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

summary="$(cc_json_get '.summary // .compact_summary')"
[[ -n "$summary" ]] || summary="summary_missing"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cwd="$(cc_json_get '.cwd')"
[[ -n "$cwd" ]] || cwd="$(pwd -P)"
event="$(jq -cn \
  --arg session "$(cc_session_id)" \
  --arg cwd "$cwd" \
  --arg summary "$summary" \
  '{eventKind:"compact_post",sessionId:$session,cwd:$cwd,data:{compactSummary:$summary,verificationStale:true}}')"
if ! cc_etrnl_state_append_json "$event"; then
  printf 'claude-guard warning: compact post-state write failed; continuing with legacy cache only\n' >&2
fi
cc_state_update --arg summary "$summary" --arg now "$now" \
  ".lastCompactSummary = \$summary | .lastCompactAt = \$now | .compactCount = ((.compactCount // 0) + 1)"
