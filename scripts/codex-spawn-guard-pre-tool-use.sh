#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${ETRNL_SKIP_HOOKS:-}" == *"spawn-guard"* ]]; then
  exit 0
fi

spawn_mode="${ETRNL_SPAWN_GUARD_MODE:-enforce}"
if [[ "$spawn_mode" == "off" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    exit 0
  fi
  echo "Codex spawn guard hook requires jq, but jq is not on PATH." >&2
  exit 2
fi

input="$(cat)"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // .tool // empty' 2>/dev/null || true)"
if [[ "$tool_name" != "spawn_agent" && "$tool_name" != *spawn* ]]; then
  exit 0
fi

deny_reason() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": $reason
      }
    }'
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
LEDGER_SCRIPT="$SCRIPT_DIR/execution-ledger.mjs"
if [[ ! -f "$LEDGER_SCRIPT" ]]; then
  LEDGER_SCRIPT="${CODEX_HOME:-$HOME/.codex}/scripts/execution-ledger.mjs"
fi
if [[ ! -f "$LEDGER_SCRIPT" ]]; then
  if [[ "$spawn_mode" == "advisory" ]]; then
    exit 0
  fi
  deny_reason "Spawn guard unavailable: execution-ledger.mjs missing at ${LEDGER_SCRIPT}."
  exit 0
fi

task_name="$(printf '%s' "$input" | jq -r '.tool_input.task_name // .tool_input.taskName // .tool_input.name // empty' 2>/dev/null || true)"
wave_id="$(printf '%s' "$input" | jq -r '.tool_input.wave // .tool_input.waveId // empty' 2>/dev/null || true)"
subagent_type="$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // .tool_input.agent_type // empty' 2>/dev/null || true)"
packet_mode="$(printf '%s' "$input" | jq -r '.tool_input.packet.mode // .tool_input.mode // empty' 2>/dev/null || true)"

if [[ -z "$task_name" ]]; then
  args_json="$(printf '%s' "$input" | jq -r '.tool_input.arguments // .tool_input // empty' 2>/dev/null || true)"
  if [[ -n "$args_json" && "$args_json" != "null" ]]; then
    task_name="$(printf '%s' "$args_json" | jq -r '.task_name // .taskName // empty' 2>/dev/null || true)"
    wave_id="${wave_id:-$(printf '%s' "$args_json" | jq -r '.wave // .waveId // empty' 2>/dev/null || true)}"
    subagent_type="${subagent_type:-$(printf '%s' "$args_json" | jq -r '.subagent_type // .agent_type // empty' 2>/dev/null || true)}"
    packet_mode="${packet_mode:-$(printf '%s' "$args_json" | jq -r '.packet.mode // .mode // empty' 2>/dev/null || true)}"
  fi
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

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)"
if [[ -z "$session_id" ]]; then
  session_id="${CODEX_SESSION_ID:-${CLAUDE_SESSION_ID:-default}}"
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
    exit 0
  fi
  deny_reason "Spawn guard could not resolve task_name from spawn_agent arguments."
  exit 0
fi

plan_exec=0
state_lib="${CLAUDE_HOME:-$HOME/.claude}/hooks/lib/state.sh"
if [[ ! -f "$state_lib" ]]; then
  state_lib="$SCRIPT_DIR/../hooks/lib/state.sh"
fi
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

ledger_stderr="$(mktemp "${TMPDIR:-/tmp}/codex-spawn-guard.XXXXXX")"
ledger_rc=0
ledger_stdout="$(ETRNL_SPAWN_GUARD_RECORDER=hook node "$LEDGER_SCRIPT" "${check_args[@]}" 2>"$ledger_stderr")" || ledger_rc=$?
output="$ledger_stdout"
if [[ "$ledger_rc" -ne 0 && -z "$output" && -s "$ledger_stderr" ]]; then
  output="$(cat "$ledger_stderr")"
fi
rm -f -- "$ledger_stderr"

if [[ "$ledger_rc" -ne 0 ]]; then
  if [[ "$plan_exec" -eq 0 ]] && [[ "$output" == *"No active execution ledger"* ]]; then
    exit 0
  fi
  reason="$(printf '%s' "$output" | jq -r '.reason // empty' 2>/dev/null || true)"
  code="$(printf '%s' "$output" | jq -r '.reasonCode // empty' 2>/dev/null || true)"
  fix="$(printf '%s' "$output" | jq -r '.exactFix // empty' 2>/dev/null || true)"
  example="$(printf '%s' "$output" | jq -r '.exampleCommand // empty' 2>/dev/null || true)"
  msg="Spawn guard blocked (${code:-blocked}): ${reason:-$output}"
  if [[ -n "$fix" ]]; then msg="${msg} Fix: ${fix}"; fi
  if [[ -n "$example" ]]; then msg="${msg} Example: ${example}"; fi
  if [[ "$spawn_mode" == "advisory" ]]; then
    exit 0
  fi
  deny_reason "$msg"
  exit 0
fi

exit 0
