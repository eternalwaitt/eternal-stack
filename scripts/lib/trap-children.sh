#!/usr/bin/env bash
# Reusable child-process cleanup for scripts that spawn background jobs.
# shellcheck shell=bash

trap_children_init() {
  TRAP_CHILDREN_PIDS=()
  trap 'trap_children_signal INT' INT
  trap 'trap_children_signal TERM' TERM
}

trap_children_track() {
  TRAP_CHILDREN_PIDS+=("$1")
}

trap_children_reap_tracked() {
  local -a still_running=()
  local pid
  for pid in "${TRAP_CHILDREN_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      still_running+=("$pid")
    else
      wait "$pid" 2>/dev/null || true
    fi
  done
  if ((${#still_running[@]} > 0)); then
    TRAP_CHILDREN_PIDS=("${still_running[@]}")
  else
    TRAP_CHILDREN_PIDS=()
  fi
}

trap_children_wait_for_slot() {
  local max_jobs="$1"
  until ((${#TRAP_CHILDREN_PIDS[@]} < max_jobs)); do
    trap_children_reap_tracked
    sleep 0.05
  done
}

trap_children_kill_all() {
  local pid
  if ((${#TRAP_CHILDREN_PIDS[@]} == 0)); then
    return 0
  fi
  for pid in "${TRAP_CHILDREN_PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${TRAP_CHILDREN_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  TRAP_CHILDREN_PIDS=()
}

trap_children_signal() {
  local signal="${1:-TERM}"
  trap_children_kill_all
  trap - "$signal"
  kill -s "$signal" "$$" 2>/dev/null || exit 130
}
