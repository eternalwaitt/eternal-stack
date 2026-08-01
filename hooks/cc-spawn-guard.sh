#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${ETRNL_SKIP_HOOKS:-}" == *"cc-spawn-guard"* ]]; then
  exit 0
fi

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"

cc_json_deny_pretool_no_jq() {
  local reason="$1"
  local escaped="${reason//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  escaped="${escaped//$'\n'/\\n}"
  escaped="${escaped//$'\r'/\\r}"
  escaped="${escaped//$'\t'/\\t}"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$escaped"
}

cc_json_read_stdin
spawn_mode="${ETRNL_SPAWN_GUARD_MODE:-enforce}"
if [[ "$spawn_mode" == "off" ]]; then
  cc_json_allow
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    cc_json_allow
    exit 0
  fi
  cc_json_deny_pretool_no_jq "Spawn guard requires jq in enforce mode; install jq or set ETRNL_SPAWN_GUARD_MODE=advisory."
  exit 0
fi
if ! cc_json_valid; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    cc_json_allow
    exit 0
  fi
  cc_json_deny_pretool "Spawn guard received invalid hook JSON in enforce mode."
  exit 0
fi

current_tool="$(cc_json_get '.tool_name // .tool // empty')"
case "$current_tool" in
  Agent|Task|TaskCreate) ;;
  *) cc_json_allow; exit 0 ;;
esac

LEDGER_SCRIPT="$SCRIPT_DIR/../scripts/execution-ledger.mjs"
if [[ ! -f "$LEDGER_SCRIPT" ]]; then
  LEDGER_SCRIPT="${CLAUDE_HOME:-$HOME/.claude}/scripts/execution-ledger.mjs"
fi
if [[ ! -f "$LEDGER_SCRIPT" ]]; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    cc_json_allow
    exit 0
  fi
  cc_json_deny_pretool "Spawn guard unavailable: execution-ledger.mjs missing at ${LEDGER_SCRIPT}."
  exit 0
fi

task_name="$(cc_json_get '.tool_input.spawnTaskName // .tool_input.task_name // .tool_input.taskName // empty')"
wave_id="$(cc_json_get '.tool_input.waveId // .tool_input.wave // .tool_input.packet.waveId // empty')"
packet_task_id="$(cc_json_get '.tool_input.packet.taskId // empty')"
packet_mode="$(cc_json_get '.tool_input.packet.mode // empty')"
subagent_type="$(cc_json_get '.tool_input.subagent_type // .tool_input.agent_type // empty')"

if [[ -z "$task_name" && -n "$packet_task_id" ]]; then
  if [[ "$packet_mode" == "read-only" || "$subagent_type" == *review* ]]; then
    if [[ "$subagent_type" == *spec* ]]; then
      task_name="${packet_task_id}_spec_review"
    elif [[ "$subagent_type" == *quality* ]]; then
      task_name="${packet_task_id}_quality_review"
    elif [[ "$subagent_type" == *simplifier* ]]; then
      task_name="${packet_task_id}_simplifier_review"
    else
      task_name="${packet_task_id}_review"
    fi
  else
    task_name="${packet_task_id}_writer"
  fi
fi

if [[ -z "$task_name" ]]; then
  task_name="$(cc_json_get '.tool_input.description // .tool_input.prompt // empty | if type == "string" then split("\n")[0][0:240] else empty end')"
fi

if [[ -z "$task_name" && -n "$subagent_type" ]]; then
  task_name="$subagent_type"
fi

reviewer_spawn=0
if [[ -z "$wave_id" ]]; then
  case "$subagent_type" in
    *spec-review*|*quality-review*|*simplifier*|*adversary*|*design-review*|*dx-review*|*consumer-trace*|*browser-qa*|*reviewer*)
      reviewer_spawn=1
      ;;
  esac
  if [[ "$packet_mode" == "read-only" && "$subagent_type" == *review* && "$subagent_type" != *scout* ]]; then
    reviewer_spawn=1
  fi
  if [[ "$reviewer_spawn" -eq 0 ]]; then
    wave_id="wave-1"
  fi
fi

session_id="$(cc_json_get '.session_id // empty')"
if [[ -z "$session_id" ]]; then
  session_id="${CLAUDE_SESSION_ID:-default}"
fi
export CLAUDE_SESSION_ID="$session_id"

if [[ -z "$wave_id" && "$reviewer_spawn" -eq 1 ]]; then
  inferred_wave="$(node "$LEDGER_SCRIPT" infer-spawn-wave --session "$session_id" --task-name "$task_name" --json 2>/dev/null | jq -r '.waveId // empty' 2>/dev/null || true)"
  if [[ -n "$inferred_wave" && "$inferred_wave" != "null" ]]; then
    wave_id="$inferred_wave"
  fi
fi

if [[ -z "$task_name" ]]; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    cc_json_allow
    exit 0
  fi
  cc_json_deny_pretool "Spawn guard could not resolve task name from Agent/Task payload. Set tool_input.spawnTaskName or packet.taskId."
  exit 0
fi

plan_exec=0
state_lib="$SCRIPT_DIR/lib/state.sh"
if [[ -f "$state_lib" ]]; then
  # shellcheck source=hooks/lib/state.sh
  source "$state_lib"
  if jq -e '.planExecutionRequested == true' <<<"$(cc_state_read 2>/dev/null || echo '{}')" >/dev/null 2>&1; then
    plan_exec=1
  fi
fi
check_args=(check-spawn --session "$session_id" --task-name "$task_name" --wave "$wave_id" --json)
if [[ -n "$subagent_type" ]]; then
  check_args+=(--subagent-type "$subagent_type")
fi
if [[ -n "$packet_mode" ]]; then
  check_args+=(--packet-mode "$packet_mode")
fi
if [[ "$spawn_mode" == "advisory" ]]; then
  check_args+=(--dry-run)
fi

ledger_stderr="$(mktemp "${TMPDIR:-/tmp}/cc-spawn-guard.XXXXXX")"
ledger_rc=0
ledger_stdout="$(ETRNL_SPAWN_GUARD_RECORDER=hook node "$LEDGER_SCRIPT" "${check_args[@]}" 2>"$ledger_stderr")" || ledger_rc=$?
output="$ledger_stdout"
if [[ "$ledger_rc" -ne 0 && -z "$output" && -s "$ledger_stderr" ]]; then
  output="$(cat "$ledger_stderr")"
fi
rm -f -- "$ledger_stderr"

if [[ "$ledger_rc" -ne 0 ]]; then
  if [[ "$plan_exec" -eq 0 ]] && [[ "$output" == *"No active execution ledger"* ]]; then
    cc_json_allow
    exit 0
  fi
  reason="$(printf '%s' "$output" | jq -r '.reason // empty' 2>/dev/null || true)"
  code="$(printf '%s' "$output" | jq -r '.reasonCode // empty' 2>/dev/null || true)"
  fix="$(printf '%s' "$output" | jq -r '.exactFix // empty' 2>/dev/null || true)"
  example="$(printf '%s' "$output" | jq -r '.exampleCommand // empty' 2>/dev/null || true)"
  if [[ -z "$reason" ]]; then
    reason="$output"
  fi
  deny_msg="Spawn guard blocked (${code:-blocked}): ${reason}"
  if [[ -n "$fix" ]]; then
    deny_msg="${deny_msg} Fix: ${fix}"
  fi
  if [[ -n "$example" ]]; then
    deny_msg="${deny_msg} Example: ${example}"
  fi
  if [[ "$spawn_mode" == "advisory" ]]; then
    cc_json_allow_context "PreToolUse" "$deny_msg"
    exit 0
  fi
  cc_json_deny_pretool "$deny_msg"
  exit 0
fi

cc_json_allow
exit 0
