#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
# shellcheck source=./tests/lib/harness.sh
source ./tests/lib/harness.sh
cc_test_init

state_lock_probe="$(
  HOOK_INPUT='{"session_id":"fixture-lock"}' CLAUDE_GUARD_STATE_DIR="$TMPROOT" bash -c '
    source "$1"
    cc_state_init
    lock="$(cc_state_acquire_lock)"
    if [[ -d "$lock" ]]; then printf "held"; fi
    cc_state_release_lock "$lock"
    if [[ ! -d "$lock" ]]; then printf " released"; fi
  ' _ "$ROOT/hooks/lib/state.sh"
)"
assert_contains "state lock remains held after acquire" "$state_lock_probe" "held"
assert_contains "state lock is released after release" "$state_lock_probe" "released"

long_complexity="$TMPROOT/complex.ts"
{
  printf 'function tooMany(a,b,c,d,e) {\n'
  printf 'if (a) { if (b) { if (c) { if (d) { if (e) { return true; } } } } }\n'
  for _ in $(seq 1 55); do printf 'const x = 1;\n'; done
  printf '}\n'
} >"$long_complexity"
if complexity_out="$(node "$ROOT/hooks/lib/complexity-check.mjs" "$long_complexity" 2>&1)"; then
  not_ok "complexity aggregation rejects bad file"
else
  assert_contains "complexity aggregation includes params" "$complexity_out" "parameters"
  assert_contains "complexity aggregation includes nesting" "$complexity_out" "nesting"
  assert_contains "complexity aggregation includes function length" "$complexity_out" "exceeds 50"
fi
short_complexity="$TMPROOT/simple.ts"
printf '%s\n' 'function ok(value) {' '  return value + 1;' '}' >"$short_complexity"
if complexity_out="$(node "$ROOT/hooks/lib/complexity-check.mjs" "$short_complexity" 2>&1)"; then
  ok "complexity check accepts simple file"
else
  not_ok "complexity check accepts simple file: $complexity_out"
fi

mkdir -p "$TMPROOT/codex-bin"
cat >"$TMPROOT/codex-bin/rtk" <<'BASH'
#!/usr/bin/env bash
if [[ "$1" == "rewrite" ]]; then
  shift
  if [[ "$*" == "git status" ]]; then printf "rtk git status\n"; exit 0; fi
  if [[ "$*" == "rg -n foo src" ]]; then printf "rtk grep -n foo src\n"; exit 0; fi
  printf "%s\n" "$*"
  exit 1
fi
exit 0
BASH
chmod +x "$TMPROOT/codex-bin/rtk"
codex_git_event="$(jq -cn '{tool_input:{command:"git status"}}')"
codex_git_out="$(PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_git_event")"
assert_json_expr "codex RTK hook rewrites with updatedInput" "$codex_git_out" '.hookSpecificOutput.permissionDecision == "allow" and .hookSpecificOutput.updatedInput.command == "rtk git status"'
codex_rg_files_event="$(jq -cn '{tool_input:{command:"rg --files src"}}')"
codex_rg_files_out="$(PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_rg_files_event")"
assert_json_expr "codex RTK hook proxies rg --files" "$codex_rg_files_out" '.hookSpecificOutput.updatedInput.command == "rtk proxy --ultra-compact rg --files src"'
codex_broad_scan_event="$(jq -cn '{tool_input:{command:"rg -n rtk /Users/testuser/.codex"}}')"
codex_broad_scan_out="$(PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_broad_scan_event")"
assert_json_expr "codex RTK hook blocks broad codex scans" "$codex_broad_scan_out" '.hookSpecificOutput.permissionDecision == "deny"'
codex_config_scan_event="$(jq -cn '{tool_input:{command:"rg -n token /Users/testuser/.codex/config.toml"}}')"
codex_config_scan_out="$(PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_config_scan_event")"
assert_json_expr "codex RTK hook blocks config scans" "$codex_config_scan_out" '.hookSpecificOutput.permissionDecision == "deny"'
codex_rg_pipe_event="$(jq -cn '{tool_input:{command:"rg --files src | head -20"}}')"
codex_rg_pipe_out="$(PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_rg_pipe_event")"
if [[ -z "$codex_rg_pipe_out" ]]; then ok "codex RTK hook does not proxy shell-control rg"; else not_ok "codex RTK hook should not proxy shell-control rg: $codex_rg_pipe_out"; fi
codex_deny_out="$(CODEX_RTK_HOOK_DENY_REWRITE=1 PATH="$TMPROOT/codex-bin:$PATH" bash "$ROOT/scripts/codex-rtk-pre-tool-use.sh" <<<"$codex_git_event")"
assert_json_expr "codex RTK hook keeps deny fallback mode" "$codex_deny_out" '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("rtk git status"))'

ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-ledger --plan "$ROOT/hooks/fixtures/plans/good-plan.md")"
assert_file "execution ledger init creates file" "$ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-ledger --task T1 --title Task --status in_progress
node "$ROOT/scripts/execution-ledger.mjs" require-artifact --session fixture-ledger --type review-log
ledger_stop="$(jq -cn '{session_id:"fixture-ledger",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$ledger_stop")"
assert_contains "stop verifier blocks incomplete ledger" "$out" "unfinished tasks"
subagent_bad="$(fixture subagentstop-malformed.json)"
out="$(run_hook cc-subagentstop-record.sh "$subagent_bad")"
assert_contains "subagent stop blocks missing task id" "$out" "ETRNL_TASK_ID"
subagent_good="$(fixture subagentstop-valid.json)"
assert_command "subagent stop records valid output" run_hook cc-subagentstop-record.sh "$subagent_good"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-ledger --task T1 --title Task --status verified
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-ledger --name final --command "pnpm test" --status passed
if node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger >/dev/null 2>&1; then
  not_ok "execution ledger blocks missing required artifact"
else
  ok "execution ledger blocks missing required artifact"
fi
printf '%s\n' '{"findings":[]}' >"$TMPROOT/execution-review-log.jsonl"
node "$ROOT/scripts/execution-ledger.mjs" record-artifact --session fixture-ledger --type review-log --path "$TMPROOT/execution-review-log.jsonl"
assert_command "execution ledger accepts complete run" node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger
if node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger --require-ledger --require-tasks --require-plan-phases >/dev/null 2>&1; then
  not_ok "execution ledger requires plan phases for plan execution"
else
  ok "execution ledger requires plan phases for plan execution"
fi
node "$ROOT/scripts/execution-ledger.mjs" set-phase --session fixture-ledger --phase P1 --status verified
assert_command "execution ledger accepts verified plan phases" node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger --require-ledger --require-tasks --require-plan-phases
bound_ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-bound --plan "$ROOT/hooks/fixtures/plans/good-plan.md" --cwd "$ROOT")"
assert_file "execution ledger bound init creates file" "$bound_ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-bound --task T-write --title "Write task" --status verified --mode write --lineage wave-1.T-write --packet-hash abc123 --requires-implementation-evidence --spec-review-required --quality-review-required
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-bound --name final --command "pnpm test" --status passed
if node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-bound >/dev/null 2>&1; then
  not_ok "execution ledger blocks unbound write evidence"
else
  ok "execution ledger blocks unbound write evidence"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-agent --session fixture-bound --id worker-1 --role etrnl-executor --mode write --task T-write --lineage wave-1.T-write --packet-hash abc123 --status completed
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-bound --reviewer etrnl-spec-reviewer --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified
if node "$ROOT/scripts/execution-ledger.mjs" check-bound-execute --session fixture-bound --task T-write >/dev/null 2>&1; then
  not_ok "execution ledger blocks missing quality reviewer"
else
  ok "execution ledger blocks missing quality reviewer"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-bound --reviewer etrnl-quality-reviewer --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified
assert_command "execution ledger accepts bound write evidence" node "$ROOT/scripts/execution-ledger.mjs" check-bound-execute --session fixture-bound --task T-write
evidence_ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-evidence --plan "$ROOT/hooks/fixtures/plans/good-plan.md" --cwd "$ROOT")"
assert_file "execution ledger evidence init creates file" "$evidence_ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-evidence --task T-write --title "Write task" --status verified --mode write --lineage wave-1.T-write --packet-hash abc123 --requires-implementation-evidence --spec-review-required --quality-review-required --tdd-required --simplifier-review-required --completion-audit-required
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-evidence --name final --command "pnpm test" --status passed
node "$ROOT/scripts/execution-ledger.mjs" record-agent --session fixture-evidence --id worker-1 --role etrnl-executor --mode write --task T-write --lineage wave-1.T-write --packet-hash abc123 --status completed
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-evidence --reviewer etrnl-spec-reviewer --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-evidence --reviewer etrnl-quality-reviewer --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified
if evidence_stop_out="$(node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-evidence 2>&1)"; then
  not_ok "execution ledger blocks missing TDD and simplifier evidence"
else
  assert_contains "execution ledger blocks missing TDD evidence" "$evidence_stop_out" "missing TDD evidence"
  assert_contains "execution ledger blocks missing simplifier evidence" "$evidence_stop_out" "missing simplifier evidence"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-tdd --session fixture-evidence --task T-write --lineage wave-1.T-write --packet-hash abc123 --status red_green_verified --source-files scripts/deep-stack-check.mjs --red-command "tests/test-workflow-tools.sh" --red-status failed --red-failure "expected fixture failure" --green-command "tests/test-workflow-tools.sh" --green-status passed
node "$ROOT/scripts/execution-ledger.mjs" record-simplifier --session fixture-evidence --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified --evidence "code-simplifier reviewed diff"
# Regression guard (CodeRabbit PR #4): a bound task's completion audit must carry
# matching binding, or the bound-evidence matcher can never clear the requirement.
if node "$ROOT/scripts/execution-ledger.mjs" record-completion-audit --session fixture-evidence --item P1 --task T-write --classification DONE --evidence "diff" >/dev/null 2>&1; then
  not_ok "record-completion-audit rejects unbound row for bound task"
else
  ok "record-completion-audit rejects unbound row for bound task"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-completion-audit --session fixture-evidence --item P1 --task T-write --lineage wave-1.T-write --packet-hash abc123 --classification DONE --evidence "diff/test evidence"
assert_command "execution ledger accepts task-bound TDD, simplifier, and completion-audit evidence" node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-evidence
review_order_ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-review-order --plan "$ROOT/hooks/fixtures/plans/good-plan.md" --cwd "$ROOT")"
assert_file "execution ledger review order init creates file" "$review_order_ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-review-order --task T-write --title "Write task" --status verified --mode write --lineage wave-1.T-write --packet-hash abc123 --requires-implementation-evidence --spec-review-required
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-review-order --name final --command "pnpm test" --status passed
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-review-order --reviewer etrnl-spec-reviewer --task T-write --lineage wave-1.T-write --packet-hash abc123 --status verified
sleep 1
node "$ROOT/scripts/execution-ledger.mjs" record-agent --session fixture-review-order --id worker-1 --role etrnl-executor --mode write --task T-write --lineage wave-1.T-write --packet-hash abc123 --status completed
if order_out="$(node "$ROOT/scripts/execution-ledger.mjs" check-bound-execute --session fixture-review-order --task T-write 2>&1)"; then
  not_ok "execution ledger rejects reviewer evidence before implementation"
else
  assert_contains "execution ledger review ordering reason" "$order_out" "after implementation"
fi
lineage_ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-lineage-binding --plan "$ROOT/hooks/fixtures/plans/good-plan.md" --cwd "$ROOT")"
assert_file "execution ledger lineage init creates file" "$lineage_ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-lineage-binding --task T-write --title "Write task" --status verified --mode write --lineage wave-1.T-write --packet-hash abc123 --requires-implementation-evidence --spec-review-required
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-lineage-binding --name final --command "pnpm test" --status passed
node "$ROOT/scripts/execution-ledger.mjs" record-agent --session fixture-lineage-binding --id worker-1 --role etrnl-executor --mode write --task T-write --lineage wave-1.T-write --packet-hash abc123 --status completed
node "$ROOT/scripts/execution-ledger.mjs" record-review --session fixture-lineage-binding --reviewer etrnl-spec-reviewer --task T-write --lineage wave-2.T-write --packet-hash abc123 --status verified
if lineage_out="$(node "$ROOT/scripts/execution-ledger.mjs" check-bound-execute --session fixture-lineage-binding --task T-write 2>&1)"; then
  not_ok "execution ledger rejects mismatched reviewer lineage"
else
  assert_contains "execution ledger lineage binding reason" "$lineage_out" "missing etrnl-spec-reviewer"
fi
uat_ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-uat --plan "$ROOT/hooks/fixtures/plans/good-plan.md")"
assert_file "execution ledger UAT init creates file" "$uat_ledger_path"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-uat --task T1 --title Task --status verified
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-uat --name final --command "pnpm test" --status passed
node "$ROOT/scripts/execution-ledger.mjs" set-phase --session fixture-uat --phase P1 --workstream browser --status uat
node "$ROOT/scripts/execution-ledger.mjs" record-uat --session fixture-uat --artifact "$TMPROOT/browser-qa.json" --open-findings 2
if node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-uat >/dev/null 2>&1; then
  not_ok "execution ledger blocks open UAT findings"
else
  ok "execution ledger blocks open UAT findings"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-uat --session fixture-uat --artifact "$TMPROOT/browser-qa.json" --open-findings 0
assert_command "execution ledger accepts closed UAT findings" node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-uat

doc_health_bad_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],successfulCommands:[],verificationRuns:[] }')"
doc_health_bad_status="$(jq -cn --argjson state "$doc_health_bad_state" --arg message "Done, docs look fine." '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_bad_status" == "missing-inventory" ]]; then ok "documentation health checker requires inventory"; else not_ok "documentation health checker requires inventory: $doc_health_bad_status"; fi

doc_health_shallow_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}],verificationRuns:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}]}')"
doc_health_shallow_status="$(jq -cn --argjson state "$doc_health_shallow_state" --arg message "Done, docs look fine." '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_shallow_status" == "missing-coverage-counters" ]]; then ok "documentation health checker rejects shallow report"; else not_ok "documentation health checker rejects shallow report: $doc_health_shallow_status"; fi

doc_health_missing_comment_message=$'# Documentation Health Audit\n\n## Documentation Inventory\ncanonical docs and secondary docs classified.\n\n## Freshness And Drift Proof\nsource_of_truth matrix checked; stale reference searches covered old architecture names and active plan queues.\n\n## Findings Ledger\n| severity | source_of_truth | disposition | verification |\n| --- | --- | --- | --- |\n| P2 | scripts/install.sh | fixed | scripts/doctor.sh passed |\n\n## Scorecard\nOverall documentation health: 8/10\n\nDOCS_FILES_TOTAL: 12\nDOCS_FILES_REVIEWED: 12\nSOURCE_FILES_SAMPLED_OR_REVIEWED: 6\nRECENT_COMMITS_REVIEWED: 5\nRECENT_PRS_REVIEWED: 2\nRECENT_CHANGE_DOC_IMPACT_CHECKS: 4\nDOC_CLAIMS_CHECKED: 14\nSOURCE_TRUTH_MAPPINGS_REVIEWED: 8\nSTALE_REFERENCE_SEARCHES_RUN: 5\nOUTDATED_DOC_CLAIMS_FOUND: 1\nOUTDATED_DOC_CLAIMS_REMAINING: 0\nSTALE_DOCS_FOUND: 1\nSTALE_DOCS_REMAINING: 0\nMISLEADING_DOCS_FOUND: 0\nMISLEADING_DOCS_REMAINING: 0\nACTIVE_PLAN_QUEUE_DOCS_REVIEWED: 2\nACTIVE_PLAN_QUEUE_DOCS_STALE: 0\nCHECKS_SKIPPED: []\nFINAL_DOC_HEALTH_SCORE: 82/100\n'
doc_health_missing_comment_status="$(jq -cn --argjson state "$doc_health_shallow_state" --arg message "$doc_health_missing_comment_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_missing_comment_status" == "missing-comment-health-counters" ]]; then ok "documentation health checker requires comment counters"; else not_ok "documentation health checker requires comment counters: $doc_health_missing_comment_status"; fi

doc_health_full_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"},{value:"node ~/.claude/scripts/documentation-comment-health.mjs --root . --json --include-untracked",at:"2026-01-01T00:00:02Z"},{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:03Z"}],verificationRuns:[{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:03Z"}]}')"
doc_health_missing_freshness_message=$'# Documentation Health Audit\n\n## Documentation Inventory\ncanonical docs and secondary docs classified.\n\n## 10. TSDoc/JSDoc And Comments\nComment Health classified useful, missing, stale, misleading, noise, and wrong-format targets.\n\n## Findings Ledger\n| severity | source_of_truth | disposition | verification |\n| --- | --- | --- | --- |\n| P2 | scripts/install.sh | fixed | scripts/doctor.sh passed |\n\n## Action Items\nAll action items are terminal.\n\n## Resolution Plan\nImmediate fixes are verified.\n\n## Scorecard\nTSDoc/JSDoc/comment health: 8/10\nOverall documentation health: 8/10\n\nDOCS_FILES_TOTAL: 12\nDOCS_FILES_REVIEWED: 12\nSOURCE_FILES_SAMPLED_OR_REVIEWED: 6\nTSDOC_JSDOC_FILES_SCANNED: 4\nCOMMENT_TARGETS_REVIEWED: 9\nCOMMENT_TARGETS_DOCUMENTED: 7\nCOMMENT_TARGETS_MISSING_DOCS: 2\nCOMMENT_TARGETS_WRONG_FORMAT: 0\nAI_CONTEXT_FILES_REVIEWED: 3\nAI_CONTEXT_DRIFT_FINDINGS: 0\nAI_CONTEXT_DUPLICATE_RULE_OWNERS: 0\nAI_CONTEXT_HOT_PATH_LEAKS: 0\nCHECKS_SKIPPED: []\nFINAL_DOC_HEALTH_SCORE: 82/100\n'
doc_health_missing_freshness_status="$(jq -cn --argjson state "$doc_health_full_state" --arg message "$doc_health_missing_freshness_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_missing_freshness_status" == "missing-freshness-counters" ]]; then ok "documentation health checker requires freshness counters"; else not_ok "documentation health checker requires freshness counters: $doc_health_missing_freshness_status"; fi

doc_health_full_message=$'# Documentation Health Audit\n\n## Documentation Inventory\ncanonical docs and secondary docs classified.\n\n## Freshness And Drift Proof\nsource_of_truth matrix checked; stale reference searches covered old architecture names and active plan queues.\n\n## 10. TSDoc/JSDoc And Comments\nComment Health classified useful, missing, stale, misleading, noise, and wrong-format targets.\n\n## Findings Ledger\n| severity | source_of_truth | disposition | verification |\n| --- | --- | --- | --- |\n| P2 | scripts/install.sh | fixed | scripts/doctor.sh passed |\n\n## Action Items\nAll action items are terminal.\n\n## Resolution Plan\nImmediate fixes are verified.\n\n## Scorecard\nTSDoc/JSDoc/comment health: 8/10\nOverall documentation health: 8/10\n\nDOCS_FILES_TOTAL: 12\nDOCS_FILES_REVIEWED: 12\nSOURCE_FILES_SAMPLED_OR_REVIEWED: 6\nRECENT_COMMITS_REVIEWED: 5\nRECENT_PRS_REVIEWED: 2\nRECENT_CHANGE_DOC_IMPACT_CHECKS: 4\nDOC_CLAIMS_CHECKED: 14\nSOURCE_TRUTH_MAPPINGS_REVIEWED: 8\nSTALE_REFERENCE_SEARCHES_RUN: 5\nOUTDATED_DOC_CLAIMS_FOUND: 1\nOUTDATED_DOC_CLAIMS_REMAINING: 0\nSTALE_DOCS_FOUND: 1\nSTALE_DOCS_REMAINING: 0\nMISLEADING_DOCS_FOUND: 0\nMISLEADING_DOCS_REMAINING: 0\nACTIVE_PLAN_QUEUE_DOCS_REVIEWED: 2\nACTIVE_PLAN_QUEUE_DOCS_STALE: 0\nTSDOC_JSDOC_FILES_SCANNED: 4\nCOMMENT_TARGETS_REVIEWED: 9\nCOMMENT_TARGETS_DOCUMENTED: 7\nCOMMENT_TARGETS_MISSING_DOCS: 2\nCOMMENT_TARGETS_WRONG_FORMAT: 0\nAI_CONTEXT_FILES_REVIEWED: 3\nAI_CONTEXT_DRIFT_FINDINGS: 0\nAI_CONTEXT_DUPLICATE_RULE_OWNERS: 0\nAI_CONTEXT_HOT_PATH_LEAKS: 0\nCHECKS_SKIPPED: []\nFINAL_DOC_HEALTH_SCORE: 82/100\n'
doc_health_full_status="$(jq -cn --argjson state "$doc_health_full_state" --arg message "$doc_health_full_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ -z "$doc_health_full_status" ]]; then ok "documentation health checker accepts complete report"; else not_ok "documentation health checker accepts complete report: $doc_health_full_status"; fi

doc_health_open_drift_message="${doc_health_full_message/STALE_DOCS_REMAINING: 0/STALE_DOCS_REMAINING: 1}"
doc_health_open_drift_message="${doc_health_open_drift_message/FINAL_DOC_HEALTH_SCORE: 82/FINAL_DOC_HEALTH_SCORE: 100}"
doc_health_open_drift_status="$(jq -cn --argjson state "$doc_health_full_state" --arg message "$doc_health_open_drift_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_open_drift_status" == "score-100-with-open-drift" ]]; then ok "documentation health checker rejects 100 score with remaining drift"; else not_ok "documentation health checker rejects 100 score with remaining drift: $doc_health_open_drift_status"; fi

doc_health_unreviewed_docs_message="${doc_health_full_message/DOCS_FILES_REVIEWED: 12/DOCS_FILES_REVIEWED: 11}"
doc_health_unreviewed_docs_message="${doc_health_unreviewed_docs_message/FINAL_DOC_HEALTH_SCORE: 82/FINAL_DOC_HEALTH_SCORE: 100}"
doc_health_unreviewed_docs_status="$(jq -cn --argjson state "$doc_health_full_state" --arg message "$doc_health_unreviewed_docs_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_unreviewed_docs_status" == "score-100-with-unreviewed-docs" ]]; then ok "documentation health checker rejects 100 score with unreviewed docs"; else not_ok "documentation health checker rejects 100 score with unreviewed docs: $doc_health_unreviewed_docs_status"; fi

doc_health_baseline_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],edits:{"/tmp/example/docs/policy/COMMENT_HEALTH_BASELINE.json":"2026-01-01T00:00:03Z"},successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"},{value:"node ~/.claude/scripts/documentation-comment-health.mjs --root . --json --include-untracked",at:"2026-01-01T00:00:02Z"},{value:"pnpm docs:comments:baseline",at:"2026-01-01T00:00:03Z"},{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:04Z"}],verificationRuns:[{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:04Z"}],lastPrompt:"run documentation health"}')"
doc_health_baseline_message="${doc_health_full_message}"$'\nBaseline written: docs/policy/COMMENT_HEALTH_BASELINE.json\n'
doc_health_baseline_status="$(jq -cn --argjson state "$doc_health_baseline_state" --arg message "$doc_health_baseline_message" '{state:$state,message:$message}' | node "$ROOT/scripts/documentation-health-ledger-check.mjs")"
if [[ "$doc_health_baseline_status" == "baseline-without-remediation" ]]; then ok "documentation health checker rejects baseline-only closure"; else not_ok "documentation health checker rejects baseline-only closure: $doc_health_baseline_status"; fi

code_health_bad_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-code",at:"2026-01-01T00:00:00Z"}],successfulCommands:[],verificationRuns:[] }')"
code_health_bad_status="$(jq -cn --argjson state "$code_health_bad_state" --arg message "Done, code looks fine." '{state:$state,message:$message}' | node "$ROOT/scripts/code-health-ledger-check.mjs")"
if [[ "$code_health_bad_status" == "missing-inventory" ]]; then ok "code health checker requires inventory"; else not_ok "code health checker requires inventory: $code_health_bad_status"; fi

code_health_state="$(jq -nc '{requestedSkills:[{value:"etrnl-audit-code",at:"2026-01-01T00:00:00Z"}],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"},{value:"tests/test-workflow-tools.sh",at:"2026-01-01T00:00:02Z"}],verificationRuns:[{value:"tests/test-workflow-tools.sh",at:"2026-01-01T00:00:02Z"}]}')"
code_health_shallow_status="$(jq -cn --argjson state "$code_health_state" --arg message "Done, code looks fine." '{state:$state,message:$message}' | node "$ROOT/scripts/code-health-ledger-check.mjs")"
if [[ "$code_health_shallow_status" == "missing-coverage-counters" ]]; then ok "code health checker rejects shallow report"; else not_ok "code health checker rejects shallow report: $code_health_shallow_status"; fi

code_health_open_message=$'# Code Health Audit\n\n## Coverage Map\nEvery tracked file inventoried.\n\n## Findings Ledger\n| severity | evidence | disposition | verification |\n| --- | --- | --- | --- |\n| P1 | scripts/example.ts | open | pending |\n\n## Action Items\nOne action item remains open.\n\n## Resolution Plan\nFix every valid finding.\n\n## Final Gate Status\nHealth stack pending.\n\nCODE_HEALTH_FILES_TOTAL: 10\nCODE_HEALTH_FILES_AUDITED: 8\nACTION_ITEMS_TOTAL: 1\nACTION_ITEMS_OPEN: 1\nACTION_ITEMS_TERMINAL: 0\nCHECKS_SKIPPED: []\nFINAL_CODE_HEALTH_SCORE: 40/100\n'
code_health_open_status="$(jq -cn --argjson state "$code_health_state" --arg message "$code_health_open_message" '{state:$state,message:$message}' | node "$ROOT/scripts/code-health-ledger-check.mjs")"
if [[ "$code_health_open_status" == "open-action-items" ]]; then ok "code health checker blocks open action items"; else not_ok "code health checker blocks open action items: $code_health_open_status"; fi

code_health_full_message=$'# Code Health Audit\n\n## Coverage Map\nEvery tracked file inventoried and exclusions are listed with reasons.\n\n## Findings Ledger\n| severity | evidence | disposition | verification |\n| --- | --- | --- | --- |\n| P1 | scripts/example.ts | fixed | tests/test-workflow-tools.sh passed |\n\n## Action Items\nAll action items are terminal.\n\n## Resolution Plan\nEvery valid finding is fixed.\n\n## Final Gate Status\nHealth stack passed.\n\nCODE_HEALTH_FILES_TOTAL: 10\nCODE_HEALTH_FILES_AUDITED: 8\nACTION_ITEMS_TOTAL: 1\nACTION_ITEMS_OPEN: 0\nACTION_ITEMS_TERMINAL: 1\nCHECKS_SKIPPED: []\nFINAL_CODE_HEALTH_SCORE: 100/100\n'
code_health_full_status="$(jq -cn --argjson state "$code_health_state" --arg message "$code_health_full_message" '{state:$state,message:$message}' | node "$ROOT/scripts/code-health-ledger-check.mjs")"
if [[ -z "$code_health_full_status" ]]; then ok "code health checker accepts complete report"; else not_ok "code health checker accepts complete report: $code_health_full_status"; fi

doc_comment_root="$TMPROOT/doc-comment-health"
mkdir -p "$doc_comment_root/src"
cat >"$doc_comment_root/src/api.ts" <<'TS'
/**
 * Handles the documented public route.
 */
export function documentedRoute() {
  return true
}

export function missingRoute() {
  return false
}
TS
doc_comment_json="$(node "$ROOT/scripts/documentation-comment-health.mjs" --root "$doc_comment_root" --json)"
assert_json_expr "documentation comment health counts targets" "$doc_comment_json" '.tsdocJsdocTargetCount == 2 and .documentedTargetCount == 1 and .missingDocTargetCount == 1'

doc_comment_exclusion_root="$TMPROOT/doc-comment-health-exclusions"
mkdir -p \
  "$doc_comment_exclusion_root/.cache" \
  "$doc_comment_exclusion_root/.audit" \
  "$doc_comment_exclusion_root/dist" \
  "$doc_comment_exclusion_root/generated" \
  "$doc_comment_exclusion_root/node_modules/pkg" \
  "$doc_comment_exclusion_root/src" \
  "$doc_comment_exclusion_root/tool-output" \
  "$doc_comment_exclusion_root/vendor/pkg"
cat >"$doc_comment_exclusion_root/src/api.ts" <<'TS'
export function realRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/node_modules/pkg/index.ts" <<'TS'
export function dependencyRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/.audit/report.ts" <<'TS'
export function auditArtifactRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/dist/out.ts" <<'TS'
export function buildOutputRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/generated/client.ts" <<'TS'
export function generatedRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/vendor/pkg/index.ts" <<'TS'
export function vendorRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/.cache/cache.ts" <<'TS'
export function cacheRoute() {
  return true
}
TS
cat >"$doc_comment_exclusion_root/tool-output/report.ts" <<'TS'
export function toolOutputRoute() {
  return true
}
TS
doc_comment_exclusion_json="$(node "$ROOT/scripts/documentation-comment-health.mjs" --root "$doc_comment_exclusion_root" --json)"
assert_json_expr "documentation comment health skips obvious folders" "$doc_comment_exclusion_json" '.sourceFilesScanned == 1 and .tsdocJsdocTargetCount == 1 and .targets[0].path == "src/api.ts"'

for script in \
  cc-pretooluse-guard.sh \
  cc-rate-limiter.sh \
  cc-posttoolbatch-observer.sh \
  cc-posttoolusefailure-diagnose.sh \
  cc-posttooluse-sycophancy.sh \
  cc-userprompt-router.sh \
  cc-userprompt-expansion.sh \
  cc-subagentstop-record.sh \
  cc-stop-verifier.sh \
  cc-precompact-save.sh \
  cc-postcompact-record.sh \
  cc-sessionstart-restore.sh \
  cc-sessionend-save.sh
do
  assert_command "syntax $script" bash -n "$ROOT/hooks/$script"
done

assert_command "complexity syntax" node --check "$ROOT/hooks/lib/complexity-check.mjs"
assert_command "audit exclusions syntax" node --check "$ROOT/scripts/lib/audit-exclusions.mjs"
assert_command "env utils namespaced git limits" env \
  CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS=123 \
  GIT_TIMEOUT_MS=456 \
  CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES=789 \
  GIT_MAX_BUFFER_BYTES=111 \
  node --input-type=module -e 'import { gitSubprocessLimits } from "./scripts/lib/env-utils.mjs";
const limits = gitSubprocessLimits({ timeoutMs: 1, maxBufferBytes: 2 });
if (limits.timeout !== 123 || limits.maxBuffer !== 789) process.exit(1);'
assert_command "env utils invalid namespaced falls through" env \
  CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS=abc \
  GIT_TIMEOUT_MS=456 \
  CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES=abc \
  GIT_MAX_BUFFER_BYTES=111 \
  node --input-type=module -e 'import { gitSubprocessLimits } from "./scripts/lib/env-utils.mjs";
const limits = gitSubprocessLimits({ timeoutMs: 1, maxBufferBytes: 2 });
if (limits.timeout !== 456 || limits.maxBuffer !== 111) process.exit(1);'
assert_command "env utils rejects non-decimal integers" env \
  CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS=1e3 \
  GIT_TIMEOUT_MS=456 \
  CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES=0x100 \
  GIT_MAX_BUFFER_BYTES=111 \
  node --input-type=module -e 'import { gitSubprocessLimits } from "./scripts/lib/env-utils.mjs";
const limits = gitSubprocessLimits({ timeoutMs: 1, maxBufferBytes: 2 });
if (limits.timeout !== 456 || limits.maxBuffer !== 111) process.exit(1);'
assert_command "env utils rejects unsafe integers" env \
  CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS=9007199254740993 \
  GIT_TIMEOUT_MS=456 \
  CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES=9007199254740993 \
  GIT_MAX_BUFFER_BYTES=111 \
  node --input-type=module -e 'import { gitSubprocessLimits } from "./scripts/lib/env-utils.mjs";
const limits = gitSubprocessLimits({ timeoutMs: 1, maxBufferBytes: 2 });
if (limits.timeout !== 456 || limits.maxBuffer !== 111) process.exit(1);'
assert_command "code-health inventory syntax" node --check "$ROOT/scripts/code-health-inventory.mjs"
if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
  assert_command "code-health inventory runs" node "$ROOT/scripts/code-health-inventory.mjs" --json
  inventory_quiet_json="$(node "$ROOT/scripts/code-health-inventory.mjs" --json --quiet)"
  assert_json_expr "code-health inventory json quiet emits JSON" "$inventory_quiet_json" '.totalFiles >= 1'
  assert_json_expr "code-health inventory emits measured hotspots" "$inventory_quiet_json" '.riskHotspots | type == "array"'
else
  ok "SKIPPED (not in git repo) code-health inventory runs"
  ok "SKIPPED (not in git repo) code-health inventory quiet JSON emits JSON"
fi
inventory_exclusion_root="$TMPROOT/code-health-inventory-exclusions"
mkdir -p \
  "$inventory_exclusion_root/.audit" \
  "$inventory_exclusion_root/.cache" \
  "$inventory_exclusion_root/.claude" \
  "$inventory_exclusion_root/build" \
  "$inventory_exclusion_root/cache" \
  "$inventory_exclusion_root/dist" \
  "$inventory_exclusion_root/generated" \
  "$inventory_exclusion_root/logs" \
  "$inventory_exclusion_root/node_modules/pkg" \
  "$inventory_exclusion_root/out" \
  "$inventory_exclusion_root/docs" \
  "$inventory_exclusion_root/tests" \
  "$inventory_exclusion_root/src" \
  "$inventory_exclusion_root/tool-output" \
  "$inventory_exclusion_root/vendor/pkg"
git -C "$inventory_exclusion_root" init -q
git -C "$inventory_exclusion_root" config user.email "tests@example.invalid"
git -C "$inventory_exclusion_root" config user.name "Tests"
printf '%s\n' 'export const real = true' >"$inventory_exclusion_root/src/app.ts"
printf '%s\n' 'export const dep = true' >"$inventory_exclusion_root/node_modules/pkg/index.js"
printf '%s\n' '# audit report' >"$inventory_exclusion_root/.audit/report.md"
printf '%s\n' 'export const cache = true' >"$inventory_exclusion_root/.cache/cache.js"
printf '%s\n' 'export const builtMore = true' >"$inventory_exclusion_root/build/out.js"
printf '%s\n' 'local cache' >"$inventory_exclusion_root/cache/run.log"
printf '%s\n' 'export const built = true' >"$inventory_exclusion_root/dist/out.js"
printf '%s\n' '# security docs' >"$inventory_exclusion_root/docs/security.md"
printf '%s\n' 'export const generated = true' >"$inventory_exclusion_root/generated/client.ts"
printf '%s\n' 'test("auth", () => {})' >"$inventory_exclusion_root/tests/auth.test.ts"
mkdir -p "$inventory_exclusion_root/src/auth-service" "$inventory_exclusion_root/src/service-auth" "$inventory_exclusion_root/src/authored"
printf '%s\n' 'export const authService = true' >"$inventory_exclusion_root/src/auth-service/index.ts"
printf '%s\n' 'export const serviceAuth = true' >"$inventory_exclusion_root/src/service-auth/index.ts"
printf '%s\n' 'export const authored = true' >"$inventory_exclusion_root/src/authored/index.ts"
printf '%s\n' '{"session":"local"}' >"$inventory_exclusion_root/.claude/state.json"
printf '%s\n' 'local log' >"$inventory_exclusion_root/logs/run.log"
printf '%s\n' 'export const out = true' >"$inventory_exclusion_root/out/bundle.js"
printf '%s\n' 'tool output' >"$inventory_exclusion_root/tool-output/report.txt"
printf '%s\n' 'export const vendor = true' >"$inventory_exclusion_root/vendor/pkg/index.js"
git -C "$inventory_exclusion_root" add -f . >/dev/null
inventory_exclusion_json="$(node "$ROOT/scripts/code-health-inventory.mjs" --json --root="$inventory_exclusion_root")"
assert_json_expr "code-health inventory lists obvious folders without auditing them" "$inventory_exclusion_json" '([.files[] | select(.path == "src/app.ts" and .auditScope == "audit")] | length) == 1 and ([.files[] | select(((.path | startswith("src/") | not) and .path != "docs/security.md" and .path != "tests/auth.test.ts") and .auditScope != "listed")] | length) == 0 and ([.files[] | select(.path | startswith(".audit/"))][0].category == "excluded")'
assert_json_expr "code-health inventory keeps doc/test sensitive paths below hotspot threshold" "$inventory_exclusion_json" '([.riskHotspots[] | select(.path == "docs/security.md" or .path == "tests/auth.test.ts")] | length) == 0'
assert_json_expr "code-health inventory uses segment boundaries for sensitive path tokens" "$inventory_exclusion_json" '([.riskHotspots[] | select(.path == "src/auth-service/index.ts" or .path == "src/service-auth/index.ts")] | length) == 2 and ([.riskHotspots[] | select(.path == "src/authored/index.ts")] | length) == 0'
assert_command "plan readiness syntax" node --check "$ROOT/scripts/plan-readiness-check.mjs"
assert_command "deep-stack check syntax" node --check "$ROOT/scripts/deep-stack-check.mjs"
assert_command "tool-effectiveness syntax" node --check "$ROOT/scripts/tool-effectiveness.mjs"
assert_command "tool stack check syntax" node --check "$ROOT/scripts/tool-stack-check.mjs"
assert_command "stack profile check syntax" node --check "$ROOT/scripts/stack-profile-check.mjs"
assert_command "skill update prompt syntax" node --check "$ROOT/scripts/skill-update-prompt.mjs"
assert_command "pr preflight syntax" node --check "$ROOT/scripts/pr-preflight.mjs"
assert_command "live hook noise report syntax" node --check "$ROOT/scripts/live-hook-noise-report.mjs"
assert_command "session audit syntax" node --check "$ROOT/scripts/session-audit.mjs"
assert_command "performance baseline syntax" node --check "$ROOT/scripts/performance-baseline.mjs"
assert_command "disk cleanup manifest syntax" node --check "$ROOT/scripts/disk-cleanup-manifest.mjs"
assert_command "pr preflight validates fixture" bash -c 'printf "%s\n" "{\"branch\":\"feature\",\"dirty\":false,\"changedFiles\":[],\"blockers\":[],\"ghAvailable\":false}" | node "$0/scripts/pr-preflight.mjs" validate --json >/dev/null' "$ROOT"
if pr_invalid_json="$(printf '{' | node "$ROOT/scripts/pr-preflight.mjs" validate --json 2>&1)"; then
  not_ok "pr preflight reports invalid JSON"
else
  assert_contains "pr preflight reports invalid JSON" "$pr_invalid_json" "invalid JSON input"
fi
pr_preflight_repo="$TMPROOT/pr-preflight-repo"
mkdir -p "$pr_preflight_repo"
git -C "$pr_preflight_repo" init -q -b main
git -C "$pr_preflight_repo" config user.email "test@example.com"
git -C "$pr_preflight_repo" config user.name "Test User"
printf '%s\n' '# Changelog' >"$pr_preflight_repo/CHANGELOG.md"
git -C "$pr_preflight_repo" add CHANGELOG.md
git -C "$pr_preflight_repo" commit -qm "initial"
printf '%s\n' '# Changelog' 'changed' >"$pr_preflight_repo/CHANGELOG.md"
printf '%s\n' 'scratch' >"$pr_preflight_repo/untracked.txt"
mkdir -p "$pr_preflight_repo/docs"
git -C "$pr_preflight_repo" mv CHANGELOG.md docs/CHANGELOG.md
pr_preflight_status_json="$(cd "$pr_preflight_repo" && node "$ROOT/scripts/pr-preflight.mjs" status --json)"
assert_json_expr "pr preflight preserves modified path names" "$pr_preflight_status_json" '.changedFiles == ["docs/CHANGELOG.md"]'
assert_json_expr "pr preflight separates untracked files" "$pr_preflight_status_json" '.dirty == true and .untrackedFiles == ["untracked.txt"]'
perf_baseline_fixture="$TMPROOT/performance-baseline.json"
printf '%s\n' '{"schemaVersion":1,"baselineId":"base","targetLabel":"fixture","measurements":[{"route":"/","durationMs":100,"responseBytes":1000,"capturedAt":"2026-01-01T00:00:00Z"},{"route":"/removed","durationMs":75,"responseBytes":500,"capturedAt":"2026-01-01T00:00:00Z"}],"nextRun":{"command":"pnpm bench","thresholds":{"maxRegressionPct":20}}}' >"$perf_baseline_fixture"
assert_command "performance baseline validates fixture" node "$ROOT/scripts/performance-baseline.mjs" validate "$perf_baseline_fixture"
perf_created_path="$(printf '%s\n' '{"baselineId":"created","targetLabel":"fixture","measurements":[{"route":"/created","durationMs":50,"capturedAt":"2026-01-01T00:00:00Z"}]}' | CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$TMPROOT/artifacts" node "$ROOT/scripts/performance-baseline.mjs" create)"
assert_file "performance baseline create writes report without nextRun" "$perf_created_path"
assert_command "performance baseline create output validates" node "$ROOT/scripts/performance-baseline.mjs" validate "$perf_created_path"
assert_json_expr "performance baseline create omits empty nextRun" "$(cat "$perf_created_path")" 'has("nextRun") | not'
perf_baseline_after="$TMPROOT/performance-baseline-after.json"
printf '%s\n' '{"schemaVersion":1,"baselineId":"after","targetLabel":"fixture","measurements":[{"route":"/","durationMs":125,"responseBytes":1000,"capturedAt":"2026-01-01T00:01:00Z"}],"nextRun":{"command":"pnpm bench","thresholds":{"maxRegressionPct":20}}}' >"$perf_baseline_after"
perf_trend_json="$(node "$ROOT/scripts/performance-baseline.mjs" trend --before "$perf_baseline_fixture" --after "$perf_baseline_after")"
assert_json_expr "performance baseline trend reports delta" "$perf_trend_json" '.comparisons[0].deltaMs == 25'
assert_json_expr "performance baseline trend reports removed rows" "$perf_trend_json" 'any(.comparisons[]; .key == "/removed" and .removed == true and .beforeMs == 75 and .afterMs == null)'
if perf_missing_file="$(node "$ROOT/scripts/performance-baseline.mjs" validate "$TMPROOT/missing-performance-baseline.json" 2>&1)"; then
  not_ok "performance baseline validate reports missing file"
else
  assert_contains "performance baseline validate reports missing file" "$perf_missing_file" "performance-baseline validate: file not found"
fi
if perf_invalid_json="$(printf '{' | node "$ROOT/scripts/performance-baseline.mjs" create 2>&1)"; then
  not_ok "performance baseline reports invalid JSON"
else
  assert_contains "performance baseline reports invalid JSON" "$perf_invalid_json" "invalid JSON from stdin"
fi
disk_manifest_fixture='{"items":[{"path":"/tmp/cache/file","category":"cache","estimatedBytes":1024,"description":"cache file","whySafe":"rebuildable cache","cleanupCommand":"trash /tmp/cache/file","riskTier":1}]}'
assert_command "disk cleanup manifest validates fixture" bash -c 'printf "%s\n" "$1" | node "$0/scripts/disk-cleanup-manifest.mjs" validate >/dev/null' "$ROOT" "$disk_manifest_fixture"
disk_manifest_missing_items='{"schemaVersion":1}'
disk_missing_summary="$(printf '%s\n' "$disk_manifest_missing_items" | node "$ROOT/scripts/disk-cleanup-manifest.mjs" summary)"
assert_json_expr "disk cleanup manifest summary tolerates missing items" "$disk_missing_summary" '.items == 0 and .totalBytes == 0'
disk_manifest_empty_command='{"items":[{"path":"/tmp/cache/file","category":"cache","estimatedBytes":1024,"description":"cache file","whySafe":"rebuildable cache","cleanupCommand":"","riskTier":1}]}'
if disk_empty_command="$(printf '%s\n' "$disk_manifest_empty_command" | node "$ROOT/scripts/disk-cleanup-manifest.mjs" validate 2>&1)"; then
  not_ok "disk cleanup manifest rejects empty cleanup command"
else
  assert_contains "disk cleanup manifest rejects empty cleanup command" "$disk_empty_command" "must be a non-empty string"
fi
disk_manifest_wrong_path='{"items":[{"path":"/tmp/cache/file","category":"cache","estimatedBytes":1024,"description":"cache file","whySafe":"rebuildable cache","cleanupCommand":"trash /tmp/cache/other","riskTier":1}]}'
if disk_wrong_path="$(printf '%s\n' "$disk_manifest_wrong_path" | node "$ROOT/scripts/disk-cleanup-manifest.mjs" validate 2>&1)"; then
  not_ok "disk cleanup manifest rejects commands targeting another path"
else
  assert_contains "disk cleanup manifest rejects commands targeting another path" "$disk_wrong_path" "must reference the specified path"
fi
disk_manifest_recursive='{"items":[{"path":"/tmp/cache/file","category":"cache","estimatedBytes":1024,"description":"cache file","whySafe":"rebuildable cache","cleanupCommand":"/bin/rm -Rf /tmp/cache/file","riskTier":1}]}'
if disk_recursive="$(printf '%s\n' "$disk_manifest_recursive" | node "$ROOT/scripts/disk-cleanup-manifest.mjs" validate 2>&1)"; then
  not_ok "disk cleanup manifest rejects recursive rm variants"
else
  assert_contains "disk cleanup manifest rejects recursive rm variants" "$disk_recursive" "must not use recursive rm"
fi
disk_manifest_trash='{"items":[{"path":"/tmp/cache/file","category":"cache","estimatedBytes":1024,"description":"cache file","whySafe":"rebuildable cache","cleanupCommand":"trash ~/.Trash /tmp/cache/file","riskTier":1}]}'
if disk_trash="$(printf '%s\n' "$disk_manifest_trash" | node "$ROOT/scripts/disk-cleanup-manifest.mjs" validate 2>&1)"; then
  not_ok "disk cleanup manifest rejects whole Trash cleanup"
else
  assert_contains "disk cleanup manifest rejects whole Trash cleanup" "$disk_trash" "must not empty the whole Trash"
fi
assert_command "deep-stack artifact library syntax" node --check "$ROOT/scripts/lib/deep-stack-artifacts.mjs"
assert_command "deep-audit artifact check syntax" node --check "$ROOT/scripts/deep-audit-artifact-check.mjs"
assert_command "deep-audit category registry syntax" node --check "$ROOT/scripts/lib/deep-audit-categories.mjs"
assert_command "deep-audit valid artifact passes" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.valid.json"
assert_command "deep-audit production direct artifact passes" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.production-valid.json"
assert_command "deep-audit performance direct artifact passes" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.performance-valid.json"
assert_command "deep-audit source-limited artifact passes" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.source-limited.json"
assert_command "deep-audit fixture suite passes" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate-fixtures
assert_command "deep-audit registry validates" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate-registry --root "$ROOT"
assert_command "deep-audit synthetic fixtures validate" node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate-synthetic-fixtures --fixture "$ROOT/tests/fixtures/deep-audit/synthetic-target" --templates "$ROOT/tests/fixtures/deep-audit/templates"
deep_audit_diag_json="$(node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.missing-confirmed-clean.json" --json 2>/dev/null || true)"
assert_json_expr "deep-audit diagnostics include problem cause fix" "$deep_audit_diag_json" 'any(.errors[]; .errorCode == "CHECK_WITHOUT_EVIDENCE" and (.problem | length > 0) and (.cause | length > 0) and (.fix | length > 0))'
deep_audit_hidden_finding_json="$(node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.hidden-finding-clean-synthesis.json" --json 2>/dev/null || true)"
assert_json_expr "deep-audit findings cannot hide under clean synthesis" "$deep_audit_hidden_finding_json" 'any(.errors[]; .errorCode == "FINDING_HIDDEN_UNDER_CLEAN")'
deep_audit_missing_worklist_json="$(node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$ROOT/tests/fixtures/deep-audit/report.required-worklist-missing.json" --json 2>/dev/null || true)"
assert_json_expr "deep-audit required worklists are mandatory" "$deep_audit_missing_worklist_json" 'any(.errors[]; .errorCode == "REQUIRED_WORKLIST_MISSING")'
deep_audit_private_token_fixture="$TMPROOT/deep-audit-private-token.json"
deep_audit_token_prefix="sk-proj-"
deep_audit_token_body="abcdefghijklmnopqrstuvwxyz123456"
jq --arg token "$deep_audit_token_prefix$deep_audit_token_body" '.findings = [{"evidence": ("redaction fixture " + $token)}]' "$ROOT/tests/fixtures/deep-audit/report.production-valid.json" >"$deep_audit_private_token_fixture"
deep_audit_private_token_json="$(node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$deep_audit_private_token_fixture" --json 2>/dev/null || true)"
assert_json_expr "deep-audit private token redaction catches sk-proj" "$deep_audit_private_token_json" 'any(.errors[]; .errorCode == "PRIVATE_STRING")'
security_missing_evidence_fixture="$TMPROOT/deep-audit-security-missing-evidence.json"
jq '.categoryReports |= map(if .categoryId == "security" then (.checks[0].nonFindings = {}) else . end)' "$ROOT/tests/fixtures/deep-audit/report.valid.json" >"$security_missing_evidence_fixture"
security_missing_evidence_json="$(node "$ROOT/scripts/deep-audit-artifact-check.mjs" validate --artifact "$security_missing_evidence_fixture" --json 2>/dev/null || true)"
assert_json_expr "deep-audit security clean rows require non-findings" "$security_missing_evidence_json" 'any(.errors[]; .errorCode == "SECURITY_NON_FINDING_FIELD_MISSING" or .errorCode == "SECURITY_NON_FINDINGS_MISSING")'
assert_command "cli arg parser edge cases" node --input-type=module <<'JS'
import { argValue } from "./scripts/lib/cli-args.mjs";
const expect = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
};
expect(argValue(["--flag=value"], "--flag", "fallback"), "value", "equals syntax");
expect(argValue(["--flag", "value"], "--flag", "fallback"), "value", "space syntax");
expect(argValue(["--flag="], "--flag", "fallback"), "fallback", "empty equals fallback");
expect(argValue(["--flag", "--other"], "--flag", "fallback"), "fallback", "next flag fallback");
expect(argValue(["--flag", "first", "--flag", "second"], "--flag", "fallback"), "first", "first duplicate wins");
expect(argValue(["--flag", 10, "--other"], "--flag", "fallback"), "fallback", "non-string value ignored");
JS
assert_command "bash array parser token branches" node --input-type=module <<'JS'
import { parseBashArray } from "./scripts/lib/bash-array-parser.mjs";
const expect = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
};
const source = `ARR=(
  "double \\"quoted\\" value"
  "dollar \\$HOME"
  "tab\\tvalue"
  "hex\\x41value"
  "octal\\101value"
  'single quoted value'
  plain\\ token
  escaped\\ space\\ token
)`;
const parsed = parseBashArray(source, "ARR");
expect(parsed.length, 8, "token count");
expect(parsed[0], "double \"quoted\" value", "double-quoted branch");
expect(parsed[1], "dollar $HOME", "double-quoted escapes");
expect(parsed[2], "tab\tvalue", "double-quoted control escape");
expect(parsed[3], "hexAvalue", "double-quoted hex escape");
expect(parsed[4], "octalAvalue", "double-quoted octal escape");
expect(parsed[5], "single quoted value", "single-quoted branch");
expect(parsed[6], "plain token", "unquoted escaped space branch");
expect(parsed[7], "escaped space token", "unquoted multi-escape branch");
JS
for script in agent-task-packet-check guard-override-token replay-hook-fixtures execution-ledger etrnl-state execute-evidence-check execution-wave-check tool-effectiveness tool-stack-check stack-profile-check code-health-ledger-check documentation-comment-health documentation-health-ledger-check review-log project-buglog browser-qa-report context-state live-hook-noise-report session-audit workflow-health prompt-budget-check skill-update-prompt changelog-release-check port-guard update-check settings-audit deep-stack-check; do
  assert_command "$script syntax" node --check "$ROOT/scripts/$script.mjs"
done
assert_command "core stack profile check passes" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.core.json"
assert_command "full stack profile check passes" node "$ROOT/scripts/stack-profile-check.mjs" "$ROOT/templates/stack-profile.full.json"
assert_command "etrnl state core syntax" node --check "$ROOT/scripts/lib/etrnl-state-core.mjs"
assert_command "etrnl state fixtures validate" node "$ROOT/scripts/etrnl-state.mjs" validate --fixtures "$ROOT/tests/fixtures/etrnl-state"
etrnl_state_dir="$TMPROOT/etrnl-state-cli"
ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/compact-pre.json" --json >/dev/null
ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/compact-post.json" --json >/dev/null
etrnl_handoff_json="$(ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" compact-handoff --session fixture-compact --json)"
assert_json_expr "etrnl compact handoff marks stale verification" "$etrnl_handoff_json" '.found == true and .handoff.verificationStale == true and (.text | test("verification_stale=true"))'
etrnl_latest_dir="$TMPROOT/etrnl-state-latest"
printf '%s\n' '{"eventKind":"compact_post","sessionId":"older-compact","at":"2026-06-05T01:00:00Z","data":{"compactSummary":"older"}}' \
  | ETRNL_STATE_DIR="$etrnl_latest_dir" node "$ROOT/scripts/etrnl-state.mjs" append --json >/dev/null
printf '%s\n' '{"eventKind":"compact_post","sessionId":"newer-compact","at":"2026-06-05T02:00:00Z","data":{"compactSummary":"newer"}}' \
  | ETRNL_STATE_DIR="$etrnl_latest_dir" node "$ROOT/scripts/etrnl-state.mjs" append --json >/dev/null
etrnl_latest_json="$(ETRNL_STATE_DIR="$etrnl_latest_dir" node "$ROOT/scripts/etrnl-state.mjs" compact-handoff --latest --json)"
assert_json_expr "etrnl latest handoff compares timestamps across sessions" "$etrnl_latest_json" '.found == true and .handoff.sessionId == "newer-compact" and (.text | test("summary=newer"))'
if ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" stop-status --session fixture-compact --json >/dev/null 2>&1; then
  not_ok "etrnl stop-status blocks stale compact verification"
else
  ok "etrnl stop-status blocks stale compact verification"
fi
ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/check-verification.json" --json >/dev/null
assert_command "etrnl stop-status allows fresh verification" env ETRNL_STATE_DIR="$etrnl_state_dir" node "$ROOT/scripts/etrnl-state.mjs" stop-status --session fixture-compact --json
etrnl_privacy_json="$(node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/privacy-raw-prompt.json" --dry-run --json 2>/dev/null || true)"
assert_json_expr "etrnl state privacy rejects raw prompt" "$etrnl_privacy_json" '.ok == false and .code == "PrivacyRejectError" and .diagnosticCommand != ""'
beads_state_dir="$TMPROOT/etrnl-state-beads"
ETRNL_STATE_DIR="$beads_state_dir" node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/beads-backlog.json" --json >/dev/null
ETRNL_STATE_DIR="$beads_state_dir" node "$ROOT/scripts/etrnl-state.mjs" append --fixture "$ROOT/tests/fixtures/etrnl-state/beads-active-execution-noise.json" --json >/dev/null
beads_bridge_json="$(ETRNL_STATE_DIR="$beads_state_dir" node "$ROOT/scripts/etrnl-state.mjs" bead-link --dry-run --json)"
assert_json_expr "etrnl beads bridge is backlog-only dry-run" "$beads_bridge_json" '.dryRun == true and .wouldRunBd == false and .backlogCandidates == 1 and .activeExecutionNoise == 1'
beads_prime_json="$(printf '%s\n' 'Beads doctrine: default task tracking. Do not use TodoWrite. Session close protocol.' | node "$ROOT/scripts/etrnl-state.mjs" bead-prime-audit --json 2>/dev/null || true)"
assert_json_expr "etrnl rejects raw Beads prime doctrine" "$beads_prime_json" '.allowed == false and (.prohibited | index("beads-default-task-tracking") != null) and (.prohibited | index("beads-todowrite-doctrine") != null)'
tool_stack_bin="$TMPROOT/tool-stack-bin"
mkdir -p "$tool_stack_bin"
cat >"$tool_stack_bin/codegraph" <<'BASH'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  printf 'codegraph 0.9.9\n'
  exit 0
fi
exit 0
BASH
cat >"$tool_stack_bin/bd" <<'BASH'
#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then
  printf 'bd version 1.0.5 (fixture)\n'
  exit 0
fi
exit 0
BASH
cat >"$tool_stack_bin/npm" <<'BASH'
#!/usr/bin/env bash
if [[ "$1 $2 $3" == "view @colbymchenry/codegraph version" ]]; then
  printf '1.0.0\n'
  exit 0
fi
if [[ "$1 $2 $3" == "view @beads/bd version" ]]; then
  printf '1.0.5\n'
  exit 0
fi
exit 1
BASH
cat >"$tool_stack_bin/brew" <<'BASH'
#!/usr/bin/env bash
if [[ "$1 $2 $3" == "info beads --json=v2" ]]; then
  printf '{"formulae":[{"name":"beads","versions":{"stable":"1.0.5"}}]}\n'
  exit 0
fi
exit 1
BASH
cat >"$tool_stack_bin/claude" <<'BASH'
#!/usr/bin/env bash
if [[ "$1 $2" == "plugin list" ]]; then
  printf 'hindsight-memory@hindsight 0.7.1\n'
  exit 0
fi
exit 1
BASH
chmod +x "$tool_stack_bin/codegraph" "$tool_stack_bin/bd" "$tool_stack_bin/npm" "$tool_stack_bin/brew" "$tool_stack_bin/claude"
node_bin="$(command -v node)"
mkdir -p "$TMPROOT/tool-stack-home" "$TMPROOT/tool-stack-hindsight"
cat >"$TMPROOT/tool-stack-home/settings.json" <<'JSON'
{"enabledPlugins":{"hindsight-memory@hindsight":true}}
JSON
cat >"$TMPROOT/tool-stack-hindsight/claude-code.json" <<'JSON'
{
  "hindsightApiUrl": "",
  "apiPort": 9077,
  "dynamicBankId": true,
  "dynamicBankGranularity": ["agent", "project"],
  "recallContextTurns": 3,
  "recallTypes": ["observation"],
  "retainToolCalls": false,
  "recallPromptPreamble": "Fresh repo/runtime evidence overrides memory."
}
JSON
tool_stack_json="$(PATH="$tool_stack_bin:/usr/bin:/bin" CLAUDE_HOME="$TMPROOT/tool-stack-home" HINDSIGHT_HOME="$TMPROOT/tool-stack-hindsight" CLAUDE_CONTROL_PLANE_TOOL_STACK_STATE="$TMPROOT/tool-stack-state.json" "$node_bin" "$ROOT/scripts/tool-stack-check.mjs" --json --force)"
assert_json_expr "tool stack checker detects codegraph update" "$tool_stack_json" '.tools.codegraph.installed == true and .tools.codegraph.currentVersion == "0.9.9" and .tools.codegraph.latestVersion == "1.0.0" and .tools.codegraph.updateAvailable == true'
assert_json_expr "tool stack checker keeps beads current" "$tool_stack_json" '.tools.beads.installed == true and .tools.beads.currentVersion == "1.0.5" and .tools.beads.updateAvailable == false'
assert_json_expr "tool stack checker reports Hindsight plugin posture" "$tool_stack_json" '.tools.hindsight.pluginEnabled == true and .tools.hindsight.pluginInstalled == true and .tools.hindsight.ok == true and .tools.hindsight.mode == "local-daemon"'
tool_stack_text="$(PATH="$tool_stack_bin:/usr/bin:/bin" CLAUDE_HOME="$TMPROOT/tool-stack-home" HINDSIGHT_HOME="$TMPROOT/tool-stack-hindsight" CLAUDE_CONTROL_PLANE_TOOL_STACK_STATE="$TMPROOT/tool-stack-state.json" "$node_bin" "$ROOT/scripts/tool-stack-check.mjs" --force)"
assert_contains "tool stack checker text advertises update" "$tool_stack_text" "TOOL_STACK_UPDATE_AVAILABLE codegraph"
hindsight_canary_json="$("$ROOT/scripts/canary-hindsight.sh" --settings "$TMPROOT/tool-stack-home/settings.json" --config "$TMPROOT/tool-stack-hindsight/claude-code.json" --json)"
assert_json_expr "hindsight canary passes local daemon config without live health" "$hindsight_canary_json" '.ok == true and .mode == "local-daemon" and .health == "health-skipped"'
hindsight_bad_config="$TMPROOT/tool-stack-hindsight/bad-claude-code.json"
jq '.retainToolCalls = true' "$TMPROOT/tool-stack-hindsight/claude-code.json" >"$hindsight_bad_config"
hindsight_bad_json="$("$ROOT/scripts/canary-hindsight.sh" --settings "$TMPROOT/tool-stack-home/settings.json" --config "$hindsight_bad_config" --json 2>/dev/null || true)"
assert_json_expr "hindsight canary rejects unsafe retention" "$hindsight_bad_json" '.ok == false and .code == "config-unsafe"'
tool_effectiveness_fixtures_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --json)"
assert_command "tool-effectiveness fixtures validate" node "$ROOT/scripts/tool-effectiveness.mjs" validate-fixtures --fixtures "$ROOT/tests/fixtures/tool-effectiveness"
assert_json_expr "tool-effectiveness codegraph keep verdict" "$tool_effectiveness_fixtures_json" '.tools.codegraph.verdict == "keep" and .tools.codegraph.evidence.eligibleSessions >= 5'
assert_json_expr "tool-effectiveness beads keep verdict" "$tool_effectiveness_fixtures_json" '.tools.beads.verdict == "keep"'
assert_json_expr "tool-effectiveness duplicate beads remove-watch verdict" "$tool_effectiveness_fixtures_json" '."tools"."beads-duplicate-fixture".verdict == "remove-watch"'
assert_json_expr "tool-effectiveness privacy fixture rejected" "$tool_effectiveness_fixtures_json" '.totals.rejected == 1'
tool_effectiveness_codegraph_only_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --tool codegraph --json)"
assert_json_expr "tool-effectiveness tool filter narrows summary" "$tool_effectiveness_codegraph_only_json" '(.tools | keys) == ["codegraph"]'
tool_effectiveness_project_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --project project-alpha --json)"
assert_json_expr "tool-effectiveness project filter narrows events" "$tool_effectiveness_project_json" '.totals.events > 0 and .totals.events < 18'
tool_effectiveness_bad_projects_config="$TMPROOT/tool-effectiveness-bad-projects.json"
printf '%s\n' '{"projects": [' >"$tool_effectiveness_bad_projects_config"
if bad_projects_out="$(node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --projects-config "$tool_effectiveness_bad_projects_config" --project project-alpha 2>&1)"; then
  not_ok "tool-effectiveness rejects malformed projects config"
else
  assert_contains "tool-effectiveness rejects malformed projects config" "$bad_projects_out" "tool-effectiveness error: invalid --projects-config"
fi
tool_effectiveness_privacy_root="$TMPROOT/tool-effectiveness-privacy"
mkdir -p "$tool_effectiveness_privacy_root"
jq -n '{
  events: (
    [range(0;5) | {
      tool: "leaky-tool",
      projectHash: "privacy-project",
      eligible: true,
      toolUsed: true,
      usedBeforeFirstEdit: true,
      usefulWork: true,
      downstreamArtifact: true,
      readSearchCount: 1,
      baselineReadSearchCount: 4,
      repeatedEdits: 0,
      baselineRepeatedEdits: 2
    }]
    + [{
      tool: "leaky-tool",
      promptText: "raw prompt must be rejected"
    }]
  )
}' >"$tool_effectiveness_privacy_root/events.json"
tool_effectiveness_privacy_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" summarize --fixtures "$tool_effectiveness_privacy_root" --json)"
assert_json_expr "tool-effectiveness privacy rejects downgrade tool" "$tool_effectiveness_privacy_json" '."tools"."leaky-tool".verdict == "remove-watch" and ."tools"."leaky-tool".evidence.privacyRejectCount == 1'
tool_effectiveness_baseline_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" baseline --since-days 7 --fixtures "$ROOT/tests/fixtures/tool-effectiveness" --json)"
assert_json_expr "tool-effectiveness baseline emits tool medians" "$tool_effectiveness_baseline_json" '.command == "baseline" and .byTool.codegraph.medianReadSearchCount >= 0'
tool_effectiveness_codex_import_json="$(node "$ROOT/scripts/tool-effectiveness.mjs" import-codex --fixtures "$ROOT/tests/fixtures/tool-effectiveness/codex" --dry-run --json)"
assert_json_expr "tool-effectiveness codex import sanitizes tool events" "$tool_effectiveness_codex_import_json" '.command == "import-codex" and .dryRun == true and .eventsImported == 2 and (.rejected | length) == 0'
assert_json_expr "tool-effectiveness codex import preserves explicit outcomes" "$tool_effectiveness_codex_import_json" '(.events[] | select(.tool == "codegraph") | .eligible == true and .toolUsed == true and .usefulWork == true and .downstreamArtifact == true) and (.events[] | select(.tool == "beads") | .eligible == false and .toolUsed == false and .usefulWork == false and .downstreamArtifact == false)'
assert_command "update shell syntax" bash -n "$ROOT/scripts/update.sh"
assert_command "bootstrap tools shell syntax" bash -n "$ROOT/scripts/bootstrap-tools.sh"
merge_target="$TMPROOT/settings-target.json"
merge_template="$TMPROOT/settings-template.json"
printf '%s\n' "{\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/cc-sessionstart-restore.sh\",\"timeout\":5}]},{\"hooks\":[{\"type\":\"command\",\"command\":\"bash $HOME/.claude/hooks/cc-sessionstart-restore.sh\",\"timeout\":7}]}],\"Stop\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"bash $HOME/.claude/hooks/cc-stop-verifier.sh\",\"timeout\":5}]},{\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/cc-stop-verifier.sh\",\"timeout\":10}]},{\"hooks\":[{\"type\":\"command\",\"command\":\"bash /tmp$HOME/.claude/hooks/not-real.sh\",\"timeout\":1}]}]}}" >"$merge_target"
printf '%s\n' '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash ~/.claude/hooks/cc-sessionstart-restore.sh","timeout":20}]}]}}' >"$merge_template"
node "$ROOT/scripts/merge-settings.mjs" "$merge_target" "$merge_template"
assert_json_expr "merge-settings updates existing hook metadata" "$(jq -c . "$merge_target")" '.hooks.SessionStart[0].hooks[0].timeout == 20'
assert_json_expr "merge-settings dedupes canonical installed hook paths" "$(jq -c . "$merge_target")" '([.hooks.SessionStart[].hooks[]] | length) == 1'
assert_json_expr "merge-settings compacts non-template event duplicates" "$(jq -c . "$merge_target")" '([.hooks.Stop[].hooks[] | select(.command | test("cc-stop-verifier"))] | length) == 1'
assert_json_expr "merge-settings preserves non-prefix home substrings" "$(jq -c . "$merge_target")" "[.hooks.Stop[].hooks[].command] | any(contains(\"/tmp$HOME/.claude/hooks/not-real.sh\"))"
merge_order_target="$TMPROOT/merge-order-target.json"
merge_order_template="$TMPROOT/merge-order-template.json"
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]},{"matcher":"Bash|Read|Edit|Write|MultiEdit|WebSearch|Task|TaskCreate|Agent","hooks":[{"type":"command","command":"bash ~/.claude/hooks/cc-pretooluse-guard.sh","timeout":10}]}]}}' >"$merge_order_target"
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"bash ~/.claude/hooks/cc-rtk-rg-compat.sh","timeout":5}]}]}}' >"$merge_order_template"
node "$ROOT/scripts/merge-settings.mjs" "$merge_order_target" "$merge_order_template"
assert_json_expr "merge-settings orders rtk rg compat before native rtk hook" "$(jq -c . "$merge_order_target")" '([.hooks.PreToolUse[].hooks[0].command] | index("bash ~/.claude/hooks/cc-rtk-rg-compat.sh")) < ([.hooks.PreToolUse[].hooks[0].command] | index("rtk hook claude"))'
assert_json_expr "merge-settings orders rtk rg compat before pretool guard" "$(jq -c . "$merge_order_target")" '([.hooks.PreToolUse[].hooks[0].command] | index("bash ~/.claude/hooks/cc-rtk-rg-compat.sh")) < ([.hooks.PreToolUse[].hooks[0].command] | index("bash ~/.claude/hooks/cc-pretooluse-guard.sh"))'
settings_audit_target="$TMPROOT/settings-audit-target.json"
settings_audit_home="$TMPROOT/settings-audit-home"
settings_audit_project="$TMPROOT/settings-audit-project"
mkdir -p "$settings_audit_home/.claude/hooks" "$settings_audit_home/.claude/plugins/cache/hindsight-memory/0.7.1/hooks" "$settings_audit_home/.hindsight" "$settings_audit_project/.claude/hooks"
printf '%s\n' '#!/usr/bin/env bash' '# rtk-hook-version: 3' >"$settings_audit_home/.claude/hooks/rtk-rewrite.sh"
for required_hook in cc-sessionstart-restore.sh cc-precompact-save.sh cc-postcompact-record.sh cc-stop-verifier.sh; do
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$settings_audit_home/.claude/hooks/$required_hook"
  chmod +x "$settings_audit_home/.claude/hooks/$required_hook"
done
cat >"$settings_audit_home/.claude/plugins/cache/hindsight-memory/0.7.1/hooks/hooks.json" <<'JSON'
{
  "name": "hindsight-memory",
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "python3 hooks/session_start.py"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 hooks/recall.py"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "python3 hooks/retain.py", "async": true}]}]
  }
}
JSON
cat >"$settings_audit_home/.hindsight/claude-code.json" <<'JSON'
{
  "hindsightApiUrl": "",
  "apiPort": 9077,
  "dynamicBankId": true,
  "dynamicBankGranularity": ["agent", "project"],
  "recallContextTurns": 3,
  "recallTypes": ["observation"],
  "retainToolCalls": false,
  "recallPromptPreamble": "Fresh repo/runtime evidence overrides memory."
}
JSON
cat >"$settings_audit_project/.claude/hooks/check-context-and-handoff.sh" <<'BASH'
#!/usr/bin/env bash
jq -cn --arg text "context" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $text
  }
}'
BASH
printf '%s\n' "{\"hooks\":{\"PostToolUse\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"bash $settings_audit_home/.claude/hooks/rate-limiter.sh\"}]},{\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/rate-limiter.sh.backup\"}]},{\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/cc-rate-limiter.sh\",\"timeout\":5}]}],\"PreToolUse\":[{\"matcher\":\"Bash\",\"hooks\":[{\"type\":\"command\",\"command\":\"~/.claude/hooks/rtk-rewrite.sh\"}]},{\"matcher\":\"Bash\",\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/enforce-cli-toolkit.sh\"}]},{\"matcher\":\"Bash\",\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/custom-local-guard.sh\"}]},{\"matcher\":\"Task|Agent\",\"hooks\":[{\"type\":\"command\",\"command\":\"bash $settings_audit_home/.claude/hooks/cc-pretooluse-guard.sh\",\"timeout\":5}]},{\"matcher\":\"Task|TaskCreate|Agent\",\"hooks\":[{\"type\":\"command\",\"command\":\"bash ~/.claude/hooks/cc-pretooluse-guard.sh\",\"timeout\":10}]}],\"Stop\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"bash $settings_audit_project/.claude/hooks/check-context-and-handoff.sh\"}]}]}}" >"$settings_audit_target"
settings_audit_target_next="$settings_audit_target.tmp"
jq --arg command "bash \"$settings_audit_project/.claude/hooks/check-context-and-handoff.sh\"" '.hooks.Stop[0].hooks[0].command = $command' "$settings_audit_target" >"$settings_audit_target_next"
mv "$settings_audit_target_next" "$settings_audit_target"
settings_audit_target_next="$settings_audit_target.home.tmp"
jq '.hooks.PreToolUse += [{"matcher":"Task","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cc-pretooluse-guard.sh","timeout":15}]}]' "$settings_audit_target" >"$settings_audit_target_next"
mv "$settings_audit_target_next" "$settings_audit_target"
HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_target" --fix
assert_json_expr "settings-audit rewrites legacy rate limiter" "$(jq -c . "$settings_audit_target")" '([.hooks.PostToolUse[].hooks[].command] | map(select(test("/rate-limiter\\.sh$"))) | length) == 0'
assert_json_expr "settings-audit ignores backup rate limiter names" "$(jq -c . "$settings_audit_target")" '([.hooks.PostToolUse[].hooks[].command] | any(endswith("rate-limiter.sh.backup")))'
assert_json_expr "settings-audit compacts matcher supersets" "$(jq -c . "$settings_audit_target")" '([.hooks.PreToolUse[].hooks[] | select(.command | test("cc-pretooluse-guard"))] | length) == 1'
assert_json_expr "settings-audit preserves TaskCreate matcher" "$(jq -c . "$settings_audit_target")" '(.hooks.PreToolUse[] | select(.hooks[0].command | test("cc-pretooluse-guard")) | .matcher) == "Task|TaskCreate|Agent"'
assert_json_expr "settings-audit removes invalid stop handoff hook" "$(jq -c . "$settings_audit_target")" '([.hooks.Stop[]?.hooks[]?.command // empty | select(test("check-context-and-handoff"))] | length) == 0'
settings_audit_report="$(HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_target" --json)"
assert_json_expr "settings-audit reports stale rtk rewrite conflict" "$settings_audit_report" 'any(.after.conflictingHooks[]?; .id == "rtk-rewrite" and .hook == "rtk-rewrite.sh")'
assert_json_expr "settings-audit reports legacy cli toolkit conflict" "$settings_audit_report" 'any(.after.conflictingHooks[]?; .id == "legacy-cli-toolkit" and .hook == "enforce-cli-toolkit.sh")'
assert_json_expr "settings-audit reports unknown external hooks" "$settings_audit_report" 'any(.after.externalHooks[]?; .owner == "unknown-external" and .hook == "custom-local-guard.sh")'
assert_json_expr "settings-audit reports plugin hook manifests" "$settings_audit_report" 'any(.after.pluginHookManifests[]?; .plugin == "hindsight-memory" and .eventName == "UserPromptSubmit")'
assert_json_expr "settings-audit reports memory plugin hooks" "$settings_audit_report" 'any(.after.memoryPluginHooks[]?; .plugin == "hindsight-memory" and .eventName == "Stop" and .async == true)'
settings_audit_bad_home="$TMPROOT/settings-audit-bad-home"
settings_audit_bad_target="$TMPROOT/settings-audit-bad-target.json"
mkdir -p "$settings_audit_bad_home/.claude/plugins/cache/bad-plugin/0.0.1/hooks"
printf '%s\n' '{"hooks":' >"$settings_audit_bad_home/.claude/plugins/cache/bad-plugin/0.0.1/hooks/hooks.json"
printf '%s\n' '{"hooks":{}}' >"$settings_audit_bad_target"
settings_audit_bad_report="$(HOME="$settings_audit_bad_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_bad_target" --json 2>/dev/null || true)"
assert_json_expr "settings-audit rejects corrupt plugin hook manifest" "$settings_audit_bad_report" '.ok == false and any(.after.manifestErrors[]?; .plugin == "bad-plugin")'
settings_audit_memory_target="$TMPROOT/settings-audit-memory-target.json"
cat >"$settings_audit_memory_target" <<'JSON'
{
  "enabledPlugins": {
    "hindsight-memory@hindsight": true
  },
  "autoCompactWindow": 400000,
  "skipAutoPermissionPrompt": true,
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "bash ~/.claude/hooks/cc-sessionstart-restore.sh"}]}],
    "PreCompact": [{"hooks": [{"type": "command", "command": "bash ~/.claude/hooks/cc-precompact-save.sh"}]}],
    "PostCompact": [{"hooks": [{"type": "command", "command": "bash ~/.claude/hooks/cc-postcompact-record.sh"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "bash ~/.claude/hooks/cc-stop-verifier.sh"}]}]
  }
}
JSON
mkdir -p "$settings_audit_home/.claude/skills/frontmatter-hook"
cat >"$settings_audit_home/.claude/skills/frontmatter-hook/SKILL.md" <<'MD'
---
name: frontmatter-hook
hooks: []
---
# Frontmatter Hook
MD
settings_audit_memory_report="$(HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_memory_target" --strict-conflicts --json 2>/dev/null || true)"
assert_json_expr "settings-audit strict rejects risky top-level settings" "$settings_audit_memory_report" '.ok == false and any(.after.riskyTopLevelSettings[]?; .key == "autoCompactWindow") and any(.after.riskyTopLevelSettings[]?; .key == "skipAutoPermissionPrompt")'
assert_json_expr "settings-audit reports Hindsight memory posture" "$settings_audit_memory_report" 'any(.after.memoryPluginPosture[]?; .plugin == "hindsight-memory@hindsight" and .status == "healthy-config" and .mode == "local-daemon")'
assert_json_expr "settings-audit reports frontmatter hook declarations" "$settings_audit_memory_report" 'any(.after.frontmatterHookDeclarations[]?; .key == "hooks")'
settings_audit_async_target="$TMPROOT/settings-audit-async.json"
printf '%s\n' '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash ~/.claude/hooks/cc-sessionstart-restore.sh","async":true}]}],"PreCompact":[{"hooks":[{"type":"command","command":"bash ~/.claude/hooks/suggest-compact.sh"}]}]}}' >"$settings_audit_async_target"
settings_audit_async_report="$(HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_async_target" --strict-conflicts --json 2>/dev/null || true)"
assert_json_expr "settings-audit strict rejects async compact restore" "$settings_audit_async_report" '.ok == false and any(.after.syncExpectationIssues[]?; .id == "compact-restore-sync")'
assert_json_expr "settings-audit strict classifies compact companion noise" "$settings_audit_async_report" 'any(.after.conflictingHooks[]?; .id == "compact-companion-noise" and .hook == "suggest-compact.sh")'
settings_audit_quoted_target="$TMPROOT/settings-audit-quoted-target.json"
# shellcheck disable=SC2016
printf '%s\n' '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"bash '\''$HOME/.claude/hooks/check-context-and-handoff.sh'\''"},{"type":"command","command":"bash \"~/.claude/hooks/check-context-and-handoff.sh\""}]}]}}' >"$settings_audit_quoted_target"
settings_audit_quoted_report="$(HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_quoted_target" --json)"
assert_json_expr "settings-audit ignores single-quoted HOME hook paths" "$settings_audit_quoted_report" '([.after.conflictingHooks[]? | select(.id == "invalid-stop-context-handoff")] | length) == 0'
assert_json_expr "settings-audit ignores double-quoted tilde hook paths" "$settings_audit_quoted_report" '([.after.externalHooks[]? | select(.hook == "check-context-and-handoff.sh")] | length) == 0'
HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_quoted_target" --fix
assert_json_expr "settings-audit preserves shell-literal hook paths" "$(jq -c . "$settings_audit_quoted_target")" '([.hooks.Stop[]?.hooks[]?.command // empty | select(test("check-context-and-handoff"))] | length) == 2'
settings_audit_literal_target="$TMPROOT/settings-audit-literal-target.json"
cat >"$settings_audit_literal_target" <<'JSON'
{"hooks":{"PostToolUse":[{"hooks":[{"type":"command","command":"bash '$HOME/.claude/hooks/rate-limiter.sh'"}]}]}}
JSON
HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_literal_target" --fix
# shellcheck disable=SC2016
assert_json_expr "settings-audit preserves single-quoted HOME rate limiter literal" "$(jq -c . "$settings_audit_literal_target")" '(.hooks.PostToolUse[0].hooks[0].command | contains("$HOME/.claude/hooks/rate-limiter.sh"))'
assert_json_expr "settings-audit does not rewrite single-quoted HOME rate limiter literal" "$(jq -c . "$settings_audit_literal_target")" '([.hooks.PostToolUse[].hooks[].command | select(test("cc-rate-limiter"))] | length) == 0'
settings_audit_strict_status=0
HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_target" --strict-conflicts >/dev/null 2>&1 || settings_audit_strict_status=$?
if [[ "$settings_audit_strict_status" -ne 0 ]]; then ok "settings-audit strict conflicts fail closed"; else not_ok "settings-audit strict conflicts should fail closed"; fi
printf '%s\n' '#!/usr/bin/env bash' '# rtk-hook-version: 4' 'rg_rewrite_needs_proxy() { return 0; }' >"$settings_audit_home/.claude/hooks/rtk-rewrite.sh"
settings_audit_report="$(HOME="$settings_audit_home" node "$ROOT/scripts/settings-audit.mjs" "$settings_audit_target" --json)"
assert_json_expr "settings-audit accepts fixed rtk rewrite hook" "$settings_audit_report" '([.after.conflictingHooks[]? | select(.id == "rtk-rewrite")] | length) == 0'
assert_command "skill contract syntax" node --check "$ROOT/scripts/skill-contract-check.mjs"
assert_command "skill contracts pass" node "$ROOT/scripts/skill-contract-check.mjs" --root "$ROOT"
advisory_skill_root="$TMPROOT/advisory-skill-root"
mkdir -p "$advisory_skill_root/scripts/lib" "$advisory_skill_root/docs" "$advisory_skill_root/skills/etrnl-soft" "$advisory_skill_root/hooks/lib"
printf '%s\n' 'OWNED_SKILLS=(' '  "etrnl-soft"' ')' 'OWNED_AGENTS=()' >"$advisory_skill_root/scripts/lib/skill-lists.sh"
printf '%s\n' '# ETRNL Skills' '' '| Command | Purpose |' '| --- | --- |' '| /etrnl-soft | Test skill |' >"$advisory_skill_root/docs/skills.md"
printf '%s\n' 'get_etrnl_skill_hint() {' '  printf "%s\n" "/etrnl-soft"' '}' >"$advisory_skill_root/hooks/lib/skill-hints.sh"
printf '%s\n' '---' 'name: etrnl-soft' 'description: Test skill.' '---' '# Soft Skill' '' '- Prefer advisory language.' >"$advisory_skill_root/skills/etrnl-soft/SKILL.md"
if advisory_skill_out="$(node "$ROOT/scripts/skill-contract-check.mjs" --root "$advisory_skill_root" 2>&1)"; then
  not_ok "skill contracts reject advisory wording"
else
  assert_contains "skill contracts reject advisory wording" "$advisory_skill_out" 'advisory wording "prefer"'
fi
model_skill_root="$TMPROOT/model-skill-root"
mkdir -p "$model_skill_root/scripts/lib" "$model_skill_root/docs" "$model_skill_root/skills/etrnl-model-pinned" "$model_skill_root/hooks/lib"
printf '%s\n' 'OWNED_SKILLS=(' '  "etrnl-model-pinned"' ')' 'OWNED_AGENTS=()' >"$model_skill_root/scripts/lib/skill-lists.sh"
printf '%s\n' '# ETRNL Skills' '' '| Command | Purpose |' '| --- | --- |' '| /etrnl-model-pinned | Test skill |' >"$model_skill_root/docs/skills.md"
printf '%s\n' 'get_etrnl_skill_hint() {' '  printf "%s\n" "/etrnl-model-pinned"' '}' >"$model_skill_root/hooks/lib/skill-hints.sh"
printf '%s\n' '---' 'name: etrnl-model-pinned' 'description: Test skill.' 'model: sonnet' 'effort: medium' '---' '# Model Pinned Skill' '' '- Use active model routing.' >"$model_skill_root/skills/etrnl-model-pinned/SKILL.md"
if model_skill_out="$(node "$ROOT/scripts/skill-contract-check.mjs" --root "$model_skill_root" 2>&1)"; then
  not_ok "skill contracts reject model routing frontmatter"
else
  assert_contains "skill contracts reject model routing frontmatter" "$model_skill_out" 'model frontmatter is not allowed'
  assert_contains "skill contracts reject effort routing frontmatter" "$model_skill_out" 'effort frontmatter is not allowed'
fi
assert_command "skill behavior smoke syntax" node --check "$ROOT/scripts/skill-behavior-smoke.mjs"
assert_command "skill behavior smoke pass" node "$ROOT/scripts/skill-behavior-smoke.mjs" --root "$ROOT"
assert_command "research intel syntax" node --check "$ROOT/scripts/research-competitor-intel.mjs"
assert_command "research core syntax" node --check "$ROOT/scripts/lib/research-intel-core.mjs"
assert_command "research manifest validates" node "$ROOT/scripts/research-competitor-intel.mjs" validate-manifest --manifest "$ROOT/docs/research/top10-lock.json"
assert_command "research evidence validates" node "$ROOT/scripts/research-competitor-intel.mjs" validate-evidence --evidence "$ROOT/docs/research/capability-evidence.json"
assert_command "research scorecard validates" node "$ROOT/scripts/research-competitor-intel.mjs" validate-scorecard --scorecard "$ROOT/docs/research/parity-scorecard.json" --skills-file "$ROOT/scripts/lib/skill-lists.sh" --evidence "$ROOT/docs/research/capability-evidence.json"
assert_json_expr "research schema defines scorecards array" "$(jq -c . "$ROOT/docs/research/parity-scorecard.schema.json")" '.properties.scorecards.type == "array"'
assert_json_expr "research schema avoids hardcoded OWNED_SKILLS minItems" "$(jq -c . "$ROOT/docs/research/parity-scorecard.schema.json")" '(.properties.scorecards.minItems | not)'
research_manifest_json="$(jq -c . "$ROOT/docs/research/top10-lock.json")"
assert_json_expr "research lock has 10 unique competitors" "$research_manifest_json" '.competitors | length == 10 and (map(.id) | unique | length == 10)'
assert_json_expr "research lock commit SHAs pinned" "$research_manifest_json" '(.competitors | map(.commitSha | test("^[A-Fa-f0-9]{40}$")) | all)'
research_evidence_json="$(jq -c . "$ROOT/docs/research/capability-evidence.json")"
assert_json_expr "research evidence has full capability coverage" "$research_evidence_json" '.rows | length == 80'
assert_json_expr "research evidence enforces non-README refs" "$research_evidence_json" '([.rows[].evidence[].file | test("(^|/)README(\\.|$)"; "i")] | any | not)'

bad_manifest="$TMPROOT/research-bad-manifest.json"
printf '%s\n' '{}' >"$bad_manifest"
if node "$ROOT/scripts/research-competitor-intel.mjs" validate-manifest --manifest "$bad_manifest" >/dev/null 2>&1; then
  not_ok "research manifest validator rejects missing fields"
else
  ok "research manifest validator rejects missing fields"
fi

bad_evidence="$TMPROOT/research-bad-evidence.json"
printf '%s\n' '{"generatedAt":"2026-05-11T00:00:00Z","capabilities":["tdd_enforcement"],"rows":[{"competitorId":"fixture","capability":"tdd_enforcement","status":"present","enforcementLevel":"prompt_only","evidence":[{"file":"README.md","line":1,"snippet":"bad","kind":"code_ref"}]}]}' >"$bad_evidence"
if node "$ROOT/scripts/research-competitor-intel.mjs" validate-evidence --evidence "$bad_evidence" >/dev/null 2>&1; then
  not_ok "research evidence validator rejects README citations"
else
  ok "research evidence validator rejects README citations"
fi

fixture_repos="$TMPROOT/research-fixtures"
fixture_manifest="$TMPROOT/research-fixture-manifest.json"
cp -- "$ROOT/tests/fixtures/research-fixture-manifest.json" "$fixture_manifest"
# shellcheck source=tests/fixtures/research-skill-strings.sh
if [[ ! -f "$ROOT/tests/fixtures/research-skill-strings.sh" ]]; then
  not_ok "research fixture strings file missing"
  exit 1
fi
source "$ROOT/tests/fixtures/research-skill-strings.sh"
assert_command "research fixture strings align with CAPABILITY_DEFS" env \
  SKILL_LINE_TDD="$SKILL_LINE_TDD" \
  SKILL_LINE_PLANNING="$SKILL_LINE_PLANNING" \
  SKILL_LINE_RESEARCH="$SKILL_LINE_RESEARCH" \
  SKILL_LINE_SUBAGENT="$SKILL_LINE_SUBAGENT" \
  SKILL_LINE_PARALLELISM="$SKILL_LINE_PARALLELISM" \
  SKILL_LINE_GATE="$SKILL_LINE_GATE" \
  SKILL_LINE_ROLLBACK="$SKILL_LINE_ROLLBACK" \
  SKILL_LINE_TELEMETRY="$SKILL_LINE_TELEMETRY" \
  HOOK_LINE_GATE="$HOOK_LINE_GATE" \
  SCRIPT_LINE_TELEMETRY="$SCRIPT_LINE_TELEMETRY" \
  TEST_LINE_TDD="$TEST_LINE_TDD" \
  node --input-type=module <<'JS'
import { CAPABILITY_DEFS } from "./scripts/lib/research-intel-core.mjs";

const byId = new Map(CAPABILITY_DEFS.map((item) => [item.id, item.patterns]));
const checks = [
  ["tdd_enforcement", process.env.SKILL_LINE_TDD],
  ["tdd_enforcement", process.env.TEST_LINE_TDD],
  ["planning_depth", process.env.SKILL_LINE_PLANNING],
  ["research_flow", process.env.SKILL_LINE_RESEARCH],
  ["subagent_orchestration", process.env.SKILL_LINE_SUBAGENT],
  ["parallelism_safety", process.env.SKILL_LINE_PARALLELISM],
  ["verification_gates", process.env.SKILL_LINE_GATE],
  ["verification_gates", process.env.HOOK_LINE_GATE],
  ["rollback_guardrails", process.env.SKILL_LINE_ROLLBACK],
  ["telemetry_proactive", process.env.SKILL_LINE_TELEMETRY],
  ["telemetry_proactive", process.env.SCRIPT_LINE_TELEMETRY],
];

for (const [capability, value] of checks) {
  if (!value) throw new Error(`missing fixture string for ${capability}`);
  const patterns = byId.get(capability) || [];
  if (!patterns.some((pattern) => pattern.test(value))) {
    throw new Error(`fixture string does not match ${capability} patterns: ${value}`);
  }
}
JS
while IFS=$'\t' read -r fixture_id fixture_path; do
  if [[ -z "$fixture_id" || -z "$fixture_path" ]]; then
    not_ok "research fixture manifest row missing id/path"
    exit 1
  fi
  fixture_dir="$fixture_repos/$fixture_path"
  if ! mkdir -p "$fixture_dir/skills/research" "$fixture_dir/hooks" "$fixture_dir/scripts" "$fixture_dir/tests"; then
    not_ok "research fixture scaffold failed for $fixture_id"
    exit 1
  fi
  if ! mkdir -p "$fixture_dir/dist/skills" "$fixture_dir/vendor/scripts" "$fixture_dir/.cache/hooks"; then
    not_ok "research fixture exclusion scaffold failed for $fixture_id"
    exit 1
  fi
  if ! {
    printf '%s\n' "# Skill ${fixture_id}" "${SKILL_LINE_TDD} for ${fixture_id}." "${SKILL_LINE_PLANNING} for ${fixture_id}." "${SKILL_LINE_RESEARCH} for ${fixture_id}." "$SKILL_LINE_SUBAGENT" "$SKILL_LINE_PARALLELISM" "$SKILL_LINE_GATE" "$SKILL_LINE_ROLLBACK." "$SKILL_LINE_TELEMETRY" >"$fixture_dir/skills/research/SKILL.md"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${HOOK_LINE_GATE} ${fixture_id}\"" >"$fixture_dir/hooks/pretool.sh"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${SCRIPT_LINE_TELEMETRY} ${fixture_id}\"" >"$fixture_dir/scripts/monitor.sh"
    printf '%s\n' "describe(\"tdd-${fixture_id}\", () => {" "  test(\"${TEST_LINE_TDD}\", () => {});" '});' >"$fixture_dir/tests/tdd.test.ts"
    printf '%s\n' "# Excluded Skill ${fixture_id}" "${SKILL_LINE_TDD} excluded for ${fixture_id}." >"$fixture_dir/dist/skills/SKILL.md"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${SCRIPT_LINE_TELEMETRY} excluded ${fixture_id}\"" >"$fixture_dir/vendor/scripts/monitor.sh"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${HOOK_LINE_GATE} excluded ${fixture_id}\"" >"$fixture_dir/.cache/hooks/pretool.sh"
  }; then
    not_ok "research fixture file creation failed for $fixture_id"
    exit 1
  fi
done < <(jq -r '.competitors[] | [.id, (.localPath // .id)] | @tsv' "$fixture_manifest")
fixture_evidence="$TMPROOT/research-fixture-evidence.json"
assert_command "research extractor runs on fixture repo" node "$ROOT/scripts/research-competitor-intel.mjs" extract --manifest "$fixture_manifest" --repos-root "$fixture_repos" --out "$fixture_evidence"
if node "$ROOT/scripts/research-competitor-intel.mjs" extract --manifest "$fixture_manifest" --repos-root "$fixture_repos" --out "$TMPROOT/research-overlong-cadence.json" --refresh-cadence-days 3651 >/dev/null 2>&1; then
  not_ok "research extractor rejects overlong refresh cadence"
else
  ok "research extractor rejects overlong refresh cadence"
fi
fixture_json="$(jq -c . "$fixture_evidence")"
assert_json_expr "research extractor emits 80 rows for 10 competitors x 8 capabilities" "$fixture_json" '.rows | length == 80'
assert_json_expr "research extractor detects TDD signal" "$fixture_json" '([.rows[] | select(.capability=="tdd_enforcement") | .status == "present"] | any)'
assert_json_expr "research extractor emits hook enforcement signal" "$fixture_json" '([.rows[] | select(.enforcementLevel=="hook_enforced")] | length > 0)'
assert_json_expr "research extractor skips generated and vendor evidence" "$fixture_json" '([.rows[].evidence[].file | test("(^|/)(dist|vendor|\\.cache)(/|$)")] | any | not)'

bad_scorecard="$TMPROOT/research-bad-scorecard.json"
jq '(.scorecards[0].gaps[0].sourceRows[0]) = "unknown:capability"' "$ROOT/docs/research/parity-scorecard.json" >"$bad_scorecard"
if node "$ROOT/scripts/research-competitor-intel.mjs" validate-scorecard --scorecard "$bad_scorecard" --skills-file "$ROOT/scripts/lib/skill-lists.sh" --evidence "$ROOT/docs/research/capability-evidence.json" >/dev/null 2>&1; then
  not_ok "research scorecard validator rejects unknown sourceRows"
else
  ok "research scorecard validator rejects unknown sourceRows"
fi

does_doc="$ROOT/docs/research/does-doesnt-by-competitor.md"
for competitor_id in $(jq -r '.competitors[].id' "$ROOT/docs/research/top10-lock.json"); do
  # Print lines under `## <competitor_id> ...`; match the first heading token exactly and stop only at the next top-level `##`.
  section_text="$(awk -v id="$competitor_id" '
    BEGIN {
      in_section = 0
    }
    /^##[[:space:]]+/ {
      rest = $0
      sub(/^##[[:space:]]+/, "", rest)
      heading_id = rest
      sub(/[[:space:]].*$/, "", heading_id)
      if (heading_id == id) {
        in_section = 1
        next
      }
      if (in_section) {
        exit
      }
    }
    in_section { print }
  ' "$does_doc")"
  assert_contains "does/doesn't section found for $competitor_id" "$section_text" "- "
  assert_contains "does/doesn't includes does row for $competitor_id" "$section_text" "- does:"
  assert_contains "does/doesn't includes does-not row for $competitor_id" "$section_text" "- does-not:"
done

assert_command "port-guard self-test" node "$ROOT/scripts/port-guard.mjs" self-test
assert_command "replay hook fixtures pass" node "$ROOT/scripts/replay-hook-fixtures.mjs"

budget_root="$TMPROOT/budget"
mkdir -p "$budget_root/skills/gstack-huge" "$budget_root/skills/etrnl-small"
printf '%20000s\n' "x" >"$budget_root/skills/gstack-huge/SKILL.md"
printf '%s\n' "---" "name: etrnl-small" "---" >"$budget_root/skills/etrnl-small/SKILL.md"
assert_command "prompt budget owned-only ignores external skills" node "$ROOT/scripts/prompt-budget-check.mjs" "$budget_root" --owned-only

changelog_good="$TMPROOT/changelog-good"
mkdir -p "$changelog_good"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1' '' '- Release note.' >"$changelog_good/CHANGELOG.md"
assert_command "changelog check accepts empty Unreleased" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_good" --strict-unreleased
changelog_missing="$TMPROOT/changelog-missing"
mkdir -p "$changelog_missing"
if missing_out="$(node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_missing" 2>&1)"; then
  not_ok "changelog check reports missing file"
else
  assert_contains "changelog check reports missing file" "$missing_out" "Failed to read CHANGELOG.md"
fi
changelog_comments="$TMPROOT/changelog-comments"
mkdir -p "$changelog_comments"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '<!-- hidden note' '- still hidden' '-->' '<!-- inline hidden -->' '<!-->' '<!-- ---->' '## v0.1.1' '' '- Release note.' >"$changelog_comments/CHANGELOG.md"
assert_command "changelog check ignores HTML comments" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_comments" --strict-unreleased
changelog_bad="$TMPROOT/changelog-bad"
mkdir -p "$changelog_bad"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '- Pending release note.' '' '## v0.1.0' '' '- Previous release.' >"$changelog_bad/CHANGELOG.md"
if node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_bad" --strict-unreleased >/dev/null 2>&1; then
  not_ok "changelog check rejects Unreleased entries"
else
  ok "changelog check rejects Unreleased entries"
fi
assert_command "changelog check allows Unreleased entries with allow flag" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_bad" --allow-unreleased
changelog_repo="$TMPROOT/changelog-repo"
mkdir -p "$changelog_repo"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.0' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
git -C "$changelog_repo" init -q -b main
git -C "$changelog_repo" config user.email "test@example.com"
git -C "$changelog_repo" config user.name "Test User"
git -C "$changelog_repo" add CHANGELOG.md
git -C "$changelog_repo" commit -qm "release v0.1.0"
git -C "$changelog_repo" tag v0.1.0
printf '%s\n' 'changed' >"$changelog_repo/README.md"
git -C "$changelog_repo" add README.md
git -C "$changelog_repo" commit -qm "workflow change"
if node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_repo" >/dev/null 2>&1; then
  not_ok "changelog check requires new release after tag"
else
  ok "changelog check requires new release after tag"
fi
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1' '' '- Workflow change.' '' '## v0.1.0' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
assert_command "changelog check accepts release after tag" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_repo"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.2' '' '- Current pending release.' '' '## v0.1.1' '' '- Untagged older release.' '' '## v0.1.0' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
if drift_out="$(node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_repo" 2>&1)"; then
  not_ok "changelog check rejects untagged older release sections"
else
  assert_contains "changelog check rejects untagged older release sections" "$drift_out" "untagged release sections below the top pending release"
fi
git -C "$changelog_repo" tag v0.1.2
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.3' '' '- Current pending release.' '' '## v0.1.2' '' '- Tagged release.' '' '## v0.1.1' '' '- Older untagged release.' '' '## v0.1.0' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
if drift_out="$(node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_repo" 2>&1)"; then
  not_ok "changelog check rejects older untagged sections below a tagged release"
else
  assert_contains "changelog check rejects older untagged sections below a tagged release" "$drift_out" "untagged release sections below the top pending release"
fi

changelog_malformed_tag="$TMPROOT/changelog-malformed-tag"
mkdir -p "$changelog_malformed_tag"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1' '' '- Release note.' >"$changelog_malformed_tag/CHANGELOG.md"
git -C "$changelog_malformed_tag" init -q -b main
git -C "$changelog_malformed_tag" config user.email "test@example.com"
git -C "$changelog_malformed_tag" config user.name "Test User"
git -C "$changelog_malformed_tag" add CHANGELOG.md
git -C "$changelog_malformed_tag" commit -qm "release v0.1.1"
git -C "$changelog_malformed_tag" tag v0.1.0-beta
printf '%s\n' 'changed' >"$changelog_malformed_tag/README.md"
git -C "$changelog_malformed_tag" add README.md
git -C "$changelog_malformed_tag" commit -qm "workflow change"
if malformed_out="$(node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_malformed_tag" 2>&1)"; then
  not_ok "changelog check rejects malformed semver tag"
else
  assert_contains "changelog check rejects malformed semver tag" "$malformed_out" "Invalid semver version: v0.1.0-beta"
fi

review_fp="$(node "$ROOT/scripts/review-log.mjs" add --path "$TMPROOT/review-log.jsonl" --finding "sk_live_example_should_redact" --severity P1 --status open)"
aws_secret_value="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
review_fp="$(node "$ROOT/scripts/review-log.mjs" add --path "$TMPROOT/review-log.jsonl" --finding "aws_secret_access_key=$aws_secret_value" --severity P1 --status open)"
if [[ ${#review_fp} -ge 16 ]]; then
  ok "review log fingerprint emitted"
else
  not_ok "review log fingerprint emitted"
fi
assert_command "review log validates" node "$ROOT/scripts/review-log.mjs" validate --path "$TMPROOT/review-log.jsonl"
review_summary="$(node "$ROOT/scripts/review-log.mjs" summary --path "$TMPROOT/review-log.jsonl")"
assert_contains "review log summary unresolved" "$review_summary" "unresolved=2"
if rg -F "sk_live_example" "$TMPROOT/review-log.jsonl" >/dev/null || rg -F "$aws_secret_value" "$TMPROOT/review-log.jsonl" >/dev/null; then
  not_ok "review log redacts token-like values"
else
  ok "review log redacts token-like values"
fi
buglog_path="$TMPROOT/project-buglog.jsonl"
BUGLOG_TOKEN="sk_live_example_should_not_persist"
BUGLOG_SECRET="aws_secret_access_key=$aws_secret_value"
buglog_fp="$(CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" record --cwd "$TMPROOT/project" --file src/app.ts --category repeated-edit --summary "repeat failure leaked $BUGLOG_TOKEN and $BUGLOG_SECRET")"
if [[ ${#buglog_fp} -ge 16 ]]; then
  ok "project buglog fingerprint emitted"
else
  not_ok "project buglog fingerprint emitted"
fi
buglog_fp_session2="$(CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" record --cwd "$TMPROOT/project" --file src/app.ts --category repeated-edit --summary "repeat failure leaked $BUGLOG_TOKEN and $BUGLOG_SECRET" --session other-session)"
if [[ "$buglog_fp_session2" == "$buglog_fp" ]]; then
  ok "project buglog fingerprint is cross-session stable"
else
  not_ok "project buglog fingerprint is cross-session stable"
fi
CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" record --cwd "$TMPROOT/project" --file src/other.ts --category repeated-edit --summary "repeat failure leaked $BUGLOG_TOKEN and $BUGLOG_SECRET" >/dev/null
CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" record --cwd "$TMPROOT/project" --file src/third.ts --category repeated-edit --summary "repeat failure leaked $BUGLOG_TOKEN and $BUGLOG_SECRET" >/dev/null
buglog_json="$(CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" suggest --cwd "$TMPROOT/project" --file src/app.ts --json)"
assert_json_expr "project buglog suggest emits JSON" "$buglog_json" '.schemaVersion == 1 and (.suggestions | length) == 1'
assert_json_expr "project buglog suggest includes guard recommendation" "$buglog_json" '(.suggestions[0].suggestedGuard | length) > 0'
buglog_project_json="$(CLAUDE_CONTROL_PLANE_BUGLOG="$buglog_path" node "$ROOT/scripts/project-buglog.mjs" suggest-project --cwd "$TMPROOT/project" --json --aggregate-threshold 3)"
assert_json_expr "project buglog project hints omit raw cwd" "$buglog_project_json" '.project == "project" and (.cwd | not) and (.suggestions | length) == 1'
assert_json_expr "project buglog aggregates repeated lessons" "$buglog_project_json" '.suggestions[0].kind == "aggregate" and .suggestions[0].affectedFilesCount == 3 and (.suggestions[0].recentFiles | length) == 3'
assert_json_expr "project buglog aggregate carries display file" "$buglog_project_json" '(.suggestions[0].file | type == "string" and length > 0)'
if rg -F "$BUGLOG_TOKEN" "$buglog_path" >/dev/null || rg -F "$aws_secret_value" "$buglog_path" >/dev/null || printf '%s' "$buglog_json" | rg -F "$aws_secret_value" >/dev/null; then
  not_ok "project buglog redacts token-like values"
else
  ok "project buglog redacts token-like values"
fi
stale_buglog_path="$TMPROOT/stale-project-buglog.jsonl"
printf '%s\n' '{"schemaVersion":1,"fingerprintVersion":2,"cwd":"'"$TMPROOT"'/stale","file":"src/stale.ts","category":"repeat-edit","summary":"old bug","sessionId":"old","at":"2000-01-01T00:00:00Z","fingerprint":"oldbug1234567890"}' >"$stale_buglog_path"
stale_buglog_json="$(CLAUDE_CONTROL_PLANE_BUGLOG="$stale_buglog_path" node "$ROOT/scripts/project-buglog.mjs" suggest --cwd "$TMPROOT/stale" --file src/stale.ts --json --max-age-days 1)"
assert_json_expr "project buglog suppresses stale hints" "$stale_buglog_json" '(.suggestions | length) == 0'

qa_report="$(printf '{"routes":["/"],"viewports":["desktop","mobile"],"findings":[]}' | node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa.json")"
assert_command "browser QA report validates" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report"
if unchecked_qa="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-unchecked.json" --routes "/,/campaigns" --viewports "desktop,mobile" --status complete 2>&1)"; then
  not_ok "browser QA report rejects unchecked complete report"
else
  assert_contains "browser QA report rejects unchecked console summary" "$unchecked_qa" "consoleSummary"
  assert_contains "browser QA report rejects unchecked network summary" "$unchecked_qa" "networkSummary"
fi
qa_report_flags="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-flags.json" --routes "/,/campaigns" --viewports "desktop,mobile" --console "no console errors" --network "no failed requests" --status complete)"
assert_command "browser QA report flag command validates" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report_flags"
if v2_unchecked_qa="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-v2-unchecked.json" --schema-version 2 --routes "/,/campaigns" --viewports "desktop,mobile" --console "no console errors" --network "no failed requests" --status complete 2>&1)"; then
  not_ok "browser QA v2 rejects incomplete matrix evidence"
else
  assert_contains "browser QA v2 rejects missing route status" "$v2_unchecked_qa" "matrix[0].status"
  assert_contains "browser QA v2 rejects missing console error count" "$v2_unchecked_qa" "consoleErrors"
  assert_contains "browser QA v2 rejects missing failed request count" "$v2_unchecked_qa" "failedRequests"
fi
printf '%s\n' "desktop screenshot bytes" >"$TMPROOT/desktop-home.png"
printf '%s\n' "mobile screenshot bytes" >"$TMPROOT/mobile-home.png"
desktop_hash="$(node "$ROOT/scripts/browser-qa-report.mjs" hash "$TMPROOT/desktop-home.png")"
mobile_hash="$(node "$ROOT/scripts/browser-qa-report.mjs" hash "$TMPROOT/mobile-home.png")"
qa_captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
qa_v2_matrix="$(jq -cn \
  --arg capturedAt "$qa_captured_at" \
  --arg desktopHash "$desktop_hash" \
  --arg mobileHash "$mobile_hash" \
  '[{"route":"/","viewport":"desktop","status":"passed","screenshot":"desktop-home.png","screenshotSha256":$desktopHash,"capturedAt":$capturedAt,"consoleErrors":0,"failedRequests":0},{"route":"/","viewport":"mobile","status":"passed","screenshot":"mobile-home.png","screenshotSha256":$mobileHash,"capturedAt":$capturedAt,"consoleErrors":0,"failedRequests":0}]')"
qa_provenance="$(jq -cn --arg capturedAt "$qa_captured_at" '{"tool":"playwright-cli","targetUrl":"http://127.0.0.1:4173","command":"playwright-cli screenshot","capturedAt":$capturedAt}')"
qa_report_explicit_v1="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-explicit-v1.json" --schema-version 1 --matrix "$qa_v2_matrix" --console "checked console logs" --network "checked network panel" --status complete)"
assert_json_expr "browser QA explicit schema version 1 stays v1" "$(jq -c . "$qa_report_explicit_v1")" '.schemaVersion == 1 and (.matrix | not)'
qa_duplicate_matrix="$(jq -cn \
  --arg capturedAt "$qa_captured_at" \
  --arg desktopHash "$desktop_hash" \
  '[{"route":"/","viewport":"desktop","status":"passed","screenshot":"desktop-home.png","screenshotSha256":$desktopHash,"capturedAt":$capturedAt,"consoleErrors":0,"failedRequests":0},{"route":"/","viewport":"desktop","status":"passed","screenshot":"desktop-home.png","screenshotSha256":$desktopHash,"capturedAt":$capturedAt,"consoleErrors":0,"failedRequests":0}]')"
if matrix_out="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-v2-duplicate.json" --artifact-root "$TMPROOT" --schema-version 2 --routes "/" --viewports "desktop,mobile" --target-url "http://127.0.0.1:4173" --tool "playwright-cli" --provenance "$qa_provenance" --matrix "$qa_duplicate_matrix" --console "checked console logs" --network "checked network panel" --status complete 2>&1)"; then
  not_ok "browser QA v2 rejects incomplete route viewport matrix"
else
  assert_contains "browser QA v2 reports missing matrix combination" "$matrix_out" "matrix missing route / viewport mobile"
  assert_contains "browser QA v2 reports duplicate matrix combination" "$matrix_out" "matrix contains duplicate route / viewport desktop"
fi
qa_report_v2="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-v2.json" --artifact-root "$TMPROOT" --schema-version 2 --routes "/" --viewports "desktop,mobile" --target-url "http://127.0.0.1:4173" --tool "playwright-cli" --provenance "$qa_provenance" --matrix "$qa_v2_matrix" --console "checked console logs" --network "checked network panel" --status complete)"
assert_command "browser QA v2 report validates" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report_v2" --artifact-root "$TMPROOT"
printf '%s\n' "trace bytes" >"$TMPROOT/home.trace.zip"
printf '%s\n' "video bytes" >"$TMPROOT/home.webm"
trace_hash="$(node "$ROOT/scripts/browser-qa-report.mjs" hash "$TMPROOT/home.trace.zip")"
video_hash="$(node "$ROOT/scripts/browser-qa-report.mjs" hash "$TMPROOT/home.webm")"
qa_trace_matrix="$(jq -cn \
  --arg capturedAt "$qa_captured_at" \
  --arg desktopHash "$desktop_hash" \
  --arg traceHash "$trace_hash" \
  --arg videoHash "$video_hash" \
  '[{"route":"/","viewport":"desktop","status":"passed","screenshot":"desktop-home.png","screenshotSha256":$desktopHash,"trace":"home.trace.zip","traceSha256":$traceHash,"video":"home.webm","videoSha256":$videoHash,"pageErrors":[],"capturedAt":$capturedAt,"consoleErrors":0,"failedRequests":0}]')"
qa_report_trace="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-trace.json" --artifact-root "$TMPROOT" --schema-version 2 --routes "/" --viewports "desktop" --target-url "http://127.0.0.1:4173" --tool "playwright-cli" --provenance "$qa_provenance" --matrix "$qa_trace_matrix" --console "checked console logs" --network "checked network panel" --status complete)"
assert_command "browser QA v2 trace video pageErrors validate" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report_trace" --artifact-root "$TMPROOT"
qa_migrated="$(node "$ROOT/scripts/browser-qa-report.mjs" migrate "$qa_report" --path "$TMPROOT/browser-qa-migrated.json")"
assert_command "browser QA migrate emits valid v2 draft" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_migrated"
assert_json_expr "browser QA migrated report is v2" "$(jq -c . "$qa_migrated")" '.schemaVersion == 2 and (.matrix | length) == 2'
qa_artifacts="$TMPROOT/browser-qa-artifacts"
mkdir -p "$qa_artifacts/browser-qa"
printf '{bad' >"$qa_artifacts/browser-qa/bad.json"
cp "$qa_report" "$qa_artifacts/browser-qa/good.json"
if qa_summary="$(CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$qa_artifacts" node "$ROOT/scripts/browser-qa-report.mjs" summary --strict 2>&1)"; then
  not_ok "browser QA strict summary exits after processing all reports"
else
  assert_contains "browser QA strict summary counts valid reports" "$qa_summary" "browserQa reports=1"
fi
context_file="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-context --title "Fixture" --remaining "finish verification" --verification "tests pending")"
assert_command "context save validates" node "$ROOT/scripts/context-state.mjs" validate "$context_file"
context_restore="$(node "$ROOT/scripts/context-state.mjs" restore "$context_file")"
assert_contains "context restore command works" "$context_restore" "stale="
stale_context="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-stale-context --title "Stale" --saved-at "2000-01-01T00:00:00Z")"
context_summary="$(node "$ROOT/scripts/context-state.mjs" show "$stale_context" --stale-hours 1)"
assert_contains "context restore detects stale context" "$context_summary" "stale=true"
session_scan_root="$TMPROOT/session-scan"
mkdir -p "$session_scan_root/claude/projects/project-a" "$session_scan_root/codex/rollout_summaries"
printf '%s\n' \
  '{"message":{"content":[{"type":"hook_non_blocking_error","hookName":"stale-hook","message":"/Users/example/old/path failed"}]}}' \
  '{"message":{"content":[{"type":"hook_blocking_error","hookName":"guard","stderr":"blocked for test@example.com"}]}}' \
  >"$session_scan_root/claude/projects/project-a/session.jsonl"
printf '%s\n' '{"event_msg":"CodeRabbit lint hook stale tooling warning"}' >"$session_scan_root/codex/rollout_summaries/session.jsonl"
live_hook_json="$(node "$ROOT/scripts/live-hook-noise-report.mjs" --root "$session_scan_root/claude" --since-days 30 --json)"
assert_json_expr "live hook report counts blocking and non-blocking errors" "$live_hook_json" '.counts.nonBlocking == 1 and .counts.blocking == 1 and .topHooks[0].count >= 1'
assert_json_expr "live hook report redacts private paths and emails" "$live_hook_json" '((.topReasons | tostring) | contains("/Users/example") | not) and ((.topReasons | tostring) | contains("test@example.com") | not)'
session_audit_json="$(node "$ROOT/scripts/session-audit.mjs" --claude-root "$session_scan_root/claude" --codex-memory-root "$session_scan_root/codex" --since-days 30 --json)"
assert_json_expr "session audit combines claude hooks and codex memory signals" "$session_audit_json" '.claude.counts.blocking == 1 and .codexMemory.filesScanned == 1 and any(.codexMemory.keywordHits[]; .keyword == "CodeRabbit")'
wave_json="$(printf '{"useWorktrees":true,"submodules":["vendor/lib"],"plans":[{"id":"T1","wave":1,"files":["src/a.ts"]},{"id":"T2","wave":1,"files":["src/a.ts"]},{"id":"T3","wave":2,"files":["vendor/lib/x.ts"]}]}' | node "$ROOT/scripts/execution-wave-check.mjs")"
assert_json_expr "wave overlap disables parallel" "$wave_json" '.waves[0].parallelSafe == false'
assert_json_expr "submodule task not worktree eligible" "$wave_json" '.waves[1].plans[0].worktreeEligible == false'
assert_contains "wave heartbeat emitted" "$wave_json" "[checkpoint]"
wave_drift_json="$(printf '{"previousPlans":[{"id":"T1","wave":1,"files":["src/a.ts"]}],"plans":[{"id":"T1","wave":1,"files":["src/b.ts"]}]}' | node "$ROOT/scripts/execution-wave-check.mjs")"
assert_json_expr "wave drift reports changed files" "$wave_drift_json" '.drift[0].type == "files_changed"'
wave_reordered_json="$(printf '{"previousPlans":[{"id":"T1","wave":1,"files":["src/b.ts","src/a.ts"]}],"plans":[{"id":"T1","wave":1,"files":["src/a.ts","src/b.ts"]}]}' | node "$ROOT/scripts/execution-wave-check.mjs")"
assert_json_expr "wave drift ignores file order" "$wave_reordered_json" '.drift | length == 0'
health_root="$TMPROOT/health"
mkdir -p "$health_root/runs"
printf '%s\n' '{"schemaVersion":1,"runId":"stale-run","updatedAt":"2000-01-01T00:00:00Z","tasks":[{"id":"T1","status":"in_progress"}],"agents":[],"checks":[]}' >"$health_root/runs/stale-run.json"
health_out="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs")"
assert_contains "workflow health detects stale runs" "$health_out" "staleRuns=1"
assert_contains "workflow health reports artifact freshness" "$health_out" "artifactFreshness latest=none"
health_status_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json)"
assert_json_expr "workflow health status emits schema" "$health_status_json" '.schemaVersion == 1'
assert_json_expr "workflow health status reports active run" "$health_status_json" '.activeRunId == "stale-run"'
assert_json_expr "workflow health status reports unfinished work" "$health_status_json" '.unfinishedTasks == 1 and .runs.stale == 1'
assert_json_expr "workflow health status reports next action" "$health_status_json" '(.nextAction | length) > 0'
mkdir -p "$health_root/project-a" "$health_root/project-b"
jq -n --arg cwd "$health_root/project-a" '{"schemaVersion":2,"runId":"project-a-run","sessionId":"project-a-session","cwd":$cwd,"projectId":"project-a","updatedAt":"2026-05-13T11:00:00Z","tasks":[{"id":"T1","status":"verified"}],"agents":[],"checks":[{"name":"fixture","status":"passed"}],"events":[]}' >"$health_root/runs/project-a-run.json"
filtered_health_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json --cwd "$health_root/project-a")"
assert_json_expr "workflow health cwd filter selects matching run" "$filtered_health_json" '.activeRunId == "project-a-run" and .filters.cwd != ""'
filtered_empty_health_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json --cwd "$health_root/project-b")"
assert_json_expr "workflow health cwd filter excludes unrelated runs" "$filtered_empty_health_json" '.activeRunId == "" and .runs.total == 0'
if workflow_unknown_out="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" nope --json 2>&1)"; then
  not_ok "workflow health rejects unknown command even in json mode"
else
  assert_contains "workflow health unknown command reason" "$workflow_unknown_out" "Unknown workflow-health command"
fi
doctor_health_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" doctor --json --all)"
assert_json_expr "workflow health doctor reports ledgers" "$doctor_health_json" '.command == "doctor" and .ledgers.total >= 2'
mkdir -p "$health_root/artifacts/tool-effectiveness"
printf '%s\n' '{"schemaVersion":1,"tool":"codegraph","eligible":true,"toolUsed":true,"usedBeforeFirstEdit":true}' >"$health_root/artifacts/tool-effectiveness/events.jsonl"
effectiveness_status_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json --all)"
assert_json_expr "workflow health status projects effectiveness when present" "$effectiveness_status_json" '.effectiveness.events == 1 and (.effectiveness.tools | index("codegraph")) != null'
effectiveness_scoped_status_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json --cwd "$health_root/project-a")"
assert_json_expr "workflow health scoped status suppresses global effectiveness" "$effectiveness_scoped_status_json" '.effectiveness == null'
effectiveness_doctor_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" doctor --json --all)"
assert_json_expr "workflow health doctor reports effectiveness health" "$effectiveness_doctor_json" '.effectiveness.events == 1 and .effectiveness.malformed == 0'
jq -n '{"schemaVersion":2,"runId":"old-terminal-run","sessionId":"old","cwd":"/tmp/old","projectId":"old","updatedAt":"2000-01-01T00:00:00Z","tasks":[{"id":"T1","status":"verified"}],"agents":[],"checks":[{"name":"fixture","status":"passed"}],"events":[]}' >"$health_root/runs/old-terminal-run.json"
prune_health_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" prune --older-than-days 30 --dry-run --json --all)"
assert_json_expr "workflow health prune dry-run reports prunable ledgers" "$prune_health_json" '.command == "prune" and .dryRun == true and (.prunable | map(.runId) | index("old-terminal-run")) != null and .pruned == 0'
printf '%s\n' '{"schemaVersion":1,"runId":"artifact-run","updatedAt":"2026-05-13T12:00:00Z","tasks":[{"id":"T1","status":"verified"}],"agents":[],"checks":[{"name":"fixture","status":"passed"}],"requiredArtifacts":["browser-qa-report"],"artifacts":[]}' >"$health_root/runs/artifact-run.json"
artifact_status_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json)"
assert_json_expr "workflow health status reports missing artifacts" "$artifact_status_json" '(.missingArtifacts | index("browser-qa-report")) != null'
printf '%s\n' '{"schemaVersion":1,"runId":"uat-run","updatedAt":"2026-05-13T13:00:00Z","phaseId":"P1","workstreamId":"browser","phaseStatus":"uat","uatArtifact":"browser-qa.json","uatOpenFindings":2,"tasks":[{"id":"T1","status":"verified"}],"agents":[],"checks":[{"name":"fixture","status":"passed"}],"requiredArtifacts":[],"artifacts":[]}' >"$health_root/runs/uat-run.json"
uat_status_json="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status --json)"
assert_json_expr "workflow health status reports UAT state" "$uat_status_json" '.phase.id == "P1" and .uat.openFindings == 2'
assert_json_expr "workflow health next action prefers UAT findings" "$uat_status_json" '(.nextAction | contains("UAT findings"))'
uat_status_text="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs" status)"
assert_contains "workflow health status text reports active run" "$uat_status_text" "activeRun=uat-run"
assert_contains "workflow health status text reports next action" "$uat_status_text" "nextAction=resolve UAT findings: 2"
empty_health="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/missing-runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs")"
assert_contains "workflow health reports artifacts without ledger dir" "$empty_health" "reviewLog entries=0"

autoplan_meta="$(jq -c . "$ROOT/skills/metadata/etrnl-dev-autoplan.json")"
assert_json_expr "autoplan includes CEO review" "$autoplan_meta" '.ownerReview == "CEO/founder review"'
assert_json_expr "autoplan includes DX review" "$autoplan_meta" '.dxReview == "DX review"'
assert_json_expr "autoplan includes adversarial review" "$autoplan_meta" '.adversarialReview == true'
assert_json_expr "autoplan includes max completeness" "$autoplan_meta" '.completeness == "10/10"'
execute_meta="$(jq -c . "$ROOT/skills/metadata/etrnl-dev-execute.json")"
assert_json_expr "execute includes wave execution" "$execute_meta" '.executionMode == "wave-based execution"'
assert_json_expr "execute includes subagent ownership rule" "$execute_meta" '.ownershipRule == "do not duplicate"'
assert_json_expr "execute includes spot-check fallback" "$execute_meta" '.fallback == "spot-check"'
assert_json_expr "execute includes TDD discipline" "$execute_meta" '.testDiscipline == "TDD red-green"'
bad_plan="$TMPROOT/bad-plan.md"
printf '%s\n' '# Bad Plan' '' 'Status: Final' '' 'Goal: Thin plan.' >"$bad_plan"
if node "$ROOT/scripts/plan-readiness-check.mjs" "$bad_plan" >/dev/null 2>&1; then
  not_ok "plan readiness rejects incomplete plan"
else
  ok "plan readiness rejects incomplete plan"
fi
bad_plan_json="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$bad_plan" --json 2>/dev/null || true)"
assert_json_expr "plan readiness emits repair hints" "$bad_plan_json" '(.repairHints | length) > 0'
good_plan="$TMPROOT/good-plan.md"
cp "$ROOT/hooks/fixtures/plans/good-plan.md" "$good_plan"
if good_plan_missing_deep_out="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$good_plan" 2>&1)"; then
  not_ok "plan readiness rejects final plan without deep artifacts"
else
  assert_contains "plan readiness rejects final plan without deep artifacts" "$good_plan_missing_deep_out" "DEEP_ARTIFACT_REQUIRED"
fi
assert_command "plan readiness allows legacy transitional plan only with explicit flag" node "$ROOT/scripts/plan-readiness-check.mjs" "$good_plan" --allow-transitional-deep-stack
deep_stack_fixture="$ROOT/tests/fixtures/deep-stack/deep-stack.valid.json"
assert_command "deep-stack artifact validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-artifact --artifact "$deep_stack_fixture"
created_deep_dir="$TMPROOT/created-deep-stack"
created_deep_artifact="$(node "$ROOT/scripts/deep-stack-check.mjs" create --plan "$good_plan" --out "$created_deep_dir")"
if created_deep_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-artifact --artifact "$created_deep_artifact" 2>&1)"; then
  not_ok "deep-stack create skeleton fails closed until evidence is filled"
else
  assert_contains "deep-stack create skeleton fails closed until evidence is filled" "$created_deep_out" "DEEP_REVIEW_NOT_PASSED"
fi
invalid_deep_artifact="$TMPROOT/invalid-deep-stack.json"
printf '{not json\n' >"$invalid_deep_artifact"
if invalid_deep_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-artifact --artifact "$invalid_deep_artifact" 2>&1)"; then
  not_ok "deep-stack artifact rejects invalid JSON"
else
  assert_contains "deep-stack artifact rejects invalid JSON" "$invalid_deep_out" "DEEP_ARTIFACT_INVALID_JSON"
fi
assert_command "deep-stack plan readiness accepts opted-in artifact" node "$ROOT/scripts/plan-readiness-check.mjs" "$ROOT/tests/fixtures/deep-stack/plan.deep-stack.valid.md"
assert_command "deep-stack validate-plan accepts opted-in artifact" node "$ROOT/scripts/deep-stack-check.mjs" validate-plan --plan "$ROOT/tests/fixtures/deep-stack/plan.deep-stack.valid.md"
if deep_stack_no_metadata_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-plan --plan "$good_plan" 2>&1)"; then
  not_ok "deep-stack validate-plan rejects missing metadata by default"
else
  assert_contains "deep-stack validate-plan rejects missing metadata by default" "$deep_stack_no_metadata_out" "DEEP_ARTIFACT_REQUIRED"
fi
assert_command "deep-stack validate-plan transitional flag is explicit" node "$ROOT/scripts/deep-stack-check.mjs" validate-plan --plan "$good_plan" --allow-transitional
missing_deep_plan_json="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$ROOT/tests/fixtures/deep-stack/plan.deep-stack.missing-artifact.md" --json 2>/dev/null || true)"
assert_json_expr "deep-stack readiness blocks missing artifact" "$missing_deep_plan_json" '.ok == false and ([.failures[].name] | index("DEEP_ARTIFACT_MISSING") != null) and ([.repairHints[]] | any(contains("deep-stack-check.mjs create")))'
empty_deep_plan="$TMPROOT/empty-deep-artifact-plan.md"
cp "$ROOT/tests/fixtures/deep-stack/plan.deep-stack.valid.md" "$empty_deep_plan"
perl -0pi -e 's/^Deep stack artifacts:.*$/Deep stack artifacts:   /m' "$empty_deep_plan"
empty_deep_plan_json="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$empty_deep_plan" --json 2>/dev/null || true)"
assert_json_expr "deep-stack readiness blocks empty artifact metadata" "$empty_deep_plan_json" '.ok == false and ([.failures[].name] | index("DEEP_ARTIFACT_PATH_EMPTY") != null)'
assert_command "deep-stack source manifest validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-sources --artifact "$deep_stack_fixture"
assert_command "deep-stack review phase records validate" node "$ROOT/scripts/deep-stack-check.mjs" validate-review-phases --artifact "$deep_stack_fixture"
assert_command "deep-stack TDD evidence validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-tdd --artifact "$deep_stack_fixture"
assert_command "deep-stack completion reconciliation validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-completion-reconciliation --artifact "$deep_stack_fixture"
assert_command "deep-stack reuse bindings validate" node "$ROOT/scripts/deep-stack-check.mjs" validate-reuse-bindings --artifact "$deep_stack_fixture"
assert_command "deep-stack TypeScript trigger evidence validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-type-triggers --artifact "$deep_stack_fixture"
assert_command "deep-stack install proof validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-install-proof --artifact "$deep_stack_fixture"
missing_commit_artifact="$TMPROOT/deep-stack-missing-commit.json"
jq 'del(.sourceManifest.sources[0].commit)' "$deep_stack_fixture" >"$missing_commit_artifact"
if missing_commit_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-sources --artifact "$missing_commit_artifact" 2>&1)"; then
  not_ok "deep-stack source manifest requires commit"
else
  assert_contains "deep-stack source manifest requires commit" "$missing_commit_out" "SOURCE_FIELD_MISSING"
fi
if source_private_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-sources --artifact "$ROOT/tests/fixtures/deep-stack/source.private-path.json" 2>&1)"; then
  not_ok "deep-stack source manifest rejects private paths"
else
  assert_contains "deep-stack source manifest rejects private paths" "$source_private_out" "SOURCE_PRIVATE_VALUE"
fi
assert_command "deep-stack skill matrix accepts plain TypeScript negative control" node "$ROOT/scripts/deep-stack-check.mjs" validate-skills --artifact "$deep_stack_fixture"
assert_command "deep-stack advanced TypeScript fixture validates" node "$ROOT/scripts/deep-stack-check.mjs" validate-skills --artifact "$ROOT/tests/fixtures/deep-stack/typescript.advanced-required.json"
if reuse_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-reuse --artifact "$ROOT/tests/fixtures/deep-stack/reuse.missing-justification.json" 2>&1)"; then
  not_ok "deep-stack reuse inventory rejects unjustified new surface"
else
  assert_contains "deep-stack reuse inventory rejects unjustified new surface" "$reuse_out" "REUSE_NEW_SURFACE_JUSTIFICATION"
fi
if findings_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-findings --artifact "$ROOT/tests/fixtures/deep-stack/findings.open-high.json" 2>&1)"; then
  not_ok "deep-stack findings block open high finding"
else
  assert_contains "deep-stack findings block open high finding" "$findings_out" "FINDING_OPEN_HIGH"
fi
if completion_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-completion --artifact "$ROOT/tests/fixtures/deep-stack/completion.not-done-high.json" 2>&1)"; then
  not_ok "deep-stack completion blocks high-impact not done"
else
  assert_contains "deep-stack completion blocks high-impact not done" "$completion_out" "COMPLETION_HIGH_IMPACT_OPEN"
fi
missing_tdd_artifact="$TMPROOT/deep-stack-missing-tdd.json"
jq 'del(.tddEvidence)' "$deep_stack_fixture" >"$missing_tdd_artifact"
if missing_tdd_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-artifact --artifact "$missing_tdd_artifact" 2>&1)"; then
  not_ok "deep-stack artifact requires TDD evidence when declared"
else
  assert_contains "deep-stack artifact requires TDD evidence when declared" "$missing_tdd_out" "TDD_EVIDENCE_REQUIRED"
fi
open_review_artifact="$TMPROOT/deep-stack-open-review.json"
jq '(.reviewPhases[0].openHighCount = 1)' "$deep_stack_fixture" >"$open_review_artifact"
if open_review_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-review-phases --artifact "$open_review_artifact" 2>&1)"; then
  not_ok "deep-stack review phases block open high findings"
else
  assert_contains "deep-stack review phases block open high findings" "$open_review_out" "REVIEW_PHASE_OPEN_HIGH"
fi
bad_reuse_binding_artifact="$TMPROOT/deep-stack-bad-reuse-binding.json"
jq 'del(.reuseBindings[0].newSurfaceJustification)' "$deep_stack_fixture" >"$bad_reuse_binding_artifact"
if bad_reuse_binding_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-reuse-bindings --artifact "$bad_reuse_binding_artifact" 2>&1)"; then
  not_ok "deep-stack reuse bindings require new-surface justification"
else
  assert_contains "deep-stack reuse bindings require new-surface justification" "$bad_reuse_binding_out" "REUSE_BINDING_JUSTIFICATION"
fi
bad_type_trigger_artifact="$TMPROOT/deep-stack-bad-type-trigger.json"
jq '(.typeTriggerEvidence[0].advancedReviewStatus = "required") | del(.typeTriggerEvidence[0].advancedReviewEvidence)' "$deep_stack_fixture" >"$bad_type_trigger_artifact"
if bad_type_trigger_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-type-triggers --artifact "$bad_type_trigger_artifact" 2>&1)"; then
  not_ok "deep-stack type triggers require advanced review evidence"
else
  assert_contains "deep-stack type triggers require advanced review evidence" "$bad_type_trigger_out" "TS_TRIGGER_ADVANCED_REQUIRED"
fi
bad_install_proof_artifact="$TMPROOT/deep-stack-bad-install-proof.json"
jq '(.riskTier.tier = 3) | (.installProof.stagedInstall.status = "not_applicable") | (.installProof.stagedDoctor.status = "not_applicable") | (.installProof.rollbackVerification.status = "not_applicable")' "$deep_stack_fixture" >"$bad_install_proof_artifact"
if bad_install_proof_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-install-proof --artifact "$bad_install_proof_artifact" 2>&1)"; then
  not_ok "deep-stack Tier 3 install proof requires staged proof"
else
  assert_contains "deep-stack Tier 3 install proof requires staged proof" "$bad_install_proof_out" "INSTALL_PROOF_TIER3_STAGE"
fi
if risk_before_review_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-risk-tier --artifact "$ROOT/tests/fixtures/deep-stack/risk-tier.before-review.json" 2>&1)"; then
  not_ok "deep-stack risk tier requires passed deep review"
else
  assert_contains "deep-stack risk tier requires passed deep review" "$risk_before_review_out" "RISK_TIER_BEFORE_DEEP_REVIEW"
fi
if risk_tier3_out="$(node "$ROOT/scripts/deep-stack-check.mjs" validate-risk-tier --artifact "$ROOT/tests/fixtures/deep-stack/risk-tier.tier3-missing-install.json" 2>&1)"; then
  not_ok "deep-stack tier 3 requires staged install"
else
  assert_contains "deep-stack tier 3 requires staged install" "$risk_tier3_out" "RISK_TIER3_STAGED_INSTALL"
fi
large_plan="$TMPROOT/large-plan.md"
cp "$ROOT/hooks/fixtures/plans/good-plan.md" "$large_plan"
for i in $(seq 1 2600); do
  printf 'Detailed execution evidence line %04d: concrete owned file, command, expected signal, rollback note, and verification result placeholder.\n' "$i"
done >>"$large_plan"
if node "$ROOT/scripts/plan-readiness-check.mjs" "$large_plan" --allow-transitional-deep-stack >/dev/null 2>&1; then
  not_ok "plan readiness rejects oversized final plan without digest"
else
  ok "plan readiness rejects oversized final plan without digest"
fi
printf '%s\n' '' '## Execution Digest' '' '- Oversized detail is chunked into referenced execution artifacts.' >>"$large_plan"
assert_command "plan readiness accepts oversized final plan with digest" node "$ROOT/scripts/plan-readiness-check.mjs" "$large_plan" --allow-transitional-deep-stack
immediate_plan="$TMPROOT/immediate-first-patch-plan.md"
cp "$ROOT/hooks/fixtures/plans/good-plan.md" "$immediate_plan"
printf '%s\n' '' '## Immediate First Patch' '' '- Do only the first slice.' >>"$immediate_plan"
if immediate_out="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$immediate_plan" --allow-transitional-deep-stack 2>&1)"; then
  not_ok "plan readiness rejects ambiguous immediate first patch"
else
  assert_contains "plan readiness rejects ambiguous immediate first patch" "$immediate_out" "Immediate First Patch"
fi
phase_plan="$TMPROOT/phase-plan.md"
{
  printf 'Phase: P1\n'
  printf 'Workstream: browser\n'
  printf 'UAT Gate: browser QA matrix has zero open findings\n\n'
  cat "$ROOT/hooks/fixtures/plans/good-plan.md"
} >"$phase_plan"
phase_plan_json="$(node "$ROOT/scripts/plan-readiness-check.mjs" "$phase_plan" --json --allow-transitional-deep-stack)"
assert_json_expr "plan readiness recognizes optional phase metadata" "$phase_plan_json" '.ok == true and .optionalMetadata.phase == true and .optionalMetadata.workstream == true and .optionalMetadata.uatGate == true'
agent_template="$(node "$ROOT/scripts/agent-task-packet-check.mjs" --template write)"
assert_json_expr "agent packet template includes write scope" "$agent_template" '.packet.writeScope[0] | length > 0'
assert_json_expr "agent packet template includes reviewer contract" "$agent_template" '(.packet.reviewers | index("etrnl-spec-reviewer")) != null and .packet.specReviewRequired == true and .packet.qualityReviewRequired == true'
assert_json_expr "agent packet template includes critical stop fields" "$agent_template" '(.packet.criticalPath | length) > 0 and (.packet.stopCondition | length) > 0'
deep_packet="$(
  jq -cn '
    {
      packet: {
        mode: "write",
        goal: "Implement deep stack",
        contextSummary: "ctx",
        cwd: "/repo",
        scope: "scope",
        readSet: ["README.md"],
        expectedOutput: "done",
        noRevert: true,
        taskId: "T1",
        lineageId: "wave-1.T1",
        writeScope: ["scripts/deep-stack-check.mjs"],
        forbiddenPaths: ["docs/owned-by-other.md"],
        verificationCommand: "tests/test-workflow-tools.sh",
        modelTier: "sonnet",
        timeoutSec: 1800,
        retryPolicy: "stop on blocker",
        webSearchGuidance: "none",
        deepStackExecution: true,
        deepStackArtifacts: "tests/fixtures/deep-stack/deep-stack.valid.json",
        riskTier: {
          tier: 2,
          reason: "multi-file after review",
          verificationGate: "tests/test-workflow-tools.sh"
        },
        completionEvidence: "completion audit row",
        tddRequired: true,
        tddEvidence: "red/green evidence",
        reuseArtifact: "reuse binding row",
        simplifierEvidence: "code-simplifier evidence",
        specReviewRequired: true,
        qualityReviewRequired: true,
        simplifierReviewRequired: true,
        reviewers: ["etrnl-spec-reviewer", "etrnl-quality-reviewer"],
        integrationOwner: "parent",
        expectedDiffShape: "bounded patch"
      }
    }
  '
)"
assert_command "agent packet accepts deep-stack execution contract" node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$deep_packet"
bad_deep_packet="$(jq -cn '{packet:{mode:"write",goal:"Implement deep stack",contextSummary:"ctx",cwd:"/repo",scope:"scope",readSet:["README.md"],expectedOutput:"done",noRevert:true,taskId:"T1",lineageId:"wave-1.T1",writeScope:["scripts/deep-stack-check.mjs"],forbiddenPaths:["docs/owned-by-other.md"],verificationCommand:"tests/test-workflow-tools.sh",modelTier:"sonnet",timeoutSec:1800,retryPolicy:"stop on blocker",webSearchGuidance:"none",deepStackExecution:true,specReviewRequired:true,qualityReviewRequired:true,reviewers:["etrnl-spec-reviewer","etrnl-quality-reviewer"],integrationOwner:"parent",expectedDiffShape:"bounded patch"}}')"
if bad_deep_packet_out="$(node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$bad_deep_packet" 2>&1)"; then
  not_ok "agent packet rejects missing deep-stack contract"
else
  assert_contains "agent packet rejects missing deep-stack contract" "$bad_deep_packet_out" "deepStackArtifacts"
fi
bad_deep_packet_reviewers="$(jq -cn '{packet:{mode:"write",goal:"Implement deep stack",contextSummary:"ctx",cwd:"/repo",scope:"scope",readSet:["README.md"],expectedOutput:"done",noRevert:true,taskId:"T1",lineageId:"wave-1.T1",writeScope:["scripts/deep-stack-check.mjs"],forbiddenPaths:["docs/owned-by-other.md"],verificationCommand:"tests/test-workflow-tools.sh",modelTier:"sonnet",timeoutSec:1800,retryPolicy:"stop on blocker",webSearchGuidance:"none",deepStackExecution:true,deepStackArtifacts:"tests/fixtures/deep-stack/deep-stack.valid.json",riskTier:{tier:2,reason:"multi-file after review",verificationGate:"tests/test-workflow-tools.sh"},completionEvidence:"completion audit row",tddRequired:true,tddEvidence:"red/green evidence",reuseArtifact:"reuse binding row",simplifierEvidence:"code-simplifier evidence",specReviewRequired:true,qualityReviewRequired:true,simplifierReviewRequired:true,reviewers:["etrnl-spec-reviewer"],integrationOwner:"parent",expectedDiffShape:"bounded patch"}}')"
if bad_deep_packet_reviewers_out="$(node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$bad_deep_packet_reviewers" 2>&1)"; then
  not_ok "agent packet rejects missing deep-stack reviewer"
else
  assert_contains "agent packet rejects missing deep-stack reviewer" "$bad_deep_packet_reviewers_out" "etrnl-quality-reviewer"
fi
deep_packet_no_tdd="$(jq -cn '{packet:{mode:"write",goal:"Install-only deep stack",contextSummary:"ctx",cwd:"/repo",scope:"scope",readSet:["README.md"],expectedOutput:"done",noRevert:true,taskId:"T3",lineageId:"wave-1.T3",writeScope:["docs/runbook.md"],forbiddenPaths:["docs/owned-by-other.md"],verificationCommand:"tests/test-workflow-tools.sh",modelTier:"sonnet",timeoutSec:1800,retryPolicy:"stop on blocker",webSearchGuidance:"none",deepStackExecution:true,deepStackArtifacts:"tests/fixtures/deep-stack/deep-stack.valid.json",riskTier:{tier:2,reason:"docs-only after review",verificationGate:"tests/test-workflow-tools.sh"},completionEvidence:"completion audit row",tddRequired:false,reuseArtifact:"reuse binding row",simplifierEvidence:"code-simplifier evidence",specReviewRequired:true,qualityReviewRequired:true,simplifierReviewRequired:true,reviewers:["etrnl-spec-reviewer","etrnl-quality-reviewer"],integrationOwner:"parent",expectedDiffShape:"bounded patch"}}')"
assert_command "agent packet accepts deep-stack without TDD when tddRequired is false" node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$deep_packet_no_tdd"
new_surface_packet="$(jq -cn '{packet:{mode:"write",goal:"Add helper",contextSummary:"ctx",cwd:"/repo",scope:"scope",readSet:["README.md"],expectedOutput:"done",noRevert:true,taskId:"T2",lineageId:"wave-1.T2",writeScope:["scripts/new-helper.mjs"],forbiddenPaths:["docs/owned-by-other.md"],verificationCommand:"node --check scripts/new-helper.mjs",modelTier:"sonnet",timeoutSec:1800,retryPolicy:"stop on blocker",webSearchGuidance:"none",createsNewSurface:true}}')"
if new_surface_packet_out="$(node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$new_surface_packet" 2>&1)"; then
  not_ok "agent packet rejects new surface without reuse binding"
else
  assert_contains "agent packet rejects new surface without reuse binding" "$new_surface_packet_out" "reuseArtifact"
fi
bad_deep_packet_no_scope="$(jq -cn '{packet:{mode:"write",goal:"Implement deep stack",contextSummary:"ctx",cwd:"/repo",scope:"scope",readSet:["README.md"],expectedOutput:"done",noRevert:true,taskId:"T1",lineageId:"wave-1.T1",verificationCommand:"tests/test-workflow-tools.sh",modelTier:"sonnet",timeoutSec:1800,retryPolicy:"stop on blocker",webSearchGuidance:"none",deepStackExecution:true,specReviewRequired:true,qualityReviewRequired:true,reviewers:["etrnl-spec-reviewer","etrnl-quality-reviewer"],integrationOwner:"parent",expectedDiffShape:"bounded patch"}}')"
if bad_deep_packet_no_scope_out="$(node "$ROOT/scripts/agent-task-packet-check.mjs" <<<"$bad_deep_packet_no_scope" 2>&1)"; then
  not_ok "agent packet rejects deep-stack contract without write scope"
else
  assert_contains "agent packet rejects deep-stack contract without write scope" "$bad_deep_packet_no_scope_out" "deepStackArtifacts"
fi
packet_hash_64="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
execute_missing_tdd_state="$(jq -cn --arg hash "$packet_hash_64" '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],edits:{"src/app.ts":"2026-01-01T00:00:01Z"},agentCalls:[{value:("subagent=etrnl-executor mode=write taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:02Z"}],reviewerAgentCalls:[{value:("subagent=etrnl-spec-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:03Z"},{value:("subagent=etrnl-quality-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:04Z"}]}')"
execute_missing_tdd_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_missing_tdd_state")"
if [[ "$execute_missing_tdd_status" == "missing-tdd-evidence" ]]; then ok "execute evidence checker blocks missing TDD"; else not_ok "execute evidence checker blocks missing TDD: $execute_missing_tdd_status"; fi
execute_missing_type_state="$(jq -cn --arg hash "$packet_hash_64" '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],edits:{"src/api/types.ts":"2026-01-01T00:00:01Z"},agentCalls:[{value:("subagent=etrnl-executor mode=write taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:02Z"}],reviewerAgentCalls:[{value:("subagent=etrnl-spec-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:03Z"},{value:("subagent=etrnl-quality-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:04Z"}],tddEvidenceRuns:[{value:"red_green_verified",at:"2026-01-01T00:00:05Z"}]}')"
execute_missing_type_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_missing_type_state")"
if [[ "$execute_missing_type_status" == "missing-type-review" ]]; then ok "execute evidence checker blocks missing TypeScript review"; else not_ok "execute evidence checker blocks missing TypeScript review: $execute_missing_type_status"; fi
execute_missing_install_state="$(jq -cn --arg hash "$packet_hash_64" '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],edits:{"hooks/cc-stop-verifier.sh":"2026-01-01T00:00:01Z"},agentCalls:[{value:("subagent=etrnl-executor mode=write taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:02Z"}],reviewerAgentCalls:[{value:("subagent=etrnl-spec-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:03Z"},{value:("subagent=etrnl-quality-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:04Z"}],tddEvidenceRuns:[{value:"red_green_verified",at:"2026-01-01T00:00:05Z"}]}')"
execute_missing_install_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_missing_install_state")"
if [[ "$execute_missing_install_status" == "missing-install-proof" ]]; then ok "execute evidence checker blocks missing install proof"; else not_ok "execute evidence checker blocks missing install proof: $execute_missing_install_status"; fi
execute_docs_install_state="$(jq -cn '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],edits:{"AGENTS.md":"2026-01-01T00:00:01Z"}}')"
execute_docs_install_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_docs_install_state")"
if [[ "$execute_docs_install_status" == "missing-install-proof" ]]; then ok "execute evidence checker blocks install-home edits without source files"; else not_ok "execute evidence checker blocks install-home edits without source files: $execute_docs_install_status"; fi
execute_docs_install_ok_state="$(jq -cn '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],edits:{"AGENTS.md":"2026-01-01T00:00:01Z"},installProofRuns:[{value:"staged install passed",at:"2026-01-01T00:00:05Z"}]}')"
execute_docs_install_ok_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_docs_install_ok_state")"
if [[ -z "$execute_docs_install_ok_status" ]]; then ok "execute evidence checker accepts install proof for install-home edits"; else not_ok "execute evidence checker accepts install proof for install-home edits: $execute_docs_install_ok_status"; fi
execute_full_state="$(jq -cn --arg hash "$packet_hash_64" '{requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"},{value:"typescript-advanced-types",at:"2026-01-01T00:00:05Z"}],edits:{"src/api/types.ts":"2026-01-01T00:00:01Z","src/app.ts":"2026-01-01T00:00:01Z"},agentCalls:[{value:("subagent=etrnl-executor mode=write taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:02Z"}],reviewerAgentCalls:[{value:("subagent=etrnl-spec-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:03Z"},{value:("subagent=etrnl-quality-reviewer taskid=t1 lineageid=wave-1.t1 packethash=" + $hash),at:"2026-01-01T00:00:04Z"}],tddEvidenceRuns:[{value:"red_green_verified",at:"2026-01-01T00:00:05Z"}],simplifierRuns:[{value:"code-simplifier reviewed",at:"2026-01-01T00:00:06Z"}],typeReviewRuns:[{value:"advanced types reviewed",at:"2026-01-01T00:00:07Z"}]}')"
execute_full_status="$(node "$ROOT/scripts/execute-evidence-check.mjs" <<<"$execute_full_state")"
if [[ -z "$execute_full_status" ]]; then ok "execute evidence checker accepts complete evidence"; else not_ok "execute evidence checker accepts complete evidence: $execute_full_status"; fi
if node "$ROOT/scripts/agent-task-packet-check.mjs" --template >/dev/null 2>&1; then
  not_ok "agent packet template requires explicit mode"
else
  ok "agent packet template requires explicit mode"
fi
assert_command "hindsight lesson syntax" python3 -m py_compile "$ROOT/hooks/cc-hindsight-lesson.py"
settings_file="$ROOT/settings.json"
if [[ ! -f "$settings_file" && -f "$ROOT/templates/settings.json" ]]; then
  settings_file="$ROOT/templates/settings.json"
fi
assert_command "settings valid" jq empty "$settings_file"
if [[ -f "$ROOT/settings.local.json" ]]; then
  assert_command "settings.local valid" jq empty "$ROOT/settings.local.json"
fi

finish_tests
