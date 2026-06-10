#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=tests/lib/harness.sh
source "$ROOT/tests/lib/harness.sh"
cc_test_init

assert_no_eagain() {
  local name="$1"
  local output="$2"
  if [[ "$output" == *"EAGAIN"* || "$output" == *"resource temporarily unavailable"* ]]; then
    not_ok "$name"
  else
    ok "$name"
  fi
}

# Fail when the captured command exited non-zero; otherwise assert no EAGAIN.
# Without the status guard a crashing command would pass merely because its
# output lacked the EAGAIN string.
check_stdin_no_eagain() {
  local name="$1"
  local status="$2"
  local output="$3"
  if (( status != 0 )); then
    not_ok "$name (exit $status): $output"
  else
    assert_no_eagain "$name" "$output"
  fi
}

assert_command "read-stdin module syntax valid" node --check "$ROOT/scripts/lib/read-stdin.mjs"

read_stdin_self_test="$(cd "$ROOT" && node --input-type=module -e '
import { readStdinJson } from "./scripts/lib/read-stdin.mjs";
const json = readStdinJson({ emptyValue: { ok: true } });
if (!json || json.probe !== "stdin") process.exit(1);
' <<< '{"probe":"stdin"}' 2>&1)" || {
  not_ok "read-stdin module reads piped JSON: $read_stdin_self_test"
  read_stdin_self_test=""
}
[[ -z "$read_stdin_self_test" ]] && ok "read-stdin module reads piped JSON"

empty_stdin_status=0
empty_stdin_out="$(cd "$ROOT" && node --input-type=module -e '
import { readStdinJson } from "./scripts/lib/read-stdin.mjs";
const json = readStdinJson({ emptyValue: { empty: true } });
if (!json.empty) process.exit(1);
' </dev/null 2>&1)" || empty_stdin_status=$?
check_stdin_no_eagain "read-stdin module tolerates closed stdin" "$empty_stdin_status" "$empty_stdin_out"

browser_qa_status=0
browser_qa_out="$(printf '{"routes":["/"],"viewports":["desktop"],"findings":[]}' | node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/read-stdin-browser-qa.json" 2>&1)" || browser_qa_status=$?
check_stdin_no_eagain "browser-qa-report reads piped stdin without EAGAIN" "$browser_qa_status" "$browser_qa_out"

pr_status=0
pr_out="$(printf '{"branch":"main","dirty":false,"changedFiles":[],"blockers":[]}' | node "$ROOT/scripts/pr-preflight.mjs" validate --json 2>&1)" || pr_status=$?
check_stdin_no_eagain "pr-preflight validate reads piped stdin without EAGAIN" "$pr_status" "$pr_out"

wave_status=0
wave_out="$(printf '{"plans":[{"id":"p1","wave":1,"files":["src/a.ts"]}]}' | node "$ROOT/scripts/execution-wave-check.mjs" --json 2>&1)" || wave_status=$?
check_stdin_no_eagain "execution-wave-check reads piped stdin without EAGAIN" "$wave_status" "$wave_out"

manifest_status=0
manifest_out="$(printf '{"items":[{"path":"/tmp/cache","category":"cache","estimatedBytes":1,"description":"x","whySafe":"x","cleanupCommand":"trash /tmp/cache","riskTier":1}]}' | node "$ROOT/scripts/disk-cleanup-manifest.mjs" validate 2>&1)" || manifest_status=$?
check_stdin_no_eagain "disk-cleanup-manifest reads piped stdin without EAGAIN" "$manifest_status" "$manifest_out"

guard_state='{"skillCalls":[],"requestedSkills":[],"verificationRuns":[],"edits":{},"newSourceFiles":{},"lastAssistantMessage":""}'
evidence_status=0
evidence_out="$(printf '%s' "$guard_state" | node "$ROOT/scripts/execute-evidence-check.mjs" 2>&1)" || evidence_status=$?
check_stdin_no_eagain "execute-evidence-check reads piped stdin without EAGAIN" "$evidence_status" "$evidence_out"

finish_tests
