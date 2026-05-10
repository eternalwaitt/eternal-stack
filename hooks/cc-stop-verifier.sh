#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"
source "$SCRIPT_DIR/lib/code-patterns.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

if jq -e '.stop_hook_active == true' <<<"$HOOK_INPUT" >/dev/null; then
  exit 0
fi

message="$(cc_json_get '.last_assistant_message // .message // .response')"
message_lower="$(printf '%s' "$message" | tr '[:upper:]' '[:lower:]')"
state="$(cc_state_read)"
if violation="$(cc_evidence_discipline_violation "$message")"; then
  cc_state_append_value evidenceDisciplineViolations "$violation"
  python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
  cc_json_block "$violation"
  exit 0
fi

claims_done=false
if [[ "$message_lower" =~ (done|complete|completed|implemented|fixed|passes|shipped|deployed|tests[[:space:]]+pass) ]]; then
  claims_done=true
fi

NORM_JQ='
def norm:
  ascii_downcase
  | sub("^/"; "")
  | sub("^skill\\("; "")
  | sub("\\)$"; "")
  | sub("^eternal-control-"; "")
  | sub("^etrnl-"; "")
  | if . == "writing-plans" then "plan"
    elif . == "code-review" then "review"
    elif . == "execute-plan" or . == "run-plan" then "execute"
    elif . == "parallel-fan-out" then "parallel"
    elif . == "devils-advocate" then "stress-test"
    elif . == "agent-file-doctor" then "agent-files"
    else . end;
'
if [[ "$claims_done" == "true" ]]; then
  if jq -e '((.verificationRuns | length) == 0)' <<<"$state" >/dev/null; then
    cc_json_block "You are trying to claim completion without verification evidence. Re-read the request, map each requested outcome to changed files or command results, run project preflight, verify user-visible behavior, then answer with evidence."
    exit 0
  fi
  # Current state stores edits as path -> timestamp; older state may use {at}.
  timestamp_status="$(printf '%s' "$state" | python3 -c '
import json
import sys
from datetime import datetime, timezone

def parse_ts(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("timestamp is not a string")
    stamp = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(stamp)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()

try:
    state = json.load(sys.stdin)
    edits = []
    for value in (state.get("edits") or {}).values():
        stamp = value.get("at") if isinstance(value, dict) else value
        epoch = parse_ts(stamp)
        if epoch is not None:
            edits.append(epoch)
    verifies = []
    for item in state.get("verificationRuns") or []:
        epoch = parse_ts(item.get("at") if isinstance(item, dict) else None)
        if epoch is not None:
            verifies.append(epoch)
except Exception as exc:
    print(f"malformed:{exc}")
else:
    latest_edit = max(edits, default=0)
    latest_verify = max(verifies, default=0)
    print("stale" if latest_edit and latest_verify and latest_edit > latest_verify else "fresh")
')"
  if [[ "$timestamp_status" == malformed:* ]]; then
    cc_json_block "Guard state contains malformed verification timestamps. Re-run the project preflight so stale-verification checks can compare ISO timestamps safely."
    exit 0
  fi
  if [[ "$timestamp_status" == "stale" ]]; then
    cc_json_block "You are trying to claim completion with stale verification. Edits happened after the last recorded verification. Re-run the project preflight or the plan's final verification gate, then answer with evidence."
    exit 0
  fi
  if jq -e "$NORM_JQ"'
    ([.requestedSkills[]?.value // empty | norm] - [.skillCalls[]?.value // empty | norm]) | length > 0
  ' <<<"$state" >/dev/null; then
    cc_json_block "A requested skill was not recorded. Invoke it or explicitly state why it is unavailable before claiming completion."
    exit 0
  fi
fi

exit 0
