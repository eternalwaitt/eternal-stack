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
# shellcheck source=hooks/lib/code-patterns.sh
source "$SCRIPT_DIR/lib/code-patterns.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

transcript="$(cc_json_get '.transcript_path')"
message=""
if [[ -n "$transcript" && -f "$transcript" ]]; then
  message="$(jq -rs '
    [.[] | select(.type == "assistant") | (.message.content // [])[]? | select(.type == "text") | .text]
    | last // empty
  ' "$transcript" 2>/dev/null || true)"
fi

if [[ -z "$message" ]]; then
  message="$(cc_json_get '.last_assistant_message // .message // .response')"
fi

if [[ -n "$message" ]] && violation="$(cc_evidence_discipline_violation "$message")"; then
  cc_state_append_value evidenceDisciplineViolations "$violation"
  python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
  cc_json_block "$violation"
  exit 0
fi

exit 0
