#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  printf '{"continue":true,"suppressOutput":true}\n'
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"
source "$SCRIPT_DIR/lib/paths.sh"
source "$SCRIPT_DIR/lib/code-patterns.sh"
source "$SCRIPT_DIR/../scripts/lib/skill-lists.sh"

fail_open() {
  printf 'claude-guard warning: %s; allowing tool call\n' "$1" >&2
  cc_json_allow
  exit 0
}

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || fail_open "invalid JSON input"
cc_state_init

tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
cwd="$(cc_project_cwd)"

deny() {
  cc_json_deny_pretool "$1"
  exit 0
}

latest_assistant_text() {
  local transcript
  transcript="$(cc_json_get '.transcript_path')"
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    jq -rs '
      [.[] | select(.type == "assistant") | (.message.content // [])[]? | select(.type == "text") | .text]
      | last // empty
    ' "$transcript" 2>/dev/null || true
    return 0
  fi
  cc_json_get '.last_assistant_message // .message // .response'
}

record_evidence_discipline_violation() {
  local violation="$1"
  cc_state_append_value evidenceDisciplineViolations "$violation"
  python3 "$SCRIPT_DIR/cc-hindsight-lesson.py" >/dev/null 2>&1 &
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
  local message violation
  message="$(latest_assistant_text)"
  if [[ -n "$message" ]] && violation="$(cc_evidence_discipline_violation "$message")"; then
    record_evidence_discipline_violation "$violation"
    deny "$violation"
  fi
}

is_source_edit_tool() {
  case "$tool_name" in
    Edit|Write|MultiEdit) return 0 ;;
    *) return 1 ;;
  esac
}

command_uses_banned_cli() {
  local cmd="$1"
  local banned='(^|[;&|({[:space:]])(grep|find|locate|ls|cat|head|tail|sed|awk|du)([[:space:];)&|]|$)'
  [[ "$cmd" =~ $banned || "$cmd" =~ rm[[:space:]]+-rf ]]
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

handle_bash() {
  local cmd="$1"
  if [[ -z "$cmd" ]]; then
    cc_json_allow
    exit 0
  fi
  if command_uses_banned_cli "$cmd"; then
    deny "Use the modern CLI toolkit instead of legacy shell commands. Prefer rg/fd/bat/eza/sd/dust/trash, or project scripts that wrap them intentionally."
  fi
  local count
  count="$(cc_state_count_command "$cmd")"
  if (( count >= 2 )) && [[ ! "$cmd" =~ (sleep|timeout|poll|watch) ]]; then
    deny "This exact command has already run twice in this session. Diagnose the failure or try a different approach before repeating it."
  fi
  if command_is_email_send "$cmd"; then
    deny "Email sending is blocked until a draft has been shown to the user and explicit approval is recorded."
  fi
  if command_is_gws_write "$cmd" && ! jq -e '.verificationRuns[]? | .value | test("gws.*(account|whoami|help)|gmail.*(account|whoami|help)|drive.*(account|whoami|help)")' "$(cc_state_file)" >/dev/null 2>&1; then
    deny "Google Workspace write actions require an account/help check first."
  fi
  if command_is_dangerous_outside_cwd "$cmd" && [[ ! "$cmd" =~ "$cwd" && ! "$cmd" =~ /tmp/ && ! "$cmd" =~ /var/folders/ ]]; then
    deny "Dangerous filesystem commands must stay inside the current project or an explicit temporary directory."
  fi
  cc_json_allow
}

handle_edit() {
  local file_path abs text violation tmp
  file_path="$(cc_json_get '.tool_input.file_path')"
  abs="$(cc_abs_path "$file_path" "$cwd")"
  text="$(cc_extract_edit_text)"

  if violation="$(cc_policy_violation "$text")"; then
    deny "$violation"
  fi

  if [[ -n "$abs" ]] && cc_is_source_path "$abs" && ! cc_is_exempt_path "$abs"; then
    if [[ "$tool_name" != "Write" && -e "$abs" ]] && ! cc_state_has_read "$abs"; then
      deny "Read the existing source file before editing it: $abs"
    fi
    if ! cc_state_has_search; then
      deny "Search for existing references/helpers before editing or creating source code. Use rg, fd, sg, git grep, Serena, or context7 as appropriate."
    fi
    if [[ "$tool_name" == "Write" && ! -e "$abs" ]] && ! cc_state_has_search; then
      deny "Search for reusable components/helpers before creating a new source file."
    fi
    if cc_domain_sensitive_path "$abs" && ! cc_domain_skill_seen; then
      deny "This path touches domain-sensitive code. Invoke eternal-best-practices or the relevant domain skill before editing auth, tenant, money, payment, i18n, Prisma, permissions, or soft-delete surfaces."
    fi
  fi

  if [[ -n "$text" && "$abs" =~ \.[cm]?[jt]sx?$ ]] && command -v node >/dev/null 2>&1; then
    tmp="$(mktemp "${TMPDIR:-/tmp}/claude-guard-edit.XXXXXX")"
    printf '%s\n' "$text" >"$tmp"
    if ! node "$SCRIPT_DIR/lib/complexity-check.mjs" "$tmp" >/tmp/claude-guard-complexity.err 2>&1; then
      deny "$(tr '\n' ' ' </tmp/claude-guard-complexity.err)"
    fi
  fi

  cc_json_allow
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
  local payload
  payload="$(jq -c '.tool_input // {}' <<<"$HOOK_INPUT")"
  for required in model cwd scope; do
    if ! jq -e --arg key "$required" 'tostring | test($key; "i")' <<<"$payload" >/dev/null; then
      deny "Subagent calls must include explicit model, cwd/project context, bounded scope, write scope or read-only, WebSearch guidance, no-revert instruction, and expected output."
    fi
  done
  for phrase in "write scope" "read-only" "WebSearch" "not to revert" "expected output"; do
    if ! jq -e --arg phrase "$phrase" 'tostring | contains($phrase)' <<<"$payload" >/dev/null; then
      deny "Subagent calls must include explicit model, cwd/project context, bounded scope, write scope or read-only, WebSearch guidance, no-revert instruction, and expected output."
    fi
  done
  cc_json_allow
}

case "$tool_name" in
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
    fi
    cc_json_allow
    ;;
esac
