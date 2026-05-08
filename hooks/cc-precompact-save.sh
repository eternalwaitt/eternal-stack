#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

summary="$(jq -c '{edits, verificationRuns, requestedSkills, skillCalls, lastPrompt}' "$(cc_state_file)")"
cc_state_update --arg summary "$summary" '.lastCompactSummary = $summary'
printf '{"continue":true,"suppressOutput":true}\n'
