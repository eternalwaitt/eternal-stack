#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMPROOT="$(mktemp -d)"
export TMPDIR="$TMPROOT"
export CLAUDE_GUARD_STATE_DIR="$TMPROOT"
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

email_bash="$(jq '.tool_input.command = "gmail send --to a@example.com"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_bash")"
assert_json_expr "email send denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

web_json="$(jq '.tool_name = "WebSearch" | .tool_input = {"query":"x"}' <<<"$bash_json")"
CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 out="$(run_hook cc-pretooluse-guard.sh "$web_json")"
assert_json_expr "websearch effort denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

edit_json="$(fixture pretooluse-edit.json | jq --arg root "$TMPROOT/example" '.cwd=$root | .tool_input.file_path=($root + "/src/app.ts")')"
out="$(run_hook cc-pretooluse-guard.sh "$edit_json")"
assert_json_expr "silent catch denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

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

skill_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"UserPromptExpansion",command_name:"code-review"}')"
run_hook cc-userprompt-expansion.sh "$skill_json" >/dev/null || true
state_file="$TMPROOT/claude-guard-fixture-session.json"
assert_json_expr "skill recorded" "$(jq -c . "$state_file")" '(.skillCalls | length) > 0'

failure_json="$(jq -cn '{session_id:"fixture-session",tool_name:"Bash",tool_input:{command:"bad --flag"},error:"unknown flag"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_json_expr "failure blocks with diagnosis" "$out" '.decision == "block"'
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_contains "repeated failure pivots" "$out" "repeated"

stop_json="$(fixture stop.json)"
out="$(run_hook cc-stop-verifier.sh "$stop_json")"
assert_json_expr "stop verifier blocks unverified completion" "$out" '.decision == "block"'

sycophancy_stop="$(jq -cn '{session_id:"fixture-session",last_assistant_message:"You are right - I will check.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$sycophancy_stop")"
assert_contains "stop verifier blocks sycophancy" "$out" "Sycophantic"

precompact_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"PreCompact"}')"
out="$(run_hook cc-precompact-save.sh "$precompact_json")"
assert_json_expr "precompact allows after save" "$out" '.continue == true'
session_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"SessionStart",source:"compact"}')"
out="$(run_hook cc-sessionstart-restore.sh "$session_json")"
assert_json_expr "session compact restores context" "$out" '.hookSpecificOutput.additionalContext | test("Compact recovery")'

agent_bad="$(jq -cn '{session_id:"fixture-session",tool_name:"Task",tool_input:{prompt:"do stuff"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$agent_bad")"
assert_json_expr "underspecified task denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

for i in $(seq 1 49); do
  out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
  assert_json_expr "safe bash repeated fixture $i" "$out" '.continue == true'
done

for script in \
  cc-pretooluse-guard.sh \
  cc-posttoolbatch-observer.sh \
  cc-posttoolusefailure-diagnose.sh \
  cc-userprompt-router.sh \
  cc-userprompt-expansion.sh \
  cc-stop-verifier.sh \
  cc-precompact-save.sh \
  cc-postcompact-record.sh \
  cc-sessionstart-restore.sh \
  cc-sessionend-save.sh
do
  bash -n "$ROOT/hooks/$script" && ok "syntax $script" || not_ok "syntax $script"
done

node --check "$ROOT/hooks/lib/complexity-check.mjs" >/dev/null && ok "complexity syntax" || not_ok "complexity syntax"
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
