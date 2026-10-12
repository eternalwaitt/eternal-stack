#!/usr/bin/env bash
# Runs every node:test suite under tests/ with an explicit file list (avoids the
# directory-as-module resolution quirk in node --test). Wired into doctor's heavy
# async batch so the review-rules, overlay, learning-loop, and changelog suites
# are gate-enforced, not just runnable by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# A doctor pool slot must not silently create one worker per CPU again. Keep the
# whole suite list; this controls scheduling, never test selection.
NODE_TEST_JOBS="${TEST_JOBS:-${DOCTOR_JOBS:-2}}"
if [[ ! "$NODE_TEST_JOBS" =~ ^[1-9][0-9]*$ ]]; then
  printf 'run-node-tests: TEST_JOBS (or DOCTOR_JOBS) must be a positive integer\n' >&2
  exit 2
fi
files=()
while IFS= read -r f; do
  files+=("$f")
done < <(find "$ROOT/tests" -name '*.test.mjs' | sort)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no node test suites found"
  exit 0
fi
node --test --test-concurrency="$NODE_TEST_JOBS" "${files[@]}"
