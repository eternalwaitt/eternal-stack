#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STATUS=0
doctor_detect_jobs() {
  local n=4
  if command -v nproc >/dev/null 2>&1; then
    n="$(nproc 2>/dev/null || echo 4)"
  elif command -v sysctl >/dev/null 2>&1; then
    n="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
  fi
  if [[ ! "$n" =~ ^[0-9]+$ ]] || (( n < 1 )); then
    n=4
  elif (( n > 8 )); then
    n=8
  fi
  printf '%s\n' "$n"
}
DOCTOR_JOBS="${DOCTOR_JOBS:-$(doctor_detect_jobs)}"
DOCTOR_ARGS=()
DOCTOR_EXTRA_PATHS=()
DOCTOR_MODE=full
DOCTOR_PRINT_GROUPS=0
DOCTOR_DRY_RUN=0
DOCTOR_ACTIVE_GROUPS=()
DOCTOR_CHANGED_PATHS=()
DOCTOR_CHANGED_REASONS=()
DOCTOR_FALL_OPEN=0
DOCTOR_CACHE_HIT=0
DOCTOR_INSTALL_NEEDS_FULL=0
DOCTOR_LAST_GREEN_MODE=""
DOCTOR_GROUPS_RAN=()
DOCTOR_ALL_GROUPS=(deps syntax hooks skills scripts docs rules schemas settings install security optional)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --jobs)
      if [[ $# -lt 2 || -z "${2:-}" || "${2}" == --* ]]; then
        printf 'doctor: --jobs requires a value\n' >&2
        exit 2
      fi
      DOCTOR_JOBS="$2"
      shift 2
      ;;
    --jobs=*)
      DOCTOR_JOBS="${1#*=}"
      shift
      ;;
    # Opt-in incremental gate selection. Release/install paths must run full doctor
    # (see docs/RELEASING.md and scripts/install.sh); never pass --changed there.
    --changed)
      DOCTOR_MODE=changed
      shift
      ;;
    --print-groups)
      DOCTOR_PRINT_GROUPS=1
      shift
      ;;
    --dry-run)
      DOCTOR_DRY_RUN=1
      shift
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        DOCTOR_EXTRA_PATHS+=("$1")
        shift
      done
      break
      ;;
    *)
      DOCTOR_ARGS+=("$1")
      shift
      ;;
  esac
done
if [[ ! "$DOCTOR_JOBS" =~ ^[0-9]+$ ]] || (( DOCTOR_JOBS < 1 )); then
  DOCTOR_JOBS="$(doctor_detect_jobs)"
fi

SOURCE_ROOT="$ROOT"
if [[ -f "$ROOT/etrnl/install.json" ]]; then
  installed_source_root="$(jq -r '.sourceRoot // ""' "$ROOT/etrnl/install.json" 2>/dev/null || true)"
  if [[ -n "$installed_source_root" && -f "$installed_source_root/scripts/install.sh" ]]; then
    SOURCE_ROOT="$installed_source_root"
  fi
fi
if (( ${#DOCTOR_ARGS[@]} > 0 )); then
  set -- "${DOCTOR_ARGS[@]}"
else
  set --
fi
DOCTOR_RESULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/etrnl-doctor-results.XXXXXX")"
DOCTOR_ASYNC_PIDS=()
DOCTOR_HEAVY_PIDS=()
DOCTOR_BATCH_ORDER=()
DOCTOR_HEAVY_ORDER=()
DOCTOR_HEAVY_STARTED=0
# shellcheck source=scripts/lib/skill-lists.sh
source "$ROOT/scripts/lib/skill-lists.sh"

doctor_cleanup() {
  rm -rf -- "$DOCTOR_RESULT_DIR"
}

doctor_signal_cleanup() {
  local signal="${1:-TERM}"
  local pid
  if ((${#DOCTOR_HEAVY_PIDS[@]} > 0)); then
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
    DOCTOR_HEAVY_PIDS=()
  fi
  if ((${#DOCTOR_ASYNC_PIDS[@]} > 0)); then
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
    DOCTOR_ASYNC_PIDS=()
  fi
  doctor_cleanup
  trap - "$signal"
  kill -s "$signal" "$$" 2>/dev/null || exit 130
}

trap doctor_cleanup EXIT
trap 'doctor_signal_cleanup INT' INT
trap 'doctor_signal_cleanup TERM' TERM

doctor_worktree_hash() {
  node --input-type=module -e "
import { worktreeHash } from 'file://${ROOT}/scripts/lib/etrnl-state-core.mjs';
process.stdout.write(worktreeHash(process.argv[1]));
" "$ROOT" 2>/dev/null || true
}

doctor_latest_green_json() {
  local state_file="${ETRNL_STATE_DIR:-${CLAUDE_HOME:-$HOME/.claude}/etrnl/state}/events.jsonl"
  [[ -f "$state_file" ]] || return 1
  node --input-type=module -e "
import fs from 'node:fs';
import path from 'node:path';
const stateFile = process.argv[1];
const cwd = path.resolve(process.argv[2]);
let lines = [];
try {
  lines = fs.readFileSync(stateFile, 'utf8').trim().split('\\n').filter(Boolean);
} catch {
  process.exit(1);
}
const events = lines.map((line) => JSON.parse(line));
const greens = events.filter((event) => event.eventKind === 'doctor_green' && path.resolve(String(event.cwd || '')) === cwd);
greens.sort((left, right) => Number(right.eventSeq || 0) - Number(left.eventSeq || 0));
const latest = greens[0];
if (!latest) process.exit(1);
process.stdout.write(JSON.stringify({
  treeHash: String(latest.data?.treeHash || ''),
  headCommit: String(latest.data?.headCommit || ''),
  mode: String(latest.data?.mode || ''),
  groups: Array.isArray(latest.data?.groups) ? latest.data.groups : [],
}));
" "$state_file" "$ROOT" 2>/dev/null
}

doctor_group_listed() {
  local want="$1"
  local group
  if ((${#DOCTOR_ACTIVE_GROUPS[@]} == 0)); then
    return 1
  fi
  for group in "${DOCTOR_ACTIVE_GROUPS[@]}"; do
    [[ "$group" == "$want" ]] && return 0
  done
  return 1
}

doctor_add_group() {
  local group="$1"
  local reason="${2:-}"
  doctor_group_listed "$group" && return 0
  DOCTOR_ACTIVE_GROUPS+=("$group")
  if [[ -n "$reason" ]]; then
    DOCTOR_CHANGED_REASONS+=("$group:$reason")
  fi
}

doctor_set_all_groups() {
  DOCTOR_ACTIVE_GROUPS=("${DOCTOR_ALL_GROUPS[@]}")
}

doctor_map_path_to_groups() {
  local relpath="${1#./}"
  relpath="${relpath#/}"
  case "$relpath" in
    hooks/*|tests/test-hooks.sh|tests/test-workflow-tools.sh)
      doctor_add_group hooks "$relpath"
      doctor_add_group syntax "$relpath"
      ;;
    skills/metadata/*)
      doctor_add_group schemas "$relpath"
      doctor_add_group skills "$relpath"
      ;;
    skills/*)
      doctor_add_group skills "$relpath"
      doctor_add_group docs "$relpath"
      ;;
    scripts/*)
      doctor_add_group scripts "$relpath"
      doctor_add_group syntax "$relpath"
      ;;
    templates/*|etrnl/install.json)
      doctor_add_group settings "$relpath"
      doctor_add_group install "$relpath"
      ;;
    rules/*|rules-manifest.json)
      doctor_add_group rules "$relpath"
      ;;
    schemas/*)
      doctor_add_group schemas "$relpath"
      doctor_add_group hooks "$relpath"
      ;;
    tests/test-install.sh|tests/test-install-smoke.sh)
      doctor_add_group install "$relpath"
      ;;
    VERSION|docs/RELEASING.md)
      doctor_add_group docs "$relpath"
      doctor_add_group security "$relpath"
      ;;
    docs/*|README.md|AGENTS.md|CLAUDE.md|CHANGELOG.md|CONTRIBUTING.md|CREDITS.md)
      doctor_add_group docs "$relpath"
      ;;
    *)
      DOCTOR_FALL_OPEN=1
      DOCTOR_CHANGED_REASONS+=("fall-open:$relpath")
      ;;
  esac
}

doctor_install_path_needs_full() {
  local relpath="${1#./}"
  relpath="${relpath#/}"
  case "$relpath" in
    scripts/install.sh|scripts/update.sh|scripts/rollback-local.sh|scripts/uninstall.sh|scripts/bootstrap-tools.sh|scripts/merge-settings.mjs|scripts/post-upgrade-canary.sh|tests/test-install.sh|tests/test-install-smoke.sh|templates/*|etrnl/install.json)
      return 0
      ;;
  esac
  return 1
}

doctor_resolve_install_suite() {
  DOCTOR_INSTALL_NEEDS_FULL=0
  if [[ "${DOCTOR_INSTALL_SUITE:-}" == "full" ]] || [[ "${ETRNL_DOCTOR_FULL_INSTALL:-0}" == "1" ]]; then
    DOCTOR_INSTALL_NEEDS_FULL=1
    return 0
  fi
  if [[ "${DOCTOR_INSTALL_SUITE:-}" == "smoke" ]]; then
    return 0
  fi
  if [[ "$DOCTOR_MODE" == "full" ]]; then
    return 0
  fi
  if (( DOCTOR_FALL_OPEN )); then
    DOCTOR_INSTALL_NEEDS_FULL=1
    return 0
  fi
  local path
  for path in "${DOCTOR_CHANGED_PATHS[@]}"; do
    if doctor_install_path_needs_full "$path"; then
      DOCTOR_INSTALL_NEEDS_FULL=1
      return 0
    fi
  done
}

doctor_install_test_script() {
  if (( DOCTOR_INSTALL_NEEDS_FULL )) && [[ -x "$ROOT/tests/test-install.sh" ]]; then
    printf '%s\n' "$ROOT/tests/test-install.sh"
  elif [[ -x "$ROOT/tests/test-install-smoke.sh" ]]; then
    printf '%s\n' "$ROOT/tests/test-install-smoke.sh"
  elif [[ -x "$ROOT/tests/test-install.sh" ]]; then
    printf '%s\n' "$ROOT/tests/test-install.sh"
  fi
}

doctor_collect_changed_paths() {
  local -a paths=()
  local line relpath green_json green_head current_head
  if ((${#DOCTOR_EXTRA_PATHS[@]} > 0)); then
    DOCTOR_CHANGED_PATHS=("${DOCTOR_EXTRA_PATHS[@]}")
    return 0
  fi
  if green_json="$(doctor_latest_green_json)"; then
    green_head="$(printf '%s' "$green_json" | jq -r '.headCommit // ""')"
    current_head="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
    if [[ -n "$green_head" && -n "$current_head" && "$green_head" != "$current_head" ]]; then
      while IFS= read -r relpath; do
        [[ -n "$relpath" ]] && paths+=("$relpath")
      done < <(git -C "$ROOT" diff --name-only "$green_head..HEAD" 2>/dev/null || true)
    fi
  fi
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    relpath="${line#??}"
    relpath="${relpath#\"}"
    relpath="${relpath%\"}"
    [[ -n "$relpath" ]] && paths+=("$relpath")
  done < <(git -C "$ROOT" status --porcelain=v1 2>/dev/null || true)
  while IFS= read -r relpath; do
    [[ -n "$relpath" ]] && paths+=("$relpath")
  done < <(git -C "$ROOT" diff --name-only HEAD 2>/dev/null || true)
  while IFS= read -r relpath; do
    [[ -n "$relpath" ]] && paths+=("$relpath")
  done < <(git -C "$ROOT" diff --cached --name-only 2>/dev/null || true)
  if ((${#paths[@]} == 0)); then
    DOCTOR_CHANGED_PATHS=()
    return 0
  fi
  local -a unique=()
  while IFS= read -r path; do
    [[ -n "$path" ]] && unique+=("$path")
  done < <(printf '%s\n' "${paths[@]}" | sort -u)
  DOCTOR_CHANGED_PATHS=("${unique[@]}")
}

doctor_resolve_changed_groups() {
  local path current_hash green_json green_hash
  DOCTOR_ACTIVE_GROUPS=()
  DOCTOR_CHANGED_REASONS=()
  DOCTOR_FALL_OPEN=0
  DOCTOR_CACHE_HIT=0
  if [[ "$DOCTOR_MODE" == "full" && "$DOCTOR_PRINT_GROUPS" -eq 1 && ((${#DOCTOR_EXTRA_PATHS[@]} == 0)) ]]; then
    doctor_set_all_groups
    return 0
  fi
  if [[ "$DOCTOR_MODE" != "changed" && "$DOCTOR_PRINT_GROUPS" -eq 0 && "$DOCTOR_DRY_RUN" -eq 0 ]]; then
    doctor_set_all_groups
    return 0
  fi
  if [[ "$DOCTOR_MODE" == "full" && ((${#DOCTOR_EXTRA_PATHS[@]} > 0)) ]]; then
    DOCTOR_MODE=changed
  fi
  current_hash="$(doctor_worktree_hash)"
  if [[ -n "$current_hash" ]] && green_json="$(doctor_latest_green_json)"; then
    green_hash="$(printf '%s' "$green_json" | jq -r '.treeHash // ""')"
    DOCTOR_LAST_GREEN_MODE="$(printf '%s' "$green_json" | jq -r '.mode // ""')"
    if [[ -n "$green_hash" && "$current_hash" == "$green_hash" ]]; then
      doctor_collect_changed_paths
      if ((${#DOCTOR_CHANGED_PATHS[@]} == 0)) && [[ "$DOCTOR_LAST_GREEN_MODE" == "full" ]]; then
        DOCTOR_CACHE_HIT=1
        return 0
      fi
    fi
  fi
  doctor_collect_changed_paths
  if ((${#DOCTOR_CHANGED_PATHS[@]} == 0)); then
    doctor_add_group deps "no changed paths detected"
    return 0
  fi
  doctor_add_group deps "baseline"
  for path in "${DOCTOR_CHANGED_PATHS[@]}"; do
    doctor_map_path_to_groups "$path"
  done
  if (( DOCTOR_FALL_OPEN )); then
    doctor_set_all_groups
  fi
}

doctor_print_groups_summary() {
  local group
  if (( DOCTOR_CACHE_HIT )); then
    printf 'doctor-groups: cache-hit\n'
    printf 'doctor-mode: changed\n'
    printf 'ok: doctor cache hit (tree unchanged since last green %s run)\n' "${DOCTOR_LAST_GREEN_MODE:-doctor}"
    return 0
  fi
  if (( DOCTOR_FALL_OPEN )); then
    printf 'doctor-groups: %s\n' "${DOCTOR_ALL_GROUPS[*]}"
    printf 'doctor-mode: %s\n' "$DOCTOR_MODE"
    printf 'doctor-selection: fall-open full\n'
  else
    printf 'doctor-groups: %s\n' "${DOCTOR_ACTIVE_GROUPS[*]-}"
    printf 'doctor-mode: %s\n' "$DOCTOR_MODE"
    printf 'doctor-selection: mapped\n'
  fi
  if ((${#DOCTOR_CHANGED_PATHS[@]} > 0)); then
    printf 'doctor-changed-paths: %s\n' "${DOCTOR_CHANGED_PATHS[*]}"
  fi
  if ((${#DOCTOR_CHANGED_REASONS[@]} > 0)); then
    local reason
    for reason in "${DOCTOR_CHANGED_REASONS[@]}"; do
      printf 'doctor-reason: %s\n' "$reason"
    done
  fi
}

doctor_init_changed_mode() {
  if [[ "$DOCTOR_MODE" == "full" && "$DOCTOR_PRINT_GROUPS" -eq 0 && "$DOCTOR_DRY_RUN" -eq 0 ]]; then
    doctor_set_all_groups
    return 0
  fi
  doctor_resolve_changed_groups
  if (( DOCTOR_CACHE_HIT )); then
    doctor_print_groups_summary
    exit 0
  fi
  if (( DOCTOR_PRINT_GROUPS )); then
    doctor_print_groups_summary
    exit 0
  fi
  if (( DOCTOR_DRY_RUN )); then
    doctor_print_groups_summary
    printf 'doctor-dry-run: skipping gate execution\n'
    exit 0
  fi
  if [[ "$DOCTOR_MODE" == "changed" ]]; then
    if (( DOCTOR_FALL_OPEN )); then
      printf 'doctor: --changed fall-open to full doctor (%d changed path(s))\n' "${#DOCTOR_CHANGED_PATHS[@]}"
    else
      printf 'doctor: --changed running groups: %s (%d changed path(s))\n' "${DOCTOR_ACTIVE_GROUPS[*]-}" "${#DOCTOR_CHANGED_PATHS[@]}"
    fi
    local reason
    for reason in "${DOCTOR_CHANGED_REASONS[@]}"; do
      printf 'doctor-reason: %s\n' "$reason"
    done
  fi
}

doctor_group_enabled() {
  local group="$1"
  if [[ "$DOCTOR_MODE" == "full" ]]; then
    return 0
  fi
  if (( DOCTOR_FALL_OPEN )); then
    return 0
  fi
  doctor_group_listed "$group"
}

doctor_note_group() {
  local group="$1"
  local seen
  if ((${#DOCTOR_GROUPS_RAN[@]} > 0)); then
    for seen in "${DOCTOR_GROUPS_RAN[@]}"; do
      [[ "$seen" == "$group" ]] && return 0
    done
  fi
  DOCTOR_GROUPS_RAN+=("$group")
}

doctor_record_green() {
  local mode="$1"
  shift
  local -a groups=("$@")
  local tree_hash head_commit groups_json payload
  tree_hash="$(doctor_worktree_hash)"
  head_commit="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  if ((${#groups[@]} == 0)); then
    groups_json='[]'
  else
    groups_json="$(printf '%s\n' "${groups[@]}" | jq -R . | jq -s -c .)"
  fi
  payload="$(jq -cn \
    --arg tree_hash "$tree_hash" \
    --arg head "$head_commit" \
    --arg mode "$mode" \
    --argjson groups "$groups_json" \
    --arg cwd "$ROOT" \
    '{eventKind:"doctor_green",cwd:$cwd,data:{treeHash:$tree_hash,headCommit:$head,mode:$mode,groups:$groups}}')"
  if printf '%s\n' "$payload" | node "$ROOT/scripts/etrnl-state.mjs" append --cwd "$ROOT" >/dev/null 2>&1; then
    ok "doctor green state recorded ($mode)"
  else
    ok "doctor green state record skipped (fail-open)"
  fi
}

ok() { printf 'ok: %s\n' "$*"; }
fail() { printf 'fail: %s\n' "$*" >&2; STATUS=1; }

require_command() {
  local dep="$1"
  if command -v "$dep" >/dev/null 2>&1; then
    ok "$dep available"
  else
    fail "$dep missing"
  fi
}

optional_command() {
  local dep="$1"
  local present_msg="$2"
  local missing_msg="$3"
  if command -v "$dep" >/dev/null 2>&1; then
    ok "$present_msg"
  else
    ok "$missing_msg"
  fi
}

report_command() {
  local present_msg="$1"
  local failure_msg="$2"
  local output_file
  shift 2
  output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
  if "$@" >"$output_file" 2>&1; then
    ok "$present_msg"
  elif [[ -s "$output_file" ]]; then
    fail "$failure_msg: $(tail -n 40 "$output_file")"
  else
    fail "$failure_msg"
  fi
  rm -f "$output_file"
}

queue_async_command() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  shift 3
  DOCTOR_BATCH_ORDER+=("$slot")
  (
    local output_file
    output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
    if "$@" >"$output_file" 2>&1; then
      printf 'ok\t%s\n' "$present_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
    elif [[ -s "$output_file" ]]; then
      printf 'fail\t%s: %s\n' "$failure_msg" "$(tail -n 40 "$output_file")" >"$DOCTOR_RESULT_DIR/${slot}.result"
    else
      printf 'fail\t%s\n' "$failure_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
    fi
    rm -f "$output_file"
  ) &
  DOCTOR_ASYNC_PIDS+=("$!")
}

doctor_write_async_result() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  local output_file="$4"
  local exit_code="$5"
  if (( exit_code == 0 )); then
    printf 'ok\t%s\n' "$present_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
  elif [[ -s "$output_file" ]]; then
    printf 'fail\t%s: %s\n' "$failure_msg" "$(tail -n 40 "$output_file")" >"$DOCTOR_RESULT_DIR/${slot}.result"
  else
    printf 'fail\t%s\n' "$failure_msg" >"$DOCTOR_RESULT_DIR/${slot}.result"
  fi
}

queue_heavy_async_command() {
  local slot="$1"
  local present_msg="$2"
  local failure_msg="$3"
  shift 3
  DOCTOR_HEAVY_ORDER+=("$slot")
  (
    local output_file exit_code
    output_file="$(mktemp "${TMPDIR:-/tmp}/etrnl-doctor.XXXXXX")"
    if "$@" >"$output_file" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi
    doctor_write_async_result "$slot" "$present_msg" "$failure_msg" "$output_file" "$exit_code"
    rm -f "$output_file"
  ) &
  DOCTOR_HEAVY_PIDS+=("$!")
}

doctor_active_job_count() {
  echo $(( ${#DOCTOR_ASYNC_PIDS[@]} + ${#DOCTOR_HEAVY_PIDS[@]} ))
}

doctor_reap_async_pids() {
  local -a still_running=()
  local pid
  if (( ${#DOCTOR_ASYNC_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        still_running+=("$pid")
      else
        wait "$pid" || true
      fi
    done
  fi
  if (( ${#still_running[@]} > 0 )); then
    DOCTOR_ASYNC_PIDS=("${still_running[@]}")
  else
    DOCTOR_ASYNC_PIDS=()
  fi
}

doctor_reap_heavy_pids() {
  local -a still_running=()
  local pid
  if (( ${#DOCTOR_HEAVY_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        still_running+=("$pid")
      else
        wait "$pid" || true
      fi
    done
  fi
  if (( ${#still_running[@]} > 0 )); then
    DOCTOR_HEAVY_PIDS=("${still_running[@]}")
  else
    DOCTOR_HEAVY_PIDS=()
  fi
}

wait_for_doctor_job_slot() {
  local max_jobs="$1"
  until (( $(doctor_active_job_count) < max_jobs )); do
    doctor_reap_async_pids
    doctor_reap_heavy_pids
    sleep 0.05
  done
}

flush_async_batch() {
  local pid slot status msg
  if (( ${#DOCTOR_ASYNC_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_ASYNC_PIDS[@]}"; do
      wait "$pid" || true
    done
  fi
  DOCTOR_ASYNC_PIDS=()
  if (( ${#DOCTOR_BATCH_ORDER[@]} > 0 )); then
    for slot in "${DOCTOR_BATCH_ORDER[@]}"; do
      if [[ ! -f "$DOCTOR_RESULT_DIR/${slot}.result" ]]; then
        fail "doctor async result missing for $slot"
        continue
      fi
      IFS=$'\t' read -r status msg <"$DOCTOR_RESULT_DIR/${slot}.result" || true
      if [[ "$status" == "ok" ]]; then
        ok "$msg"
      else
        fail "$msg"
      fi
      rm -f "$DOCTOR_RESULT_DIR/${slot}.result"
    done
  fi
  DOCTOR_BATCH_ORDER=()
}

start_heavy_async_checks() {
  local hook_test
  (( DOCTOR_HEAVY_STARTED )) && return 0
  DOCTOR_HEAVY_STARTED=1
  if doctor_group_enabled hooks && (( ${#hook_tests[@]} > 0 )); then
    doctor_note_group hooks
    for hook_test in "${hook_tests[@]}"; do
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_heavy_async_command "heavy-$(basename "$hook_test")" "$(basename "$hook_test") pass" "$(basename "$hook_test") fail" "$hook_test"
    done
  fi
  if doctor_group_enabled install; then
    local install_test install_msg_ok install_msg_fail install_slot
    doctor_resolve_install_suite
    install_test="$(doctor_install_test_script)"
    if [[ -n "$install_test" ]]; then
      doctor_note_group install
      if (( DOCTOR_INSTALL_NEEDS_FULL )); then
        install_msg_ok="install/rollback tests pass"
        install_msg_fail="install/rollback tests fail"
        install_slot="heavy-test-install"
      else
        install_msg_ok="install smoke tests pass"
        install_msg_fail="install smoke tests fail"
        install_slot="heavy-test-install-smoke"
      fi
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      if (( DOCTOR_INSTALL_NEEDS_FULL )); then
        queue_heavy_async_command "$install_slot" "$install_msg_ok" "$install_msg_fail" "$install_test"
      else
        queue_heavy_async_command "$install_slot" "$install_msg_ok" "$install_msg_fail" env RUN_INSTALL_SMOKE_MODE=fast "$install_test"
      fi
    fi
  fi
  if doctor_group_enabled scripts && [[ -x "$ROOT/tests/test-read-stdin.sh" ]]; then
    doctor_note_group scripts
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-read-stdin" "read-stdin tests pass" "read-stdin tests fail" "$ROOT/tests/test-read-stdin.sh"
  fi
  if doctor_group_enabled hooks && [[ -d "$ROOT/hooks/fixtures/events/replay" ]]; then
    doctor_note_group hooks
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-replay-fixtures" "replay fixtures clean" "replay fixtures failed" node "$ROOT/scripts/replay-hook-fixtures.mjs"
  fi
  if doctor_group_enabled scripts && [[ -x "$ROOT/tests/run-node-tests.sh" ]]; then
    doctor_note_group scripts
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_heavy_async_command "heavy-node-tests" "node test suites pass" "node test suites fail" "$ROOT/tests/run-node-tests.sh"
  fi
}

flush_heavy_async_checks() {
  local pid slot status msg
  (( DOCTOR_HEAVY_STARTED )) || return 0
  if (( ${#DOCTOR_HEAVY_PIDS[@]} > 0 )); then
    for pid in "${DOCTOR_HEAVY_PIDS[@]}"; do
      wait "$pid" || true
    done
  fi
  DOCTOR_HEAVY_PIDS=()
  if (( ${#DOCTOR_HEAVY_ORDER[@]} > 0 )); then
    for slot in "${DOCTOR_HEAVY_ORDER[@]}"; do
      if [[ ! -f "$DOCTOR_RESULT_DIR/${slot}.result" ]]; then
        fail "doctor async result missing for $slot"
        continue
      fi
      IFS=$'\t' read -r status msg <"$DOCTOR_RESULT_DIR/${slot}.result" || true
      if [[ "$status" == "ok" ]]; then
        ok "$msg"
      else
        fail "$msg"
      fi
      rm -f "$DOCTOR_RESULT_DIR/${slot}.result"
    done
  fi
  DOCTOR_HEAVY_ORDER=()
}

run_parallel_syntax_checks() {
  local script slot=0 id
  local -a syntax_scripts=(
    agent-task-packet-check guard-override-token replay-hook-fixtures execution-ledger etrnl-state
    execute-evidence-check execution-wave-check tool-effectiveness tool-stack-check stack-profile-check
    code-health-ledger-check documentation-comment-health documentation-health-ledger-check review-log
    project-buglog browser-qa-report context-state canary-codex-hindsight live-hook-noise-report session-deep-dive session-audit workflow-health
    prompt-budget-check skill-contract-check skill-behavior-smoke skill-update-prompt disk-cleanup-manifest
    performance-baseline pr-preflight changelog-release-check changelog-scaffold port-guard update-check
    settings-audit review-rules review-learn diff-triviality
  )
  for script in "${syntax_scripts[@]}"; do
    if [[ -f "$ROOT/scripts/$script.mjs" ]]; then
      slot=$((slot + 1))
      id="$(printf 'syntax-%03d-%s' "$slot" "$script")"
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_async_command "$id" "$script syntax valid" "$script syntax invalid" node --check "$ROOT/scripts/$script.mjs"
    else
      fail "$script script missing"
    fi
  done
  flush_async_batch
}

run_parallel_schema_checks() {
  local json_dir dir json_file slot=0 id found_json
  for json_dir in schemas skills/metadata; do
    dir="$ROOT/$json_dir"
    if [[ ! -d "$dir" ]]; then
      fail "$json_dir directory missing"
      continue
    fi
    found_json=0
    for json_file in "$dir"/*.json; do
      [[ -e "$json_file" ]] || continue
      found_json=1
      slot=$((slot + 1))
      id="$(printf 'schema-%03d-%s' "$slot" "$(basename "$json_file")")"
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_async_command "$id" "$json_dir/$(basename "$json_file") valid JSON" "$json_dir/$(basename "$json_file") invalid JSON" jq empty "$json_file"
    done
    if [[ "$found_json" -eq 0 ]]; then
      fail "$json_dir contains no JSON files"
    fi
  done
  flush_async_batch
}

run_parallel_settings_checks() {
  if [[ -f "$ROOT/templates/settings.json" && -f "$ROOT/templates/settings.strict.json" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "settings-templates-json" "settings templates valid" "settings template invalid" jq empty "$ROOT/templates/settings.json" "$ROOT/templates/settings.strict.json" "$ROOT/templates/settings.local.example.json"
    if [[ -f "$ROOT/templates/hindsight/claude-code.local-daemon.json" && -f "$ROOT/templates/hindsight/claude-code.external.example.json" ]]; then
      wait_for_doctor_job_slot "$DOCTOR_JOBS"
      queue_async_command "settings-hindsight-json" "hindsight config templates valid" "hindsight config template invalid" jq empty "$ROOT/templates/hindsight/claude-code.local-daemon.json" "$ROOT/templates/hindsight/claude-code.external.example.json"
    fi
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "settings-default-audit" "settings default audit clean" "settings default audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/templates/settings.json" --strict-conflicts
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "settings-strict-audit" "settings strict audit clean" "settings strict audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/templates/settings.strict.json" --strict-conflicts
    flush_async_batch
    if jq -e '.hooks.PreToolUse and .hooks.PostToolUse and .hooks.PostToolUseFailure and .hooks.Stop and .hooks.SubagentStop and .hooks.PreCompact and .hooks.PostCompact' "$ROOT/templates/settings.strict.json" >/dev/null; then
      ok "strict template registers blocker hooks"
    else
      fail "strict template missing blocker hooks"
    fi
  elif [[ -f "$ROOT/settings.json" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "settings-installed-json" "installed settings valid" "installed settings invalid" jq empty "$ROOT/settings.json"
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "settings-installed-audit" "installed settings audit clean" "installed settings audit failed" node "$ROOT/scripts/settings-audit.mjs" "$ROOT/settings.json" --strict-conflicts
    flush_async_batch
  else
    ok "settings template check skipped outside source checkout"
  fi
}

run_parallel_scripts_fixture_checks() {
  if [[ -d "$ROOT/tests/fixtures/tool-effectiveness" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-tool-effectiveness-fixtures" "tool-effectiveness fixtures valid" "tool-effectiveness fixtures invalid" node "$ROOT/scripts/tool-effectiveness.mjs" validate-fixtures --fixtures "$ROOT/tests/fixtures/tool-effectiveness"
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-tool-effectiveness-summary" "tool-effectiveness fixture summary runs" "tool-effectiveness fixture summary failed" node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --json
  fi
  if [[ -d "$ROOT/tests/fixtures/etrnl-state" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-etrnl-state-fixtures" "etrnl-state fixtures valid" "etrnl-state fixtures invalid" node "$ROOT/scripts/etrnl-state.mjs" validate --fixtures "$ROOT/tests/fixtures/etrnl-state"
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-etrnl-state-doctor" "etrnl-state compact doctor runs" "etrnl-state compact doctor failed" node "$ROOT/scripts/etrnl-state.mjs" doctor --compact --explain
  fi
  if [[ -f "$ROOT/templates/stack-profile.core.json" && -f "$ROOT/templates/stack-profile.full.json" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-stack-profile-core" "core stack profile valid" "core stack profile invalid" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.core.json"
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "scripts-stack-profile-full" "full stack profile valid" "full stack profile invalid" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.full.json"
  fi
  flush_async_batch
}

run_parallel_skill_checks() {
  if [[ -f "$ROOT/scripts/prompt-budget-check.mjs" ]]; then
    wait_for_doctor_job_slot "$DOCTOR_JOBS"
    queue_async_command "skills-prompt-budget" "repo-owned prompt budget check clean" "repo-owned prompt budget check failed" node "$ROOT/scripts/prompt-budget-check.mjs" "$ROOT" --owned-only
  fi
  wait_for_doctor_job_slot "$DOCTOR_JOBS"
  queue_async_command "skills-contract-check" "etrnl skill contracts clean" "etrnl skill contract check failed" node "$ROOT/scripts/skill-contract-check.mjs" --root "$ROOT"
  wait_for_doctor_job_slot "$DOCTOR_JOBS"
  queue_async_command "skills-behavior-smoke" "etrnl skill behavior smoke clean" "etrnl skill behavior smoke failed" node "$ROOT/scripts/skill-behavior-smoke.mjs" --root "$ROOT"
  flush_async_batch
}

line_count_file() {
  local file="$1"
  wc -l <"$file" | tr -d ' '
}

file_has_exact_line() {
  local file="$1"
  local expected="$2"
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "$expected" ]] && return 0
  done <"$file"
  return 1
}

check_startup_file_budget() {
  local file="$1"
  local label="$2"
  local count
  count="$(line_count_file "$file")"
  if (( count <= 200 )); then
    ok "$label concise ($count lines)"
  else
    fail "$label too large ($count lines; target <= 200)"
  fi
}

doctor_init_changed_mode

for dep in jq git node rg; do
  doctor_note_group deps
  require_command "$dep"
done
if doctor_group_enabled deps; then
  doctor_note_group deps
  optional_command fd "fd available" "fd unavailable; some workflows fall back to slower file scans"
  optional_command sg "sg available" "sg unavailable; live hooks fail open"
  optional_command ast-grep "ast-grep available (review-rules ast_grep rules can evaluate)" "ast-grep unavailable; review-rules ast_grep rules exit 2 (cannot-evaluate), not a false pass"
fi

if doctor_group_enabled scripts; then
  doctor_note_group scripts
  if [[ -f "$ROOT/scripts/bootstrap-tools.sh" ]]; then
    report_command "bootstrap-tools syntax valid" "bootstrap-tools syntax invalid" bash -n "$ROOT/scripts/bootstrap-tools.sh"
  else
    fail "bootstrap-tools script missing"
  fi
fi

if doctor_group_enabled hooks; then
  doctor_note_group hooks
  # The Stop-verifier triviality fast-path needs schemas/ beside scripts/.
  if [[ -f "$ROOT/scripts/diff-triviality.mjs" ]]; then
    if triviality_out="$(node "$ROOT/scripts/diff-triviality.mjs" classify --json README.md 2>/dev/null)" \
      && printf '%s' "$triviality_out" | jq -e '.trivial == true' >/dev/null 2>&1; then
      ok "diff-triviality resolves its schema (Stop-verifier fast-path live)"
    else
      fail "diff-triviality cannot resolve schemas/review-classification-rules-v1.json; Stop-verifier fast-path is dead (install schemas/)"
    fi
  fi

  if [[ -f "$ROOT/hooks/lib/skill-hints.sh" ]]; then
    if rg -q 'skill-lists\.sh' "$ROOT/hooks/lib/skill-hints.sh" \
      && rg -q 'OWNED_SKILLS' "$ROOT/hooks/lib/skill-hints.sh"; then
      ok "skill-hints derive from OWNED_SKILLS via skill-lists.sh"
    else
      fail "hooks/lib/skill-hints.sh must source skill-lists.sh and use OWNED_SKILLS"
    fi
  else
    fail "hooks/lib/skill-hints.sh missing"
  fi
fi

hook_tests=()
if doctor_group_enabled hooks; then
  if [[ -x "$ROOT/tests/test-hooks.sh" ]]; then
    hook_tests+=("$ROOT/tests/test-hooks.sh")
    [[ -x "$ROOT/tests/test-workflow-tools.sh" ]] && hook_tests+=("$ROOT/tests/test-workflow-tools.sh")
  elif [[ -x "$ROOT/hooks/test-hooks.sh" ]]; then
    hook_tests+=("$ROOT/hooks/test-hooks.sh")
    [[ -x "$ROOT/hooks/test-workflow-tools.sh" ]] && hook_tests+=("$ROOT/hooks/test-workflow-tools.sh")
  fi
  if (( ${#hook_tests[@]} > 0 )); then
    :
  else
    ok "hook tests skipped outside source checkout"
  fi
fi
if doctor_group_enabled install; then
  if [[ -x "$ROOT/tests/test-install.sh" || -x "$ROOT/tests/test-install-smoke.sh" ]]; then
    :
  else
    ok "install/rollback tests skipped outside source checkout"
  fi
fi
if doctor_group_enabled hooks || doctor_group_enabled install || doctor_group_enabled scripts; then
  start_heavy_async_checks
fi

if doctor_group_enabled scripts; then
  doctor_note_group scripts
  if [[ -f "$ROOT/scripts/merge-settings.mjs" ]]; then
    report_command "merge-settings syntax valid" "merge-settings syntax invalid" node --check "$ROOT/scripts/merge-settings.mjs"
  else
    # Installed doctors run after settings were already merged; source checkouts must still keep merge-settings.mjs.
    ok "merge-settings check skipped outside source checkout"
  fi
  if [[ -f "$ROOT/scripts/settings-audit.mjs" ]]; then
    report_command "settings-audit syntax valid" "settings-audit syntax invalid" node --check "$ROOT/scripts/settings-audit.mjs"
  else
    fail "settings-audit script missing"
  fi
  if [[ -f "$ROOT/scripts/code-health-inventory.mjs" ]]; then
    report_command "code-health inventory syntax valid" "code-health inventory syntax invalid" node --check "$ROOT/scripts/code-health-inventory.mjs"
    # Installed doctor runs outside the source checkout; inventory requires git context.
    if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
      report_command "code-health inventory runs" "code-health inventory failed" node "$ROOT/scripts/code-health-inventory.mjs" --json --quiet
    else
      ok "code-health inventory run skipped outside source checkout"
    fi
  else
    fail "code-health inventory script missing"
  fi
  if [[ -f "$ROOT/scripts/plan-readiness-check.mjs" ]]; then
    report_command "plan readiness syntax valid" "plan readiness syntax invalid" node --check "$ROOT/scripts/plan-readiness-check.mjs"
  else
    fail "plan readiness script missing"
  fi
  if [[ -f "$ROOT/scripts/deep-stack-check.mjs" ]]; then
    report_command "deep-stack check syntax valid" "deep-stack check syntax invalid" node --check "$ROOT/scripts/deep-stack-check.mjs"
  else
    fail "deep-stack check script missing"
  fi
fi
if doctor_group_enabled hooks; then
  doctor_note_group hooks
  if [[ -f "$ROOT/scripts/codex-rtk-pre-tool-use.sh" ]]; then
    report_command "codex RTK hook syntax valid" "codex RTK hook syntax invalid" bash -n "$ROOT/scripts/codex-rtk-pre-tool-use.sh"
  else
    fail "codex RTK hook script missing"
  fi
fi
if doctor_group_enabled syntax; then
  doctor_note_group syntax
  run_parallel_syntax_checks
fi
if doctor_group_enabled scripts; then
  if [[ -f "$ROOT/scripts/lib/read-stdin.mjs" ]]; then
    report_command "read-stdin helper syntax valid" "read-stdin helper syntax invalid" node --check "$ROOT/scripts/lib/read-stdin.mjs"
  else
    fail "read-stdin helper missing"
  fi
  if [[ -d "$ROOT/tests/fixtures/tool-effectiveness" || -d "$ROOT/tests/fixtures/etrnl-state" || ( -f "$ROOT/templates/stack-profile.core.json" && -f "$ROOT/templates/stack-profile.full.json" ) ]]; then
    run_parallel_scripts_fixture_checks
  fi
fi
if doctor_group_enabled hooks; then
  for hook_file in "${CRITICAL_HOOKS[@]}"; do
    if [[ -f "$ROOT/hooks/$hook_file" ]]; then
      ok "critical hook present: $hook_file"
    else
      fail "critical hook missing: $hook_file"
    fi
  done
fi
if doctor_group_enabled scripts; then
  for script_file in "${CRITICAL_SCRIPTS[@]}"; do
    if [[ -f "$ROOT/scripts/$script_file" ]]; then
      ok "critical script present: $script_file"
    else
      fail "critical script missing: $script_file"
    fi
  done
fi
if doctor_group_enabled skills; then
  doctor_note_group skills
  run_parallel_skill_checks
fi
if doctor_group_enabled hooks; then
  if [[ ! -d "$ROOT/hooks/fixtures/events/replay" ]]; then
    fail "replay fixture directory missing"
  fi
fi

if doctor_group_enabled settings; then
  doctor_note_group settings
  run_parallel_settings_checks
fi

if doctor_group_enabled schemas; then
  doctor_note_group schemas
  run_parallel_schema_checks
fi

if doctor_group_enabled scripts; then
  doctor_note_group scripts
  stack_profile=""
  if [[ -f "$ROOT/etrnl/install.json" ]]; then
    stack_profile="$(jq -r '.stackProfile // ""' "$ROOT/etrnl/install.json" 2>/dev/null || true)"
  fi
  if [[ -x "$ROOT/scripts/canary-hindsight.sh" ]]; then
    report_command "hindsight canary syntax valid" "hindsight canary syntax invalid" bash -n "$ROOT/scripts/canary-hindsight.sh"
    if [[ "$stack_profile" == "full" || "${ETRNL_REQUIRE_HINDSIGHT:-0}" == "1" ]]; then
      report_command "hindsight canary green" "hindsight canary red" env HINDSIGHT_CANARY_REQUIRE_HEALTH=1 "$ROOT/scripts/canary-hindsight.sh" --json
    elif hindsight_posture="$("$ROOT/scripts/canary-hindsight.sh" --json 2>/dev/null)"; then
      if jq -e . >/dev/null 2>&1 <<<"$hindsight_posture"; then
        ok "hindsight posture green: $(jq -r '(.mode // "") + " " + (.health // "")' <<<"$hindsight_posture")"
      else
        ok "hindsight posture returned non-JSON output; optional for core/source profile"
      fi
    else
      ok "hindsight posture red but optional for core/source profile"
    fi
  fi
fi

if doctor_group_enabled skills || doctor_group_enabled docs; then
  doctor_group_enabled skills && doctor_note_group skills
  doctor_group_enabled docs && doctor_note_group docs
  if [[ -d "$ROOT/skills" && -f "$ROOT/docs/skills.md" ]]; then
  skill_check_failed=0
  installed_root=0
  if [[ -f "$ROOT/etrnl/install.json" ]]; then
    installed_root=1
  fi
  for skill_dir in "${OWNED_SKILLS[@]}"; do
    skill_file="$ROOT/skills/$skill_dir/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
      fail "owned skill missing: $skill_dir"
      skill_check_failed=1
      continue
    fi
    skill_name=""
    if command -v yq >/dev/null 2>&1; then
      skill_name="$(yq -r '.name // ""' "$skill_file" 2>/dev/null || true)"
    fi
    if [[ -z "$skill_name" ]]; then
      # Fallback for systems without yq: use rg and trim common YAML quotes.
      name_line="$(rg -m 1 '^name:' "$skill_file" || true)"
      skill_name="$(printf '%s' "${name_line#name:}" | xargs)"
      first_char="${skill_name:0:1}"
      last_char="${skill_name: -1}"
      if [[ ${#skill_name} -ge 2 && "$first_char" == "$last_char" && ( "$first_char" == '"' || "$first_char" == "'" ) ]]; then
        skill_name="${skill_name:1:${#skill_name}-2}"
      fi
    fi
    skill_name="$(printf '%s' "$skill_name" | xargs)"
    if [[ "$skill_name" != "$skill_dir" ]]; then
      fail "skill name mismatch in $skill_file: $skill_name"
      skill_check_failed=1
    elif ! rg -F "/$skill_dir" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing /$skill_dir"
      skill_check_failed=1
    fi
    if [[ "$installed_root" == "1" && ! -f "$ROOT/commands/$skill_dir.md" ]]; then
      fail "installed slash command missing: $skill_dir"
      skill_check_failed=1
    fi
  done
  for skill_dir in "${REMOVED_SKILLS[@]}"; do
    if [[ -d "$ROOT/skills/$skill_dir" ]]; then
      fail "removed repo-owned skill still installed: $skill_dir"
      skill_check_failed=1
    fi
  done
  if [[ "$skill_check_failed" == "0" ]]; then
    ok "etrnl skill namespace documented"
  fi
else
  fail "skills directory or docs/skills.md missing"
  fi

  if [[ -d "$ROOT/commands" && -f "$ROOT/docs/skills.md" ]]; then
  command_check_failed=0
  for command_name in "${OWNED_COMMANDS[@]}"; do
    command_file="$ROOT/commands/$command_name.md"
    if [[ ! -f "$command_file" ]]; then
      fail "owned command missing: $command_name"
      command_check_failed=1
    elif ! rg -F "/$command_name" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing /$command_name"
      command_check_failed=1
    fi
  done
  if [[ "$command_check_failed" == "0" ]]; then
    ok "custom commands installed and documented"
  fi
else
  fail "commands directory or docs/skills.md missing"
  fi

  if [[ -d "$ROOT/agents" ]]; then
  agent_check_failed=0
  for agent in "${OWNED_AGENTS[@]}"; do
    agent_file="$ROOT/agents/$agent.md"
    if [[ ! -f "$agent_file" ]]; then
      fail "owned agent missing: $agent"
      agent_check_failed=1
    elif ! rg -F "name: $agent" "$agent_file" >/dev/null; then
      fail "agent name mismatch in $agent_file"
      agent_check_failed=1
    elif ! rg -F "$agent" "$ROOT/docs/skills.md" >/dev/null; then
      fail "docs/skills.md missing agent $agent"
      agent_check_failed=1
    fi
  done
  if [[ "$agent_check_failed" == "0" ]]; then
    ok "etrnl agents installed and documented"
  fi
else
  fail "agents directory missing"
  fi
fi

if doctor_group_enabled scripts; then
  doctor_note_group scripts
  runs_dir="${ETRNL_RUNS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/etrnl/runs}"
artifact_dir="${ETRNL_ARTIFACTS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/etrnl/artifacts}"
if [[ -d "$runs_dir" ]]; then
  ok "workflow ledger directory present"
else
  ok "workflow ledger directory not created yet"
fi
if [[ -d "$artifact_dir" ]]; then
  ok "workflow artifact directory present"
else
  ok "workflow artifact directory not created yet"
fi
if [[ -f "$ROOT/scripts/workflow-health.mjs" ]]; then
  if workflow_health="$(ETRNL_RUNS_DIR="$runs_dir" ETRNL_ARTIFACTS_DIR="$artifact_dir" node "$ROOT/scripts/workflow-health.mjs" 2>&1)"; then
    ok "workflow health summary available"
    while IFS= read -r line; do
      [[ -n "$line" ]] && ok "workflow health: $line"
    done <<<"$workflow_health"
  else
    fail "workflow health summary failed: $workflow_health"
  fi
  workflow_doctor_args=(doctor --json)
  if [[ "${ETRNL_DOCTOR_STRICT_RUNTIME:-0}" == "1" ]]; then
    workflow_doctor_args+=(--strict)
  fi
  if workflow_doctor="$(ETRNL_RUNS_DIR="$runs_dir" ETRNL_ARTIFACTS_DIR="$artifact_dir" node "$ROOT/scripts/workflow-health.mjs" "${workflow_doctor_args[@]}" 2>&1)"; then
    ok "workflow runtime doctor available"
  else
    fail "workflow runtime doctor failed: $workflow_doctor"
  fi
  if jq -e . >/dev/null 2>&1 <<<"$workflow_doctor"; then
    runtime_findings_count="$(jq -r '.runtimeFindings | length' <<<"$workflow_doctor")"
    ok "workflow runtime findings=${runtime_findings_count}"
  fi
fi
fi

if doctor_group_enabled optional; then
  doctor_note_group optional
  optional_command codex "optional Codex escalation available" "optional Codex escalation not installed"
  codex_target="${CODEX_HOME:-$HOME/.codex}"
  codex_config="$codex_target/config.toml"
  codex_byte_budget=32768
  if [[ -f "$codex_config" ]]; then
    parsed_budget="$(python3 -c "
import re, sys
with open('$codex_config') as f:
    content = f.read()
m = re.search(r'project_doc_max_bytes\s*=\s*([0-9]+)', content)
print(m.group(1) if m else '')
" 2>/dev/null)" || parsed_budget=""
    if [[ -n "$parsed_budget" && "$parsed_budget" =~ ^[0-9]+$ ]]; then
      codex_byte_budget="$parsed_budget"
      ok "Codex byte budget from config.toml: $codex_byte_budget"
    else
      ok "Codex byte budget: default $codex_byte_budget (project_doc_max_bytes not set in config.toml)"
    fi
  else
    ok "Codex byte budget: default $codex_byte_budget (~/.codex/config.toml not present)"
  fi
  codex_warn_threshold=$(( codex_byte_budget * 75 / 100 ))
  if [[ -f "$codex_target/AGENTS.md" ]]; then
    agents_bytes="$(wc -c < "$codex_target/AGENTS.md" | tr -d ' ')"
    if (( agents_bytes > codex_byte_budget )); then
      fail "~/.codex/AGENTS.md exceeds byte budget ($agents_bytes > $codex_byte_budget)"
    elif (( agents_bytes > codex_warn_threshold )); then
      fail "~/.codex/AGENTS.md at $agents_bytes bytes (>75% of $codex_byte_budget budget)"
    else
      ok "~/.codex/AGENTS.md within byte budget ($agents_bytes / $codex_byte_budget)"
    fi
  else
    ok "~/.codex/AGENTS.md not installed (ETRNL_INSTALL_STARTUP gated)"
  fi
  optional_command gemini "optional Gemini escalation available" "optional Gemini escalation not installed"
  optional_command playwright-cli "optional browser QA tool available" "optional browser QA tool not installed"
  optional_command react-doctor "optional React/Next linter (react-doctor) available" "optional React/Next linter (react-doctor) not installed"
  if [[ -x "$HOME/.claude/skills/gstack/bin/design" || -x "$HOME/.agents/skills/gstack/bin/design" || -x "$HOME/.gstack/repos/gstack/bin/design" ]]; then
    ok "optional design/mock tool available"
  else
    ok "optional design/mock tool not installed"
  fi
  if [[ -d "$ROOT/.codegraph" ]]; then
    ok "codegraph index present (index-first discovery active for scout/investigator)"
  else
    ok "no codegraph index (index-first discovery not applicable)"
  fi
fi

if doctor_group_enabled scripts; then
  if token_report="$(node "$ROOT/scripts/token-savings.mjs" report --json 2>/dev/null)"; then
    token_total="$(printf '%s' "$token_report" | jq -r '.totals.totalOutputTokens // 0' 2>/dev/null || echo 0)"
    token_negatives="$(printf '%s' "$token_report" | jq -r '.totals.netNegativeRecords // 0' 2>/dev/null || echo 0)"
    ok "subagent token accounting: ${token_total} scored output tokens, ${token_negatives} net-negative record(s)"
  else
    ok "subagent token accounting: report unavailable (no ledger records yet)"
  fi
fi

if doctor_group_enabled rules; then
  doctor_note_group rules
  if [[ -d "$ROOT/rules/etrnl" ]]; then
    for rule in workflow quality tools safety identity domains; do
      if [[ -f "$ROOT/rules/etrnl/$rule.md" ]]; then
        ok "rule present: $rule"
      else
        fail "rule missing: $rule"
      fi
    done
  else
    fail "rules/etrnl missing"
  fi

  if [[ -f "$ROOT/rules-manifest.json" ]]; then
    if jq empty "$ROOT/rules-manifest.json" >/dev/null 2>&1; then
      ok "rules-manifest.json is valid JSON"
      manifest_schema="$(jq -r '.schemaVersion // empty' "$ROOT/rules-manifest.json" 2>/dev/null)"
      if [[ "$manifest_schema" == "1" ]]; then
        ok "rules-manifest.json schemaVersion=1"
      else
        fail "rules-manifest.json schemaVersion unexpected: ${manifest_schema:-missing}"
      fi
      banned_count="$(jq -r '.privacy.bannedTokens | length' "$ROOT/rules-manifest.json" 2>/dev/null || echo "0")"
      banned_source="$(jq -r '.privacy.bannedTokensSource // ""' "$ROOT/rules-manifest.json" 2>/dev/null || echo "")"
      if (( banned_count > 0 )); then
        ok "rules-manifest.json bannedTokens=$banned_count"
      elif [[ -n "$banned_source" ]]; then
        if [[ -f "$ROOT/$banned_source" ]]; then
          overlay_count="$(jq -r '
            .bannedTokens as $t
            | if (($t|type)=="array") and (($t|length)>0)
                 and ($t|all((type=="string") and ((gsub("\\s";"")|length)>0)))
              then ($t|length) else "invalid" end' "$ROOT/$banned_source" 2>/dev/null || echo "invalid")"
          if [[ "$overlay_count" =~ ^[0-9]+$ ]] && (( overlay_count > 0 )); then
            ok "rules-manifest.json privacy gate active via overlay: $banned_source ($overlay_count tokens)"
          else
            fail "rules-manifest.json privacy overlay present but is not a non-empty array of non-empty string tokens; gate inactive: $banned_source"
          fi
        else
          ok "rules-manifest.json privacy gate configured via overlay (absent in this checkout): $banned_source"
        fi
      else
        fail "rules-manifest.json privacy.bannedTokens is empty and no bannedTokensSource — privacy gate inactive"
      fi
    else
      fail "rules-manifest.json invalid JSON"
    fi
  else
    ok "rules-manifest.json not present (optional until first profile defined)"
  fi
  if [[ -d "$ROOT/rules/eternal-saas/global" ]]; then
    global_count="$(find "$ROOT/rules/eternal-saas/global" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')"
    if (( global_count > 0 )); then
      ok "rules/eternal-saas/global present ($global_count modules)"
    else
      fail "rules/eternal-saas/global is empty"
    fi
  else
    ok "rules/eternal-saas/global not present (installed on demand)"
  fi
fi

if doctor_group_enabled docs; then
  doctor_note_group docs
  if [[ -f "$ROOT/docs/health-stack.md" ]]; then
    ok "health stack documented"
  else
    fail "docs/health-stack.md missing"
  fi

  if [[ -f "$ROOT/AGENTS.md" || -f "$ROOT/templates/AGENTS.md" || -f "$ROOT/docs/templates/AGENTS.md" ]]; then
    ok "AGENTS baseline present"
  else
    fail "AGENTS baseline missing"
  fi
  if [[ -f "$ROOT/CLAUDE.md" || -f "$ROOT/templates/CLAUDE.md" || -f "$ROOT/docs/templates/CLAUDE.md" ]]; then
    ok "Claude wrapper present"
  else
    fail "Claude wrapper missing"
  fi
  for startup_file in "$ROOT/AGENTS.md" "$ROOT/CLAUDE.md" "$ROOT/templates/AGENTS.md" "$ROOT/templates/CLAUDE.md" "$ROOT/docs/templates/AGENTS.md" "$ROOT/docs/templates/CLAUDE.md"; do
    [[ -f "$startup_file" ]] || continue
    check_startup_file_budget "$startup_file" "${startup_file#"$ROOT/"}"
  done
  for claude_file in "$ROOT/CLAUDE.md" "$ROOT/templates/CLAUDE.md" "$ROOT/docs/templates/CLAUDE.md"; do
    [[ -f "$claude_file" ]] || continue
    if file_has_exact_line "$claude_file" "@AGENTS.md"; then
      ok "${claude_file#"$ROOT/"} imports AGENTS.md"
    else
      fail "${claude_file#"$ROOT/"} should import AGENTS.md"
    fi
  done
fi

if doctor_group_enabled install; then
  doctor_note_group install
  if [[ -x "$ROOT/scripts/rollback-local.sh" ]]; then
  ok "rollback script present"
else
  fail "rollback script missing"
fi
if [[ -x "$ROOT/scripts/update.sh" ]]; then
  ok "update script present"
else
  fail "update script missing"
fi
if [[ -f "$ROOT/etrnl/install.json" ]]; then
  report_command "installed update metadata valid" "installed update metadata invalid" jq empty "$ROOT/etrnl/install.json"
elif [[ -f "$ROOT/scripts/update-check.mjs" ]]; then
  report_command "source update fingerprint available" "source update fingerprint failed" node "$ROOT/scripts/update-check.mjs" --fingerprint-source "$ROOT"
fi

bundled_hits=0
bundled_missing=0
for skill in "${BUNDLED_SKILLS[@]}"; do
  skill_file="$SOURCE_ROOT/skills/bundled/$skill/SKILL.md"
  if [[ ! -f "$skill_file" ]]; then
    fail "bundled skill missing in repo: skills/bundled/$skill/SKILL.md"
    bundled_missing=1
    continue
  fi
  bundled_hits=$((bundled_hits + 1))
done
if [[ "$bundled_missing" == "0" ]]; then
  ok "bundled skills vendored in repo: $bundled_hits"
fi
installed_bundled=0
claude_home="${CLAUDE_HOME:-$HOME/.claude}"
if [[ -f "$claude_home/etrnl/install.json" ]]; then
  for skill in "${BUNDLED_SKILLS[@]}"; do
    [[ -f "$claude_home/skills/$skill/SKILL.md" ]] && installed_bundled=$((installed_bundled + 1))
  done
  if (( installed_bundled == ${#BUNDLED_SKILLS[@]} )); then
    ok "bundled stack skills installed in Claude home: $installed_bundled"
  elif (( installed_bundled > 0 )); then
    fail "bundled stack skills partially installed in Claude home: $installed_bundled/${#BUNDLED_SKILLS[@]}"
  else
    fail "bundled stack skills missing in Claude home; rerun install.sh"
  fi
fi
fi

if doctor_group_enabled security; then
  doctor_note_group security
  if [[ -f "$ROOT/scripts/changelog-release-check.mjs" && -f "$ROOT/CHANGELOG.md" ]]; then
  if changelog_out="$(node "$ROOT/scripts/changelog-release-check.mjs" --active-dev --allow-clean-history-changelog 2>&1)"; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && ok "changelog: $line"
    done <<<"$changelog_out"
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && fail "changelog: $line"
    done <<<"$changelog_out"
  fi
else
  ok "changelog release check skipped outside source checkout"
fi

if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && [[ -f "$ROOT/CHANGELOG.md" ]]; then
  credential_scan_globs=(
    --glob '!.agents/**'
    --glob '!.audit/**'
    --glob '!.cache/**'
    --glob '!.claude/**'
    --glob '!.codex/**'
    --glob '!.cursor/**'
    --glob '!.git/**'
    --glob '!.idea/**'
    --glob '!.netlify/**'
    --glob '!.next/**'
    --glob '!.nuxt/**'
    --glob '!.output/**'
    --glob '!.parcel-cache/**'
    --glob '!.svelte-kit/**'
    --glob '!.turbo/**'
    --glob '!.vercel/**'
    --glob '!.vite/**'
    --glob '!.vitest/**'
    --glob '!.vscode/**'
    --glob '!.worktrees/**'
    --glob '!build/**'
    --glob '!cache/**'
    --glob '!coverage/**'
    --glob '!dbscans/**'
    --glob '!dist/**'
    --glob '!generated/**'
    --glob '!logs/**'
    --glob '!node_modules/**'
    --glob '!out/**'
    --glob '!storybook-static/**'
    --glob '!temp/**'
    --glob '!tmp/**'
    --glob '!tool-output/**'
    --glob '!vendor/**'
  )
  if rg -n "${credential_scan_globs[@]}" 'sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xoxb-[0-9A-Za-z-]{20,}|npm_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}' "$ROOT" >/dev/null 2>&1; then
    fail "private credential pattern found in repo"
  else
    ok "credential pattern scan clean"
  fi
else
  ok "credential scan skipped outside source checkout"
fi
fi

if doctor_group_enabled hooks || doctor_group_enabled install || doctor_group_enabled scripts; then
  flush_heavy_async_checks
fi

if (( STATUS == 0 )); then
  if [[ "$DOCTOR_MODE" == "changed" ]] && (( ! DOCTOR_FALL_OPEN )) && ((${#DOCTOR_ACTIVE_GROUPS[@]} > 0)); then
    doctor_record_green changed "${DOCTOR_ACTIVE_GROUPS[@]}"
  elif [[ "$DOCTOR_MODE" == "full" ]]; then
    doctor_record_green full "${DOCTOR_ALL_GROUPS[@]}"
  fi
fi

exit "$STATUS"
