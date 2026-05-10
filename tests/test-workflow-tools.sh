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
node "$ROOT/scripts/execution-ledger.mjs" record-artifact --session fixture-ledger --type review-log --path "$TMPROOT/review-log.jsonl"
assert_command "execution ledger accepts complete run" node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger

for script in \
  cc-pretooluse-guard.sh \
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
assert_command "code-health inventory syntax" node --check "$ROOT/scripts/code-health-inventory.mjs"
assert_command "code-health inventory runs" node "$ROOT/scripts/code-health-inventory.mjs" --json
inventory_quiet_json="$(node "$ROOT/scripts/code-health-inventory.mjs" --json --quiet)"
assert_json_expr "code-health inventory json quiet emits JSON" "$inventory_quiet_json" '.totalFiles >= 1'
assert_command "plan readiness syntax" node --check "$ROOT/scripts/plan-readiness-check.mjs"
for script in agent-task-packet-check execution-ledger execution-wave-check review-log browser-qa-report context-state workflow-health prompt-budget-check changelog-release-check port-guard; do
  assert_command "$script syntax" node --check "$ROOT/scripts/$script.mjs"
done
assert_command "port-guard self-test" node "$ROOT/scripts/port-guard.mjs" self-test

budget_root="$TMPROOT/budget"
mkdir -p "$budget_root/skills/gstack-huge" "$budget_root/skills/etrnl-small"
printf '%20000s\n' "x" >"$budget_root/skills/gstack-huge/SKILL.md"
printf '%s\n' "---" "name: etrnl-small" "---" >"$budget_root/skills/etrnl-small/SKILL.md"
assert_command "prompt budget owned-only ignores external skills" node "$ROOT/scripts/prompt-budget-check.mjs" "$budget_root" --owned-only

changelog_good="$TMPROOT/changelog-good"
mkdir -p "$changelog_good"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1 - 2026-01-01' '' '- Release note.' >"$changelog_good/CHANGELOG.md"
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
printf '%s\n' '# Changelog' '' '## Unreleased' '' '<!-- hidden note' '- still hidden' '-->' '<!-- inline hidden -->' '<!-->' '<!-- ---->' '## v0.1.1 - 2026-01-01' '' '- Release note.' >"$changelog_comments/CHANGELOG.md"
assert_command "changelog check ignores HTML comments" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_comments" --strict-unreleased
changelog_bad="$TMPROOT/changelog-bad"
mkdir -p "$changelog_bad"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '- Pending release note.' '' '## v0.1.0 - 2026-01-01' '' '- Previous release.' >"$changelog_bad/CHANGELOG.md"
if node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_bad" --strict-unreleased >/dev/null 2>&1; then
  not_ok "changelog check rejects Unreleased entries"
else
  ok "changelog check rejects Unreleased entries"
fi
changelog_repo="$TMPROOT/changelog-repo"
mkdir -p "$changelog_repo"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.0 - 2026-01-01' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
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
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1 - 2026-01-01' '' '- Workflow change.' '' '## v0.1.0 - 2026-01-01' '' '- Initial release.' >"$changelog_repo/CHANGELOG.md"
assert_command "changelog check accepts release after tag" node "$ROOT/scripts/changelog-release-check.mjs" --root "$changelog_repo"

changelog_malformed_tag="$TMPROOT/changelog-malformed-tag"
mkdir -p "$changelog_malformed_tag"
printf '%s\n' '# Changelog' '' '## Unreleased' '' '## v0.1.1 - 2026-01-01' '' '- Release note.' >"$changelog_malformed_tag/CHANGELOG.md"
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
if [[ ${#review_fp} -ge 16 ]]; then
  ok "review log fingerprint emitted"
else
  not_ok "review log fingerprint emitted"
fi
assert_command "review log validates" node "$ROOT/scripts/review-log.mjs" validate --path "$TMPROOT/review-log.jsonl"
review_summary="$(node "$ROOT/scripts/review-log.mjs" summary --path "$TMPROOT/review-log.jsonl")"
assert_contains "review log summary unresolved" "$review_summary" "unresolved=1"
if rg -F "sk_live_example" "$TMPROOT/review-log.jsonl" >/dev/null; then
  not_ok "review log redacts token-like values"
else
  ok "review log redacts token-like values"
fi

qa_report="$(printf '{"routes":["/"],"viewports":["desktop","mobile"],"findings":[]}' | node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa.json")"
assert_command "browser QA report validates" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report"
context_file="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-context --title "Fixture" --remaining "finish verification" --verification "tests pending")"
assert_command "context save validates" node "$ROOT/scripts/context-state.mjs" validate "$context_file"
stale_context="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-stale-context --title "Stale" --saved-at "2000-01-01T00:00:00Z")"
context_summary="$(node "$ROOT/scripts/context-state.mjs" show "$stale_context" --stale-hours 1)"
assert_contains "context restore detects stale context" "$context_summary" "stale=true"
wave_json="$(printf '{"useWorktrees":true,"submodules":["vendor/lib"],"plans":[{"id":"T1","wave":1,"files":["src/a.ts"]},{"id":"T2","wave":1,"files":["src/a.ts"]},{"id":"T3","wave":2,"files":["vendor/lib/x.ts"]}]}' | node "$ROOT/scripts/execution-wave-check.mjs")"
assert_json_expr "wave overlap disables parallel" "$wave_json" '.waves[0].parallelSafe == false'
assert_json_expr "submodule task not worktree eligible" "$wave_json" '.waves[1].plans[0].worktreeEligible == false'
assert_contains "wave heartbeat emitted" "$wave_json" "[checkpoint]"
health_root="$TMPROOT/health"
mkdir -p "$health_root/runs"
printf '%s\n' '{"schemaVersion":1,"runId":"stale-run","updatedAt":"2000-01-01T00:00:00Z","tasks":[{"id":"T1","status":"in_progress"}],"agents":[],"checks":[]}' >"$health_root/runs/stale-run.json"
health_out="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs")"
assert_contains "workflow health detects stale runs" "$health_out" "staleRuns=1"
assert_contains "workflow health reports artifact freshness" "$health_out" "artifactFreshness latest=none"
empty_health="$(CLAUDE_CONTROL_PLANE_RUNS_DIR="$health_root/missing-runs" CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR="$health_root/artifacts" node "$ROOT/scripts/workflow-health.mjs")"
assert_contains "workflow health reports artifacts without ledger dir" "$empty_health" "reviewLog entries=0"

autoplan_meta="$(jq -c . "$ROOT/skills/metadata/etrnl-autoplan.json")"
assert_json_expr "autoplan includes CEO review" "$autoplan_meta" '.ownerReview == "CEO/founder review"'
assert_json_expr "autoplan includes DX review" "$autoplan_meta" '.dxReview == "DX review"'
assert_json_expr "autoplan includes adversarial review" "$autoplan_meta" '.adversarialReview == true'
assert_json_expr "autoplan includes max completeness" "$autoplan_meta" '.completeness == "10/10"'
execute_meta="$(jq -c . "$ROOT/skills/metadata/etrnl-execute.json")"
assert_json_expr "execute includes wave execution" "$execute_meta" '.executionMode == "wave-based execution"'
assert_json_expr "execute includes subagent ownership rule" "$execute_meta" '.ownershipRule == "do not duplicate"'
assert_json_expr "execute includes spot-check fallback" "$execute_meta" '.fallback == "spot-check"'
bad_plan="$TMPROOT/bad-plan.md"
printf '%s\n' '# Bad Plan' '' 'Status: Final' '' 'Goal: Thin plan.' >"$bad_plan"
if node "$ROOT/scripts/plan-readiness-check.mjs" "$bad_plan" >/dev/null 2>&1; then
  not_ok "plan readiness rejects incomplete plan"
else
  ok "plan readiness rejects incomplete plan"
fi
good_plan="$TMPROOT/good-plan.md"
cp "$ROOT/hooks/fixtures/plans/good-plan.md" "$good_plan"
assert_command "plan readiness accepts complete plan" node "$ROOT/scripts/plan-readiness-check.mjs" "$good_plan"
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
