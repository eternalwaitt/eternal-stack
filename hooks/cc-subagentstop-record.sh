#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

# Record a contract verdict, failing closed if the critical state write fails. Silently
# dropping the write (|| true) would leave .contractVerdicts stale or missing, so a later
# Stop backstop could miss a real violation (or keep enforcing a cleared one) — the P1
# floor must be able to trust the recorded verdict. On write failure block the stop
# (escapable via CLAUDE_GUARD_DISABLED=1) rather than reporting success.
record_verdict_or_block() {
  if ! cc_state_record_contract_verdict "$1" "$2"; then
    cc_json_block "Unable to persist the agent output-contract verdict (${2}) for ${1}: guard state is unwritable, so the Stop backstop cannot be trusted. Fix guard state and re-run. Operator recovery: CLAUDE_GUARD_DISABLED=1."
    exit 0
  fi
}

# P1 enforcement floor: validate the subagent's emitted output contract FIRST, before
# any ledger append. Contract validation is the gate; only a passing (or not-applicable)
# contract lets the record-subagent append run. Recording a completed-agent ledger row
# for a rejected/retried subagent would pollute token-savings/provenance with a row per
# failed attempt, so a blocking verdict returns before the append.
#
# The agent identity comes from the TRUSTED hook event (.subagent_type // .agent_type),
# never from the self-reported ETRNL_AGENT line in the subagent's text — that line is
# spoofable and must not decide worker-vs-reviewer profile or whether the agent is
# contracted. We invoke the validator whenever node is available AND either the text
# carries an ETRNL_CONTRACT block OR the trusted agent identity is known, so a
# contracted agent that OMITS the block can no longer escape enforcement: the
# validator (which reads agents/<agent>.md) blocks a missing block for a contracted
# agent and passes through non-contracted subagents. A malformed/gamed/spoofed
# contract blocks the subagent's own stop; the verdict is recorded (keyed by the
# TRUSTED task:agent) so cc-stop-verifier can backstop, and clears on a passing re-run.
subagent_text="$(cc_json_get '[.last_assistant_message, .message, .response, .reason, .tool_result.content] | map(select(. != null and . != "")) | join("\n")')"
trusted_agent="$(cc_json_get '.subagent_type // .agent_type')"

# A response that carries an ETRNL_CONTRACT block but NO trusted agent identity cannot be
# authoritatively evaluated. Without .subagent_type/.agent_type the validator would run
# WITHOUT --agent, skipping per-agent required keys, worker-vs-reviewer status rules, and
# the adversary stop-cycle cap — so a self-identified contract could slip agent-specific
# enforcement via a generic pass. Fail closed instead of accepting an unauthenticated
# contract. (The inverse case — trusted agent present, block absent — still flows into the
# validator below, which blocks a contracted agent that omits the block.)
if [[ -z "$trusted_agent" && "$subagent_text" == *"ETRNL_CONTRACT: v1"* ]]; then
  # Persist the failure so cc-stop-verifier's .contractVerdicts backstop still fires on a
  # later Stop even though we block the current stop here. Without this record a subsequent
  # Stop could miss the failure. Key by the TRUSTED task/agent metadata (mirrors the
  # validator path's verdict_key), falling back to notask/subagent when the event omits it.
  trusted_task_id="$(cc_json_get '.task_id')"
  trusted_agent_id="$(cc_json_get '.agent_id // .subagent_id')"
  record_verdict_or_block "${trusted_task_id:-notask}:${trusted_agent_id:-subagent}" "violation"
  cc_json_block "Agent output contract could not be evaluated: an ETRNL_CONTRACT block was emitted without a trusted subagent identity (.subagent_type/.agent_type), so per-agent enforcement cannot be applied. Fail-closed floor: block until the trusted identity is present. If this environment genuinely does not provide the trusted identity (not a gamed contract), the operator can set CLAUDE_GUARD_DISABLED=1 to recover."
  exit 0
fi

if command -v node >/dev/null 2>&1 \
  && { [[ "$subagent_text" == *"ETRNL_CONTRACT: v1"* ]] || [[ -n "$trusted_agent" ]]; }; then
  # Derive task_id for the verdict key from the TRUSTED event.task_id first, falling
  # back to the self-reported ETRNL_TASK_ID only when the event lacks it. A spoofed or
  # prefixed self-reported id must not steer the verdict under the wrong task.
  trusted_task_id="$(cc_json_get '.task_id')"
  parsed_task_id="$(printf '%s\n' "$subagent_text" | sed -n 's/.*ETRNL_TASK_ID[:=][[:space:]]*\([A-Za-z0-9_.-]*\).*/\1/p' | head -n1)"
  task_id="${trusted_task_id:-$parsed_task_id}"
  agent_id="$(cc_json_get '.agent_id // .subagent_id')"
  verdict_key="${task_id:-notask}:${agent_id:-${trusted_agent:-subagent}}"

  contract_args=(check --stdin)
  [[ -n "$trusted_agent" ]] && contract_args+=(--agent "$trusted_agent")
  # Pass the TRUSTED event.task_id to the validator, which compares it against the
  # ETRNL_TASK_ID parsed from the EXTRACTED contract block (and rejects duplicate
  # ETRNL_TASK_ID lines). A hook-side first-match scan of the whole text is bypassable —
  # an agent could prefix a matching ETRNL_TASK_ID before a block that declares another —
  # so the authoritative comparison lives in the validator against the parsed block.
  [[ -n "$trusted_task_id" ]] && contract_args+=(--task-id "$trusted_task_id")
  if contract_out="$(printf '%s\n' "$subagent_text" | node "$SCRIPT_DIR/../scripts/agent-output-contract.mjs" "${contract_args[@]}" 2>&1)"; then
    record_verdict_or_block "$verdict_key" "pass"
  else
    status=$?
    record_verdict_or_block "$verdict_key" "violation"
    # Exit 1 (real violation) and exit 2 (cannot-evaluate) both BLOCK the subagent's
    # stop — the advertised fail-closed floor must not let a schema/evaluator failure
    # slip through. A genuine validator/install break stays escapable via
    # CLAUDE_GUARD_DISABLED=1, so infrastructure failures do not become permanent
    # deadlocks while a gamed/erroring contract can no longer fail open.
    if [[ "$status" == "1" ]]; then
      cc_json_block "Agent output contract violation (${trusted_agent:-subagent}):"$'\n'"$contract_out"$'\n'"Re-emit a valid ETRNL_CONTRACT: v1 block (status must match findings) before stopping."
      exit 0
    fi
    cc_json_block "Agent output contract could not be evaluated (status ${status}, ${trusted_agent:-subagent}):"$'\n'"$contract_out"$'\n'"Fail-closed floor: fix the contract block and re-emit. If this is a validator/install failure (not a gamed contract), the operator can set CLAUDE_GUARD_DISABLED=1 to recover."
    exit 0
  fi
fi

# Contract passed or was not applicable: NOW append the subagent record to the
# execution ledger. A ledger error (e.g. missing/unknown ETRNL_TASK_ID) blocks so the
# parent cannot claim completion. Because this runs only on the contract pass path, a
# rejected/retried subagent no longer adds a completed-agent row per attempt.
if ! output="$(node "$SCRIPT_DIR/../scripts/execution-ledger.mjs" record-subagent <<<"$HOOK_INPUT" 2>&1)"; then
  cc_json_block "$output"
  exit 0
fi

exit 0
