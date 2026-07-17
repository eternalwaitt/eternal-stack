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

# Existing behavior: append the subagent record to the execution ledger. A ledger
# error (e.g. missing ETRNL_TASK_ID) blocks so the parent cannot claim completion.
if ! output="$(node "$SCRIPT_DIR/../scripts/execution-ledger.mjs" record-subagent <<<"$HOOK_INPUT" 2>&1)"; then
  cc_json_block "$output"
  exit 0
fi

# P1 enforcement floor: validate the subagent's emitted output contract. The agent
# identity comes from the TRUSTED hook event (.subagent_type // .agent_type), never
# from the self-reported ETRNL_AGENT line in the subagent's text — that line is
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

if command -v node >/dev/null 2>&1 \
  && { [[ "$subagent_text" == *"ETRNL_CONTRACT: v1"* ]] || [[ -n "$trusted_agent" ]]; }; then
  task_id="$(printf '%s\n' "$subagent_text" | sed -n 's/.*ETRNL_TASK_ID[:=][[:space:]]*\([A-Za-z0-9_.-]*\).*/\1/p' | head -n1)"
  agent_id="$(cc_json_get '.agent_id // .subagent_id')"
  verdict_key="${task_id:-notask}:${agent_id:-${trusted_agent:-subagent}}"

  contract_args=(check --stdin)
  [[ -n "$trusted_agent" ]] && contract_args+=(--agent "$trusted_agent")
  if contract_out="$(printf '%s\n' "$subagent_text" | node "$SCRIPT_DIR/../scripts/agent-output-contract.mjs" "${contract_args[@]}" 2>&1)"; then
    cc_state_record_contract_verdict "$verdict_key" "pass" || true
  else
    status=$?
    cc_state_record_contract_verdict "$verdict_key" "violation" || true
    # Exit 2 (cannot-evaluate) fails open with a warning; exit 1 (real violation) blocks.
    if [[ "$status" == "1" ]]; then
      cc_json_block "Agent output contract violation (${trusted_agent:-subagent}):"$'\n'"$contract_out"$'\n'"Re-emit a valid ETRNL_CONTRACT: v1 block (status must match findings) before stopping."
      exit 0
    fi
    printf 'claude-guard warning: agent-output-contract could not evaluate (%s): %s\n' "$status" "$contract_out" >&2
  fi
fi

exit 0
