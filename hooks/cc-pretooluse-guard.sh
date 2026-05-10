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
# shellcheck source=scripts/lib/skill-lists.sh
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
  if [[ ! -f "$helper" ]]; then
    printf 'claude-guard warning: port guard skipped for command %q: missing %s\n' "$cmd" "$helper" >&2
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    printf 'claude-guard warning: port guard skipped for command %q: missing node\n' "$cmd" >&2
    return 0
  fi
  node "$helper" check --command "$cmd"
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
  local outside_path
  if command_is_dangerous_outside_cwd "$cmd" && outside_path="$(dangerous_command_outside_path "$cmd")"; then
    deny "Dangerous filesystem commands must stay inside the current project or an explicit temporary directory. Outside path: $outside_path"
  fi
  local port_guard_output
  if ! port_guard_output="$(command_passes_port_guard "$cmd" 2>&1)"; then
    deny "$port_guard_output"
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
  local output
  if ! output="$(node "$SCRIPT_DIR/../scripts/agent-task-packet-check.mjs" <<<"$HOOK_INPUT" 2>&1)"; then
    deny "$output"
  fi
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
