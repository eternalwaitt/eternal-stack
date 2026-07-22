#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
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
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0

# A missing name is the common case; check it before paying state init.
name="$(cc_json_get '.command_name // .commandName // .skill_name // .skillName // .name')"
if [[ -n "$name" ]]; then
  cc_state_init
  cc_state_append_value skillCalls "$name"
fi
