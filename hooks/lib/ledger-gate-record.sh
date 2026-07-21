#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf 'error: %s is a library and must be sourced\n' "${BASH_SOURCE[0]}" >&2
  exit 1
fi

cc_command_is_auto_record_gate() {
  local cmd
  cmd="$(cc_command_trim "$1")"
  case "$cmd" in
    "bash tests/test-hooks.sh"|"bash tests/test-workflow-tools.sh"|"bash scripts/doctor.sh"|"bash scripts/doctor.sh --changed")
      return 0
      ;;
    node\ scripts/plan-readiness-check.mjs\ *)
      return 0
      ;;
  esac
  return 1
}

cc_ledger_auto_record_gate_check_async() {
  local command="$1"
  local succeeded="$2"
  local session_id="$3"
  local script_dir="$4"
  local timeout_sec="${5:-5}"
  local status="passed"
  [[ "$succeeded" == "true" ]] || status="failed"
  local ledger_script="$script_dir/../scripts/execution-ledger.mjs"
  [[ -f "$ledger_script" ]] || return 0
  command -v node >/dev/null 2>&1 || return 0
  (
    if command -v timeout >/dev/null 2>&1; then
      timeout "$timeout_sec" node "$ledger_script" record-check \
        --session "$session_id" \
        --name "gate:auto" \
        --command "$command" \
        --status "$status" >/dev/null 2>&1 || true
    else
      node "$ledger_script" record-check \
        --session "$session_id" \
        --name "gate:auto" \
        --command "$command" \
        --status "$status" >/dev/null 2>&1 || true
    fi
  ) &
  disown 2>/dev/null || true
}
