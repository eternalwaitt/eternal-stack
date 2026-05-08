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

source_name="$(cc_json_get '.source')"
state="$(cc_state_read)"
if [[ "$source_name" == "compact" ]]; then
  msg="$(jq -r '"Compact recovery: " + (.lastCompactSummary // "no saved summary")' <<<"$state" | head -c 1500)"
else
  msg="$(jq -r '"Control-plane guard active. Fresh evidence beats memory. Cwd: " + (.cwd // "")' <<<"$state" | head -c 600)"
fi
cc_json_emit_context "SessionStart" "$msg"

