#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=tests/lib/harness.sh
source "$ROOT/tests/lib/harness.sh"
cc_test_init

perf_root="$TMPROOT/workflow-health-perf"
mkdir -p "$perf_root/runs" "$perf_root/state"

repeat_tree="abc123repeatdeadbeef"
jq -n \
  --arg session "perf-loop-session" \
  --arg tree "$repeat_tree" \
  '{
    schemaVersion: 2,
    runId: "perf-loop-run",
    sessionId: $session,
    startedAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-20T12:00:00Z",
    tasks: [{id: "T1", status: "verified", startedAt: "2026-07-20T10:00:00Z", completedAt: "2026-07-20T10:30:00Z"}],
    agents: [],
    checks: [
      range(0; 5) | {name: "gate:auto", command: "bash tests/test-hooks.sh", status: "passed", treeHash: $tree}
    ],
    events: []
  }' >"$perf_root/runs/perf-loop-run.json"

clean_tree="clean111deadbeef"
jq -n \
  --arg session "perf-clean-session" \
  --arg tree "$clean_tree" \
  '{
    schemaVersion: 2,
    runId: "perf-clean-run",
    sessionId: $session,
    startedAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-20T11:00:00Z",
    tasks: [{id: "T1", status: "verified", startedAt: "2026-07-20T10:00:00Z", completedAt: "2026-07-20T10:30:00Z"}],
    agents: [],
    checks: [{name: "gate:auto", command: "bash tests/test-hooks.sh", status: "passed", treeHash: $tree}],
    events: []
  }' >"$perf_root/runs/perf-clean-run.json"

jq -n '{
  schemaVersion: 1,
  runId: "perf-legacy-run",
  sessionId: "perf-legacy-session",
  updatedAt: "2026-07-20T11:00:00Z",
  tasks: [{id: "T1", status: "verified"}],
  agents: [],
  checks: [{name: "fixture", command: "pnpm test", status: "passed"}]
}' >"$perf_root/runs/perf-legacy-run.json"

perf_summary_out="$(
  ETRNL_RUNS_DIR="$perf_root/runs" \
  ETRNL_ARTIFACTS_DIR="$perf_root/artifacts" \
  ETRNL_STATE_DIR="$perf_root/state" \
  node "$ROOT/scripts/workflow-health.mjs" summary
)"
assert_contains "workflow health summary reports performance section" "$perf_summary_out" "performance:"
assert_contains "workflow health summary reports gate repeat count" "$perf_summary_out" "gateMaxRepeats=5"
assert_contains "workflow health summary names repeat session" "$perf_summary_out" "perf-loop-session"

perf_summary_json="$(
  ETRNL_RUNS_DIR="$perf_root/runs" \
  ETRNL_ARTIFACTS_DIR="$perf_root/artifacts" \
  ETRNL_STATE_DIR="$perf_root/state" \
  node "$ROOT/scripts/workflow-health.mjs" summary --json
)"
assert_json_expr "workflow health summary json includes performance rows" "$perf_summary_json" '.command == "summary" and (.performance.sessions | map(select(.sessionId == "perf-loop-session" and .gateMaxRepeatsAtTreeHash == 5)) | length) == 1'
assert_json_expr "workflow health summary json omits gate repeats for legacy ledger" "$perf_summary_json" '(.performance.sessions | map(select(.runId == "perf-legacy-run" and has("gateMaxRepeatsAtTreeHash"))) | length) == 0'

perf_doctor_json="$(
  ETRNL_RUNS_DIR="$perf_root/runs" \
  ETRNL_ARTIFACTS_DIR="$perf_root/artifacts" \
  ETRNL_STATE_DIR="$perf_root/state" \
  node "$ROOT/scripts/workflow-health.mjs" doctor --json --all
)"
assert_json_expr "workflow health doctor warns on gate repeat loop" "$perf_doctor_json" 'any(.runtimeFindings[]; .id == "perf-gate-repeats" and .sessionId == "perf-loop-session" and .value == 5)'
assert_json_expr "workflow health doctor clean ledger has no gate repeat finding" "$perf_doctor_json" 'all(.runtimeFindings[]; .sessionId != "perf-clean-session" or .id != "perf-gate-repeats")'

if perf_strict_out="$(
  ETRNL_RUNS_DIR="$perf_root/runs" \
  ETRNL_ARTIFACTS_DIR="$perf_root/artifacts" \
  ETRNL_STATE_DIR="$perf_root/state" \
  node "$ROOT/scripts/workflow-health.mjs" doctor --json --all --strict 2>&1
)"; then
  not_ok "workflow health strict doctor fails on performance gate repeats"
else
  assert_json_expr "workflow health strict doctor fails on performance gate repeats" "$perf_strict_out" '.ok == false and any(.runtimeFindings[]; .id == "perf-gate-repeats")'
fi

if ETRNL_RUNS_DIR="$perf_root/runs" ETRNL_ARTIFACTS_DIR="$perf_root/artifacts" ETRNL_STATE_DIR="$perf_root/state" \
  node "$ROOT/scripts/workflow-health.mjs" doctor --json --all >/dev/null; then
  ok "workflow health doctor exits zero without strict on performance findings"
else
  not_ok "workflow health doctor exits zero without strict on performance findings"
fi

finish_tests
