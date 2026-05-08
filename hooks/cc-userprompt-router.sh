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

if [[ "$prompt" =~ (use|load|call)[[:space:]]+([A-Za-z0-9:_-]+)[[:space:]]+skill ]]; then
  cc_state_append_value requestedSkills "${BASH_REMATCH[2]}"
fi

notes=()
notes+=("Evidence-first correction protocol: do not use reflexive agreement phrases like \"You're right\". State what is verified or unverified, then name the evidence check or correction.")
case "$prompt_lower" in
  *"why"*|*"are you sure"*|*"that's not"*|*"thats not"*|*"not what"*|*"wrong"*|*"still"*|*"wasn't"*|*"wasnt"*|*"i thought"*|*"you said"*|*"she said"*|*"loose ends"*|*"wdym"*)
    cc_state_append_value evidenceChallenges "$prompt"
    notes+=("The user is challenging a prior answer. Do not agree first. If evidence is missing, say \"I have not verified that yet\" and run or name the concrete check.")
    ;;
esac
if [[ "$prompt" =~ (audit|review|plan) ]]; then
  notes+=("Use the relevant audit/review/plan workflow and finish with evidence against the original request.")
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
