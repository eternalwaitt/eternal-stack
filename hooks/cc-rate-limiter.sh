#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" || "${ETRNL_RATE_LIMITER:-1}" == "0" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/event-extract.sh
source "$SCRIPT_DIR/lib/event-extract.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

RAPID_WINDOW="${ETRNL_RATE_LIMITER_WINDOW_SEC:-60}"
RAPID_THRESHOLD="${ETRNL_RATE_LIMITER_RAPID_THRESHOLD:-15}"
FAILURE_THRESHOLD="${ETRNL_RATE_LIMITER_FAILURE_THRESHOLD:-3}"
MAX_LINES="${ETRNL_RATE_LIMITER_MAX_LINES:-50}"
WARN_INTERVAL="${ETRNL_RATE_LIMITER_WARN_INTERVAL_SEC:-60}"
LOCK_TIMEOUT="${ETRNL_RATE_LIMITER_LOCK_TIMEOUT_SEC:-2}"

for value_name in RAPID_WINDOW RAPID_THRESHOLD FAILURE_THRESHOLD MAX_LINES WARN_INTERVAL LOCK_TIMEOUT; do
  value="${!value_name}"
  if [[ ! "$value" =~ ^[0-9]+$ || "$value" == "0" ]]; then
    exit 0
  fi
done

session_id="$(cc_session_id)"
root="${ETRNL_RATE_LIMITER_DIR:-${TMPDIR:-/tmp}/etrnl-rate-limiter}"
mkdir -p "$root" 2>/dev/null || exit 0
chmod 700 "$root" 2>/dev/null || true

counter="$root/${session_id}.log"
lock="$counter.lock"
lock_start="$(date +%s)"
until mkdir "$lock" 2>/dev/null; do
  if (( $(date +%s) - lock_start >= LOCK_TIMEOUT )); then
    exit 0
  fi
  sleep 0.05
done
tmp=""
cleanup() {
  [[ -z "${tmp:-}" || ! -f "$tmp" ]] || rm -f -- "$tmp"
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

now="$(date +%s)"
tool_name="$(cc_event_tool_name)"
[[ -n "$tool_name" ]] || tool_name="unknown"
tool_name="${tool_name//[^a-zA-Z0-9_.-]/_}"
was_error="$(jq -r '
  if .was_error == true then "1"
  elif ((.tool_result // .result // .stderr // .error // .message // "") | tostring | test("error|exception|traceback|command not found|permission denied|no such file|failed"; "i"))
  then "1" else "0" end
' <<<"$HOOK_INPUT" 2>/dev/null || printf '0')"
[[ "$was_error" == "1" ]] || was_error="0"

printf '%s:%s:%s\n' "$now" "$tool_name" "$was_error" >>"$counter" 2>/dev/null || exit 0
chmod 600 "$counter" 2>/dev/null || true

tmp="$(mktemp "${counter}.tmp.XXXXXX")" || {
  printf 'claude-guard warning: rate-limiter temp file unavailable; skipping advisory update\n' >&2
  exit 0
}
tail -n "$MAX_LINES" "$counter" >"$tmp"
chmod 600 "$tmp" 2>/dev/null || true
mv -- "$tmp" "$counter"
tmp=""

recent_count=0
consecutive_failures=0
cutoff=$((now - RAPID_WINDOW))
while IFS=: read -r ts _tool code; do
  [[ "$ts" =~ ^[0-9]+$ ]] || continue
  if (( ts >= cutoff )); then
    recent_count=$((recent_count + 1))
  fi
  if [[ "$code" == "1" ]]; then
    consecutive_failures=$((consecutive_failures + 1))
  else
    consecutive_failures=0
  fi
done <"$counter"

should_warn() {
  local key="$1"
  local stamp="$root/${session_id}.${key}.stamp"
  local last=0
  if [[ -f "$stamp" ]]; then
    if ! read -r last <"$stamp"; then
      last=0
    fi
  fi
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  if (( now - last < WARN_INTERVAL )); then
    return 1
  fi
  printf '%s\n' "$now" >"$stamp" 2>/dev/null || true
  chmod 600 "$stamp" 2>/dev/null || true
  return 0
}

messages=()
if (( recent_count > RAPID_THRESHOLD )) && should_warn rapid; then
  messages+=("Pace check: ${recent_count} tool calls in the last ${RAPID_WINDOW}s. Pause, name the next hypothesis, and choose a different diagnostic if the last attempts did not change state.")
fi
if (( consecutive_failures >= FAILURE_THRESHOLD )) && should_warn failures; then
  messages+=("Failure loop: ${consecutive_failures} consecutive tool failures. Read the exact error, list the top hypotheses, and verify the first one before retrying.")
fi

if (( ${#messages[@]} > 0 )); then
  cc_json_emit_context "PostToolUse" "$(printf '%s\n' "${messages[@]}")"
fi
