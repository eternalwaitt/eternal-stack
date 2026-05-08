#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
command="$(cc_json_get '.tool_input.command // .input.command // .command')"
error_hash="$(jq -r '(.error // .stderr // .message // "") | @json' <<<"$HOOK_INPUT" | shasum -a 256 | cut -d' ' -f1)"
key="${tool_name}:${command}:${error_hash}"
cc_state_append_value failures "$key"

count="$(jq --arg key "$key" '[.failures[]? | select(.value == $key)] | length' "$(cc_state_file)")"
if (( count >= 2 )); then
  cc_json_block "The same tool failure has repeated. Stop retrying the exact action; inspect syntax/help/logs or use a different approach."
else
  cc_json_block "Tool failed. Before retrying, inspect the error text, verify the command/tool syntax, and choose the next diagnostic step."
fi

