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

WINDOW_TOKENS="${ETRNL_COMPACT_WINDOW_TOKENS:-}"
THRESHOLD_PERCENT="${ETRNL_COMPACT_SUGGEST_PERCENT:-75}"
SUGGEST_INTERVAL="${ETRNL_COMPACT_SUGGEST_INTERVAL_SEC:-900}"
SCAN_BYTES="${ETRNL_TRANSCRIPT_SCAN_BYTES:-2000000}"

# Claude Code's own two window sizes: 200k for pre-1M model generations, 1M for
# registry entries marked native_1m and for any model carrying a [1m] suffix.
BASE_WINDOW_TOKENS=200000
LONG_WINDOW_TOKENS=1000000

[[ "$WINDOW_TOKENS" =~ ^[0-9]+$ ]] && (( WINDOW_TOKENS > 0 )) || WINDOW_TOKENS=""
[[ "$THRESHOLD_PERCENT" =~ ^[0-9]+$ ]] && (( THRESHOLD_PERCENT > 0 && THRESHOLD_PERCENT <= 100 )) || THRESHOLD_PERCENT=75
[[ "$SUGGEST_INTERVAL" =~ ^[0-9]+$ ]] || SUGGEST_INTERVAL=900
[[ "$SCAN_BYTES" =~ ^[0-9]+$ ]] && (( SCAN_BYTES > 0 )) || SCAN_BYTES=2000000

# Claude Code honors CLAUDE_CODE_MAX_CONTEXT_TOKENS for the live window, so a
# host that has already been told the window should not be second-guessed here.
if [[ -z "$WINDOW_TOKENS" && "${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-}" =~ ^[0-9]+$ ]] \
  && (( CLAUDE_CODE_MAX_CONTEXT_TOKENS > 0 )); then
  WINDOW_TOKENS="$CLAUDE_CODE_MAX_CONTEXT_TOKENS"
fi

# A fixed window assumption is wrong for whichever generation it was not written
# for: 200k reports a nearly exhausted window at 15% of a 1M session, and every
# current Claude generation is 1M. Resolve from the model instead, and report
# nothing rather than a guess when the model is unknown.
compact_window_for_model() {
  local model
  model="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ -n "$model" ]] || return 1
  if [[ "${CLAUDE_CODE_DISABLE_1M_CONTEXT:-0}" != "1" ]]; then
    case "$model" in
      *'[1m]'*|*claude-sonnet-5*|*claude-opus-4-7*|*claude-opus-4-8*|*claude-opus-5*|*claude-fable-5*|*claude-mythos-*)
        printf '%s\n' "$LONG_WINDOW_TOKENS"
        return 0
        ;;
    esac
  fi
  return 1
}

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

# Context size and model, in preference order: explicit fields on the event
# payload, then the newest assistant entry in the transcript. Claude Code reports
# usage per assistant message, and the live window is input + both cache buckets
# + output. PreToolUse payloads carry none of this today, so the transcript is
# the normal source; the payload branch covers hosts that do send it.
payload_row="$(cc_json_get '
  [
    (.context.used_tokens // .contextUsedTokens // .context_window.total_input_tokens //
      ((.usage // {}) | (((.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0)) | select(. > 0))) // ""),
    (.context_window.context_window_size // .contextWindowTokens // ""),
    (.model | if type == "object" then (.id // .display_name // "") elif type == "string" then . else "" end)
  ] | map(tostring) | @tsv
')"
IFS=$'\t' read -r used_tokens payload_window model <<<"$payload_row"

[[ "$used_tokens" =~ ^[0-9]+$ ]] || used_tokens=""
[[ "$payload_window" =~ ^[0-9]+$ ]] && (( payload_window > 0 )) || payload_window=""

if [[ -z "$used_tokens" || ( -z "$WINDOW_TOKENS" && -z "$payload_window" && -z "$model" ) ]]; then
  transcript="$(cc_event_transcript_path)"
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    usage_program='
      [ .[]
        | select(type == "object")
        | select(.type == "assistant")
        | {
            model: ((.message.model // .model // "") | tostring),
            used: ((.message.usage // .usage // {})
              | ((.input_tokens // 0) + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.output_tokens // 0)))
          }
        | select(.used > 0)
      ] | last // empty
      | [ (.used | tostring), .model ] | @tsv
    '
    transcript_bytes="$(wc -c <"$transcript" 2>/dev/null | tr -d '[:space:]' || printf '0')"
    [[ "$transcript_bytes" =~ ^[0-9]+$ ]] || transcript_bytes=0
    if (( transcript_bytes > SCAN_BYTES )); then
      transcript_row="$(tail -c "$SCAN_BYTES" "$transcript" | sed '1d' | jq -rs "$usage_program" 2>/dev/null || true)"
    else
      transcript_row="$(jq -rs "$usage_program" "$transcript" 2>/dev/null || true)"
    fi
    IFS=$'\t' read -r transcript_used transcript_model <<<"${transcript_row:-}"
    [[ -n "$used_tokens" ]] || used_tokens="${transcript_used:-}"
    [[ -n "$model" ]] || model="${transcript_model:-}"
  fi
fi

[[ "$used_tokens" =~ ^[0-9]+$ ]] || exit 0

window_inferred=0
if [[ -z "$WINDOW_TOKENS" ]]; then
  if [[ -n "$payload_window" ]]; then
    WINDOW_TOKENS="$payload_window"
  else
    WINDOW_TOKENS="$(compact_window_for_model "$model" || true)"
    [[ "$WINDOW_TOKENS" =~ ^[0-9]+$ ]] || WINDOW_TOKENS="$BASE_WINDOW_TOKENS"
    window_inferred=1
  fi
fi

# Usage can never exceed the real window, so a count above the assumed window
# disproves the assumption instead of meaning the session is over budget.
if (( window_inferred )) && (( used_tokens > WINDOW_TOKENS )); then
  if (( used_tokens <= LONG_WINDOW_TOKENS )); then
    WINDOW_TOKENS="$LONG_WINDOW_TOKENS"
  else
    WINDOW_TOKENS="$used_tokens"
  fi
fi

threshold=$(( WINDOW_TOKENS * THRESHOLD_PERCENT / 100 ))
(( threshold > 0 )) || exit 0
(( used_tokens >= threshold )) || exit 0

mkdir -p "$stamp_dir" 2>/dev/null || exit 0
chmod 700 "$stamp_dir" 2>/dev/null || true
printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
chmod 600 "$stamp" 2>/dev/null || true

used_percent=$(( used_tokens * 100 / WINDOW_TOKENS ))
(( used_percent <= 100 )) || used_percent=100
cc_json_emit_context "PreToolUse" "$(printf 'Context budget: about %s of %s tokens used (%s%%), at or past the %s%% compact threshold. Re-sent context, not generation, is the dominant token cost, so checkpoint now instead of carrying this window forward: write the resumable state with etrnl-ops-context-save, finish or park the current task, then compact. Tune with ETRNL_COMPACT_SUGGEST_PERCENT and ETRNL_COMPACT_WINDOW_TOKENS, or turn this off with ETRNL_SKIP_HOOKS=cc-compact-suggest.' \
  "$used_tokens" "$WINDOW_TOKENS" "$used_percent" "$THRESHOLD_PERCENT")"
