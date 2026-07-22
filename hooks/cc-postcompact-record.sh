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
summary_present=1
if [[ -z "$summary" ]]; then
  printf 'claude-guard warning: compact summary missing from event; recording placeholder only\n' >&2
  summary="compact_summary_missing"
  summary_present=0
fi
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cwd="$(cc_json_get '.cwd')"
[[ -n "$cwd" ]] || cwd="$(pwd -P)"
tree_hash="$(cc_worktree_hash "$cwd")"
if [[ -n "$tree_hash" ]]; then
  event="$(jq -cn \
    --arg session "$(cc_session_id)" \
    --arg cwd "$cwd" \
    --arg summary "$summary" \
    --arg tree_hash "$tree_hash" \
    '{eventKind:"compact_post",sessionId:$session,cwd:$cwd,data:{compactSummary:$summary,treeHashAtCompact:$tree_hash}}')"
else
  event="$(jq -cn \
    --arg session "$(cc_session_id)" \
    --arg cwd "$cwd" \
    --arg summary "$summary" \
    '{eventKind:"compact_post",sessionId:$session,cwd:$cwd,data:{compactSummary:$summary,verificationStale:true}}')"
fi
if ! cc_etrnl_state_append_json "$event"; then
  printf 'claude-guard warning: ETRNL_POSTCOMPACT_STATE_WRITE_FAILED compact post-state write failed; continuing with legacy cache only\n' >&2
  cc_state_update '.etrnlStateWriteFailures = ((.etrnlStateWriteFailures // 0) + 1)' || true
fi
if [[ "$summary_present" == "1" ]]; then
  cc_state_update --arg summary "$summary" --arg now "$now" \
    ".lastCompactSummary = \$summary | .lastCompactAt = \$now | .compactCount = ((.compactCount // 0) + 1)"
fi
compact_hints=()
if [[ -f "$SCRIPT_DIR/../scripts/etrnl-retro.mjs" ]] && command -v node >/dev/null 2>&1; then
  retro_hint="$(node "$SCRIPT_DIR/../scripts/etrnl-retro.mjs" hints --max-chars "${ETRNL_LEARNING_HINT_MAX_CHARS:-500}" --cwd "$cwd" 2>/dev/null || true)"
  steering_hint="$(node "$SCRIPT_DIR/../scripts/etrnl-retro.mjs" steering-hint --cwd "$cwd" 2>/dev/null || true)"
  [[ -n "$retro_hint" ]] && compact_hints+=("$retro_hint")
  [[ -n "$steering_hint" ]] && compact_hints+=("$steering_hint")
fi
if (( ${#compact_hints[@]} > 0 )); then
  hint_msg="$(printf '%s\n' "${compact_hints[@]}")"
  if command -v node >/dev/null 2>&1; then
    hint_msg="$(printf '%s' "$hint_msg" | node -e '
const limit = Number(process.argv[1]);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(Array.from(input).slice(0, limit).join(""));
});
' "${ETRNL_LEARNING_HINT_MAX_CHARS:-500}")"
  fi
  cc_json_emit_context "PostCompact" "$hint_msg"
  exit 0
fi
