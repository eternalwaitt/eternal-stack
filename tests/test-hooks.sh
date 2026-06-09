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

mkdir -p "$TMPROOT/bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$TMPROOT/bin/rtk"
chmod +x "$TMPROOT/bin/rtk"
rtk_rg_bad="$(jq -cn '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"rg -li \"MCR\" /tmp/contracts"}}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-rtk-rg-compat.sh "$rtk_rg_bad")"
assert_json_expr "rtk rg compat proxies files-with-matches search" "$out" '.hookSpecificOutput.updatedInput.command == "rtk proxy --ultra-compact rg -li \"MCR\" /tmp/contracts"'
rtk_rg_safe="$(jq -cn '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"rg -n \"MCR\" /tmp/contracts"}}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-rtk-rg-compat.sh "$rtk_rg_safe")"
if [[ -z "$out" ]]; then ok "rtk rg compat leaves compact-safe rg search to RTK"; else not_ok "rtk rg compat should not rewrite compact-safe rg search: $out"; fi
rtk_rg_compound="$(jq -cn '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"rg -li \"MCR\" /tmp/contracts && rm -rf /tmp/nope"}}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-rtk-rg-compat.sh "$rtk_rg_compound")"
if [[ -z "$out" ]]; then ok "rtk rg compat does not rewrite compound shell commands"; else not_ok "rtk rg compat should not rewrite compound shell commands: $out"; fi

invalid="$(printf '{bad' | "$ROOT/hooks/cc-pretooluse-guard.sh")"
assert_json_expr "invalid JSON fails open" "$invalid" '.continue == true'

bash_json="$(fixture pretooluse-bash.json)"
out="$(run_hook cc-pretooluse-guard.sh "$bash_json")"
assert_json_expr "legacy grep denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "legacy grep reason" "$out" "modern CLI"

primary_nested="$(bash -c 'source "$1"; cc_command_primary_token "$2" || true' _ "$ROOT/hooks/lib/command-classifiers.sh" "sudo timeout 10s command rg -n foo src/app.ts")"
if [[ "$primary_nested" == "rg" ]]; then ok "primary token resolves nested wrappers"; else not_ok "primary token resolves nested wrappers: got '$primary_nested'"; fi
primary_env_sudo="$(bash -c 'source "$1"; cc_command_primary_token "$2" || true' _ "$ROOT/hooks/lib/command-classifiers.sh" "VAR=x sudo -u user command rg -n foo src/app.ts")"
if [[ "$primary_env_sudo" == "rg" ]]; then ok "primary token resolves env + sudo wrapper"; else not_ok "primary token resolves env + sudo wrapper: got '$primary_env_sudo'"; fi
primary_timeout_flag_only="$(bash -c 'source "$1"; cc_command_primary_token "$2" || true' _ "$ROOT/hooks/lib/command-classifiers.sh" "timeout --kill-after")"
if [[ -z "$primary_timeout_flag_only" ]]; then ok "primary token handles timeout flag missing arg"; else not_ok "primary token handles timeout flag missing arg: got '$primary_timeout_flag_only'"; fi
primary_timeout_flag_arg_only="$(bash -c 'source "$1"; cc_command_primary_token "$2" || true' _ "$ROOT/hooks/lib/command-classifiers.sh" "timeout --kill-after command")"
if [[ -z "$primary_timeout_flag_arg_only" ]]; then ok "primary token handles timeout consumed arg without command"; else not_ok "primary token handles timeout consumed arg without command: got '$primary_timeout_flag_arg_only'"; fi
prod_schema_detect="$(bash -c 'source "$1"; cc_command_is_prod_schema_mutation "$2" "$3"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "prisma db push --url postgresql://prod.example.com/app" "")"
if [[ "$prod_schema_detect" == "0" ]]; then ok "prod schema detection flags production URL"; else not_ok "prod schema detection flags production URL: got '$prod_schema_detect'"; fi
prod_schema_localhost="$(bash -c 'source "$1"; cc_command_is_prod_schema_mutation "$2" "$3"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "prisma db push --url postgresql://localhost/app" "")"
if [[ "$prod_schema_localhost" == "1" ]]; then ok "prod schema detection excludes localhost URL"; else not_ok "prod schema detection excludes localhost URL: got '$prod_schema_localhost'"; fi
prod_schema_dev_schema="$(bash -c 'source "$1"; cc_command_is_prod_schema_mutation "$2" "$3"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "prisma db push --schema ./dev.schema" "")"
if [[ "$prod_schema_dev_schema" == "1" ]]; then ok "prod schema detection excludes dev schema path"; else not_ok "prod schema detection excludes dev schema path: got '$prod_schema_dev_schema'"; fi
prod_schema_dev_host_port="$(bash -c 'source "$1"; cc_command_is_prod_schema_mutation "$2" "$3"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "prisma db push --url postgresql://db-staging.example.com:5433/app" "")"
if [[ "$prod_schema_dev_host_port" == "1" ]]; then ok "prod schema detection excludes staged host with port"; else not_ok "prod schema detection excludes staged host with port: got '$prod_schema_dev_host_port'"; fi
prod_schema_env_hint="$(bash -c 'source "$1"; cc_command_is_prod_schema_mutation "$2" "$3"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "prisma db push" "DATABASE_URL=postgresql://qa-db.example.com:5433/app")"
if [[ "$prod_schema_env_hint" == "1" ]]; then ok "prod schema detection excludes qa env hint"; else not_ok "prod schema detection excludes qa env hint: got '$prod_schema_env_hint'"; fi

large_bash_json="$(node -e 'process.stdout.write(JSON.stringify({session_id:"fixture-large",tool_name:"Bash",tool_input:{command:"grep -n foo src/app.ts"},padding:"x".repeat(2 * 1024 * 1024)}))')"
out="$(printf '%s' "$large_bash_json" | "$ROOT/hooks/cc-pretooluse-guard.sh")"
assert_json_expr "large JSON payload still enforced" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

safe_bash="$(jq '.tool_input.command = "rg -n foo src/app.ts"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$safe_bash")"
assert_json_expr "rg allowed" "$out" '.continue == true'

output_limiter_bash="$(jq '.tool_input.command = "rg -n foo src/app.ts | head -20"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$output_limiter_bash")"
assert_json_expr "output limiter pipe denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "output limiter reason" "$out" "output-limiter"
diagnostic_tail_bash="$(jq '.tool_input.command = "pnpm test 2>&1 | tail -80"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$diagnostic_tail_bash")"
assert_json_expr "diagnostic verification tail allowed" "$out" '.continue == true'
unbounded_inventory_bash="$(jq '.tool_input.command = "node scripts/code-health-inventory.mjs --json --include-untracked"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$unbounded_inventory_bash")"
assert_json_expr "unbounded inventory JSON dump denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "unbounded inventory JSON reason" "$out" "Unbounded JSON dump"
bounded_inventory_bash="$(jq '.tool_input.command = "node scripts/code-health-inventory.mjs --json --quiet --include-untracked"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$bounded_inventory_bash")"
assert_json_expr "bounded inventory JSON allowed" "$out" '.continue == true'
redirected_inventory_bash="$(jq '.tool_input.command = "node scripts/code-health-inventory.mjs --json --include-untracked > artifacts/code-health.json"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$redirected_inventory_bash")"
assert_json_expr "redirected inventory JSON artifact allowed" "$out" '.continue == true'
compact_redirected_inventory_bash="$(jq '.tool_input.command = "node scripts/code-health-inventory.mjs --json>artifacts/code-health.json"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$compact_redirected_inventory_bash")"
assert_json_expr "compact redirected inventory JSON artifact allowed" "$out" '.continue == true'
unbounded_workflow_bash="$(jq '.tool_input.command = "node scripts/workflow-health.mjs --json"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$unbounded_workflow_bash")"
assert_json_expr "unbounded workflow JSON dump denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
bounded_workflow_bash="$(jq '.tool_input.command = "node scripts/workflow-health.mjs status --json"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$bounded_workflow_bash")"
assert_json_expr "bounded workflow status JSON allowed" "$out" '.continue == true'
redirected_workflow_bash="$(jq '.tool_input.command = "node scripts/workflow-health.mjs --json >> artifacts/workflow-health.jsonl"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$redirected_workflow_bash")"
assert_json_expr "redirected workflow JSON artifact allowed" "$out" '.continue == true'
fd_redirected_workflow_bash="$(jq '.tool_input.command = "node scripts/workflow-health.mjs --json 1>artifacts/workflow-health.json"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$fd_redirected_workflow_bash")"
assert_json_expr "fd redirected workflow JSON artifact allowed" "$out" '.continue == true'
rtk_filtered_check_types="$(bash -c 'source "$1"; cc_command_is_quality_verification "$2"; echo $?' _ "$ROOT/hooks/lib/command-classifiers.sh" "rtk pnpm --filter @fixture/api check-types 2>&1 | tail -20")"
if [[ "$rtk_filtered_check_types" == "0" ]]; then ok "rtk pnpm filtered check-types counts as quality verification"; else not_ok "rtk pnpm filtered check-types should count as quality verification: got '$rtk_filtered_check_types'"; fi
readiness_help_bash="$(jq '.tool_input.command = "node ~/.claude/scripts/plan-readiness-check.mjs --help 2>&1 || bat ~/.claude/scripts/plan-readiness-check.mjs"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$readiness_help_bash")"
assert_json_expr "plan readiness help probe denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "plan readiness help reason" "$out" "plan-readiness-check.mjs <plan-path>"
readiness_help_only_bash="$(jq '.tool_input.command = "node ~/.claude/scripts/plan-readiness-check.mjs --help"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$readiness_help_only_bash")"
assert_json_expr "plan readiness direct help allowed" "$out" '.continue == true'

read_dir_json="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-read-dir",tool_name:"Read",cwd:$root,tool_input:{file_path:$root}}')"
out="$(run_hook cc-pretooluse-guard.sh "$read_dir_json")"
assert_json_expr "directory read denied before tool error" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "directory read reason" "$out" "directory"

dangerous_outside="$(jq --arg cwd "$ROOT" '.cwd = $cwd | .tool_input.command = "cp /etc/passwd \($cwd)/passwd-copy"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dangerous_outside")"
assert_json_expr "dangerous outside path denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "dangerous outside path named" "$out" "/etc/passwd"

dangerous_quoted="$(jq --arg cwd "$ROOT" '.cwd = $cwd | .tool_input.command = "cp \"/etc/passwd\" \"\($cwd)/passwd-copy\""' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$dangerous_quoted")"
assert_json_expr "dangerous quoted outside path denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "dangerous quoted outside path named" "$out" "/etc/passwd"

broad_codex_scan="$(jq '.tool_input.command = "rg -n rtk /Users/testuser/.codex"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$broad_codex_scan")"
assert_json_expr "broad codex memory scan denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "broad codex memory scan reason" "$out" "Broad ~/.codex scans are blocked"
broad_codex_config_scan="$(jq '.tool_input.command = "rg -n token /Users/testuser/.codex/config.toml"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$broad_codex_config_scan")"
assert_json_expr "broad codex config scan denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'

tool_signal_batch="$(jq -nc '{session_id:"fixture-tool-signals",tool_calls:[{tool_name:"mcp__codegraph__search",tool_input:{query:"symbol"}},{tool_name:"Bash",tool_input:{command:"bd show ready"}}]}')"
run_hook cc-posttoolbatch-observer.sh "$tool_signal_batch" >/dev/null
tool_signal_state="$(jq -c . "$TMPROOT/claude-guard-fixture-tool-signals.json")"
assert_json_expr "posttool observer records codegraph tool signal" "$tool_signal_state" 'any(.toolSignals[]; .tool == "codegraph" and .toolKind == "codegraph" and .event == "mcp-call")'
assert_json_expr "posttool observer records beads tool signal" "$tool_signal_state" 'any(.toolSignals[]; .tool == "beads" and .toolKind == "beads" and .event == "bash-command")'
assert_json_expr "posttool observer records before-first-edit signal" "$tool_signal_state" '.toolUseBeforeFirstEdit.codegraph == 1 and .toolUseBeforeFirstEdit.beads == 1'

lesson_home="$TMPROOT/hindsight-lesson-home"
lesson_state_dir="$TMPROOT/hindsight-lesson-state"
mkdir -p "$lesson_home"
HOME="$lesson_home" ETRNL_STATE_DIR="$lesson_state_dir" CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON=0 CLAUDE_GUARD_FORCE_LESSON_RETAIN=1 python3 "$ROOT/hooks/cc-hindsight-lesson.py"
lesson_state="$(jq -c . "$lesson_state_dir/events.jsonl")"
assert_json_expr "hindsight lesson hook records ETRNL lesson first" "$lesson_state" '.eventKind == "lesson" and .data.lessonId == "etrnl/evidence-before-agreement/v1" and .data.exportTarget == "hindsight"'
assert_no_file "hindsight lesson hook does not write false Hindsight retained stamp without canary" "$lesson_home/.claude/cache/etrnl-lessons/evidence-before-agreement-v1.hindsight.retained"
private_lesson_home="$TMPROOT/hindsight-private-lesson-home"
private_lesson_state_dir="$TMPROOT/hindsight-private-lesson-state"
mkdir -p "$private_lesson_home"
HOME="$private_lesson_home" ETRNL_STATE_DIR="$private_lesson_state_dir" CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON=0 CLAUDE_GUARD_FORCE_LESSON_RETAIN=1 CLAUDE_GUARD_HINDSIGHT_LESSON_TEXT="/Users/testuser/.claude/projects/raw-session.json" python3 "$ROOT/hooks/cc-hindsight-lesson.py"
assert_no_file "hindsight lesson privacy rejection skips ETRNL write" "$private_lesson_state_dir/events.jsonl"

disk_cleanup_state="$TMPROOT/claude-guard-fixture-disk-cleanup.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"etrnl-ops-disk-cleanup",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"free SSD space",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$disk_cleanup_state"
disk_cleanup_path="$HOME/Library/Caches/example-cache"
disk_cleanup_trash="$(jq --arg path "$disk_cleanup_path" '.session_id = "fixture-disk-cleanup" | .tool_input.command = ("trash " + $path)' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$disk_cleanup_trash")"
assert_json_expr "disk cleanup allows approved trash path" "$out" '.continue == true'
disk_cleanup_rm="$(jq --arg path "$disk_cleanup_path" '.session_id = "fixture-disk-cleanup" | .tool_input.command = ("rm -rf " + $path)' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$disk_cleanup_rm")"
assert_json_expr "disk cleanup blocks recursive rm" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "disk cleanup rm reason" "$out" "must use trash"
disk_cleanup_upper_rm="$(jq --arg path "$disk_cleanup_path" '.session_id = "fixture-disk-cleanup" | .tool_input.command = ("/bin/rm -Rf " + $path)' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$disk_cleanup_upper_rm")"
assert_json_expr "disk cleanup blocks uppercase recursive rm" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
disk_cleanup_tilde_trash="$(jq '.session_id = "fixture-disk-cleanup" | .tool_input.command = "trash ~/Documents"' <<<"$bash_json")"
out="$(HOME="/Users/testuser" run_hook cc-pretooluse-guard.sh "$disk_cleanup_tilde_trash")"
assert_json_expr "disk cleanup blocks unsafe tilde trash path" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
disk_cleanup_unsafe="$(jq '.session_id = "fixture-disk-cleanup" | .tool_input.command = "trash /etc/passwd"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$disk_cleanup_unsafe")"
assert_json_expr "disk cleanup blocks unapproved path" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "disk cleanup unsafe path named" "$out" "/etc/passwd"

gws_help_state="$TMPROOT/claude-guard-fixture-gws-help.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"gws gmail help",at:"2026-01-01T00:00:00Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:""}' >"$gws_help_state"
gws_write_with_help="$(jq '.session_id = "fixture-gws-help" | .tool_input.command = "gws gmail users messages batchModify --params {} --json {}"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$gws_write_with_help")"
assert_json_expr "gws help does not satisfy write preflight" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "gws help denial names account verification" "$out" "Help output is not account verification"
gws_prefixed_write="$(jq '.session_id = "fixture-gws-help" | .tool_input.command = "/usr/local/bin/gws gmail users messages batchModify --params {} --json {}"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$gws_prefixed_write")"
assert_json_expr "gws prefixed write requires account verification" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
sqlite_rule_command="sqlite3 /tmp/runtime.sqlite \"INSERT INTO rules (email, updated_at) VALUES ('brand@gmail.com', datetime('now'))\""
sqlite_rule_upsert="$(jq --arg command "$sqlite_rule_command" '.session_id = "fixture-gws-help" | .tool_input.command = $command' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$sqlite_rule_upsert")"
assert_json_expr "gmail text inside sqlite rule is not gws write" "$out" '.continue == true'

email_triage_raw_mutation_state="$TMPROOT/claude-guard-fixture-email-triage-raw-mutation.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"gws gmail account whoami",at:"2026-01-01T00:00:00Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:""}' >"$email_triage_raw_mutation_state"
email_triage_raw_mutation="$(jq '.session_id = "fixture-email-triage-raw-mutation" | .tool_input.command = "gws gmail users messages batchModify --params {} --json {}"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_triage_raw_mutation")"
assert_json_expr "email triage blocks raw gmail mutation" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "email triage raw mutation reason" "$out" "Raw Gmail mutation is blocked"

email_triage_dry_command_state="$TMPROOT/claude-guard-fixture-email-triage-dry-command.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_dry_command_state"
email_triage_dry_command="$(jq '.session_id = "fixture-email-triage-dry-command" | .tool_input.command = "ACCOUNT=agencia && vivaz-email triage run --account \"$ACCOUNT\" --max-inbox 50"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_triage_dry_command")"
assert_json_expr "email triage blocks dry run command" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "email triage dry run reason" "$out" "Dry email-triage runs are blocked"

email_triage_debug_dry_command="$(jq '.session_id = "fixture-email-triage-dry-command" | .tool_input.command = "ACCOUNT=agencia && vivaz-email triage run --account \"$ACCOUNT\" --max-inbox 50 --no-sync"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_triage_debug_dry_command")"
assert_json_expr "email triage allows maintainer debug dry run" "$out" '.continue == true'

email_triage_verify_cli="$TMPROOT/bin/vivaz-email"
cat >"$email_triage_verify_cli" <<'BASH'
#!/usr/bin/env bash
if [[ "$1 $2" == "triage verify" ]]; then
  if [[ "${VIVAZ_EMAIL_VERIFY_DRY:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":true,"gmail_mutated":false,"inbox_zero_verified":false,"inbox_count":5}}\n'
  elif [[ "${VIVAZ_EMAIL_VERIFY_READY:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":true,"gmail_mutated":false,"inbox_zero_verified":true,"queue_ready_without_mutation":true,"inbox_count":0,"action_backlog_count":31}}\n'
  elif [[ "${VIVAZ_EMAIL_VERIFY_NONZERO:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":1}}\n'
  else
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":0}}\n'
  fi
  exit 0
fi
exit 0
BASH
chmod +x "$email_triage_verify_cli"

email_triage_queue_before_verify_state="$TMPROOT/claude-guard-fixture-email-triage-queue-before-verify.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"vivaz-email triage guarded-run --account agencia --max-inbox 500 --apply --require-insights",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_queue_before_verify_state"
email_triage_queue_before_verify="$(jq '.session_id = "fixture-email-triage-queue-before-verify" | .tool_input.command = "vivaz-email triage queue --run-id triage_fixture --mode reply --format markdown --next"' <<<"$bash_json")"
out="$(run_hook cc-pretooluse-guard.sh "$email_triage_queue_before_verify")"
assert_json_expr "email triage blocks queue before verify" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "email triage queue before verify reason" "$out" "queue is blocked until Inbox Zero verification"

email_triage_queue_after_verify_state="$TMPROOT/claude-guard-fixture-email-triage-queue-after-verify.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"vivaz-email triage guarded-run --account agencia --max-inbox 500 --apply --require-insights",at:"2026-01-01T00:00:01Z"},{command:"vivaz-email triage verify --latest --account agencia",at:"2026-01-01T00:00:02Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_queue_after_verify_state"
email_triage_queue_after_verify="$(jq '.session_id = "fixture-email-triage-queue-after-verify" | .tool_input.command = "vivaz-email triage queue --run-id triage_fixture --mode reply --format markdown --next"' <<<"$bash_json")"
out="$(VIVAZ_EMAIL_BIN="$email_triage_verify_cli" run_hook cc-pretooluse-guard.sh "$email_triage_queue_after_verify")"
assert_json_expr "email triage allows queue after verify" "$out" '.continue == true'

out="$(VIVAZ_EMAIL_VERIFY_READY=1 VIVAZ_EMAIL_BIN="$email_triage_verify_cli" run_hook cc-pretooluse-guard.sh "$email_triage_queue_after_verify")"
assert_json_expr "email triage allows queue after no-mutation ready verify" "$out" '.continue == true'

out="$(VIVAZ_EMAIL_VERIFY_DRY=1 VIVAZ_EMAIL_BIN="$email_triage_verify_cli" run_hook cc-pretooluse-guard.sh "$email_triage_queue_after_verify")"
assert_json_expr "email triage blocks queue after dry verify result" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "email triage dry verify queue reason" "$out" "queue_ready_without_mutation true"

out="$(VIVAZ_EMAIL_VERIFY_NONZERO=1 VIVAZ_EMAIL_BIN="$email_triage_verify_cli" run_hook cc-pretooluse-guard.sh "$email_triage_queue_after_verify")"
assert_json_expr "email triage blocks queue after nonzero verify result" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "email triage nonzero verify queue reason" "$out" "inbox_count 0"

live_hook_edit="$(jq -cn --arg file "$HOME/.claude/hooks/cc-stop-verifier.sh" '{session_id:"fixture-live-hook-edit",tool_name:"Edit",cwd:"/tmp",tool_input:{file_path:$file,old_string:"old",new_string:"new"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$live_hook_edit")"
assert_json_expr "live claude hook edit denied" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "live claude hook edit reason" "$out" "Live ~/.claude/hooks edits are blocked"

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
trivial_python_assert="$(jq '.tool_input.file_path = "tests/test_app.py" | .tool_input.old_string = "class TestApp:\n    pass" | .tool_input.new_string = "class TestApp:\n    def test_true(self):\n        self.assertTrue(True)"' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$trivial_python_assert")"
assert_contains "python trivial self assert denied" "$out" "trivial always-true assertions"
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
existing_write="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-session",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/app.ts"),content:"export const value = 5;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$existing_write")"
assert_json_expr "existing source Write reads disk fallback and is allowed" "$out" '.continue == true'

missing_status_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-missing-status",hook_event_name:"PostToolBatch",tool_name:"Read",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")},tool_response:{type:"text"}}')"
run_hook cc-posttoolbatch-observer.sh "$missing_status_read" >/dev/null || true
missing_status_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-missing-status",hook_event_name:"PostToolBatch",tool_name:"Bash",cwd:$root,tool_input:{command:"fd app.ts src"},tool_response:{stdout:"src/app.ts"}}')"
run_hook cc-posttoolbatch-observer.sh "$missing_status_search" >/dev/null || true
missing_status_state="$TMPROOT/claude-guard-fixture-missing-status.json"
assert_json_expr "posttoolbatch missing status records successful read" "$(jq -c . "$missing_status_state")" '(.reads | length) == 1 and ([.failures[]?.value | select(test("Read failed"))] | length) == 0'
assert_json_expr "posttoolbatch missing status records successful search command" "$(jq -c . "$missing_status_state")" '(.successfulCommands | length) == 1 and (.searches | length) == 1'
failed_response_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-failed-response",hook_event_name:"PostToolBatch",tool_name:"Read",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")},tool_response:{is_error:true,content:"blocked"}}')"
run_hook cc-posttoolbatch-observer.sh "$failed_response_read" >/dev/null || true
failed_response_state="$TMPROOT/claude-guard-fixture-failed-response.json"
assert_json_expr "posttoolbatch explicit failed response does not record read" "$(jq -c . "$failed_response_state")" '(.reads | length) == 0 and ([.failures[]?.value | select(test("Read failed"))] | length) == 1'

large_new_string="$(node -e 'for (let i = 0; i < 130; i += 1) console.log("export const value" + i + " = " + i + ";")')"
large_edit="$(jq --arg text "$large_new_string" '.tool_input.old_string = "export const oldValue = 1;" | .tool_input.new_string = $text' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$large_edit")"
assert_contains "large edit denied" "$out" "Large-change"
planned_large_state="$TMPROOT/claude-guard-fixture-planned-large.json"
planned_large_src="$(cd "$TMPROOT/example/src" && pwd -P)/app.ts"
jq -nc --arg plans "$TMPROOT/example/.rulebook/PLANS.md" --arg src "$planned_large_src" '{schemaVersion:4,reads:{($src):"2026-01-01T00:00:00Z"},searches:{($src):"2026-01-01T00:00:00Z"},edits:{($plans):"2026-01-01T00:00:01Z"},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:1,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$planned_large_state"
planned_large_edit="$(jq --arg text "$large_new_string" '.session_id = "fixture-planned-large" | .tool_input.old_string = "export const oldValue = 1;" | .tool_input.new_string = $text' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$planned_large_edit")"
assert_json_expr "plan artifact allows large edit path" "$out" '.continue == true'
planned_large_command_state="$TMPROOT/claude-guard-fixture-planned-large-command.json"
jq -nc --arg src "$planned_large_src" '{schemaVersion:4,reads:{($src):"2026-01-01T00:00:00Z"},searches:{($src):"2026-01-01T00:00:00Z"},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"node scripts/context-state.mjs save --reason refactor-plan",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:1,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$planned_large_command_state"
planned_large_command_edit="$(jq --arg text "$large_new_string" '.session_id = "fixture-planned-large-command" | .tool_input.old_string = "export const oldValue = 1;" | .tool_input.new_string = $text' <<<"$edit_json")"
out="$(run_hook cc-pretooluse-guard.sh "$planned_large_command_edit")"
assert_json_expr "plan command artifact allows large edit path" "$out" '.continue == true'

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
assert_json_expr "file sprawl not denied by default (check is opt-in)" "$out" '.hookSpecificOutput.permissionDecision != "deny"'
out="$(CLAUDE_GUARD_FILE_SPRAWL=1 run_hook cc-pretooluse-guard.sh "$sprawl_fourth")"
assert_contains "file sprawl denied when opt-in flag set" "$out" "File-sprawl"
planned_sprawl_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-planned-sprawl",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n planned src"}}')"
run_hook cc-posttoolbatch-observer.sh "$planned_sprawl_search" >/dev/null || true
planned_sprawl_agent="$(jq -cn '{session_id:"fixture-planned-sprawl",tool_name:"Agent",status:"success",tool_input:{subagent_type:"etrnl-executor",description:"planned file split",packet:{mode:"write",goal:"planned split",writeScope:["src"]}}}')"
run_hook cc-posttoolbatch-observer.sh "$planned_sprawl_agent" >/dev/null || true
for created in planned-one planned-two planned-three planned-four; do
  planned_write="$(jq -cn --arg root "$TMPROOT/example" --arg created "$created" '{session_id:"fixture-planned-sprawl",tool_name:"Write",cwd:$root,tool_input:{file_path:($root + "/src/" + $created + ".ts"),content:"export const planned = true;"}}')"
  out="$(run_hook cc-pretooluse-guard.sh "$planned_write")"
  assert_json_expr "planned write-scope new source $created allowed past sprawl limit" "$out" '.continue == true'
done

mkdir -p "$TMPROOT/home/.claude/rules" "$TMPROOT/example/.claude" "$TMPROOT/example/rules" "$TMPROOT/example/subdir"
printf '%s\n' '# Global Claude' 'Reuse before create from injected global.' '@AGENTS.md' '@~/.claude/rules/global-extra.md' >"$TMPROOT/home/.claude/CLAUDE.md"
printf '%s\n' '# Global Agents' 'Global AGENTS bridge was expanded.' >"$TMPROOT/home/.claude/AGENTS.md"
printf '%s\n' '# Global Extra' 'Global tilde markdown import was expanded.' >"$TMPROOT/home/.claude/rules/global-extra.md"
printf '%s\n' '# Project Claude' 'Project-specific gotcha from injected CLAUDE.md.' '@AGENTS.md' '@../outside.md' >"$TMPROOT/example/CLAUDE.md"
printf '%s\n' '# Dot Claude' 'Dot-claude project instruction was injected.' >"$TMPROOT/example/.claude/CLAUDE.md"
printf '%s\n' '# Local Claude' 'Local project instruction was injected.' >"$TMPROOT/example/CLAUDE.local.md"
printf '%s\n' '# Nested Claude' 'Nested project instruction was injected.' >"$TMPROOT/example/subdir/CLAUDE.md"
printf '%s\n' '# Project Agents' 'Agent local rule from referenced AGENTS.md.' '@rules/deeper.md' >"$TMPROOT/example/AGENTS.md"
printf '%s\n' '# Deeper Rule' 'Recursive markdown import was expanded.' >"$TMPROOT/example/rules/deeper.md"
printf '%s\n' 'Outside secret should not be injected.' >"$TMPROOT/outside.md"
prompt="$(fixture userpromptsubmit.json | jq --arg cwd "$TMPROOT/example/subdir" '.cwd = $cwd')"
out="$(HOME="$TMPROOT/home" run_hook cc-userprompt-router.sh "$prompt")"
assert_json_expr "prompt router emits context" "$out" '.hookSpecificOutput.additionalContext | length > 0'
assert_contains "prompt router names code review workflow" "$out" "etrnl-dev-review"
assert_contains "prompt router reinjects global CLAUDE.md" "$out" "Reuse before create from injected global"
assert_contains "prompt router expands global AGENTS bridge" "$out" "Global AGENTS bridge was expanded"
assert_contains "prompt router expands global tilde references" "$out" "Global tilde markdown import was expanded"
assert_contains "prompt router reinjects project CLAUDE.md" "$out" "Project-specific gotcha from injected CLAUDE.md"
assert_contains "prompt router reinjects .claude/CLAUDE.md" "$out" "Dot-claude project instruction was injected"
assert_contains "prompt router reinjects CLAUDE.local.md" "$out" "Local project instruction was injected"
assert_contains "prompt router reinjects nested CLAUDE.md" "$out" "Nested project instruction was injected"
assert_contains "prompt router expands CLAUDE.md references" "$out" "Agent local rule from referenced AGENTS.md"
assert_contains "prompt router expands recursive markdown references" "$out" "Recursive markdown import was expanded"
if [[ "$out" == *"Outside secret should not be injected"* ]]; then
  not_ok "prompt router skips out-of-root CLAUDE.md references"
else
  ok "prompt router skips out-of-root CLAUDE.md references"
fi
out="$(HOME="$TMPROOT/home" run_hook cc-userprompt-router.sh "$prompt")"
if [[ "$out" == *"Project-specific gotcha from injected CLAUDE.md"* ]]; then
  not_ok "prompt router reinjects CLAUDE.md only once per session"
else
  ok "prompt router reinjects CLAUDE.md only once per session"
fi
out="$(HOME="$TMPROOT/home" ETRNL_INJECT_CLAUDE_MD=always run_hook cc-userprompt-router.sh "$prompt")"
assert_contains "prompt router always mode repeats CLAUDE.md reinjection" "$out" "Project-specific gotcha from injected CLAUDE.md"
disabled_zero_prompt="$(printf '%s' "$prompt" | jq '.session_id = "fixture-userprompt-disabled-zero"')"
out="$(HOME="$TMPROOT/home" ETRNL_INJECT_CLAUDE_MD=0 run_hook cc-userprompt-router.sh "$disabled_zero_prompt")"
if [[ "$out" == *"Project-specific gotcha from injected CLAUDE.md"* ]]; then
  not_ok "prompt router disables CLAUDE.md reinjection"
else
  ok "prompt router disables CLAUDE.md reinjection"
fi
disabled_false_prompt="$(printf '%s' "$prompt" | jq '.session_id = "fixture-userprompt-disabled-false"')"
out="$(HOME="$TMPROOT/home" ETRNL_INJECT_CLAUDE_MD=FALSE run_hook cc-userprompt-router.sh "$disabled_false_prompt")"
if [[ "$out" == *"Project-specific gotcha from injected CLAUDE.md"* ]]; then
  not_ok "prompt router disables CLAUDE.md reinjection case-insensitively"
else
  ok "prompt router disables CLAUDE.md reinjection case-insensitively"
fi
challenge_prompt="$(jq -cn '{session_id:"fixture-challenge-prompt",prompt:"why is Vega saying you are right? I thought we had a hook for this"}')"
out="$(run_hook cc-userprompt-router.sh "$challenge_prompt")"
assert_contains "challenge prompt gets evidence protocol" "$out" "Evidence-first correction protocol"
challenge_state="$TMPROOT/claude-guard-fixture-challenge-prompt.json"
assert_json_expr "challenge prompt recorded" "$(jq -c . "$challenge_state")" '(.evidenceChallenges | length) == 1'
plan_prompt="$(jq -cn '{session_id:"fixture-plan-prompt",prompt:"write an implementation plan for this repo"}')"
out="$(run_hook cc-userprompt-router.sh "$plan_prompt")"
assert_contains "plan prompt routes writing plans" "$out" "etrnl-dev-plan"
plan_state="$TMPROOT/claude-guard-fixture-plan-prompt.json"
assert_json_expr "plan skill recorded" "$(jq -c . "$plan_state")" 'any(.requestedSkills[]?.value; . == "etrnl-dev-plan")'
fake_skill_update="$TMPROOT/fake-skill-update.mjs"
cat >"$fake_skill_update" <<'JS'
#!/usr/bin/env node
console.log('ETRNL_UPDATE_AVAILABLE installed=old source=new version=v0 run="~/.claude/scripts/update.sh"');
console.log('TOOL_STACK_UPDATE_AVAILABLE codegraph current=0.9.9 latest=1.0.0 run="npm install -g codegraph"');
JS
skill_update_prompt="$(jq -cn '{session_id:"fixture-skill-update-prompt",prompt:"/etrnl-dev-plan docs/plans/example.md"}')"
out="$(ETRNL_SKILL_UPDATE_CHECK=1 ETRNL_UPDATE_CHECK_SCRIPT="$fake_skill_update" run_hook cc-userprompt-router.sh "$skill_update_prompt")"
assert_contains "skill prompt checks etrnl updates" "$out" "Skill update check before requested skill"
assert_contains "skill prompt includes tool-stack update" "$out" "TOOL_STACK_UPDATE_AVAILABLE codegraph"
assert_contains "skill prompt names remaining choices only" "$out" "remaining remote/tool-stack choices"
health_prompt="$(jq -cn '{session_id:"fixture-health-prompt",prompt:"audit the entire codebase with no skips or loose ends"}')"
out="$(run_hook cc-userprompt-router.sh "$health_prompt")"
assert_contains "health prompt routes code health" "$out" "etrnl-audit-code"
health_state="$TMPROOT/claude-guard-fixture-health-prompt.json"
assert_json_expr "health skill recorded" "$(jq -c . "$health_state")" 'any(.requestedSkills[]?.value; . == "etrnl-audit-code")'
email_prompt="$(jq -cn '{session_id:"fixture-email-prompt",prompt:"/email-triage agencia"}')"
out="$(run_hook cc-userprompt-router.sh "$email_prompt")"
assert_contains "email prompt emits exact guarded command" "$out" "vivaz-email triage guarded-run --account agencia --max-inbox 500 --apply --require-insights"
assert_contains "email prompt requires inbox zero verify" "$out" "vivaz-email triage verify --latest --account agencia"
assert_contains "email prompt blocks queue before inbox zero" "$out" "Do not open the queue unless verify reports inbox_zero_verified true and inbox_count 0"
assert_contains "email prompt emits reply queue command" "$out" "vivaz-email triage queue --run-id <run-id> --mode reply --format markdown --next"
email_prompt_state="$TMPROOT/claude-guard-fixture-email-prompt.json"
assert_json_expr "email triage skill recorded" "$(jq -c . "$email_prompt_state")" 'any(.requestedSkills[]?.value; . == "email-triage")'
disk_prompt="$(jq -cn '{session_id:"fixture-disk-prompt",prompt:"free SSD space with a disk cleanup pass"}')"
out="$(run_hook cc-userprompt-router.sh "$disk_prompt")"
assert_contains "disk cleanup prompt emits trash workflow" "$out" "Use etrnl-ops-disk-cleanup"
assert_contains "disk cleanup prompt blocks rm" "$out" "Do not use rm -r/rm -rf"
disk_prompt_state="$TMPROOT/claude-guard-fixture-disk-prompt.json"
assert_json_expr "disk cleanup skill recorded" "$(jq -c . "$disk_prompt_state")" 'any(.requestedSkills[]?.value; . == "etrnl-ops-disk-cleanup")'
advice_prompt="$(jq -cn '{session_id:"fixture-advice-prompt",prompt:"which iPhone should I buy today?"}')"
out="$(run_hook cc-userprompt-router.sh "$advice_prompt")"
assert_contains "advice prompt routes source evidence" "$out" "dated URLs/sources"
agent_packet_prompt="$(jq -cn '{session_id:"fixture-agent-packet-prompt",prompt:"delegate this to a subagent with a task packet"}')"
out="$(run_hook cc-userprompt-router.sh "$agent_packet_prompt")"
assert_contains "agent packet prompt emits template command" "$out" "agent-task-packet-check.mjs --template"

skill_trigger_cases="$ROOT/tests/fixtures/skill-triggering/cases.json"
skill_trigger_count="$(jq 'length' "$skill_trigger_cases")"
for (( i = 0; i < skill_trigger_count; i++ )); do
  case_name="$(jq -r ".[$i].name" "$skill_trigger_cases")"
  case_prompt="$(jq -r ".[$i].prompt" "$skill_trigger_cases")"
  case_session="fixture-skill-trigger-$i"
  case_event="$(jq -cn --arg session "$case_session" --arg prompt "$case_prompt" '{session_id:$session,prompt:$prompt}')"
  run_hook cc-userprompt-router.sh "$case_event" >/dev/null || true
  case_state="$TMPROOT/claude-guard-$case_session.json"
  case_state_json="$(jq -c . "$case_state")"
  expected_skills="$(jq -r ".[$i].expectedSkills[]?" "$skill_trigger_cases")"
  while IFS= read -r expected_skill; do
    [[ -n "$expected_skill" ]] || continue
    assert_json_expr "skill trigger $case_name records $expected_skill" "$case_state_json" "any(.requestedSkills[]?.value; . == \"$expected_skill\")"
  done <<<"$expected_skills"
  unexpected_skills="$(jq -r ".[$i].unexpectedSkills[]?" "$skill_trigger_cases")"
  while IFS= read -r unexpected_skill; do
    [[ -n "$unexpected_skill" ]] || continue
    assert_json_expr "skill trigger $case_name does not record $unexpected_skill" "$case_state_json" "([.requestedSkills[]?.value] | index(\"$unexpected_skill\") | not)"
  done <<<"$unexpected_skills"
done

skill_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"UserPromptExpansion",command_name:"etrnl-dev-review"}')"
run_hook cc-userprompt-expansion.sh "$skill_json" >/dev/null || true
state_file="$TMPROOT/claude-guard-fixture-session.json"
assert_json_expr "skill recorded" "$(jq -c . "$state_file")" '(.skillCalls | length) > 0'
agent_event="$(jq -cn '{session_id:"fixture-agent-observer",tool_name:"Agent",status:"success",tool_input:{subagent_type:"etrnl-executor",description:"bounded implementation",packet:{mode:"write",goal:"bounded task"}}}')"
run_hook cc-posttoolbatch-observer.sh "$agent_event" >/dev/null || true
agent_state="$TMPROOT/claude-guard-fixture-agent-observer.json"
assert_json_expr "implementation agent recorded" "$(jq -c . "$agent_state")" 'any(.agentCalls[]?.value; test("subagent=etrnl-executor") and test("mode=write"))'
review_agent_event="$(jq -cn '{session_id:"fixture-reviewer-observer",tool_name:"Task",status:"success",tool_input:{subagent_type:"etrnl-spec-reviewer",description:"review spec",packet:{mode:"read-only",goal:"review implemented plan"}}}')"
run_hook cc-posttoolbatch-observer.sh "$review_agent_event" >/dev/null || true
review_agent_state="$TMPROOT/claude-guard-fixture-reviewer-observer.json"
assert_json_expr "reviewer agent recorded separately" "$(jq -c . "$review_agent_state")" 'any(.reviewerAgentCalls[]?.value; test("subagent=etrnl-spec-reviewer"))'

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
assert_json_expr "first failure emits context only" "$out" '.hookSpecificOutput.hookEventName == "PostToolUseFailure"'
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$failure_json")"
assert_contains "repeated failure pivots" "$out" "repeated"
large_failure_json="$(jq -cn '{session_id:"fixture-large-failure",tool_name:"Read",tool_input:{file_path:"/tmp/huge-output.txt"},error:"File content exceeds maximum allowed tokens"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$large_failure_json")"
assert_contains "large-output failure gets targeted diagnostic" "$out" "targeted read/search"
serena_large_failure_json="$(jq -cn '{session_id:"fixture-serena-large-failure",tool_name:"mcp__serena__search_for_pattern",tool_input:{substring_pattern:"needle"},error:"Error: result (43,867 characters) exceeds maximum allowed tokens. Output has been saved to /tmp/mcp-plugin_serena_serena-search_for_pattern.txt"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$serena_large_failure_json")"
assert_contains "serena large-output failure gets scoped diagnostic" "$out" "narrower relative_path"
serena_unscoped_json="$(jq -cn '{session_id:"fixture-serena-preflight",tool_name:"mcp__serena__search_for_pattern",tool_input:{substring_pattern:"needle",max_answer_chars:12000}}')"
out="$(ETRNL_SERENA_SCOPE_GUARD=1 run_hook cc-pretooluse-guard.sh "$serena_unscoped_json")"
assert_json_expr "serena unscoped search denied before output blowup" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "serena unscoped search reason" "$out" "must be scoped"
serena_uncapped_json="$(jq -cn '{session_id:"fixture-serena-preflight",tool_name:"mcp__serena__search_for_pattern",tool_input:{substring_pattern:"needle",relative_path:"src"}}')"
out="$(ETRNL_SERENA_SCOPE_GUARD=1 run_hook cc-pretooluse-guard.sh "$serena_uncapped_json")"
assert_json_expr "serena uncapped search denied before output blowup" "$out" '.hookSpecificOutput.permissionDecision == "deny"'
assert_contains "serena uncapped search reason" "$out" "max_answer_chars"
serena_scoped_json="$(jq -cn '{session_id:"fixture-serena-preflight",tool_name:"mcp__serena__search_for_pattern",tool_input:{substring_pattern:"needle",relative_path:"src",max_answer_chars:12000,context_lines_before:2,context_lines_after:2}}')"
out="$(ETRNL_SERENA_SCOPE_GUARD=1 run_hook cc-pretooluse-guard.sh "$serena_scoped_json")"
assert_json_expr "serena scoped bounded search allowed" "$out" '.continue == true'
email_guard_failure_json="$(jq -cn '{session_id:"fixture-email-guard-failure",tool_name:"Bash",tool_input:{command:"vivaz-email triage guarded-run --account agencia --apply --require-insights"},error:"TRIAGE_GUARD_ML_DISAGREED: ML archive review found 1 disagreement"}')"
out="$(run_hook cc-posttoolusefailure-diagnose.sh "$email_guard_failure_json")"
assert_contains "email triage ML disagreement gets recovery diagnostic" "$out" "triage ml-reviews"
assert_contains "email triage ML disagreement avoids asking repository owner" "$out" "not a question for the repository owner"

rate_event="$(jq -cn '{session_id:"fixture-rate",tool_name:"Bash",tool_input:{command:"rg -n value src"}}')"
run_hook cc-rate-limiter.sh "$rate_event" >/dev/null || true
out="$(ETRNL_RATE_LIMITER_RAPID_THRESHOLD=1 run_hook cc-rate-limiter.sh "$rate_event")"
assert_contains "rate limiter emits pace context" "$out" "Pace check"

warning_edit_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-warning-debounce",tool_name:"Edit",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
out="$(run_hook cc-posttoolbatch-observer.sh "$warning_edit_event")"
assert_contains "observer emits first stale-quality warning" "$out" "Quality verification"
warning_non_edit_event="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-warning-debounce",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n value src/app.ts"}}')"
out="$(run_hook cc-posttoolbatch-observer.sh "$warning_non_edit_event")"
if [[ -z "$out" ]]; then ok "observer debounces duplicate stale-quality warning"; else not_ok "observer debounces duplicate stale-quality warning: $out"; fi

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
out="$(run_hook cc-pretooluse-guard.sh "$bug_edit")"
if [[ "$out" == *"Previous bug notes"* ]]; then
  not_ok "bug memory suggestion debounced in session"
else
  ok "bug memory suggestion debounced in session"
fi
bug_disabled_read="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-disabled",tool_name:"Read",status:"success",cwd:$root,tool_input:{file_path:($root + "/src/app.ts")}}')"
run_hook cc-posttoolbatch-observer.sh "$bug_disabled_read" >/dev/null || true
bug_disabled_search="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-disabled",tool_name:"Bash",status:"success",cwd:$root,tool_input:{command:"rg -n value src/app.ts"}}')"
run_hook cc-posttoolbatch-observer.sh "$bug_disabled_search" >/dev/null || true
bug_disabled_edit="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-bug-disabled",tool_name:"Edit",cwd:$root,tool_input:{file_path:($root + "/src/app.ts"),old_string:"export const value = 1;",new_string:"export const value = 4;"}}')"
out="$(ETRNL_LEARNING_HINTS=0 run_hook cc-pretooluse-guard.sh "$bug_disabled_edit")"
if [[ "$out" == *"Previous bug notes"* ]]; then
  not_ok "bug memory disabled by env flag"
else
  ok "bug memory disabled by env flag"
fi

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

paused_prod_state="$TMPROOT/claude-guard-fixture-paused-prod-status.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],activePlanPath:"",activePlanPathUpdatedAt:"",planExecutionRequested:false,planExecutionRequestedAt:"",lastPrompt:"did u read the handoff file?",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$paused_prod_state"
paused_prod_message=$'Yes. It was injected as the restored handoff.\n\n1. Check PR #53 CI - green\n2. Merge - done\n3. Deploy to prod metacards-painel - was watching GHCR build-and-push, in_progress\n4. Set bruno to master in prod DB - only AFTER deploy\n\nBefore I SSH into prod: do you want me to proceed with the deploy once the GHCR build is green?\nNothing is live yet. Awaiting your answer before I SSH to prod.'
paused_prod_stop="$(jq -cn --arg message "$paused_prod_message" '{session_id:"fixture-paused-prod-status",last_assistant_message:$message,stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$paused_prod_stop")"
if [[ -z "$out" ]]; then ok "stop verifier allows paused production status"; else not_ok "paused production status should not claim completion: $out"; fi

true_completion_pending_stop="$(jq -cn '{session_id:"fixture-true-completion-pending-token",last_assistant_message:"Done. Tests pass. No live change needed; nothing pending.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$true_completion_pending_stop")"
assert_contains "stop verifier keeps true completion despite incidental work-state token" "$out" "claim completion without verification evidence"

advice_state="$TMPROOT/claude-guard-fixture-advice.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"which iPhone should I buy today?",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$advice_state"
advice_missing_stop="$(jq -cn '{session_id:"fixture-advice",last_assistant_message:"Done, I recommend the Pro model.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$advice_missing_stop")"
assert_contains "advice stop requires dated source evidence" "$out" "Advice/search completion requires current source evidence"
advice_ok_stop="$(jq -cn '{session_id:"fixture-advice",last_assistant_message:"Done. As of May 26, 2026, Apple lists current iPhone models at https://www.apple.com/iphone/ and carrier pricing varies by plan.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$advice_ok_stop")"
if [[ -z "$out" ]]; then ok "advice answer with dated URL satisfies stop"; else not_ok "advice answer with dated URL should pass: $out"; fi
advice_far_source_stop="$(jq -cn '{session_id:"fixture-advice",last_assistant_message:"Done. As of May 26, 2026, Apple lists current iPhone models.\nhttps://www.apple.com/iphone/",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$advice_far_source_stop")"
if [[ -z "$out" ]]; then ok "advice multiline dated URL satisfies stop"; else not_ok "advice multiline dated URL should pass: $out"; fi
long_advice_state="$TMPROOT/claude-guard-fixture-long-advice.json"
long_prompt="$(printf 'search database library %.0s' $(seq 1 80))"
jq -nc --arg prompt "$long_prompt" '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:$prompt,lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$long_advice_state"
long_advice_stop="$(jq -cn '{session_id:"fixture-long-advice",last_assistant_message:"Here is the technical context.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$long_advice_stop")"
if [[ -z "$out" ]]; then ok "long technical prompt does not trigger advice source gate"; else not_ok "long technical prompt should not trigger advice source gate: $out"; fi

mkdir -p "$TMPROOT/bin"
cat >"$TMPROOT/bin/vivaz-email" <<'BASH'
#!/usr/bin/env bash
if [[ "${VIVAZ_EMAIL_VERIFY_FAIL:-0}" == "1" ]]; then exit 1; fi
if [[ "$1 $2" == "triage verify" ]]; then
  if [[ "${VIVAZ_EMAIL_VERIFY_DRY:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":true,"gmail_mutated":false,"inbox_zero_verified":false,"inbox_count":5}}\n'
  elif [[ "${VIVAZ_EMAIL_VERIFY_READY:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":true,"gmail_mutated":false,"inbox_zero_verified":true,"queue_ready_without_mutation":true,"inbox_count":0,"action_backlog_count":31}}\n'
  elif [[ "${VIVAZ_EMAIL_VERIFY_NONZERO:-0}" == "1" ]]; then
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":1}}\n'
  else
    printf '{"ok":true,"data":{"verified":true,"dry_run":false,"gmail_mutated":true,"inbox_zero_verified":true,"inbox_count":0}}\n'
  fi
  exit 0
fi
exit 0
BASH
chmod +x "$TMPROOT/bin/vivaz-email"

email_triage_missing_state="$TMPROOT/claude-guard-fixture-email-triage-missing.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_missing_state"
email_triage_missing_stop="$(jq -cn '{session_id:"fixture-email-triage-missing",last_assistant_message:"Done, email triage complete.",stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_missing_stop")"
assert_contains "email triage stop requires runtime apply command" "$out" "vivaz-email triage guarded-run --account <id> --max-inbox 500 --apply --require-insights"

email_triage_ok_state="$TMPROOT/claude-guard-fixture-email-triage-ok.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"vivaz-email triage guarded-run --account agencia --max-inbox 50 --apply --require-insights",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_ok_state"
email_triage_ok_queue="# Email Reply Queue"$'\n\n'"Run: triage_fixture_agencia"$'\n'"Account: agencia"$'\n'"Status: verified"$'\n'"Queue mode: reply"$'\n'"Open queue items: 1"$'\n'"All action items: 1"$'\n\n'"### 1. P0 100 - urgent contract"$'\n\n'"Recommended handling: Review draft, then send only after the repository owner explicitly approves this specific reply."$'\n\n'"## Next Step"$'\n\n'"- Ask the repository owner to approve/send the exact visible draft, rewrite it, skip it, or show the next item."
email_triage_ok_stop="$(jq -cn --arg message "$email_triage_ok_queue" '{session_id:"fixture-email-triage-ok",last_assistant_message:$message,stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_ok_stop")"
if [[ -z "$out" ]]; then ok "email triage queue satisfies stop"; else not_ok "email triage queue should pass: $out"; fi

email_triage_dry_state="$TMPROOT/claude-guard-fixture-email-triage-dry.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"vivaz-email triage run --account agencia --max-inbox 50",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_dry_state"
email_triage_dry_stop="$(jq -cn --arg message "$email_triage_ok_queue" '{session_id:"fixture-email-triage-dry",last_assistant_message:$message,stop_hook_active:false}')"
out="$(VIVAZ_EMAIL_VERIFY_DRY=1 PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_dry_stop")"
assert_contains "email triage dry run does not satisfy inbox zero" "$out" "queue_ready_without_mutation true"

out="$(VIVAZ_EMAIL_VERIFY_READY=1 PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_ok_stop")"
if [[ -z "$out" ]]; then ok "email triage no-mutation ready queue satisfies stop"; else not_ok "email triage no-mutation ready queue should pass: $out"; fi
email_auth_explainer_stop="$(jq -cn '{session_id:"fixture-email-triage-missing",last_assistant_message:"What I verified: the Authentication-Results headers show SPF and DKIM pass for this sender domain. That answers the spoofing question; it is not a queue result.",stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_auth_explainer_stop")"
if [[ -z "$out" ]]; then ok "email authentication explanation does not trigger triage completion gate"; else not_ok "email auth explanation should pass: $out"; fi

out="$(VIVAZ_EMAIL_VERIFY_NONZERO=1 PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_ok_stop")"
assert_contains "email triage nonzero inbox does not satisfy inbox zero" "$out" "provider-verified INBOX zero"

email_triage_active_complete_stop="$(jq -cn --arg message "Agencia triage complete. Queue #1 active."$'\n\n'"$email_triage_ok_queue" '{session_id:"fixture-email-triage-ok",last_assistant_message:$message,stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_active_complete_stop")"
assert_contains "email triage active queue cannot be called complete" "$out" "queue is not complete"

email_triage_missing_context_report="# Email Triage Report"$'\n\n'"Run: triage_fixture_agencia"$'\n\n'"## Top Action Items"$'\n\n'"- P0 item"$'\n\n'"## Reply Queue"$'\n\n'"### 1. P0 item"$'\n\n'"## Action Items"$'\n\n'"- item"
email_triage_missing_context_stop="$(jq -cn --arg message "$email_triage_missing_context_report" '{session_id:"fixture-email-triage-ok",last_assistant_message:$message,stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_missing_context_stop")"
assert_contains "email triage report missing latest/backlog blocked" "$out" "explicit audit report"

email_triage_summary_stop="$(jq -cn '{session_id:"fixture-email-triage-ok",last_assistant_message:"Inbox zero verified for agencia.",stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_summary_stop")"
assert_contains "email triage one-line summary blocked" "$out" "one-line inbox-zero summary is not actionable"

email_triage_report_state="$TMPROOT/claude-guard-fixture-email-triage-report.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{command:"vivaz-email triage report --run-id triage_2026-05-14T18-23-14-478Z_agencia_6219c271 --format markdown",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"email-triage",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"/email-triage agencia",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$email_triage_report_state"
email_triage_ok_report="# Email Triage Report"$'\n\n'"Run: triage_fixture_agencia"$'\n\n'"## Latest Thread State"$'\n\n'"- Latest thread state checked against the most recent message."$'\n\n'"## Pre-existing Action Backlog"$'\n\n'"- Pre-existing action backlog reviewed before archive/action decisions."$'\n\n'"## Top Action Items"$'\n\n'"- P0 item"$'\n\n'"## Reply Queue"$'\n\n'"### 1. P0 item"$'\n\n'"Proposed reply:"$'\n\n'"## Action Items"$'\n\n'"- item"
email_triage_report_stop="$(jq -cn --arg message "$email_triage_ok_report" '{session_id:"fixture-email-triage-report",last_assistant_message:$message,stop_hook_active:false}')"
out="$(PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_report_stop")"
if [[ -z "$out" ]]; then ok "email triage explicit report run satisfies stop"; else not_ok "email triage explicit report run should pass: $out"; fi

out="$(VIVAZ_EMAIL_VERIFY_FAIL=1 PATH="$TMPROOT/bin:$PATH" run_hook cc-stop-verifier.sh "$email_triage_ok_stop")"
assert_contains "email triage failed ledger blocks stop" "$out" "latest vivaz-email triage ledger"

stale_state="$TMPROOT/claude-guard-fixture-stale.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{"/tmp/a.ts":"2026-01-01T00:00:02Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$stale_state"
stale_stop="$(jq -cn '{session_id:"fixture-stale",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$stale_stop")"
assert_contains "stop verifier blocks stale verification" "$out" "stale verification"

# Schema-edit migration evidence matrix
schema_missing_state="$TMPROOT/claude-guard-fixture-schema-missing.json"
jq -nc '{schemaVersion:2,reads:{},searches:{},edits:{"/tmp/example/prisma/schema.prisma":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],blockedCommands:[],successfulCommands:[],commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$schema_missing_state"
schema_missing_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-schema-missing",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$schema_missing_stop")"
assert_contains "schema edit without migration verification blocked" "$out" "schema-related edits without migration evidence"

schema_ok_state="$TMPROOT/claude-guard-fixture-schema-ok.json"
jq -nc '{schemaVersion:2,reads:{},searches:{},edits:{"/tmp/example/prisma/schema.prisma":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"},{value:"npx prisma migrate status",at:"2026-01-01T00:00:03Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],blockedCommands:[],successfulCommands:[],commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$schema_ok_state"
schema_ok_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-schema-ok",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$schema_ok_stop")"
if [[ -z "$out" ]]; then ok "schema edit with migration verification allowed"; else not_ok "schema edit with migration verification should pass: $out"; fi

for bunx_cmd in "bunx --bun prisma migrate status" "bunx --bun prisma migrate deploy" "bunx --bun prisma migrate resolve"; do
  bunx_state_id="$(printf '%s' "$bunx_cmd" | tr -cs '[:alnum:]' '-')"
  schema_bunx_state="$TMPROOT/claude-guard-fixture-schema-bunx-${bunx_state_id}.json"
  jq -nc --arg cmd "$bunx_cmd" '{schemaVersion:2,reads:{},searches:{},edits:{"/tmp/example/prisma/schema.prisma":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"},{value:$cmd,at:"2026-01-01T00:00:03Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],blockedCommands:[],successfulCommands:[],commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$schema_bunx_state"
  schema_bunx_stop="$(jq -cn --arg root "$TMPROOT/example" --arg sid "$bunx_state_id" '{session_id:("fixture-schema-bunx-" + $sid),cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
  out="$(run_hook cc-stop-verifier.sh "$schema_bunx_stop")"
  if [[ -z "$out" ]]; then ok "schema edit with $bunx_cmd allowed"; else not_ok "schema edit with $bunx_cmd should pass: $out"; fi
done

schema_bunx_negative_state="$TMPROOT/claude-guard-fixture-schema-bunx-negative.json"
jq -nc '{schemaVersion:2,reads:{},searches:{},edits:{"/tmp/example/prisma/schema.prisma":"2026-01-01T00:00:01Z"},commands:[],failures:[],skillCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"},{value:"bunx --bun prisma db push",at:"2026-01-01T00:00:03Z"}],qualityRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],testRuns:[{value:"pnpm test",at:"2026-01-01T00:00:02Z"}],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],blockedCommands:[],successfulCommands:[],commandLastEditGeneration:{},prodApprovalMarkers:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$schema_bunx_negative_state"
schema_bunx_negative_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-schema-bunx-negative",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$schema_bunx_negative_stop")"
assert_contains "schema edit with bunx non-migrate command blocked" "$out" "schema-related edits without migration evidence"

# Non-schema edit permit path is already covered by fixture-fresh-quality above.
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
jq '.reviewRuns = [{value:"etrnl-dev-review",at:"2026-01-01T00:00:03Z"}]' "$review_state" >"$review_state.tmp" && mv "$review_state.tmp" "$review_state"
out="$(run_hook cc-stop-verifier.sh "$review_stop")"
if [[ -z "$out" ]]; then ok "second-pass review evidence satisfies broad edits"; else not_ok "second-pass review evidence should satisfy broad edits: $out"; fi

requested_state="$TMPROOT/claude-guard-fixture-requested.json"
jq -nc '{schemaVersion:1,reads:{},searches:{},edits:{},commands:[],failures:[],skillCalls:[],requestedSkills:[{value:"etrnl-dev-plan",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],newFileSearches:[],lastPrompt:"",lastCompactSummary:"",cwd:"",settingsFingerprint:"",startedAt:""}' >"$requested_state"
requested_stop="$(jq -cn '{session_id:"fixture-requested",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$requested_stop")"
assert_contains "stop verifier blocks missing requested skill" "$out" "requested skill"

doc_health_state="$TMPROOT/claude-guard-fixture-doc-health.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],activePlanPath:"",activePlanPathUpdatedAt:"",planExecutionRequested:false,planExecutionRequestedAt:"",lastPrompt:"run documentation health",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$doc_health_state"
doc_health_stop="$(jq -cn '{session_id:"fixture-doc-health",last_assistant_message:"Done, docs look fine.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$doc_health_stop")"
assert_contains "documentation health blocks shallow completion" "$out" "coverage counters"
jq '.successfulCommands += [{value:"node ~/.claude/scripts/documentation-comment-health.mjs --root . --json --include-untracked",at:"2026-01-01T00:00:02Z"},{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:03Z"}] | .verificationRuns += [{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:03Z"}]' "$doc_health_state" >"$doc_health_state.tmp" && mv "$doc_health_state.tmp" "$doc_health_state"
doc_health_full_message=$'Done.\n\n# Documentation Health Audit\n\n## Documentation Inventory\ncanonical docs and secondary docs classified.\n\n## Freshness And Drift Proof\nsource_of_truth matrix checked; stale reference searches covered old architecture names and active plan queues.\n\n## 10. TSDoc/JSDoc And Comments\nComment Health classified useful, missing, stale, misleading, noise, and wrong-format targets.\n\n## Findings Ledger\n| severity | source_of_truth | disposition | verification |\n| --- | --- | --- | --- |\n| P2 | scripts/install.sh | fixed | scripts/doctor.sh passed |\n\n## Action Items\nAll action items are terminal.\n\n## Resolution Plan\nImmediate fixes are verified.\n\n## Scorecard\nTSDoc/JSDoc/comment health: 8/10\nOverall documentation health: 8/10\n\nDOCS_FILES_TOTAL: 12\nDOCS_FILES_REVIEWED: 12\nSOURCE_FILES_SAMPLED_OR_REVIEWED: 6\nRECENT_COMMITS_REVIEWED: 5\nRECENT_PRS_REVIEWED: 2\nRECENT_CHANGE_DOC_IMPACT_CHECKS: 4\nDOC_CLAIMS_CHECKED: 14\nSOURCE_TRUTH_MAPPINGS_REVIEWED: 8\nSTALE_REFERENCE_SEARCHES_RUN: 5\nOUTDATED_DOC_CLAIMS_FOUND: 1\nOUTDATED_DOC_CLAIMS_REMAINING: 0\nSTALE_DOCS_FOUND: 1\nSTALE_DOCS_REMAINING: 0\nMISLEADING_DOCS_FOUND: 0\nMISLEADING_DOCS_REMAINING: 0\nACTIVE_PLAN_QUEUE_DOCS_REVIEWED: 2\nACTIVE_PLAN_QUEUE_DOCS_STALE: 0\nTSDOC_JSDOC_FILES_SCANNED: 4\nCOMMENT_TARGETS_REVIEWED: 9\nCOMMENT_TARGETS_DOCUMENTED: 7\nCOMMENT_TARGETS_MISSING_DOCS: 2\nCOMMENT_TARGETS_WRONG_FORMAT: 0\nAI_CONTEXT_FILES_REVIEWED: 3\nAI_CONTEXT_DRIFT_FINDINGS: 0\nAI_CONTEXT_DUPLICATE_RULE_OWNERS: 0\nAI_CONTEXT_HOT_PATH_LEAKS: 0\nCHECKS_SKIPPED: []\nFINAL_DOC_HEALTH_SCORE: 82/100\n'
doc_health_full_stop="$(jq -cn --arg message "$doc_health_full_message" '{session_id:"fixture-doc-health",last_assistant_message:$message,stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$doc_health_full_stop")"
if [[ -z "$out" ]]; then ok "documentation health complete report satisfies stop gate"; else not_ok "documentation health complete report should satisfy stop gate: $out"; fi

doc_health_baseline_state="$TMPROOT/claude-guard-fixture-doc-health-baseline.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{"/tmp/example/docs/policy/COMMENT_HEALTH_BASELINE.json":"2026-01-01T00:00:03Z"},commands:[],blockedCommands:[],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"},{value:"node ~/.claude/scripts/documentation-comment-health.mjs --root . --json --include-untracked",at:"2026-01-01T00:00:02Z"},{value:"pnpm docs:comments:baseline",at:"2026-01-01T00:00:03Z"},{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:04Z"}],failures:[],skillCalls:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"etrnl-audit-docs",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"node ~/.claude/scripts/documentation-health-ledger-check.mjs --report /tmp/doc-health.md",at:"2026-01-01T00:00:04Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],activePlanPath:"",activePlanPathUpdatedAt:"",planExecutionRequested:false,planExecutionRequestedAt:"",lastPrompt:"run documentation health",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$doc_health_baseline_state"
doc_health_baseline_message="${doc_health_full_message}"$'\nBaseline written: docs/policy/COMMENT_HEALTH_BASELINE.json\n'
doc_health_baseline_stop="$(jq -cn --arg message "$doc_health_baseline_message" '{session_id:"fixture-doc-health-baseline",last_assistant_message:$message,stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$doc_health_baseline_stop")"
assert_contains "documentation health blocks baseline-only completion" "$out" "Baseline files quantify existing debt"

code_health_state="$TMPROOT/claude-guard-fixture-code-health.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}],failures:[],skillCalls:[{value:"etrnl-audit-code",at:"2026-01-01T00:00:00Z"}],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[{value:"etrnl-audit-code",at:"2026-01-01T00:00:00Z"}],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked",at:"2026-01-01T00:00:01Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],activePlanPath:"",activePlanPathUpdatedAt:"",planExecutionRequested:false,planExecutionRequestedAt:"",lastPrompt:"run code health",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$code_health_state"
code_health_stop="$(jq -cn '{session_id:"fixture-code-health",last_assistant_message:"Done, code looks fine.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$code_health_stop")"
assert_contains "code health blocks shallow completion" "$out" "coverage counters"
jq '.successfulCommands += [{value:"tests/test-workflow-tools.sh",at:"2026-01-01T00:00:02Z"}] | .verificationRuns += [{value:"tests/test-workflow-tools.sh",at:"2026-01-01T00:00:02Z"}]' "$code_health_state" >"$code_health_state.tmp" && mv "$code_health_state.tmp" "$code_health_state"
code_health_full_message=$'Done.\n\n# Code Health Audit\n\n## Coverage Map\nEvery tracked file inventoried and exclusions are listed with reasons.\n\n## Findings Ledger\n| severity | evidence | disposition | verification |\n| --- | --- | --- | --- |\n| P1 | scripts/example.ts | fixed | tests/test-workflow-tools.sh passed |\n\n## Action Items\nAll action items are terminal.\n\n## Resolution Plan\nEvery valid finding is fixed.\n\n## Final Gate Status\nHealth stack passed.\n\nCODE_HEALTH_FILES_TOTAL: 10\nCODE_HEALTH_FILES_AUDITED: 8\nACTION_ITEMS_TOTAL: 1\nACTION_ITEMS_OPEN: 0\nACTION_ITEMS_TERMINAL: 1\nCHECKS_SKIPPED: []\nFINAL_CODE_HEALTH_SCORE: 100/100\n'
code_health_full_stop="$(jq -cn --arg message "$code_health_full_message" '{session_id:"fixture-code-health",last_assistant_message:$message,stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$code_health_full_stop")"
if [[ -z "$out" ]]; then ok "code health complete report satisfies stop gate"; else not_ok "code health complete report should satisfy stop gate: $out"; fi

plan_execution_no_ledger_state="$TMPROOT/claude-guard-fixture-plan-execution-no-ledger.json"
jq -nc '{schemaVersion:4,reads:{},searches:{},edits:{},commands:[],blockedCommands:[],successfulCommands:[],failures:[],skillCalls:[],agentCalls:[],reviewerAgentCalls:[],requestedSkills:[],evidenceChallenges:[],evidenceDisciplineViolations:[],evidenceViolationFingerprints:{},warningFingerprints:{},verificationRuns:[{value:"pnpm test",at:"2026-01-01T00:00:01Z"}],qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:{},editCounts:{},largeEdits:[],repeatedEditFiles:{},reviewTriggers:[],editGeneration:0,commandLastEditGeneration:{},prodApprovalMarkers:[],activePlanPath:"docs/plans/example.md",activePlanPathUpdatedAt:"2026-01-01T00:00:00Z",planExecutionRequested:true,planExecutionRequestedAt:"2026-01-01T00:00:00Z",lastPrompt:"implement now",lastCompactSummary:"",lastCompactAt:"",compactCount:0,cwd:"",settingsFingerprint:"",startedAt:"2026-01-01T00:00:00Z"}' >"$plan_execution_no_ledger_state"
plan_execution_no_ledger_stop="$(jq -cn '{session_id:"fixture-plan-execution-no-ledger",last_assistant_message:"Done, implemented the plan.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$plan_execution_no_ledger_stop")"
assert_contains "plan execution completion requires ledger" "$out" "No active execution ledger"

execute_no_agent_state="$TMPROOT/claude-guard-fixture-execute-no-agent.json"
jq -nc '{
  schemaVersion: 3,
  reads: {},
  searches: {},
  edits: {
    "/tmp/example/src/a.ts": "2026-01-01T00:00:01Z",
    "/tmp/example/src/b.ts": "2026-01-01T00:00:01Z"
  },
  commands: [],
  blockedCommands: [],
  successfulCommands: [],
  failures: [],
  skillCalls: [{value:"etrnl-dev-execute", at:"2026-01-01T00:00:00Z"}],
  agentCalls: [],
  reviewerAgentCalls: [],
  requestedSkills: [{value:"etrnl-dev-execute", at:"2026-01-01T00:00:00Z"}],
  evidenceChallenges: [],
  evidenceDisciplineViolations: [],
  verificationRuns: [{value:"pnpm test", at:"2026-01-01T00:00:02Z"}],
  qualityRuns: [{value:"pnpm test", at:"2026-01-01T00:00:02Z"}],
  testRuns: [{value:"pnpm test", at:"2026-01-01T00:00:02Z"}],
  browserRuns: [],
  reviewRuns: [{value:"etrnl-dev-review", at:"2026-01-01T00:00:02Z"}],
  newFileSearches: [],
  newSourceFiles: {},
  editCounts: {},
  largeEdits: [],
  repeatedEditFiles: {},
  reviewTriggers: [],
  editGeneration: 0,
  commandLastEditGeneration: {},
  prodApprovalMarkers: [],
  lastPrompt: "",
  lastCompactSummary: "",
  cwd: "",
  settingsFingerprint: "",
  startedAt: "2026-01-01T00:00:00Z"
}' >"$execute_no_agent_state"
execute_no_agent_stop="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-execute-no-agent",cwd:$root,last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$execute_no_agent_stop")"
assert_contains "etrnl-dev-execute multi-file source edits require implementation agent" "$out" "implementation subagent"
jq '.agentCalls = [{value:"subagent=etrnl-scout mode=read-only goal=discovery", at:"2026-01-01T00:00:01Z"}]' "$execute_no_agent_state" >"$execute_no_agent_state.tmp" && mv "$execute_no_agent_state.tmp" "$execute_no_agent_state"
out="$(run_hook cc-stop-verifier.sh "$execute_no_agent_stop")"
assert_contains "read-only scout does not satisfy implementation gate" "$out" "implementation subagent"
jq '.agentCalls = [{value:"subagent=etrnl-executor mode=write taskId=T1 lineageId=wave-1.T1 goal=bounded task packetHash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", at:"2026-01-01T00:00:01Z"}]' "$execute_no_agent_state" >"$execute_no_agent_state.tmp" && mv "$execute_no_agent_state.tmp" "$execute_no_agent_state"
out="$(run_hook cc-stop-verifier.sh "$execute_no_agent_stop")"
assert_contains "etrnl-dev-execute implementation without reviewers blocks" "$out" "reviewer subagent"
jq '.reviewerAgentCalls = [{value:"subagent=etrnl-spec-reviewer mode=read-only taskId=T1 lineageId=wave-1.T1 goal=spec review packetHash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", at:"2026-01-01T00:00:02Z"}]' "$execute_no_agent_state" >"$execute_no_agent_state.tmp" && mv "$execute_no_agent_state.tmp" "$execute_no_agent_state"
out="$(run_hook cc-stop-verifier.sh "$execute_no_agent_stop")"
assert_contains "etrnl-dev-execute missing quality reviewer blocks" "$out" "reviewer subagent"
jq '.reviewerAgentCalls = [{value:"subagent=etrnl-spec-reviewer mode=read-only taskId=T1 lineageId=wave-1.T1 goal=spec review packetHash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", at:"2026-01-01T00:00:02Z"},{value:"subagent=etrnl-quality-reviewer mode=read-only taskId=T1 lineageId=wave-1.T1 goal=quality review packetHash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", at:"2026-01-01T00:00:03Z"}]' "$execute_no_agent_state" >"$execute_no_agent_state.tmp" && mv "$execute_no_agent_state.tmp" "$execute_no_agent_state"
jq '.verificationRuns += [{value:"red_green_verified", at:"2026-01-01T00:00:04Z"}] | .successfulCommands += [{command:"code-simplifier reviewed", at:"2026-01-01T00:00:05Z"}]' "$execute_no_agent_state" >"$execute_no_agent_state.tmp" && mv "$execute_no_agent_state.tmp" "$execute_no_agent_state"
out="$(run_hook cc-stop-verifier.sh "$execute_no_agent_stop")"
if [[ -z "$out" ]]; then ok "etrnl-dev-execute implementation plus reviewer agents satisfies stop gate"; else not_ok "etrnl-dev-execute implementation plus reviewer agents should satisfy stop gate: $out"; fi

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
assert_json_expr "precompact writes durable ETRNL state without raw prompt" "$(jq -s -c . "$ETRNL_STATE_DIR/events.jsonl")" 'any(.[]; .eventKind == "compact_pre" and .sessionId == "fixture-session" and (.data | has("lastPrompt") | not))'
postcompact_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"PostCompact",summary:"compact persisted"}')"
run_hook cc-postcompact-record.sh "$postcompact_json" >/dev/null
assert_json_expr "postcompact records recovery metadata" "$(jq -c . "$TMPROOT/claude-guard-fixture-session.json")" '.lastCompactSummary == "compact persisted" and .lastCompactAt != "" and .compactCount == 1'
assert_json_expr "postcompact marks durable verification stale" "$(jq -s -c . "$ETRNL_STATE_DIR/events.jsonl")" 'any(.[]; .eventKind == "compact_post" and .sessionId == "fixture-session" and .data.verificationStale == true)'
session_json="$(jq -cn '{session_id:"fixture-session",hook_event_name:"SessionStart",source:"compact"}')"
out="$(run_hook cc-sessionstart-restore.sh "$session_json")"
assert_json_expr "session compact restores context" "$out" '.hookSpecificOutput.additionalContext | test("Compact recovery")'
assert_json_expr "session compact uses ETRNL handoff fast path" "$out" '.hookSpecificOutput.additionalContext | test("verification_stale=true")'
assert_contains "session start injects ETRNL skill hint" "$out" "ETRNL skills"
compact_stale_stop="$(jq -cn '{session_id:"fixture-session",last_assistant_message:"Done, tests pass.",stop_hook_active:false}')"
out="$(run_hook cc-stop-verifier.sh "$compact_stale_stop")"
assert_contains "stop verifier blocks stale compact verification" "$out" "Verification is stale after compact"

node "$ROOT/scripts/execution-ledger.mjs" init --session fixture-session-status --plan "$ROOT/hooks/fixtures/plans/good-plan.md" >/dev/null
node "$ROOT/scripts/execution-ledger.mjs" set-task --session fixture-session-status --task T1 --title Task --status in_progress
status_session_json="$(jq -cn '{session_id:"fixture-session-status",hook_event_name:"SessionStart"}')"
out="$(run_hook cc-sessionstart-restore.sh "$status_session_json")"
assert_contains "session start injects workflow status" "$out" "Workflow status:"
assert_contains "session start workflow status names unfinished work" "$out" "unfinished=1"
startup_buglog_path="$TMPROOT/artifacts/project-buglog.jsonl"
ETRNL_BUGLOG="$startup_buglog_path" node "$ROOT/scripts/project-buglog.mjs" record --cwd "$ROOT" --file scripts/example.mjs --category repeated-edit --summary "repeat startup hint" >/dev/null
out="$(ETRNL_BUGLOG="$startup_buglog_path" ETRNL_LEARNING_STARTUP_HINTS=1 run_hook cc-sessionstart-restore.sh "$status_session_json")"
assert_contains "session start can inject project learning hints" "$out" "Project learning hints:"

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
wrapped_packet_prompt="$(jq -cn '{packet:{mode:"read-only",goal:"inspect wrapped prompt",context_summary:"repo facts and constraints",cwd:"/repo",scope:"scripts",read_set:["scripts"],expected_output:"summary",no_revert:true}}')"
agent_wrapped="$(jq -cn --arg prompt "$wrapped_packet_prompt" '{session_id:"fixture-task-wrapped-prompt",tool_name:"Task",tool_input:{subagent_type:"etrnl-scout",prompt:$prompt}}')"
out="$(run_hook cc-pretooluse-guard.sh "$agent_wrapped")"
assert_json_expr "prompt-wrapped task packet with aliases allowed" "$out" '.continue == true'
run_hook cc-posttoolbatch-observer.sh "$(jq '.status = "success"' <<<"$agent_wrapped")" >/dev/null || true
wrapped_agent_state="$TMPROOT/claude-guard-fixture-task-wrapped-prompt.json"
assert_json_expr "observer records prompt-wrapped task packet mode" "$(jq -c . "$wrapped_agent_state")" 'any(.agentCalls[]?.value; test("subagent=etrnl-scout") and test("mode=read-only"))'

agent_fallback_state="$TMPROOT/claude-guard-fixture-agent-packet-fallback.json"
jq -nc '{schemaVersion:4,requestedSkills:[{value:"etrnl-dev-execute",at:"2026-01-01T00:00:00Z"}],planExecutionRequested:true}' >"$agent_fallback_state"
bad_agent_prompt='{"packet":{"mode":"write"}} trailing prose'
agent_packet_bad="$(jq -cn --arg root "$TMPROOT/example" --arg prompt "$bad_agent_prompt" '{session_id:"fixture-agent-packet-fallback",tool_name:"Agent",cwd:$root,tool_input:{subagent_type:"claude",description:"bad packet",prompt:$prompt}}')"
out="$(run_hook cc-pretooluse-guard.sh "$agent_packet_bad")"
assert_contains "malformed agent packet tells retry" "$out" "JSON-only task packet"
assert_contains "malformed agent packet names template command" "$out" "agent-task-packet-check.mjs --template"
fallback_edit="$(jq -cn --arg root "$TMPROOT/example" '{session_id:"fixture-agent-packet-fallback",tool_name:"Edit",cwd:$root,tool_input:{file_path:($root + "/src/app.ts"),old_string:"export const value = 1;",new_string:"export const value = 2;"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$fallback_edit")"
assert_contains "agent packet failure blocks direct source fallback" "$out" "malformed packet is not a sequential-degraded blocker"

# State migration matrix
migration_state="$TMPROOT/claude-guard-fixture-migration-v1.json"
jq -nc '{schemaVersion:1,reads:[],searches:"oops",edits:{},commands:{},verificationRuns:"bad",qualityRuns:[],testRuns:[],browserRuns:[],reviewRuns:[],newFileSearches:[],newSourceFiles:[],editCounts:[],largeEdits:{},repeatedEditFiles:[],reviewTriggers:{},lastPrompt:null,lastCompactSummary:null,cwd:null,settingsFingerprint:null,startedAt:null}' >"$migration_state"
migration_event="$(jq -cn '{session_id:"fixture-migration-v1",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"rg -n value src"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$migration_event")"
assert_json_expr "migration event allowed" "$out" '.continue == true'
assert_json_expr "state schema upgraded to v5" "$(jq -c . "$migration_state")" '.schemaVersion == 5'
assert_json_expr "state migration normalizes new buckets" "$(jq -c . "$migration_state")" '(.blockedCommands | type) == "array" and (.successfulCommands | type) == "array" and (.commandLastEditGeneration | type) == "object" and (.prodApprovalMarkers | type) == "array" and (.reviewerAgentCalls | type) == "array" and (.compactCount | type) == "number" and (.lastCompactAt | type) == "string"'

broken_state="$TMPROOT/claude-guard-fixture-migration-broken.json"
printf '{broken' >"$broken_state"
broken_event="$(jq -cn '{session_id:"fixture-migration-broken",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"rg -n value src"}}')"
out="$(run_hook cc-pretooluse-guard.sh "$broken_event")"
assert_json_expr "broken legacy state fails open to default" "$out" '.continue == true'
assert_json_expr "broken legacy state reset to schema v5" "$(jq -c . "$broken_state")" '.schemaVersion == 5'

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
override_staging_cmd='prisma db push --url postgresql://db.staging.example.com:5433/app'
override_staging_event="$(jq -cn --arg cmd "$override_staging_cmd" '{session_id:"fixture-override-staging",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:$cmd}}')"
override_staging="$(run_hook cc-pretooluse-guard.sh "$override_staging_event")"
assert_json_expr "staging schema mutation with explicit port allowed without override" "$override_staging" '.continue == true'
override_non_secure_cmd='prisma db push --url postgresql://db.example.com/app?sslmode=disable'
override_non_secure_event="$(jq -cn --arg cmd "$override_non_secure_cmd" '{session_id:"fixture-override-non-secure",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:$cmd}}')"
override_non_secure="$(run_hook cc-pretooluse-guard.sh "$override_non_secure_event")"
assert_json_expr "non-secure query flag treated as non-prod and allowed" "$override_non_secure" '.continue == true'
override_exp_fp="$(bash -c 'source "$1"; cc_command_fingerprint "$2"' _ "$ROOT/hooks/lib/command-classifiers.sh" "veloz db credentials")"
# Use epoch+1ms to guarantee the token is already expired when issued.
override_exp_json="$(node "$ROOT/scripts/guard-override-token.mjs" issue --session fixture-override-exp --command-fingerprint "$override_exp_fp" --reason "breakglass" --expires-at-ms 1)"
override_exp_token="$(jq -r '.token' <<<"$override_exp_json")"
override_exp_event="$(jq -cn --arg token "$override_exp_token" '{session_id:"fixture-override-exp",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"veloz db credentials",guard_override_token:$token}}')"
override_expired="$(run_hook cc-pretooluse-guard.sh "$override_exp_event")"
assert_json_expr "expired override token denied" "$override_expired" '.hookSpecificOutput.permissionDecision == "deny"'
secret_git_event="$(jq -cn '{session_id:"fixture-secret-git",tool_name:"Bash",cwd:"/tmp/example",tool_input:{command:"git credential fill"}}')"
secret_git_denied="$(run_hook cc-pretooluse-guard.sh "$secret_git_event")"
assert_json_expr "git credential command denied without override token" "$secret_git_denied" '.hookSpecificOutput.permissionDecision == "deny"'

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
  assert_json_expr "guard allows $fixture_name ($fixture_cmd)" "$guard_out" '.continue == true'
done

# Packet fixture matrix (C3/C4): invalid packets should deny, valid packets should allow.
for fixture_file in "${invalid_packet_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard denies $fixture_name" "$guard_out" '.hookSpecificOutput.permissionDecision == "deny"'
done
for fixture_file in "${valid_packet_fixtures[@]}"; do
  fixture_name="$(basename "$fixture_file" .json)"
  guard_out="$(run_hook cc-pretooluse-guard.sh "$(jq -c . "$fixture_file")")"
  assert_json_expr "guard allows $fixture_name" "$guard_out" '.continue == true'
done

finish_tests
