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

# P1 enforcement floor: validate the subagent's emitted output contract. The block
# is only checked when the subagent actually emitted an ETRNL_CONTRACT block, so
# non-contract subagents are unaffected (progressive rollout — enforcement turns on
# per agent as P2 lands the contract). A malformed/gamed contract blocks the
# subagent's own stop, forcing correction; the verdict is recorded (keyed by
# task:agent) so cc-stop-verifier can backstop, and clears on a passing re-run.
subagent_text="$(cc_json_get '[.last_assistant_message, .message, .response, .reason, .tool_result.content] | map(select(. != null and . != "")) | join("\n")')"

if [[ -n "$subagent_text" && "$subagent_text" == *"ETRNL_CONTRACT: v1"* ]]; then
  if command -v node >/dev/null 2>&1; then
    agent_type="$(printf '%s\n' "$subagent_text" | sed -n 's/^ETRNL_AGENT:[[:space:]]*//p' | head -n1)"
    [[ -z "$agent_type" ]] && agent_type="$(cc_json_get '.subagent_type // .agent_type')"
    task_id="$(printf '%s\n' "$subagent_text" | sed -n 's/.*ETRNL_TASK_ID[:=][[:space:]]*\([A-Za-z0-9_.-]*\).*/\1/p' | head -n1)"
    agent_id="$(cc_json_get '.agent_id // .subagent_id')"
    verdict_key="${task_id:-notask}:${agent_id:-${agent_type:-subagent}}"

    contract_args=(check --stdin)
    [[ -n "$agent_type" ]] && contract_args+=(--agent "$agent_type")
    if contract_out="$(printf '%s\n' "$subagent_text" | node "$SCRIPT_DIR/../scripts/agent-output-contract.mjs" "${contract_args[@]}" 2>&1)"; then
      cc_state_record_contract_verdict "$verdict_key" "pass" || true
    else
      status=$?
      cc_state_record_contract_verdict "$verdict_key" "violation" || true
      # Exit 2 (cannot-evaluate) fails open with a warning; exit 1 (real violation) blocks.
      if [[ "$status" == "1" ]]; then
        cc_json_block "Agent output contract violation ($agent_type):"$'\n'"$contract_out"$'\n'"Re-emit a valid ETRNL_CONTRACT: v1 block (status must match findings) before stopping."
        exit 0
      fi
      printf 'claude-guard warning: agent-output-contract could not evaluate (%s): %s\n' "$status" "$contract_out" >&2
    fi
  fi
fi

exit 0
