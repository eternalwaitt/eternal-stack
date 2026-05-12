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
assert_command "cli arg parser edge cases" node --input-type=module -e '
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
'
assert_command "bash array parser token branches" node --input-type=module -e '
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
  '"'"'single quoted value'"'"'
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
'
for script in agent-task-packet-check guard-override-token replay-hook-fixtures execution-ledger execution-wave-check review-log browser-qa-report context-state workflow-health prompt-budget-check changelog-release-check port-guard; do
  assert_command "$script syntax" node --check "$ROOT/scripts/$script.mjs"
done
assert_command "skill contract syntax" node --check "$ROOT/scripts/skill-contract-check.mjs"
assert_command "skill contracts pass" node "$ROOT/scripts/skill-contract-check.mjs" --root "$ROOT"
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
  if ! {
    printf '%s\n' "# Skill ${fixture_id}" "${SKILL_LINE_TDD} for ${fixture_id}." "${SKILL_LINE_PLANNING} for ${fixture_id}." "${SKILL_LINE_RESEARCH} for ${fixture_id}." "$SKILL_LINE_SUBAGENT" "$SKILL_LINE_PARALLELISM" "$SKILL_LINE_GATE" "$SKILL_LINE_ROLLBACK." "$SKILL_LINE_TELEMETRY" >"$fixture_dir/skills/research/SKILL.md"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${HOOK_LINE_GATE} ${fixture_id}\"" >"$fixture_dir/hooks/pretool.sh"
    printf '%s\n' '#!/usr/bin/env bash' "echo \"${SCRIPT_LINE_TELEMETRY} ${fixture_id}\"" >"$fixture_dir/scripts/monitor.sh"
    printf '%s\n' "describe(\"tdd-${fixture_id}\", () => {" "  test(\"${TEST_LINE_TDD}\", () => {});" '});' >"$fixture_dir/tests/tdd.test.ts"
  }; then
    not_ok "research fixture file creation failed for $fixture_id"
    exit 1
  fi
done < <(jq -r '.competitors[] | [.id, (.localPath // .id)] | @tsv' "$fixture_manifest")
fixture_evidence="$TMPROOT/research-fixture-evidence.json"
assert_command "research extractor runs on fixture repo" node "$ROOT/scripts/research-competitor-intel.mjs" extract --manifest "$fixture_manifest" --repos-root "$fixture_repos" --out "$fixture_evidence"
fixture_json="$(jq -c . "$fixture_evidence")"
assert_json_expr "research extractor emits 80 rows for 10 competitors x 8 capabilities" "$fixture_json" '.rows | length == 80'
assert_json_expr "research extractor detects TDD signal" "$fixture_json" '([.rows[] | select(.capability=="tdd_enforcement") | .status == "present"] | any)'
assert_json_expr "research extractor emits hook enforcement signal" "$fixture_json" '([.rows[] | select(.enforcementLevel=="hook_enforced")] | length > 0)'

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
qa_report_flags="$(node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa-flags.json" --routes "/,/campaigns" --viewports "desktop,mobile" --status complete)"
assert_command "browser QA report flag command validates" node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report_flags"
context_file="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-context --title "Fixture" --remaining "finish verification" --verification "tests pending")"
assert_command "context save validates" node "$ROOT/scripts/context-state.mjs" validate "$context_file"
context_restore="$(node "$ROOT/scripts/context-state.mjs" restore "$context_file")"
assert_contains "context restore command works" "$context_restore" "stale="
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
