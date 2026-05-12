#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
# shellcheck source=./tests/lib/harness.sh
source ./tests/lib/harness.sh
cc_test_init

if (unset ROOT; run_hook cc-pretooluse-guard.sh "{}") >/dev/null 2>&1; then
  not_ok "run_hook requires ROOT"
else
  ok "run_hook requires ROOT"
fi
if (unset ROOT; fixture pretooluse-bash.json) >/dev/null 2>&1; then
  not_ok "fixture requires ROOT"
else
  ok "fixture requires ROOT"
fi

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

large_bash_json="$(node -e 'process.stdout.write(JSON.stringify({session_id:"fixture-large",tool_name:"Bash",tool_input:{command:"grep -n foo src/app.ts"},padding:"x".repeat(2 * 1024 * 1024)}))')"
out="$(printf '%s' "$large_bash_json" | "$ROOT/hooks/cc-pretooluse-guard.sh")"
assert_json_expr "large JSON payload still enforced" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

safe_bash="$(jq '.tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
assert_json_expr "rg allowed" "$out" '.continue == true'

dangerous_outside="$(jq --arg cwd "$ROOT" '.cwd = $cwd | .tool_input.command = "cp /etc/passwd \($cwd)/passwd-copy"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dangerous_outside")"
assert_json_expr "dangerous outside path denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "dangerous outside path named" "$out" "/etc/passwd"

dangerous_quoted="$(jq --arg cwd "$ROOT" '.cwd = $cwd | .tool_input.command = "cp \"/etc/passwd\" \"\($cwd)/passwd-copy\""' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dangerous_quoted")"
assert_json_expr "dangerous quoted outside path denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "dangerous quoted outside path named" "$out" "/etc/passwd"

dev_no_port="$(jq '.tool_input.command = "pnpm dev:web"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dev_no_port")"
assert_json_expr "dev server without port denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "dev server denial mentions checked port" "$out" "explicit checked port"

port_base=$((35000 + ($$ % 1000) * 20))
free_dev_port="$(node "$ROOT/scripts/port-guard.mjs" pick --start "$port_base" --end "$((port_base + 9))")"
dev_with_port="$(jq --arg port "$free_dev_port" '.tool_input.command = "pnpm dev:web -- --port \($port)"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dev_with_port")"
assert_json_expr "dev server with free port allowed" "$out" '.continue == true'

dev_with_helper="$(jq '.tool_input.command = "port=$(node ~/.claude/scripts/port-guard.mjs pick --start 3100); pnpm dev:web -- --port \"$port\""' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dev_with_helper")"
assert_json_expr "dev server with port helper allowed" "$out" '.continue == true'

# Exercise the occupied-port denial once; the later 49 repeats cover safe idempotent hook calls.
busy_port="$(node "$ROOT/scripts/port-guard.mjs" pick --start "$((port_base + 10))" --end "$((port_base + 19))")"
busy_ready="$TMPROOT/busy-port-ready"
busy_error="$TMPROOT/busy-port-error"
busy_pid=""
cleanup_busy_port() {
  [[ -n "$busy_pid" ]] && kill "$busy_pid" >/dev/null 2>&1 || true
  [[ -n "$busy_pid" ]] && wait "$busy_pid" 2>/dev/null || true
  rm -f -- "$busy_ready" "$busy_error"
}
trap 'cleanup_busy_port; cc_test_cleanup' EXIT
trap 'cleanup_busy_port; cc_test_cleanup; exit 130' INT TERM
node "$ROOT/tests/lib/busy-port-server.mjs" "$busy_port" "$busy_ready" "$busy_error" &
busy_pid=$!
for _ in $(seq 1 50); do
  [[ -f "$busy_ready" || -f "$busy_error" ]] && break
  sleep 0.05
done
if [[ -f "$busy_error" || ! -f "$busy_ready" ]]; then
  not_ok "busy port fixture started"
else
  dev_busy_port="$(jq --arg port "$busy_port" '.tool_input.command = "pnpm dev:web -- --port \($port)"' <<<"$bash_json")"
  out="$(run_hook cc-pretooluse-guard.sh "$dev_busy_port")"
  assert_contains "dev server with busy port denied" "$out" "already in use"
fi
kill "$busy_pid" >/dev/null 2>&1 || true
wait "$busy_pid" 2>/dev/null || true
busy_pid=""

sycophancy_transcript="$TMPROOT/sycophancy.jsonl"
printf '%s\n' '{"id":"msg-sycophancy","type":"assistant","message":{"content":[{"type":"text","text":"You'\''re right - let me search first."}]}}' >"$sycophancy_transcript"
sycophancy_json="$(jq --arg path "$sycophancy_transcript" '.session_id = "fixture-sycophancy" | .assistant_message_id = "msg-sycophancy" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$sycophancy_json")"
assert_json_expr "sycophancy phrase denied before tool" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "sycophancy reason is evidence-first" "$out" "Evidence-before-agreement"

challenge_transcript="$TMPROOT/challenge.jsonl"
printf '%s\n' '{"id":"msg-challenge","type":"assistant","message":{"content":[{"type":"text","text":"Good catch, let me inspect the repo first."}]}}' >"$challenge_transcript"
challenge_json="$(jq --arg path "$challenge_transcript" '.session_id = "fixture-challenge" | .assistant_message_id = "msg-challenge" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$challenge_json")"
assert_contains "agreement-before-evidence denied" "$out" "Evidence-before-agreement"

evidence_first_transcript="$TMPROOT/evidence-first.jsonl"
printf '%s\n' '{"id":"msg-evidence","type":"assistant","message":{"content":[{"type":"text","text":"I have not verified that yet. I will inspect the repo first."}]}}' >"$evidence_first_transcript"
evidence_first_json="$(jq --arg path "$evidence_first_transcript" '.session_id = "fixture-evidence-first" | .assistant_message_id = "msg-evidence" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$evidence_first_json")"
assert_json_expr "evidence-first check allowed" "$out" '.continue == true'

email_bash="$(jq '.tool_input.command = "gmail send --to a@example.com"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_bash")"
assert_json_expr "email send denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

web_json="$(jq '.tool_name = "WebSearch" | .tool_input = {"query":"x"}' <<<"$bash_json")"
out="$(CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 run_hook cc-pretooluse-guard.sh "$web_json")"
assert_json_expr "websearch effort denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

edit_json="$(fixture pretooluse-edit.json | jq --arg root "$TMPROOT/example" '.cwd=$root | .tool_input.file_path=($root + "/src/app.ts")')"
out="$(run_hook cc-pretooluse-guard.sh "$edit_json")"
assert_json_expr "silent catch denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
aggregate_policy="$(jq '.tool_input.new_string = "/* TODO: finish */\n// eslint-disable-next-line\ntry {} catch { return null; }"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$aggregate_policy")"
assert_contains "policy aggregation includes TODO" "$out" "TODO/FIXME"
assert_contains "policy aggregation includes suppression" "$out" "suppression"
assert_contains "policy aggregation includes null catch" "$out" "return null"
param_catch_policy="$(jq '.tool_input.new_string = "try { risky(); } catch (error) { return null; }"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$param_catch_policy")"
assert_contains "policy catches parameterized catch" "$out" "return null"
test_skip_policy="$(jq '.tool_input.file_path = "src/app.test.ts" | .tool_input.old_string = "test(\"old\", () => { expect(value).toBe(1); });" | .tool_input.new_string = "test.skip(\"new\", () => { expect(value).toBe(1); });"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$test_skip_policy")"
assert_contains "test skip denied" "$out" "skipped tests"
safety_removal="$(jq '.tool_input.old_string = "try { validate(input); } catch (error) { logger.error(error); throw error; }" | .tool_input.new_string = "validate(input);"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$safety_removal")"
assert_contains "safety removal denied" "$out" "Safety-removal"
clean_edit="$(jq '.tool_input.new_string = "export const value = 2;"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$clean_edit")"
assert_json_expr "blind edit denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

read_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session",tool_name:"Read",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$read_event" >/dev/null || true
search_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n value src"}}')"
run_hook cc-posttoolbatch-observer.sh "$search_event" >/dev/null || true
out="$(run_hook cc-pretooluse-guard.sh "$clean_edit")"
assert_json_expr "read and search allow edit" "$out" '.continue == true'
large_new_string="$(node -e 'for (let i = 0; i < 130; i += 1) console.log("export const value" + i + " = " + i + ";")')"
large_edit="$(jq --arg text "$large_new_string" '.tool_input.old_string = "export const oldValue = 1;" | .tool_input.new_string = $text' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$large_edit")"
assert_contains "large edit denied" "$out" "Large-change"

write_json="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session-2",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/new.ts"),content:"export const created = true;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$write_json")"
assert_json_expr "new source without search denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

sprawl_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-sprawl",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n created src"}}')"
run_hook cc-posttoolbatch-observer.sh "$sprawl_search" >/dev/null || true
for created in one two three; do
  sprawl_write="$(jq -cn --arg root "$TMPROOT/example" --arg created "$created" '{session_id:"fixture-sprawl",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/" + $created + ".ts"),content:"export const created = true;"}}')"
  out="$(run_hook cc-pretooluse-guard.sh "$sprawl_write")"
  assert_json_expr "new source file $created allowed under sprawl limit" "$out" '.continue == true'
done
sprawl_fourth="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-sprawl",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/four.ts"),content:"export const created = true;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$sprawl_fourth")"
assert_contains "file sprawl denied" "$out" "File-sprawl"

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
domain_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Read",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/auth/session.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_read" >/dev/null || true
domain_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n auth src/auth"}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_search" >/dev/null || true
domain_edit="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-domain",tool_name:"Edit",cwd:$root,tool_input:{file_path:($root + "/src/auth/session.ts"),new_string:"export const auth = false;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$domain_edit")"
assert_json_expr "domain edit requires companion skill" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
domain_skill="$(jq -cn '{session_id:"fixture-domain",tool_name:"Skill",status:"success",tool_input:{name:"eternal-best-practices"}}')"
run_hook cc-posttoolbatch-observer.sh "$domain_skill" >/dev/null || true
out="$(run_hook cc-pretooluse-guard.sh "$domain_edit")"
assert_json_expr "domain edit allowed after companion skill" "$out" '.continue == true'

failure_json="$(jq -cn '{session_id:"fixture-session",tool_name:"Bash",tool_input:{command:"bad --flag"},error:"unknown flag"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_json_expr "failure blocks with diagnosis" "$out" '.decision == "block"'
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_contains "repeated failure pivots" "$out" "repeated"

repeat_edit_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-repeat-edit",tool_name:"Edit",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
for _ in 1 2 3; do
  run_hook cc-posttoolbatch-observer.sh "$repeat_edit_event" >/dev/null || true
done
repeat_state="$TMPROOT/claude-guard-fixture-repeat-edit.json"
assert_json_expr "repeated edit recorded" "$(jq -c . "$repeat_state")" '((.repeatedEditFiles // {}) | length) == 1'
assert_file "project buglog recorded" "$TMPROOT/artifacts/project-buglog.jsonl"
bug_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-suggest",tool_name:"Read",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$bug_read" >/dev/null || true
bug_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-suggest",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n value src/app.ts"}}')"
run_hook cc-posttoolbatch-observer.sh "$bug_search" >/dev/null || true
bug_edit="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-suggest",tool_name:"Edit",cwd:$root,tool_input:{file_path:($root + "/src/app.ts"),old_string:"export const value = 1;",new_string:"export const value = 3;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$bug_edit")"
assert_contains "bug memory surfaced before edit" "$out" "Previous bug notes"

too_big="$TMPROOT/example/src/too-big.ts"
for i in {1..301}; do printf 'export const value%s = %s;\n' "$i" "$i"; done >"$too_big"
post_quality="$(jq -cn --arg root "$TMPROOT/example" --arg file "$too_big" '{session_id:"fixture-post-quality",tool_name:"Edit",cwd:$root,tool_input:{file_path:$file}}')"
out="$(run_hook cc-posttooluse-quality.sh "$post_quality")"
assert_contains "posttool full-file complexity denied" "$out" "Full-file quality"

stop_json="$(fixture stop.json)"
out="$(run_hook cc-stop-verifier.sh "$stop_json")"
assert_json_expr "stop verifier blocks unverified completion" "$out" '.decision == "block"'

browser_outstanding_stop="$(jq -cn '{session_id:"fixture-browser-outstanding",last_assistant_message:"Phases 0-10 complete. Only the manual browser pass is still outstanding - needs pnpm dev:web and a real browser.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$browser_outstanding_stop")"
assert_contains "stop verifier blocks outstanding browser QA" "$out" "Outstanding browser QA"

stale_state="$TMPROOT/claude-guard-fixture-stale.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/a.ts":"2026-01-01T00:00:02Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$stale_state"
stale_stop="$(jq -cn '{session_id:"fixture-stale",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$stale_stop")"
assert_contains "stop verifier blocks stale verification" "$out" "stale verification"

mkdir -p "$TMPROOT/example/tests"
curl_state="$TMPROOT/claude-guard-fixture-curl-only.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/example/src/app.ts":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"curl http://localhost:3000",at:"2026-01-01T00:00:02Z"}],qualityRuns:[],testRuns:[],browserRuns:[{value:"curl http://localhost:3000",at:"2026-01-01T00:00:02Z"}],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$curl_state"
curl_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-curl-only",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$curl_stop")"
assert_contains "curl alone does not satisfy source quality" "$out" "without real quality"

fresh_state="$TMPROOT/claude-guard-fixture-fresh-quality.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/example/src/app.ts":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$fresh_state"
fresh_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-fresh-quality",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$fresh_stop")"
if [[ -z "$out" ]]; then ok "real test run satisfies source quality"; else not_ok "real test run should satisfy source quality: $out"; fi

review_state="$TMPROOT/claude-guard-fixture-review-required.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/example/src/a.ts":"2026-01-01T00:00:01Z","/tmp/example/src/b.ts":"2026-01-01T00:00:01Z","/tmp/example/src/c.ts":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$review_state"
review_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-review-required",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$review_stop")"
assert_contains "second-pass review required for broad source edits" "$out" "second-pass review"
jq '.reviewRuns = [{value:"etrnl-review",at:"2026-01-01T00:00:03Z"}]' "$review_state" >"$review_state.tmp" && mv "$review_state.tmp" "$review_state"
out="$(run_hook cc-stop-verifier.sh "$review_stop")"
if [[ -z "$out" ]]; then ok "second-pass review evidence satisfies broad edits"; else not_ok "second-pass review evidence should satisfy broad edits: $out"; fi

requested_state="$TMPROOT/claude-guard-fixture-requested.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{},commands:[],failures:[],skillCalls:[],requestedSkills:[{value:"etrnl-plan",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$requested_state"
requested_stop="$(jq -cn '{session_id:"fixture-requested",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$requested_stop")"
assert_contains "stop verifier blocks missing requested skill" "$out" "requested skill"

sycophancy_stop="$(jq -cn '{session_id:"fixture-session",last_assistant_message:"You are right - I will check.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$sycophancy_stop")"
assert_contains "stop verifier blocks sycophancy" "$out" "Evidence-before-agreement"

deflection_stop="$(jq -cn '{session_id:"fixture-deflection-stop",last_assistant_message:"Tests fail, but this is a pre-existing issue and out of scope for my changes.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$deflection_stop")"
assert_contains "stop verifier blocks ownership deflection" "$out" "Ownership-deflection"

deflection_transcript="$TMPROOT/deflection.jsonl"
printf '%s\n' '{"id":"msg-deflection","type":"assistant","message":{"content":[{"type":"text","text":"The build failure was not caused by my changes, so I will leave it for later."}]}}' >"$deflection_transcript"
deflection_json="$(jq --arg path "$deflection_transcript" '.session_id = "fixture-deflection-pretool" | .assistant_message_id = "msg-deflection" | .transcript_path = $path | .tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$deflection_json")"
assert_contains "pretooluse blocks ownership deflection" "$out" "Ownership-deflection"

post_sycophancy_json="$(jq -cn --arg path "$sycophancy_transcript" '{session_id:"fixture-sycophancy-post",tool_name:"Bash",assistant_message_id:"msg-sycophancy",transcript_path:$path}')"
out="$(run_hook cc-posttooluse-sycophancy.sh "$post_sycophancy_json")"
assert_contains "posttooluse blocks sycophancy" "$out" "Evidence-before-agreement"

precompact_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"PreCompact"}')"
out="$(run_hook cc-precompact-save.sh "$precompact_json")"
assert_json_expr "precompact allows after save" "$out" '.continue == true'
session_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"SessionStart",source:"compact"}')"
out="$(run_hook cc-sessionstart-restore.sh "$session_json")"
assert_json_expr "session compact restores context" "$out" '.hookSpecificOutput.additionalContext | test("Compact recovery")'
assert_contains "session start injects ETRNL skill hint" "$out" "ETRNL skills"

agent_bad="$(jq -cn '{session_id:"fixture-session",tool_name:"Task",tool_input:{packet:{mode:"read-only",goal:"inspect task",cwd:"/repo",scope:"scripts",readSet:["scripts"],expectedOutput:"summary",noRevert:true}}}')"
out="$(run_hook cc-pretooluse-guard.sh "$agent_bad")"
assert_json_expr "underspecified task denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "underspecified task reports multiple missing fields" "$out" "contextSummary"
agent_invalid="$(fixture pretooluse-task-invalid.json)"
out="$(run_hook cc-pretooluse-guard.sh "$agent_invalid")"
assert_contains "invalid task fixture reports retry policy" "$out" "retryPolicy"
agent_valid="$(fixture pretooluse-task-valid.json)"
out="$(run_hook cc-pretooluse-guard.sh "$agent_valid")"
assert_json_expr "valid task packet allowed" "$out" '.continue == true'

# State migration matrix
migration_state="$TMPROOT/claude-guard-fixture-migration-v1.json"
jq -nc '{schemaVersion:1,reads:[],searches:"oops",edits:{},commands:{},verificationRuns:"bad",qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:[],editCounts:[],largeEdits:{},repeatedEditFiles:[],reviewTriggers:{},lastPrompt:null,lastCompactSummary:null,cwd:null,settingsFingerprint:null,startedAt:null}' >"$migration_state"
migration_event="$(jq -cn '{session_id:"fixture-migration-v1",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"rg -n value src"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$migration_event")"
assert_json_expr "migration event allowed" "$out" '.continue == true'
assert_json_expr "state schema upgraded to v2" "$(jq -c . "$migration_state")" '.schemaVersion == 2'
assert_json_expr "state migration normalizes new buckets" "$(jq -c . "$migration_state")" '(.blockedCommands | type) == "array" and (.successfulCommands | type) == "array" and (.commandLastEditGeneration | type) == "object" and (.prodApprovalMarkers | type) == "array"'

broken_state="$TMPROOT/claude-guard-fixture-migration-broken.json"
printf '{broken' >"$broken_state"
broken_event="$(jq -cn '{session_id:"fixture-migration-broken",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"rg -n value src"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$broken_event")"
assert_json_expr "broken legacy state fails open to default" "$out" '.continue == true'
assert_json_expr "broken legacy state reset to schema v2" "$(jq -c . "$broken_state")" '.schemaVersion == 2'

# Tiered degraded-mode policy matrix
no_node_safe_event="$(jq -cn '{session_id:"fixture-no-node-safe",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"rg -n value src"}}')"
safe_no_node="$(PATH="/usr/bin:/bin" run_hook cc-pretooluse-guard.sh "$no_node_safe_event")"
assert_json_expr "low-risk command allowed when node missing" "$safe_no_node" '.continue == true'
no_node_secret_event="$(jq -cn '{session_id:"fixture-no-node-secret",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"veloz db credentials"}}')"
secret_no_node="$(PATH="/usr/bin:/bin" run_hook cc-pretooluse-guard.sh "$no_node_secret_event")"
assert_json_expr "secret command fail-closed when node missing" "$secret_no_node" '.hookSpecificOutput.permissionDecision == "deny"'

# Override token abuse matrix
override_cmd='prisma db push --url postgresql://prod.example.com/app'
override_fp="$(bash -c 'source "$1"; cc_command_fingerprint "$2"' _ "$ROOT/hooks/lib/command-classifiers.sh" "$override_cmd")"
override_token_json="$(node "$ROOT/scripts/guard-override-token.mjs" issue --session fixture-override --command-fingerprint "$override_fp" --reason "breakglass" --ttl 60)"
override_token="$(jq -r '.token' <<<"$override_token_json")"
override_event_base="$(jq -cn --arg cmd "$override_cmd" '{session_id:"fixture-override",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:$cmd}}')"
override_no_token="$(run_hook cc-pretooluse-guard.sh "$override_event_base")"
assert_json_expr "prod mutation denied without override token" "$override_no_token" '.hookSpecificOutput.permissionDecision == "deny"'
override_with_token="$(run_hook cc-pretooluse-guard.sh "$(jq --arg token "$override_token" '.tool_input.guard_override_token = $token' <<<"$override_event_base")")"
assert_json_expr "prod mutation allowed with valid override token" "$override_with_token" '.continue == true'
override_replay="$(run_hook cc-pretooluse-guard.sh "$(jq --arg token "$override_token" '.tool_input.guard_override_token = $token' <<<"$override_event_base")")"
assert_json_expr "override token replay denied" "$override_replay" '.hookSpecificOutput.permissionDecision == "deny"'
override_mismatch_cmd='prisma db push --url postgresql://prod.example.com/other'
override_mismatch_event="$(jq -cn --arg cmd "$override_mismatch_cmd" --arg token "$override_token" '{session_id:"fixture-override",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:$cmd,guard_override_token:$token}}')"
override_mismatch="$(run_hook cc-pretooluse-guard.sh "$override_mismatch_event")"
assert_json_expr "override token fingerprint mismatch denied" "$override_mismatch" '.hookSpecificOutput.permissionDecision == "deny"'
override_exp_fp="$(bash -c 'source "$1"; cc_command_fingerprint "$2"' _ "$ROOT/hooks/lib/command-classifiers.sh" "veloz db credentials")"
override_exp_json="$(node "$ROOT/scripts/guard-override-token.mjs" issue --session fixture-override-exp --command-fingerprint "$override_exp_fp" --reason "breakglass" --expires-at-ms 1)"
override_exp_token="$(jq -r '.token' <<<"$override_exp_json")"
override_exp_event="$(jq -cn --arg token "$override_exp_token" '{session_id:"fixture-override-exp",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"veloz db credentials",guard_override_token:$token}}')"
override_expired="$(run_hook cc-pretooluse-guard.sh "$override_exp_event")"
assert_json_expr "expired override token denied" "$override_expired" '.hookSpecificOutput.permissionDecision == "deny"'

# Re-run a safe command 10 times to prove non-mutating allowed commands stay idempotent under repeated hook invocations.
for i in {1..10}; do
  out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
  assert_json_expr "safe bash repeated fixture $i" "$out" '.continue == true'
done

# Guard pattern fixture matrix (A2/A3): 20 invalid (should deny) + 20 valid (should allow)
shopt -s nullglob
invalid_guard_fixtures=("$ROOT/tests/fixtures/guard-patterns"/invalid-*.json)
valid_guard_fixtures=("$ROOT/tests/fixtures/guard-patterns"/valid-*.json)
invalid_packet_fixtures=("$ROOT/tests/fixtures/events"/packet-invalid-*.json)
valid_packet_fixtures=("$ROOT/tests/fixtures/events"/packet-valid-*.json)
shopt -u nullglob

if (( ${#invalid_guard_fixtures[@]} == 0 || ${#valid_guard_fixtures[@]} == 0 )); then
  not_ok "guard fixture sanity: missing invalid/valid guard-pattern fixture files"
  finish_tests
fi
if (( ${#invalid_packet_fixtures[@]} == 0 || ${#valid_packet_fixtures[@]} == 0 )); then
  not_ok "packet fixture sanity: missing invalid/valid packet fixture files"
  finish_tests
fi

for fixture_file in "${invalid_guard_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  fixture_cmd="$(jq -r '.tool_input.command' "$fixture_file")"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard denies $fixture_name ($fixture_cmd)" "$guard_out" '.hookSpecificOutput.permissionDecision == "deny"'
done
for fixture_file in "${valid_guard_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  fixture_cmd="$(jq -r '.tool_input.command' "$fixture_file")"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard allows $fixture_name ($fixture_cmd)" "$guard_out" '.continue'
done

# Packet fixture matrix (C3/C4): 5 invalid packets (should deny) + 5 valid packets (should allow)
for fixture_file in "${invalid_packet_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard denies $fixture_name" "$guard_out" '.hookSpecificOutput.permissionDecision == "deny"'
done
for fixture_file in "${valid_packet_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard allows $fixture_name" "$guard_out" '.continue'
done

finish_tests
