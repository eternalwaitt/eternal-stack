#!/usr/bin/env bash
# Parallel job pool for test suites. Workers write TAP-like result lines to temp files;
# the caller flushes them in submission order via ok/not_ok.
# shellcheck shell=bash

parallel_run_jobs() {
  if [[ -n "${DOCTOR_JOBS:-}" && "$DOCTOR_JOBS" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$DOCTOR_JOBS"
    return 0
  fi
  if command -v nproc >/dev/null 2>&1; then
    nproc 2>/dev/null || printf '4\n'
    return 0
  fi
  if command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.ncpu 2>/dev/null || printf '4\n'
    return 0
  fi
  printf '4\n'
}

parallel_run_init() {
  local jobs="${1:-$(parallel_run_jobs)}"
  if [[ ! "$jobs" =~ ^[0-9]+$ ]] || (( jobs < 1 )); then
    jobs=4
  elif (( jobs > 8 )); then
    jobs=8
  fi
  PARALLEL_RUN_MAX_JOBS="$jobs"
  PARALLEL_RUN_DIR="$TMPROOT/parallel-run"
  PARALLEL_RUN_PIDS=()
  PARALLEL_RUN_ORDER=()
  mkdir -p "$PARALLEL_RUN_DIR"
}

parallel_run_reap_pids() {
  local -a still_running=()
  local pid state
  if ((${#PARALLEL_RUN_PIDS[@]} == 0)); then
    return 0
  fi
  for pid in "${PARALLEL_RUN_PIDS[@]}"; do
    state="$(ps -p "$pid" -o state= 2>/dev/null | tr -d ' ' || true)"
    if [[ -z "$state" || "$state" == "Z" ]]; then
      wait "$pid" 2>/dev/null || true
      continue
    fi
    still_running+=("$pid")
  done
  if ((${#still_running[@]} > 0)); then
    PARALLEL_RUN_PIDS=("${still_running[@]}")
  else
    PARALLEL_RUN_PIDS=()
  fi
}

parallel_run_wait_for_slot() {
  until ((${#PARALLEL_RUN_PIDS[@]} < PARALLEL_RUN_MAX_JOBS)); do
    parallel_run_reap_pids
    sleep 0.05
  done
}

parallel_run_queue() {
  local slot="$1"
  shift
  PARALLEL_RUN_ORDER+=("$slot")
  (
    local result_file="$PARALLEL_RUN_DIR/${slot}.result"
    if "$@" >"$result_file"; then
      :
    else
      local exit_code=$?
      if [[ ! -s "$result_file" ]]; then
        printf 'not_ok\tparallel worker failed (exit %s)\n' "$exit_code" >"$result_file"
      fi
      exit "$exit_code"
    fi
  ) &
  PARALLEL_RUN_PIDS+=("$!")
  parallel_run_wait_for_slot
}

parallel_run_flush() {
  local slot status name pid
  if ((${#PARALLEL_RUN_PIDS[@]} > 0)); then
    for pid in "${PARALLEL_RUN_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi
  PARALLEL_RUN_PIDS=()
  for slot in "${PARALLEL_RUN_ORDER[@]}"; do
    if [[ ! -f "$PARALLEL_RUN_DIR/${slot}.result" ]]; then
      not_ok "parallel result missing for $slot"
      continue
    fi
    IFS=$'\t' read -r status name <"$PARALLEL_RUN_DIR/${slot}.result" || true
    if [[ "$status" == "ok" ]]; then
      ok "$name"
    else
      not_ok "$name"
    fi
    rm -f "$PARALLEL_RUN_DIR/${slot}.result"
  done
  PARALLEL_RUN_ORDER=()
}

parallel_worker_env() {
  local worker_id="${BASHPID-$$}"
  local worker_state="$TMPROOT/parallel-state/${worker_id}-${RANDOM}"
  mkdir -p "$worker_state/etrnl-state"
  CLAUDE_GUARD_STATE_DIR="$worker_state" \
  ETRNL_STATE_DIR="$worker_state/etrnl-state" \
  "$@"
}

parallel_guard_fixture_worker() {
  local fixture_file="$1"
  local expect="$2"
  local fixture_name fixture_cmd guard_out name
  fixture_name="$(basename "$fixture_file" .json)"
  fixture_cmd="$(jq -r '.tool_input.command // ""' "$fixture_file")"
  guard_out="$(parallel_worker_env run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  if [[ "$expect" == "deny" ]]; then
    name="guard denies $fixture_name ($fixture_cmd)"
    if jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 <<<"$guard_out"; then
      printf 'ok\t%s\n' "$name"
      return 0
    fi
    printf 'not_ok\t%s\n' "$name"
    return 1
  fi
  name="guard allows $fixture_name ($fixture_cmd)"
  if jq -e '.continue == true' >/dev/null 2>&1 <<<"$guard_out"; then
    printf 'ok\t%s\n' "$name"
    return 0
  fi
  printf 'not_ok\t%s\n' "$name"
  return 1
}

parallel_packet_fixture_worker() {
  local fixture_file="$1"
  local expect="$2"
  local fixture_name guard_out name
  fixture_name="$(basename "$fixture_file" .json)"
  guard_out="$(parallel_worker_env run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  if [[ "$expect" == "deny" ]]; then
    name="guard denies $fixture_name"
    if jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 <<<"$guard_out"; then
      printf 'ok\t%s\n' "$name"
      return 0
    fi
    printf 'not_ok\t%s\n' "$name"
    return 1
  fi
  name="guard allows $fixture_name"
  if jq -e '.continue == true' >/dev/null 2>&1 <<<"$guard_out"; then
    printf 'ok\t%s\n' "$name"
    return 0
  fi
  printf 'not_ok\t%s\n' "$name"
  return 1
}

parallel_safe_bash_worker() {
  local index="$1"
  local safe_bash_json="$2"
  local out name
  out="$(parallel_worker_env run_hook cc-pretooluse-guard.sh "$safe_bash_json")"
  name="safe bash repeated fixture $index"
  if jq -e '.continue == true' >/dev/null 2>&1 <<<"$out"; then
    printf 'ok\t%s\n' "$name"
    return 0
  fi
  printf 'not_ok\t%s\n' "$name"
  return 1
}

run_parallel_guard_fixture_matrix() {
  local expect="$1"
  shift
  local -a fixture_files=("$@")
  local fixture_file slot=0
  export ROOT
  parallel_run_init
  for fixture_file in "${fixture_files[@]}"; do
    slot=$((slot + 1))
    parallel_run_queue "guard-${expect}-${slot}" parallel_guard_fixture_worker "$fixture_file" "$expect"
  done
  parallel_run_flush
}

run_parallel_packet_fixture_matrix() {
  local expect="$1"
  shift
  local -a fixture_files=("$@")
  local fixture_file slot=0
  export ROOT
  parallel_run_init
  for fixture_file in "${fixture_files[@]}"; do
    slot=$((slot + 1))
    parallel_run_queue "packet-${expect}-${slot}" parallel_packet_fixture_worker "$fixture_file" "$expect"
  done
  parallel_run_flush
}

run_parallel_safe_bash_repeats() {
  local safe_bash_json="$1"
  local count="${2:-10}"
  local i
  export ROOT
  parallel_run_init
  for ((i = 1; i <= count; i++)); do
    parallel_run_queue "safe-bash-${i}" parallel_safe_bash_worker "$i" "$safe_bash_json"
  done
  parallel_run_flush
}
