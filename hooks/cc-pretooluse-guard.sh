#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  printf '{"continue":true,"suppressOutput":true}\n'
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"
# shellcheck source=hooks/lib/paths.sh
source "$SCRIPT_DIR/lib/paths.sh"
# shellcheck source=hooks/lib/code-patterns.sh
source "$SCRIPT_DIR/lib/code-patterns.sh"
# shellcheck source=hooks/lib/command-classifiers.sh
source "$SCRIPT_DIR/lib/command-classifiers.sh"
# shellcheck source=scripts/lib/skill-lists.sh
source "$SCRIPT_DIR/../scripts/lib/skill-lists.sh"

# Hook decision pipeline:
# 1) classify command/tool risk level
# 2) enforce hard denies for safety-critical paths
# 3) enforce repeat/evidence discipline
# 4) allow with optional context warnings
#
# [input]
#    |
#    v
# [classifiers] --> [critical?] --yes--> [deny or override verify]
#    |                               no
#    +-------------------------------> [repeat/evidence checks] --> [allow/deny]

# Intentional module-level globals used across helper functions in this hook.
current_tool=""
current_bash_command=""
cwd=""

fail_open() {
  printf 'claude-guard warning: %s; allowing tool call\n' "$1" >&2
  cc_json_allow
  exit 0
}

deny() {
  local reason="$1"
  if [[ "$current_tool" == "Bash" && -n "$current_bash_command" ]]; then
    cc_state_record_command_blocked "$current_bash_command" "$reason" || true
  fi
  cc_json_deny_pretool "$reason"
  exit 0
}

emit_state_init_failure_event() {
  local metrics_path now host payload
  metrics_path="${CLAUDE_GUARD_METRICS_PATH:-${TMPDIR:-/tmp}/claude-guard-metrics.jsonl}"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host="$(hostname 2>/dev/null || printf 'unknown-host')"
  payload="$(jq -cn --arg at "$now" --arg host "$host" --arg hook "cc-pretooluse-guard" --arg event "state_init_failed" \
    '{event: $event, hook: $hook, at: $at, host: $host, cause: "cc_state_init returned non-zero"}')"
  printf '%s\n' "$payload" >>"$metrics_path" 2>/dev/null || true
}

cc_json_read_stdin
if ! cc_json_require_jq; then
  if [[ "${CC_ALLOW_NO_JQ:-0}" == "1" ]]; then
    printf 'claude-guard warning: jq unavailable and CC_ALLOW_NO_JQ=1; allowing tool call without guard checks\n' >&2
    cc_json_allow
    exit 0
  fi
  printf 'claude-guard error: jq unavailable; blocking tool call to preserve safety-critical guard checks (set CC_ALLOW_NO_JQ=1 to bypass intentionally)\n' >&2
  cc_json_deny_pretool "Safety-critical guard unavailable: jq missing. Install jq or set CC_ALLOW_NO_JQ=1 for an explicit temporary bypass."
  exit 0
fi
cc_json_valid || fail_open "invalid JSON input"
if ! cc_state_init; then
  printf 'claude-guard warning: state init failed in pretooluse guard; continuing with degraded state tracking\n' >&2
  emit_state_init_failure_event
fi

current_tool="$(cc_json_get '.tool_name // .toolName // .tool')"
cwd="$(cc_project_cwd)"

message_fingerprint() {
  local text="$1"
  local output
  if output="$(cc_command_fingerprint "$text" 2>&1)"; then
    printf '%s\n' "$output"
    return 0
  fi
  if [[ -n "$output" ]]; then
    printf 'claude-guard warning: fingerprint error: %s\n' "$output" >&2
  fi
  printf 'missing-hash\n'
}

record_evidence_discipline_violation() {
  local violation="$1"
  local fingerprint="$2"
  cc_state_append_value evidenceDisciplineViolations "$violation"
  if [[ -n "$fingerprint" && "$fingerprint" != "missing-hash" ]]; then
    cc_state_record_evidence_fingerprint "$fingerprint"
  fi
  python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
  disown || true
}

cc_domain_sensitive_path() {
  local path="$1"
  local lower
  lower="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" =~ (tenant|billing|payment|stripe|abacate|auth|permission|role|i18n|locale|prisma|schema\.prisma|middleware|money|finance|soft-delete|deleted-at) ]]
}

cc_domain_skill_seen() {
  jq -e --arg pattern "$DOMAIN_COMPANION_SKILL_PATTERN" '
    [.skillCalls[]?.value | ascii_downcase]
    | any(test($pattern))
  ' "$(cc_state_file)" >/dev/null 2>&1
}

block_evidence_discipline_before_tool() {
  local message violation fingerprint
  message="$(cc_json_current_assistant_text || true)"
  if [[ -z "$message" ]]; then
    if [[ "${CLAUDE_GUARD_DEBUG:-0}" == "1" ]]; then
      printf 'claude-guard debug: assistant text empty; skipping evidence discipline precheck\n' >&2
    fi
    return 0
  fi
  if ! violation="$(cc_evidence_discipline_violation "$message" 2>/dev/null)"; then
    return 0
  fi
  fingerprint="$(message_fingerprint "$message")"
  if [[ -n "$fingerprint" && "$fingerprint" != "missing-hash" ]] && cc_state_has_evidence_fingerprint "$fingerprint"; then
    return 0
  fi
  record_evidence_discipline_violation "$violation" "$fingerprint"
  deny "$violation"
}

is_source_edit_tool() {
  case "$current_tool" in
    Edit|Write|MultiEdit) return 0 ;;
    *) return 1 ;;
  esac
}

handle_read() {
  local file_path abs
  file_path="$(cc_json_get '.tool_input.file_path')"
  abs="$(cc_abs_path "$file_path" "$cwd")"
  if [[ -n "$abs" && -d "$abs" ]]; then
    deny "Read was pointed at a directory: $abs. Use fd/eza for directory listing or read a specific file path."
  fi
  cc_json_allow
}

command_is_email_send() {
  local cmd="$1"
  [[ "$cmd" =~ (sendmail|mailx|mutt|gmail.*send|mcp__gmail.*send|smtp) ]]
}

command_is_gws_write() {
  local cmd="$1"
  [[ "$cmd" =~ (gws|gmail|drive|calendar) ]] && [[ "$cmd" =~ (create|update|delete|send|write|upload|move|trash) ]]
}

command_is_dangerous_outside_cwd() {
  local cmd="$1"
  [[ "$cmd" =~ (trash|mv|cp|chmod|chown)[[:space:]].*/ ]] || [[ "$cmd" =~ rm[[:space:]]+-r ]]
}

path_is_allowed_for_dangerous_command() {
  local path="$1"
  case "$path" in
    "$cwd"|"$cwd"/*|/tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) return 0 ;;
    *) return 1 ;;
  esac
}

dangerous_token_outside_path() {
  local path="$1"
  [[ "$path" == /* ]] || return 1
  if ! path_is_allowed_for_dangerous_command "$path"; then
    printf '%s\n' "$path"
    return 0
  fi
  return 1
}

dangerous_command_outside_path() {
  local cmd="$1"
  local char quote token
  local i len
  quote=""
  token=""
  len="${#cmd}"
  for (( i = 0; i < len; i += 1 )); do
    char="${cmd:i:1}"
    if [[ -n "$quote" ]]; then
      if [[ "$quote" == '"' && "$char" == "\\" && $((i + 1)) -lt len ]]; then
        i=$((i + 1))
        token+="${cmd:i:1}"
      elif [[ "$char" == "$quote" ]]; then
        quote=""
      else
        token+="$char"
      fi
      continue
    fi
    if [[ "$char" == "'" || "$char" == '"' ]]; then
      quote="$char"
      continue
    fi
    if [[ "$char" == "\\" && $((i + 1)) -lt len ]]; then
      i=$((i + 1))
      token+="${cmd:i:1}"
      continue
    fi
    case "$char" in
      [[:space:]]|";"|"|"|"&"|"("|")"|"<"|">")
        if [[ -n "$token" ]]; then
          dangerous_token_outside_path "$token" && return 0
          token=""
        fi
        ;;
      *) token+="$char" ;;
    esac
  done
  [[ -n "$token" ]] && dangerous_token_outside_path "$token" && return 0
  return 1
}

command_passes_port_guard() {
  local cmd="$1"
  local helper="$SCRIPT_DIR/../scripts/port-guard.mjs"
  if ! cc_command_is_dev_server_start "$cmd"; then
    return 0
  fi
  if [[ ! -f "$helper" ]]; then
    printf 'Dev server command requires port-guard, but helper is missing: %s (command: %s)\n' "$helper" "$cmd" >&2
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    printf 'Dev server command requires Node.js runtime for port-guard checks (command: %s)\n' "$cmd" >&2
    return 1
  fi
  node "$helper" check --command "$cmd"
}

review_required_for_risky_command() {
  jq -e '
    def source_edit_count:
      (.edits // {})
      | to_entries
      | map(select(.key | test("\\.(js|jsx|ts|tsx|mjs|cjs|py|rs|go|php|rb|java|kt|swift|sh|bash|zsh)$"; "i")))
      | map(select(.key | test("(\\.test\\.|\\.spec\\.|/tests?/|__tests__|/node_modules/|/dist/|/build/|/coverage/|/generated/|/__generated__/|/migrations/)"; "i") | not))
      | length;
    ((((.reviewTriggers // []) | length) > 0)
      or (((.largeEdits // []) | length) > 0)
      or (((.newSourceFiles // {}) | length) >= 2)
      or (((.repeatedEditFiles // {}) | length) > 0)
      or (source_edit_count >= 3))
      and
    (([.reviewRuns[]?.value // empty, .verificationRuns[]?.value // empty, .skillCalls[]?.value // empty]
      | map(ascii_downcase)
      | any(test("etrnl-review|code[ -]?review|review-log|coderabbit|adversarial|redline|second[ -]?pass|stress-test"))) | not)
  ' "$(cc_state_file)" >/dev/null 2>&1
}

migration_evidence_missing() {
  local migration_cmd_regex
  migration_cmd_regex='((npx|bunx|yarn(\s+dlx)?|pnpm(\s+(dlx|exec))?|npm(\s+(run|exec))?)\s+([^;&|]+\s+)*?(--\s+)?)?\bprisma\b\s+\bmigrate\b\s+(status|deploy|resolve)\b'
  jq -e --arg migration_cmd_regex "$migration_cmd_regex" '
    def touched_schema:
      (.edits // {})
      | to_entries
      | any(.key | test("(schema\\.prisma|prisma/migrations/|packages/db/prisma/)"; "i"));
    touched_schema and ((.verificationRuns // []) | map(.value | ascii_downcase) | any(test($migration_cmd_regex)) | not)
  ' "$(cc_state_file)" >/dev/null 2>&1
}

verify_override_token() {
  local command="$1"
  local action="$2"
  local override_script token fingerprint output marker safe_reason safe_reason_raw omitted_chars session_id
  override_script="$SCRIPT_DIR/../scripts/guard-override-token.mjs"
  if [[ ! -f "$override_script" ]] || ! command -v node >/dev/null 2>&1; then
    deny "Safety-critical command blocked: override verification is unavailable. Install the control-plane scripts and retry with a one-time approved override token."
  fi
  token="$(cc_json_get '.tool_input.guard_override_token // .guard_override_token')"
  if [[ -z "$token" ]]; then
    token="${CLAUDE_GUARD_OVERRIDE_TOKEN:-}"
  fi
  if [[ -z "$token" ]]; then
    deny "$action blocked. Use reviewed migrations or approved redacted workflows. For break-glass operations, issue a one-time override token with: node scripts/guard-override-token.mjs issue --reason '<reason>' and pass it via CLAUDE_GUARD_OVERRIDE_TOKEN or the guard_override_token field."
  fi
  session_id="$(cc_session_id)"
  if [[ -z "$session_id" || ! "$session_id" =~ ^[A-Za-z0-9._:-]+$ ]]; then
    deny "Safety-critical command blocked: missing or invalid session id."
  fi
  fingerprint="$(cc_command_fingerprint "$command" || true)"
  if [[ -z "$fingerprint" || "$fingerprint" == "missing-hash" ]]; then
    deny "Safety-critical command blocked: unable to fingerprint command for override validation."
  fi
  if ! output="$(CLAUDE_GUARD_OVERRIDE_TOKEN="$token" node "$override_script" verify --session "$session_id" --command-fingerprint "$fingerprint" 2>&1)"; then
    safe_reason_raw="$(printf '%s' "$output" | tr -d '\000-\011\013\014\016-\037\177' | tr -d '\033' | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
    safe_reason="$safe_reason_raw"
    if (( ${#safe_reason_raw} > 240 )); then
      omitted_chars=$(( ${#safe_reason_raw} - 240 ))
      safe_reason="${safe_reason_raw:0:240}... (truncated, ${omitted_chars} chars omitted)"
    fi
    deny "Safety-critical command blocked: override token rejected: ${safe_reason:-unknown error}."
  fi
  marker="override:${fingerprint}:$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cc_state_record_prod_approval_marker "$marker" || true
}

cc_check_repeat_edit_generation() {
  local cmd="$1"
  local edit_generation last_generation
  edit_generation="$(cc_state_get_edit_generation)"
  [[ "$edit_generation" =~ ^-?[0-9]+$ ]] || edit_generation="-1"
  last_generation="$(jq -r --arg cmd "$cmd" '.commandLastEditGeneration[$cmd] // -1' "$(cc_state_file)" 2>/dev/null || printf -- '-1\n')"
  [[ "$last_generation" =~ ^-?[0-9]+$ ]] || last_generation="-1"
  (( last_generation >= edit_generation ))
}

handle_bash() {
  local cmd="$1"
  current_bash_command="$cmd"
  if [[ -z "$cmd" ]]; then
    cc_json_allow
    exit 0
  fi

  if cc_command_is_primary_legacy_search "$cmd"; then
    deny "Use the modern CLI toolkit instead of legacy shell commands. Prefer rg/fd/bat/eza/sd/dust/trash, or project scripts that wrap them intentionally. Also avoid piping to legacy tools (head, tail, grep, sed, awk, cat) — use rg for search, bat for display, eza for listing."
  fi
  if cc_command_has_output_limiter "$cmd"; then
    deny "Avoid shell output-limiter pipes such as head, tail, or sed -n after another command. Use native limits instead, for example rg -m/--max-count, fd --max-results, bat --line-range, jq filters, or write a bounded report file."
  fi

  local success_count
  success_count="$(cc_state_count_successful_command "$cmd")"
  if (( success_count >= 2 )) && [[ ! "$cmd" =~ (sleep|timeout|poll|watch) ]]; then
    if cc_command_is_verification "$cmd"; then
      if cc_check_repeat_edit_generation "$cmd"; then
        cc_json_allow_context "PreToolUse" "Verification command is repeating with no state change. Continue only if you are collecting a second confirmation."
        exit 0
      fi
    else
      if cc_check_repeat_edit_generation "$cmd"; then
        deny "This exact command has already run twice in this session without meaningful state change. Diagnose the failure or choose a different approach: edit a file to change state, use a different tool/flag, or run a related diagnostic first."
      fi
      cc_json_allow_context "PreToolUse" "Command is repeating but state changed after the last successful run. One retry is allowed."
      exit 0
    fi
  fi

  if command_is_email_send "$cmd"; then
    deny "Email sending is blocked until a draft has been shown to the user and explicit approval is recorded."
  fi

  if command_is_gws_write "$cmd" && ! jq -e '.verificationRuns[]? | .value | test("gws.*(account|whoami|help)|gmail.*(account|whoami|help)|drive.*(account|whoami|help)")' "$(cc_state_file)" >/dev/null 2>&1; then
    deny "Google Workspace write actions require an account/help check first."
  fi

  local outside_path
  if command_is_dangerous_outside_cwd "$cmd" && outside_path="$(dangerous_command_outside_path "$cmd")"; then
    deny "Dangerous filesystem commands must stay inside the current project or an explicit temporary directory. Outside path: $outside_path"
  fi

  local env_hint
  env_hint="$(cc_json_get '.tool_input.environment // .environment // .env // empty')"
  if cc_command_is_risky_completion_operation "$cmd" && review_required_for_risky_command; then
    deny "Risky completion command blocked until second-pass review evidence is present. Run etrnl-review (or equivalent review artifact) before commit/push/deploy operations."
  fi
  if cc_command_is_prod_schema_mutation "$cmd" "$env_hint"; then
    if migration_evidence_missing; then
      deny "Production schema mutation blocked. Add migration evidence first (for example: prisma migrate status/deploy), then provide a valid one-time override token for reviewed exceptions."
    fi
    verify_override_token "$cmd" "Production schema mutation command"
  fi

  if cc_command_may_disclose_secret "$cmd"; then
    verify_override_token "$cmd" "Secret-disclosure command"
  fi

  local port_guard_output
  if ! port_guard_output="$(command_passes_port_guard "$cmd" 2>&1)"; then
    deny "$port_guard_output"
  fi
  cc_json_allow
}

handle_edit() {
  local file_path abs text old_text violation tmp context is_new_source new_count bug_context old_text_status
  file_path="$(cc_json_get '.tool_input.file_path')"
  abs="$(cc_abs_path "$file_path" "$cwd")"
  text="$(cc_extract_edit_text)"
  old_text=""
  if old_text="$(cc_extract_old_edit_text)"; then
    old_text_status=0
  else
    old_text_status=$?
  fi
  context=""
  is_new_source=false

  if violation="$(cc_policy_violation "$text")"; then
    deny "$violation"
  fi
  if [[ -n "$abs" && "$current_tool" == "Write" && -e "$abs" && "$old_text_status" -ne 0 ]]; then
    deny "Cannot read existing content for safety checks: $abs"
  fi
  if [[ -n "$abs" && "$current_tool" == "Write" && -f "$abs" ]]; then
    if ! old_text="$(<"$abs" 2>/dev/null)"; then
      deny "Cannot read existing file for safety checks: $abs"
    fi
  fi
  if [[ -n "$abs" ]] && (cc_is_source_path "$abs" || [[ "$abs" == *.json || "$abs" == *.yaml || "$abs" == *.yml || "$abs" == *.toml ]] ); then
    if violation="$(cc_safety_removal_violation "$old_text" "$text")"; then
      deny "$violation"
    fi
  fi
  if violation="$(cc_test_quality_violation "$text" "$abs")"; then
    deny "Test-quality violation. $violation"
  fi

  if [[ -n "$abs" ]] && cc_is_source_path "$abs" && ! cc_is_exempt_path "$abs"; then
    if [[ "$current_tool" != "Write" && -e "$abs" ]] && ! cc_state_has_read "$abs"; then
      deny "Read the existing source file before editing it: $abs"
    fi
    if ! cc_state_has_search; then
      deny "Search for existing references/helpers before editing or creating source code. Use rg, fd, sg, git grep, Serena, or context7 as appropriate."
    fi
    if [[ "$current_tool" == "Write" && ! -e "$abs" ]]; then
      new_count="$(jq '(.newSourceFiles // {}) | length' "$(cc_state_file)" 2>/dev/null || printf '0\n')"
      if (( new_count >= 3 )); then
        deny "File-sprawl violation. This session is creating too many new source files. Reuse existing files, split the plan, or run a second-pass review before continuing."
      fi
      is_new_source=true
    fi
    if cc_domain_sensitive_path "$abs" && ! cc_domain_skill_seen; then
      deny "This path touches domain-sensitive code. Invoke eternal-best-practices or the relevant domain skill before editing auth, tenant, money, payment, i18n, Prisma, permissions, or soft-delete surfaces."
    fi
    if command -v node >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/../scripts/project-buglog.mjs" ]]; then
      if ! bug_context="$(node "$SCRIPT_DIR/../scripts/project-buglog.mjs" suggest --cwd "$cwd" --file "$abs" 2>&1)"; then
        deny "Project bug memory is malformed or unreadable: $bug_context"
      fi
      if [[ -n "$bug_context" ]]; then
        context="$bug_context"
      fi
    fi
  fi

  if [[ -n "$text" && -n "$abs" ]] && cc_is_source_path "$abs" && ! cc_is_exempt_path "$abs"; then
    if violation="$(cc_large_change_violation "$old_text" "$text" "$current_tool")"; then
      cc_state_append_value largeEdits "$abs"
      cc_state_append_value reviewTriggers "large edit: $abs"
      if ! jq -e '((.reviewRuns // []) | length) > 0 or ((.skillCalls // []) | map(.value | ascii_downcase) | any(test("etrnl-plan|etrnl-review|plan|review")))' "$(cc_state_file)" >/dev/null 2>&1; then
        deny "$violation"
      fi
    fi
  fi

  if [[ -n "$text" && "$abs" =~ \.[cm]?[jt]sx?$ ]] && command -v node >/dev/null 2>&1; then
    tmp="$(mktemp "${TMPDIR:-/tmp}/claude-guard-edit.XXXXXX")"
    printf '%s\n' "$text" >"$tmp"
    if ! node "$SCRIPT_DIR/lib/complexity-check.mjs" "$tmp" >/tmp/claude-guard-complexity.err 2>&1; then
      deny "$(tr '\n' ' ' </tmp/claude-guard-complexity.err)"
    fi
  fi

  if [[ "$is_new_source" == "true" ]]; then
    cc_state_mark_path newSourceFiles "$abs"
  fi
  if [[ -n "$context" ]]; then
    cc_json_allow_context "PreToolUse" "$context"
  else
    cc_json_allow
  fi
  return 0
}

handle_websearch() {
  local canary="${CLAUDE_GUARD_WEBSEARCH_CANARY:-$HOME/.claude/cache/websearch-canary.json}"
  if [[ "${CLAUDE_CODE_ALWAYS_ENABLE_EFFORT:-0}" == "1" ]]; then
    deny "WebSearch is denied while CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 is active. Use rtk proxy curl or official docs directly."
  fi
  if [[ -f "$canary" ]] && jq -e '(.status == "failed") and ((now - (.checkedAtEpoch // 0)) < 86400)' "$canary" >/dev/null 2>&1; then
    deny "WebSearch canary failed in the last 24h. Use rtk proxy curl or official docs directly."
  fi
  cc_json_allow
}

handle_agent() {
  local output
  if ! output="$(node "$SCRIPT_DIR/../scripts/agent-task-packet-check.mjs" <<<"$HOOK_INPUT" 2>&1)"; then
    deny "$output"
  fi
  cc_json_allow
}

case "$current_tool" in
  Read)
    block_evidence_discipline_before_tool
    handle_read
    ;;
  Bash)
    block_evidence_discipline_before_tool
    handle_bash "$(cc_json_get '.tool_input.command // .input.command // .command')"
    ;;
  WebSearch)
    block_evidence_discipline_before_tool
    handle_websearch
    ;;
  Agent|Task|TaskCreate)
    block_evidence_discipline_before_tool
    handle_agent
    ;;
  *)
    block_evidence_discipline_before_tool
    if is_source_edit_tool; then
      handle_edit
      exit 0
    fi
    cc_json_allow
    ;;
esac
