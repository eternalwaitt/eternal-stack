#!/usr/bin/env bash

cc_test_init() {
  TMPROOT="$(mktemp -d)"
  export TMPDIR="$TMPROOT"
  export CLAUDE_GUARD_STATE_DIR="$TMPROOT"
  export CLAUDE_CONTROL_PLANE_RUNS_DIR="$TMPROOT/runs"
  export CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$TMPROOT/artifacts"
  export CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON=1
  PASS=0
  FAIL=0
  TEST_NUM=0
  trap cc_test_cleanup EXIT
}

cc_test_cleanup() {
  case "${TMPROOT:-}" in
    /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) ;;
    *) printf 'fatal: refusing to remove unsafe TMPROOT: %s\n' "${TMPROOT:-<unset>}" >&2; return 1 ;;
  esac
  [[ "$TMPROOT" != "/" ]] || { printf 'fatal: refusing to remove root TMPROOT\n' >&2; return 1; }
  rm -rf -- "$TMPROOT"
}

ok() {
  TEST_NUM=$((TEST_NUM + 1))
  PASS=$((PASS + 1))
  printf 'ok %03d - %s\n' "$TEST_NUM" "$1"
}

not_ok() {
  TEST_NUM=$((TEST_NUM + 1))
  FAIL=$((FAIL + 1))
  printf 'not ok %03d - %s\n' "$TEST_NUM" "$1" >&2
}

assert_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    ok "$name"
  else
    not_ok "$name expected <$needle> in <$haystack>"
  fi
}

assert_json_expr() {
  local name="$1"
  local json="$2"
  local expr="$3"
  local result
  if result="$(jq -e "$expr" 2>&1 <<<"$json")"; then
    ok "$name"
  else
    not_ok "$name failed jq expr $expr on $json: $result"
  fi
}

assert_command() {
  local name="$1"
  local output
  shift
  if output="$("$@" 2>&1)"; then
    ok "$name"
  else
    not_ok "$name failed: $output"
  fi
}

assert_executable() {
  local name="$1"
  local file="$2"
  if [[ -x "$file" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

assert_file() {
  local name="$1"
  local file="$2"
  if [[ -f "$file" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

assert_no_file() {
  local name="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

assert_directory() {
  local name="$1"
  local dir="$2"
  if [[ -d "$dir" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

assert_no_directory() {
  local name="$1"
  local dir="$2"
  if [[ ! -d "$dir" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

assert_symlink() {
  local name="$1"
  local file="$2"
  if [[ -L "$file" ]]; then
    ok "$name"
  else
    not_ok "$name"
  fi
}

require_root() {
  if [[ -z "${ROOT:-}" ]]; then
    printf 'fatal: ROOT must be set before using test harness path helpers\n' >&2
    return 1
  fi
}

run_hook() {
  local hook="$1"
  local input="$2"
  local status=0
  require_root || return 1
  "$ROOT/hooks/$hook" <<<"$input" || status=$?
  return "$status"
}

fixture() {
  require_root || return 1
  jq -c . "$ROOT/hooks/fixtures/events/$1"
}

finish_tests() {
  if (( FAIL > 0 )); then
    printf 'FAILED: %d failed, %d passed\n' "$FAIL" "$PASS" >&2
    exit 1
  fi
  printf 'PASSED: %d checks\n' "$PASS"
}
