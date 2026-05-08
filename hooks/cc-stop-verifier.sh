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

if jq -e '.stop_hook_active == true' <<<"$HOOK_INPUT" >/dev/null; then
  exit 0
fi

message="$(cc_json_get '.last_assistant_message // .message // .response')"
state="$(cc_state_read)"
claims_done=false
if [[ "$message" =~ (done|complete|completed|implemented|fixed|passes|shipped|deployed) ]]; then
  claims_done=true
fi

if [[ "$claims_done" == "true" ]]; then
  if jq -e '((.verificationRuns | length) == 0)' <<<"$state" >/dev/null; then
    cc_json_block "You are trying to claim completion without verification evidence. Re-read the request, map each requested outcome to changed files or command results, run project preflight, verify user-visible behavior, then answer with evidence."
    exit 0
  fi
  if jq -e '(.requestedSkills | length) > 0 and ((.skillCalls | length) == 0)' <<<"$state" >/dev/null; then
    cc_json_block "A requested skill was not recorded. Invoke it or explicitly state why it is unavailable before claiming completion."
    exit 0
  fi
fi

exit 0
