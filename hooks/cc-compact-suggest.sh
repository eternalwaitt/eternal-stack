#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" || "${ETRNL_COMPACT_SUGGEST:-1}" == "0" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/profile.sh
source "$SCRIPT_DIR/lib/profile.sh" 2>/dev/null || true
if declare -F etrnl_profile_skip_advisory >/dev/null 2>&1 && etrnl_profile_skip_advisory; then
  exit 0
fi
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/event-extract.sh
source "$SCRIPT_DIR/lib/event-extract.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

WINDOW_TOKENS="${ETRNL_COMPACT_WINDOW_TOKENS:-200000}"
THRESHOLD_PERCENT="${ETRNL_COMPACT_SUGGEST_PERCENT:-75}"
SUGGEST_INTERVAL="${ETRNL_COMPACT_SUGGEST_INTERVAL_SEC:-900}"
SCAN_BYTES="${ETRNL_TRANSCRIPT_SCAN_BYTES:-2000000}"

[[ "$WINDOW_TOKENS" =~ ^[0-9]+$ ]] && (( WINDOW_TOKENS > 0 )) || WINDOW_TOKENS=200000
[[ "$THRESHOLD_PERCENT" =~ ^[0-9]+$ ]] && (( THRESHOLD_PERCENT > 0 && THRESHOLD_PERCENT <= 100 )) || THRESHOLD_PERCENT=75
[[ "$SUGGEST_INTERVAL" =~ ^[0-9]+$ ]] || SUGGEST_INTERVAL=900
[[ "$SCAN_BYTES" =~ ^[0-9]+$ ]] && (( SCAN_BYTES > 0 )) || SCAN_BYTES=2000000

threshold=$(( WINDOW_TOKENS * THRESHOLD_PERCENT / 100 ))
(( threshold > 0 )) || exit 0

session_id="$(cc_session_id)"
stamp_dir="${ETRNL_COMPACT_SUGGEST_DIR:-${TMPDIR:-/tmp}/etrnl-compact-suggest}"
stamp="$stamp_dir/${session_id}.stamp"
now="$(date +%s)"

# Debounce before any transcript read: this hook runs on every matched PreToolUse
# call, and the advisory is only actionable once per interval. Checking the stamp
# first keeps the common path to a stat plus a read.
if (( SUGGEST_INTERVAL > 0 )) && [[ -f "$stamp" ]]; then
  last=0
  read -r last <"$stamp" 2>/dev/null || last=0
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  if (( now - last < SUGGEST_INTERVAL )); then
    exit 0
  fi
fi

# Context size, in preference order: an explicit count on the event payload, then
# the newest usage block in the transcript. Claude Code reports usage per
# assistant message, and the live window is input + both cache buckets + output.
used_tokens="$(cc_json_get '
  .context.used_tokens // .contextUsedTokens //
  ((.usage // {}) | (((.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0)) | select(. > 0)))
')"

if [[ ! "$used_tokens" =~ ^[0-9]+$ ]]; then
  used_tokens=""
  transcript="$(cc_event_transcript_path)"
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    usage_program='
      [ .[]
        | select(type == "object")
        | select(.type == "assistant")
        | (.message.usage // .usage // empty)
        | ((.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0))
        | select(. > 0)
      ] | last // empty
    '
    transcript_bytes="$(wc -c <"$transcript" 2>/dev/null | tr -d '[:space:]' || printf '0')"
    [[ "$transcript_bytes" =~ ^[0-9]+$ ]] || transcript_bytes=0
    if (( transcript_bytes > SCAN_BYTES )); then
      used_tokens="$(tail -c "$SCAN_BYTES" "$transcript" | sed '1d' | jq -rs "$usage_program" 2>/dev/null || true)"
    else
      used_tokens="$(jq -rs "$usage_program" "$transcript" 2>/dev/null || true)"
    fi
  fi
fi

[[ "$used_tokens" =~ ^[0-9]+$ ]] || exit 0
(( used_tokens >= threshold )) || exit 0

mkdir -p "$stamp_dir" 2>/dev/null || exit 0
chmod 700 "$stamp_dir" 2>/dev/null || true
printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
chmod 600 "$stamp" 2>/dev/null || true

used_percent=$(( used_tokens * 100 / WINDOW_TOKENS ))
cc_json_emit_context "PreToolUse" "$(printf 'Context budget: about %s of %s tokens used (%s%%), at or past the %s%% compact threshold. Re-sent context, not generation, is the dominant token cost, so checkpoint now instead of carrying this window forward: write the resumable state with etrnl-ops-context-save, finish or park the current task, then compact. Tune with ETRNL_COMPACT_SUGGEST_PERCENT and ETRNL_COMPACT_WINDOW_TOKENS, or turn this off with ETRNL_SKIP_HOOKS=cc-compact-suggest.' \
  "$used_tokens" "$WINDOW_TOKENS" "$used_percent" "$THRESHOLD_PERCENT")"
