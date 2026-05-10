#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

prompt="$(cc_json_get '.prompt // .user_prompt // .message')"
cc_state_update --arg prompt "$prompt" '.lastPrompt = $prompt'
prompt_lower="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

record_skill() {
  local skill="$1"
  [[ -n "$skill" ]] && cc_state_append_value requestedSkills "$skill"
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
  msg="$(printf '%s\n' "${notes[@]}" | head -c 1200)"
  cc_json_emit_context "UserPromptSubmit" "$msg"
fi
