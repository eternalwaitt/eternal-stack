#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

state="$(cc_state_read)"
trigger="$(cc_json_get '.trigger // .compact_trigger // .source // "unknown"')"
cwd="$(cc_json_get '.cwd')"
[[ -n "$cwd" ]] || cwd="$(pwd -P)"
event="$(jq -cn \
  --arg session "$(cc_session_id)" \
  --arg cwd "$cwd" \
  --arg trigger "$trigger" \
  --argjson state "$state" '
  {
    eventKind: "compact_pre",
    sessionId: $session,
    cwd: $cwd,
    data: {
      trigger: $trigger,
      task: (if (($state.activePlanPath // "") | length) > 0 then ("plan:" + (($state.activePlanPath // "") | split("/") | last)) else "active ETRNL work" end),
      nextAction: (if ($state.planExecutionRequested // false) then "continue active plan execution" else "continue current work" end),
      editCount: (($state.edits // {}) | length),
      verificationRuns: (($state.verificationRuns // []) | length),
      requestedSkillCount: (($state.requestedSkills // []) | length),
      agentCallCount: (($state.agentCalls // []) | length)
    }
  }')"
if ! cc_etrnl_state_append_json "$event"; then
  printf 'claude-guard warning: compact pre-state write failed; continuing without durable handoff\n' >&2
fi
# Legacy tmp state remains a session cache only; do not copy raw prompt fields.
summary="$(jq -c '{edits: ((.edits // {}) | length), verificationRuns: ((.verificationRuns // []) | length), requestedSkills: ((.requestedSkills // []) | length), skillCalls: ((.skillCalls // []) | length), agentCalls: ((.agentCalls // []) | length)}' <<<"$state")"
cc_state_update --arg summary "$summary" ".lastCompactSummary = \$summary"
printf '{"continue":true,"suppressOutput":true}\n'
