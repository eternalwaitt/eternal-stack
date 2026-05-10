#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMPROOT="$(mktemp -d)"
export TMPDIR="$TMPROOT"
export CLAUDE_GUARD_STATE_DIR="$TMPROOT"
export CLAUDE_CONTROL_PLANE_RUNS_DIR="$TMPROOT/runs"
export CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON=1
PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMPROOT"
}
trap cleanup EXIT

ok() {
  PASS=$((PASS + 1))
  printf 'ok %03d - %s\n' "$PASS" "$1"
}

not_ok() {
  FAIL=$((FAIL + 1))
  printf 'not ok - %s\n' "$1" >&2
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
  if jq -e "$expr" >/dev/null <<<"$json"; then
    ok "$name"
  else
    not_ok "$name failed jq expr $expr on $json"
  fi
}

run_hook() {
  local hook="$1"
  local input="$2"
  "$ROOT/hooks/$hook" <<<"$input"
}

fixture() {
  jq -c . "$ROOT/hooks/fixtures/events/$1"
}

mkdir -p "$TMPROOT/example/src"
printf 'export const value = 1;\n' >"$TMPROOT/example/src/app.ts"

for dep in jq node rg fd; do
  if command -v "$dep" >/dev/null 2>&1; then ok "dependency $dep"; else not_ok "missing dependency $dep"; fi
done
if command -v sg >/dev/null 2>&1; then ok "dependency sg"; else ok "dependency sg unavailable but live hooks fail open"; fi

invalid="$(printf '{bad' | "$ROOT/hooks/cc-pretooluse-guard.sh")"
assert_json_expr "invalid JSON fails open" "$invalid" '.continue == true'

bash_json="$(fixture pretooluse-bash.json)"
out="$(run_hook cc-pretooluse-guard.sh "$bash_json")"
assert_json_expr "legacy grep denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "legacy grep reason" "$out" "modern CLI"

safe_bash="$(jq '.tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
assert_json_expr "rg allowed" "$out" '.continue == true'

sycophancy_transcript="$TMPROOT/sycophancy.jsonl"
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"You'\''re right - let me search first."}]}}' >"$sycophancy_transcript"
sycophancy_json="$(jq --arg path "$sycophancy_transcript" '.session_id = "fixture-sycophancy" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$sycophancy_json")"
assert_json_expr "sycophancy phrase denied before tool" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "sycophancy reason is evidence-first" "$out" "Evidence-before-agreement"

challenge_transcript="$TMPROOT/challenge.jsonl"
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"Good catch, let me inspect the repo first."}]}}' >"$challenge_transcript"
challenge_json="$(jq --arg path "$challenge_transcript" '.session_id = "fixture-challenge" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$challenge_json")"
assert_contains "agreement-before-evidence denied" "$out" "Evidence-before-agreement"

evidence_first_transcript="$TMPROOT/evidence-first.jsonl"
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"I have not verified that yet. I will inspect the repo first."}]}}' >"$evidence_first_transcript"
evidence_first_json="$(jq --arg path "$evidence_first_transcript" '.session_id = "fixture-evidence-first" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$evidence_first_json")"
assert_json_expr "evidence-first check allowed" "$out" '.continue == true'

email_bash="$(jq '.tool_input.command = "gmail send --to a@example.com"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_bash")"
assert_json_expr "email send denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

web_json="$(jq '.tool_name = "WebSearch" | .tool_input = {"query":"x"}' <<<"$bash_json")"
CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 out="$(run_hook cc-pretooluse-guard.sh "$web_json")"
assert_json_expr "websearch effort denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

edit_json="$(fixture pretooluse-edit.json | jq --arg root "$TMPROOT/example" '.cwd=$root | .tool_input.file_path=($root + "/src/app.ts")')"
out="$(run_hook cc-pretooluse-guard.sh "$edit_json")"
assert_json_expr "silent catch denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
aggregate_policy="$(jq '.tool_input.new_string = "/* TODO: finish */\n// eslint-disable-next-line\ntry {} catch { return null; }"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$aggregate_policy")"
assert_contains "policy aggregation includes TODO" "$out" "TODO/FIXME"
assert_contains "policy aggregation includes suppression" "$out" "suppression"
assert_contains "policy aggregation includes null catch" "$out" "return null"

clean_edit="$(jq '.tool_input.new_string = "export const value = 2;"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$clean_edit")"
assert_json_expr "blind edit denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

read_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session",tool_name:"Read",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$read_event" >/dev/null || true
search_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session",tool_name:"Bash",cwd:$root,tool_input:{command:"rg -n value src"}}')"
run_hook cc-posttoolbatch-observer.sh "$search_event" >/dev/null || true
out="$(run_hook cc-pretooluse-guard.sh "$clean_edit")"
assert_json_expr "read and search allow edit" "$out" '.continue == true'

write_json="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session-2",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/new.ts"),content:"export const created = true;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$write_json")"
assert_json_expr "new source without search denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

prompt="$(fixture userpromptsubmit.json)"
out="$(run_hook cc-userprompt-router.sh "$prompt")"
assert_json_expr "prompt router emits context" "$out" '.hookSpecificOutput.additionalContext | length > 0'
assert_contains "prompt router names code review workflow" "$out" "etrnl-review"
challenge_prompt="$(jq -cn '{session_id:"fixture-challenge-prompt",prompt:"why is Vega saying you are right? I thought we had a hook for this"}')"
out="$(run_hook cc-userprompt-router.sh "$challenge_prompt")"
assert_contains "challenge prompt gets evidence protocol" "$out" "Evidence-first correction protocol"
challenge_state="$TMPROOT/claude-guard-fixture-challenge-prompt.json"
assert_json_expr "challenge prompt recorded" "$(jq -c . "$challenge_state")" '(.evidenceChallenges | length) == 1'
plan_prompt="$(jq -cn '{session_id:"fixture-plan-prompt",prompt:"write an implementation plan for this repo"}')"
out="$(run_hook cc-userprompt-router.sh "$plan_prompt")"
assert_contains "plan prompt routes writing plans" "$out" "etrnl-plan"
plan_state="$TMPROOT/claude-guard-fixture-plan-prompt.json"
assert_json_expr "plan skill recorded" "$(jq -c . "$plan_state")" 'any(.requestedSkills[]?.value; . == "etrnl-plan")'
health_prompt="$(jq -cn '{session_id:"fixture-health-prompt",prompt:"audit the entire codebase with no skips or loose ends"}')"
out="$(run_hook cc-userprompt-router.sh "$health_prompt")"
assert_contains "health prompt routes code health" "$out" "etrnl-code-health"
health_state="$TMPROOT/claude-guard-fixture-health-prompt.json"
assert_json_expr "health skill recorded" "$(jq -c . "$health_state")" 'any(.requestedSkills[]?.value; . == "etrnl-code-health")'

skill_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"UserPromptExpansion",command_name:"etrnl-review"}')"
run_hook cc-userprompt-expansion.sh "$skill_json" >/dev/null || true
state_file="$TMPROOT/claude-guard-fixture-session.json"
assert_json_expr "skill recorded" "$(jq -c . "$state_file")" '(.skillCalls | length) > 0'

mkdir -p "$TMPROOT/example/src/auth"
printf 'export const auth = true;\n' >"$TMPROOT/example/src/auth/session.ts"
domain_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Read",cwd:$root,tool_input:{file_path:($root + "/src/auth/session.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_read" >/dev/null || true
domain_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Bash",cwd:$root,tool_input:{command:"rg -n auth src/auth"}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_search" >/dev/null || true
domain_edit="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Edit",cwd:$root,tool_input:{file_path:($root + "/src/auth/session.ts"),new_string:"export const auth = false;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$domain_edit")"
assert_json_expr "domain edit requires companion skill" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
domain_skill="$(jq -cn '{session_id:"fixture-domain",tool_name:"Skill",tool_input:{name:"eternal-best-practices"}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_skill" >/dev/null || true
out="$(run_hook cc-pretooluse-guard.sh "$domain_edit")"
assert_json_expr "domain edit allowed after companion skill" "$out" '.continue == true'

failure_json="$(jq -cn '{session_id:"fixture-session",tool_name:"Bash",tool_input:{command:"bad --flag"},error:"unknown flag"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_json_expr "failure blocks with diagnosis" "$out" '.decision == "block"'
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_contains "repeated failure pivots" "$out" "repeated"

stop_json="$(fixture stop.json)"
out="$(run_hook cc-stop-verifier.sh "$stop_json")"
assert_json_expr "stop verifier blocks unverified completion" "$out" '.decision == "block"'

stale_state="$TMPROOT/claude-guard-fixture-stale.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/a.ts":"2026-01-01T00:00:02Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$stale_state"
stale_stop="$(jq -cn '{session_id:"fixture-stale",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$stale_stop")"
assert_contains "stop verifier blocks stale verification" "$out" "stale verification"

requested_state="$TMPROOT/claude-guard-fixture-requested.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{},commands:[],failures:[],skillCalls:[],requestedSkills:[{value:"etrnl-plan",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$requested_state"
requested_stop="$(jq -cn '{session_id:"fixture-requested",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$requested_stop")"
assert_contains "stop verifier blocks missing requested skill" "$out" "requested skill"

sycophancy_stop="$(jq -cn '{session_id:"fixture-session",last_assistant_message:"You are right - I will check.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$sycophancy_stop")"
assert_contains "stop verifier blocks sycophancy" "$out" "Evidence-before-agreement"

post_sycophancy_json="$(jq -cn --arg path "$sycophancy_transcript" '{session_id:"fixture-sycophancy-post",tool_name:"Bash",transcript_path:$path}')"
out="$(run_hook cc-posttooluse-sycophancy.sh "$post_sycophancy_json")"
assert_contains "posttooluse blocks sycophancy" "$out" "Evidence-before-agreement"

precompact_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"PreCompact"}')"
out="$(run_hook cc-precompact-save.sh "$precompact_json")"
assert_json_expr "precompact allows after save" "$out" '.continue == true'
session_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"SessionStart",source:"compact"}')"
out="$(run_hook cc-sessionstart-restore.sh "$session_json")"
assert_json_expr "session compact restores context" "$out" '.hookSpecificOutput.additionalContext | test("Compact recovery")'
assert_contains "session start injects ETRNL skill hint" "$out" "ETRNL skills"

agent_bad="$(jq -cn '{session_id:"fixture-session",tool_name:"Task",tool_input:{prompt:"do stuff"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$agent_bad")"
assert_json_expr "underspecified task denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "underspecified task reports multiple missing fields" "$out" "context summary"
agent_invalid="$(fixture pretooluse-task-invalid.json)"
out="$(run_hook cc-pretooluse-guard.sh "$agent_invalid")"
assert_contains "invalid task fixture reports retry policy" "$out" "retry policy"
agent_valid="$(fixture pretooluse-task-valid.json)"
out="$(run_hook cc-pretooluse-guard.sh "$agent_valid")"
assert_json_expr "valid task packet allowed" "$out" '.continue == true'

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

ledger_path="$(node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-ledger --plan "$ROOT/hooks/fixtures/plans/good-plan.md")"
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-ledger --task T1 --title Task --status in_progress
node "$ROOT/scripts/execution-ledger.mjs" require-artifact --session fixture-ledger --type review-log
ledger_stop="$(jq -cn '{session_id:"fixture-ledger",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$ledger_stop")"
assert_contains "stop verifier blocks incomplete ledger" "$out" "unfinished tasks"
subagent_bad="$(fixture subagentstop-malformed.json)"
out="$(run_hook cc-subagentstop-record.sh "$subagent_bad")"
assert_contains "subagent stop blocks missing task id" "$out" "ETRNL_TASK_ID"
subagent_good="$(fixture subagentstop-valid.json)"
if run_hook cc-subagentstop-record.sh "$subagent_good" >/dev/null; then
  ok "subagent stop records valid output"
else
  not_ok "subagent stop records valid output"
fi
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-ledger --task T1 --title Task --status verified
node "$ROOT/scripts/execution-ledger.mjs" record-check --session fixture-ledger --name final --command "pnpm test" --status passed
if node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger >/dev/null 2>&1; then
  not_ok "execution ledger blocks missing required artifact"
else
  ok "execution ledger blocks missing required artifact"
fi
node "$ROOT/scripts/execution-ledger.mjs" record-artifact --session fixture-ledger --type review-log --path "$TMPROOT/review-log.jsonl"
node "$ROOT/scripts/execution-ledger.mjs" check-stop --session fixture-ledger >/dev/null && ok "execution ledger accepts complete run" || not_ok "execution ledger accepts complete run"

for i in $(seq 1 49); do
  out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
  assert_json_expr "safe bash repeated fixture $i" "$out" '.continue == true'
done

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
  bash -n "$ROOT/hooks/$script" && ok "syntax $script" || not_ok "syntax $script"
done

node --check "$ROOT/hooks/lib/complexity-check.mjs" >/dev/null && ok "complexity syntax" || not_ok "complexity syntax"
node --check "$ROOT/scripts/code-health-inventory.mjs" >/dev/null && ok "code-health inventory syntax" || not_ok "code-health inventory syntax"
node "$ROOT/scripts/code-health-inventory.mjs" --json >/dev/null && ok "code-health inventory runs" || not_ok "code-health inventory runs"
node --check "$ROOT/scripts/plan-readiness-check.mjs" >/dev/null && ok "plan readiness syntax" || not_ok "plan readiness syntax"
for script in agent-task-packet-check execution-ledger execution-wave-check review-log browser-qa-report context-state workflow-health prompt-budget-check; do
  node --check "$ROOT/scripts/$script.mjs" >/dev/null && ok "$script syntax" || not_ok "$script syntax"
done
budget_root="$TMPROOT/budget"
mkdir -p "$budget_root/skills/gstack-huge" "$budget_root/skills/etrnl-small"
printf '%20000s\n' "x" >"$budget_root/skills/gstack-huge/SKILL.md"
printf '%s\n' "---" "name: etrnl-small" "---" >"$budget_root/skills/etrnl-small/SKILL.md"
node "$ROOT/scripts/prompt-budget-check.mjs" "$budget_root" --owned-only >/dev/null && ok "prompt budget owned-only ignores external skills" || not_ok "prompt budget owned-only ignores external skills"
review_fp="$(node "$ROOT/scripts/review-log.mjs" add --path "$TMPROOT/review-log.jsonl" --finding "sk_live_example_should_redact" --severity P1 --status open)"
if [[ ${#review_fp} -ge 16 ]]; then
  ok "review log fingerprint emitted"
else
  not_ok "review log fingerprint emitted"
fi
node "$ROOT/scripts/review-log.mjs" validate --path "$TMPROOT/review-log.jsonl" >/dev/null && ok "review log validates" || not_ok "review log validates"
review_summary="$(node "$ROOT/scripts/review-log.mjs" summary --path "$TMPROOT/review-log.jsonl")"
assert_contains "review log summary unresolved" "$review_summary" "unresolved=1"
if rg -F "sk_live_example" "$TMPROOT/review-log.jsonl" >/dev/null; then
  not_ok "review log redacts token-like values"
else
  ok "review log redacts token-like values"
fi
qa_report="$(printf '{"routes":["/"],"viewports":["desktop","mobile"],"findings":[]}' | node "$ROOT/scripts/browser-qa-report.mjs" create --path "$TMPROOT/browser-qa.json")"
node "$ROOT/scripts/browser-qa-report.mjs" validate "$qa_report" >/dev/null && ok "browser QA report validates" || not_ok "browser QA report validates"
context_file="$(node "$ROOT/scripts/context-state.mjs" save --id fixture-context --title "Fixture" --remaining "finish verification" --verification "tests pending")"
node "$ROOT/scripts/context-state.mjs" validate "$context_file" >/dev/null && ok "context save validates" || not_ok "context save validates"
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
autoplan_text="$(tr '\n' ' ' < "$ROOT/skills/etrnl-autoplan/SKILL.md")"
assert_contains "autoplan includes CEO review" "$autoplan_text" "CEO/founder review"
assert_contains "autoplan includes DX review" "$autoplan_text" "DX review"
assert_contains "autoplan includes adversarial review" "$autoplan_text" "Adversarial review"
assert_contains "autoplan includes max completeness" "$autoplan_text" "completeness 10/10"
execute_text="$(tr '\n' ' ' < "$ROOT/skills/etrnl-execute/SKILL.md")"
assert_contains "execute includes wave execution" "$execute_text" "wave-based execution"
assert_contains "execute includes subagent ownership rule" "$execute_text" "do not duplicate"
assert_contains "execute includes spot-check fallback" "$execute_text" "spot-check"
bad_plan="$TMPROOT/bad-plan.md"
printf '%s\n' '# Bad Plan' '' 'Status: Final' '' 'Goal: Thin plan.' >"$bad_plan"
if node "$ROOT/scripts/plan-readiness-check.mjs" "$bad_plan" >/dev/null 2>&1; then
  not_ok "plan readiness rejects incomplete plan"
else
  ok "plan readiness rejects incomplete plan"
fi
good_plan="$TMPROOT/good-plan.md"
cp "$ROOT/hooks/fixtures/plans/good-plan.md" "$good_plan"
node "$ROOT/scripts/plan-readiness-check.mjs" "$good_plan" >/dev/null && ok "plan readiness accepts complete plan" || not_ok "plan readiness accepts complete plan"
python3 -m py_compile "$ROOT/hooks/cc-hindsight-lesson.py" && ok "hindsight lesson syntax" || not_ok "hindsight lesson syntax"
settings_file="$ROOT/settings.json"
if [[ ! -f "$settings_file" && -f "$ROOT/templates/settings.json" ]]; then
  settings_file="$ROOT/templates/settings.json"
fi
jq . "$settings_file" >/dev/null && ok "settings valid" || not_ok "settings valid"
if [[ -f "$ROOT/settings.local.json" ]]; then
  jq . "$ROOT/settings.local.json" >/dev/null && ok "settings.local valid" || not_ok "settings.local valid"
fi

if (( FAIL > 0 )); then
  printf 'FAILED: %d failed, %d passed\n' "$FAIL" "$PASS" >&2
  exit 1
fi
printf 'PASSED: %d checks\n' "$PASS"
