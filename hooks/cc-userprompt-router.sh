#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/json.sh
source "$SCRIPT_DIR/lib/json.sh"
# shellcheck source=hooks/lib/state.sh
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

prompt="$(cc_json_get '.prompt // .user_prompt // .message')"
cwd="$(cc_json_get '.cwd')"
[[ -n "$cwd" ]] || cwd="$PWD"
cc_state_update --arg prompt "$prompt" ".lastPrompt = \$prompt"
prompt_lower="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

record_skill() {
  local skill="$1"
  [[ -n "$skill" ]] && cc_state_append_value requestedSkills "$skill"
}

cc_prompt_context_cap() {
  local value="${1:-}"
  if [[ "$value" =~ ^[0-9]+$ ]] && (( value > 0 )); then
    printf '%s\n' "$value"
  else
    printf '20000\n'
  fi
}

cc_prompt_collect_upward() {
  local start="$1"
  local dir candidate
  local files=()
  local dir_files=()
  if [[ -d "$start" ]]; then
    dir="$(cd -- "$start" 2>/dev/null && pwd -P)" || return 0
  else
    dir="$(cd -- "$(dirname -- "$start")" 2>/dev/null && pwd -P)" || return 0
  fi
  while [[ "$dir" != "/" ]]; do
    dir_files=()
    for candidate in "$dir/CLAUDE.md" "$dir/.claude/CLAUDE.md" "$dir/CLAUDE.local.md"; do
      [[ -f "$candidate" ]] && dir_files+=("$candidate")
    done
    if (( ${#dir_files[@]} > 0 )); then
      if (( ${#files[@]} > 0 )); then
        files=("${dir_files[@]}" "${files[@]}")
      else
        files=("${dir_files[@]}")
      fi
    fi
    dir="$(dirname -- "$dir")"
  done
  (( ${#files[@]} > 0 )) || return 0
  printf '%s\n' "${files[@]}"
}

cc_prompt_add_context_file() {
  local label="$1"
  local file="$2"
  local resolved content block remaining
  [[ -f "$file" ]] || return 0
  resolved="$(cd -- "$(dirname -- "$file")" 2>/dev/null && pwd -P)/$(basename -- "$file")" || return 0
  [[ "$cc_prompt_seen_files" != *"|$resolved|"* ]] || return 0
  cc_prompt_seen_files+="|$resolved|"
  content="$(<"$resolved")"
  [[ -n "$content" ]] || return 0
  block=$'\n'"## $label: $resolved"$'\n'"$content"$'\n'
  remaining=$((cc_prompt_remaining_chars - ${#cc_prompt_context}))
  (( remaining > 0 )) || return 0
  if (( ${#block} > remaining )); then
    block="${block:0:remaining}"$'\n''[truncated]'
  fi
  cc_prompt_context+="$block"
}

cc_prompt_add_referenced_markdown() {
  local source_file="$1"
  local allowed_base="$2"
  local depth="${3:-1}"
  local source_dir allowed_root ref resolved line rest source_name source_content
  (( depth <= 5 )) || return 0
  source_dir="$(cd -- "$(dirname -- "$source_file")" 2>/dev/null && pwd -P)" || return 0
  allowed_root="$(cd -- "$allowed_base" 2>/dev/null && pwd -P)" || return 0
  source_name="$(basename -- "$source_file")"
  source_content="$(<"$source_file")" || return 0
  while IFS= read -r line; do
    rest="$line"
    while [[ "$rest" =~ @([~A-Za-z0-9._/-]+\.md) ]]; do
      ref="${BASH_REMATCH[1]}"
      rest="${rest#*"@$ref"}"
      case "$ref" in
        \~/*) ref="$HOME/${ref#\~/}" ;;
        /*) ;;
        *) ref="$source_dir/$ref" ;;
      esac
      [[ -f "$ref" ]] || continue
      resolved="$(cd -- "$(dirname -- "$ref")" 2>/dev/null && pwd -P)/$(basename -- "$ref")" || continue
      case "$resolved" in
        "$allowed_root"|"$allowed_root"/*) ;;
        *) continue ;;
      esac
      cc_prompt_add_context_file "Referenced by $source_name" "$ref"
      cc_prompt_add_referenced_markdown "$resolved" "$allowed_root" "$((depth + 1))"
    done
  done <<<"$source_content"
}

cc_prompt_claude_context() {
  case "${CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD:-1}" in
    0|false|FALSE|no|NO|off|OFF) return 0 ;;
  esac

  local global_claude project_file cc_prompt_context cc_prompt_seen_files cc_prompt_remaining_chars
  cc_prompt_context=""
  cc_prompt_seen_files=""
  cc_prompt_remaining_chars="$(cc_prompt_context_cap "${CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS:-}")"
  global_claude="$HOME/.claude/CLAUDE.md"

  cc_prompt_context+="CLAUDE.md reinjection: treat the following as active instructions for this prompt. This mirrors Claude's startup hierarchy where possible. Disable with CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0."
  cc_prompt_add_context_file "Global CLAUDE.md" "$global_claude"
  [[ ! -f "$global_claude" ]] || cc_prompt_add_referenced_markdown "$global_claude" "$HOME/.claude"
  while IFS= read -r project_file; do
    [[ -n "$project_file" ]] || continue
    cc_prompt_add_context_file "Project $(basename -- "$project_file")" "$project_file"
    cc_prompt_add_referenced_markdown "$project_file" "$(dirname -- "$project_file")"
  done < <(cc_prompt_collect_upward "$cwd")

  [[ -n "$cc_prompt_seen_files" ]] || return 0
  printf '%s\n' "$cc_prompt_context"
}

if [[ "$prompt" =~ (use|load|call)[[:space:]]+([A-Za-z0-9:_-]+)[[:space:]]+skill ]]; then
  record_skill "${BASH_REMATCH[2]}"
fi
if [[ "$prompt" =~ Skill\(([A-Za-z0-9:_/-]+)\) ]]; then
  record_skill "${BASH_REMATCH[1]}"
fi
legacy_aliases="writing-plans|execute-plan|run-plan|code-review|commit|deps|test|pr|fix-issue|parallel-fan-out|devils-advocate|agent-file-doctor|audit-pipeline"
# Group 2 is the requested skill name for etrnl-* slash commands and legacy aliases.
slash_skill_re="(^|[[:space:]])/(etrnl-[A-Za-z0-9_-]+|${legacy_aliases})([[:space:]]|$)"
if [[ "$prompt" =~ $slash_skill_re ]]; then
  record_skill "${BASH_REMATCH[2]}"
fi

notes=()
claude_context="$(cc_prompt_claude_context)"
[[ -z "$claude_context" ]] || notes+=("$claude_context")
notes+=("Evidence-first correction protocol: do not use reflexive agreement phrases like \"You're right\". State what is verified or unverified, then name the evidence check or correction.")
code_health_pattern='code[[:space:]]+health|health[[:space:]]+check|repo[[:space:]]+rot|audit[[:space:]]+.*(whole|entire)[[:space:]]+codebase|no[[:space:]]+skips|dead[[:space:]]+code|pr-gate'
case "$prompt_lower" in
  *"why"*|*"are you sure"*|*"that's not"*|*"thats not"*|*"not what"*|*"wrong"*|*"still"*|*"wasn't"*|*"wasnt"*|*"i thought"*|*"you said"*|*"she said"*|*"loose ends"*|*"wdym"*)
    cc_state_append_value evidenceChallenges "$prompt"
    notes+=("The user is challenging a prior answer. Do not agree first. If evidence is missing, say \"I have not verified that yet\" and run or name the concrete check.")
    ;;
esac
if [[ "$prompt_lower" =~ brainstorm|scope[[:space:]]+this|think[[:space:]]+through|design[[:space:]]+this ]]; then
  record_skill "etrnl-brainstorm"
  notes+=("Use etrnl-brainstorm first: clarify, produce a design/spec file, get approval, then move to planning.")
fi
if [[ "$prompt_lower" =~ write[[:space:]]+a[[:space:]]+plan|implementation[[:space:]]+plan|planning|turn.*into[[:space:]]+tasks ]]; then
  record_skill "etrnl-plan"
  notes+=("Use etrnl-plan: write the plan to disk, review it, improve it, mark it Final, and keep chat short.")
fi
if [[ "$prompt_lower" =~ execute[[:space:]]+.*plan|implement[[:space:]]+.*plan|carry[[:space:]]+out[[:space:]]+.*plan ]]; then
  record_skill "etrnl-execute"
  notes+=("Use etrnl-execute only for user-requested plan execution; preserve checkpoints and verification evidence.")
fi
if [[ "$prompt_lower" =~ $code_health_pattern ]]; then
  record_skill "etrnl-code-health"
  notes+=("Use etrnl-code-health: inventory every tracked file, load the repo Health Stack, create a findings ledger, and close every finding as fixed, false-positive, accepted-risk, or blocked.")
fi
if [[ "$prompt_lower" =~ audit|code[[:space:]]+review|pr[[:space:]]+review|design[[:space:]]+review|plan[[:space:]]+review|final[[:space:]]+review|review[[:space:]]+pass|loose[[:space:]]+ends|final[[:space:]]+pass|compare[[:space:]]+changes ]]; then
  record_skill "etrnl-review"
  notes+=("Use etrnl-review for findings-first review, gap mapping, and evidence against the original request.")
fi
if [[ "$prompt" =~ (current|latest|docs|API|library|package) ]]; then
  notes+=("Use context7 or official/current docs before relying on memory.")
fi
if [[ "$prompt" =~ (implement|fix|edit|code|repo|project) ]]; then
  notes+=("Read before edit and search for existing references/helpers before creating new code.")
fi
if [[ "$prompt" =~ (Gmail|Drive|Sheets|Calendar|GWS|Google) ]]; then
  notes+=("Confirm account identity before any Google Workspace write.")
fi

if (( ${#notes[@]} > 0 )); then
  msg="$(printf '%s\n' "${notes[@]}")"
  max_msg="$(cc_prompt_context_cap "${CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS:-}")"
  msg="${msg:0:max_msg}"
  cc_json_emit_context "UserPromptSubmit" "$msg"
fi
