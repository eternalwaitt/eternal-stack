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
# shellcheck source=hooks/lib/paths.sh
source "$SCRIPT_DIR/lib/paths.sh"
# shellcheck source=hooks/lib/verification.sh
source "$SCRIPT_DIR/lib/verification.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

cwd="$(cc_project_cwd)"
tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
cmd="$(cc_json_get '.tool_input.command // .input.command // .command')"
file_path="$(cc_json_get '.tool_input.file_path')"
skill_name="$(cc_json_get '.tool_input.name // .tool_input.skill // .command_name')"

record_tool() {
  local name="$1"
  local path="$2"
  local command="$3"
  case "$name" in
    Read)
      cc_state_mark_path reads "$(cc_abs_path "$path" "$cwd")"
      ;;
    Bash)
      cc_state_append_command "$command"
      if [[ "$command" =~ (^|[[:space:]])(rg|fd|sg|rtk[[:space:]]+grep|git[[:space:]]+grep)([[:space:]]|$) ]]; then
        cc_state_mark_path searches "$command"
      fi
      if cc_command_is_quality_verification "$command"; then
        cc_state_append_value verificationRuns "$command"
        cc_state_append_value qualityRuns "$command"
      fi
      if cc_command_is_test_verification "$command"; then
        cc_state_append_value testRuns "$command"
      fi
      if cc_command_is_browser_verification "$command"; then
        cc_state_append_value browserRuns "$command"
      fi
      if cc_command_is_review_verification "$command"; then
        cc_state_append_value reviewRuns "$command"
      fi
      ;;
    Edit|Write|MultiEdit)
      local local_abs count
      local_abs="$(cc_abs_path "$path" "$cwd")"
      cc_state_mark_path edits "$local_abs"
      count="$(cc_state_increment_path editCounts "$local_abs")"
      if (( count >= 3 )); then
        cc_state_mark_path repeatedEditFiles "$local_abs"
        cc_state_append_value reviewTriggers "repeated edits: $local_abs"
        if command -v node >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/../scripts/project-buglog.mjs" ]]; then
          node "$SCRIPT_DIR/../scripts/project-buglog.mjs" record \
            --cwd "$cwd" \
            --file "$local_abs" \
            --category repeat-edit \
            --summary "This file was edited repeatedly in one session; check the previous failed approach before patching again." \
            --session "$(cc_session_id)" >/dev/null
        fi
      fi
      ;;
    Skill)
      cc_state_append_value skillCalls "$path"
      ;;
    mcp__context7*|mcp__serena*)
      cc_state_mark_path searches "$name"
      ;;
  esac
}

if jq -e '.tool_calls or .toolCalls or .batch' <<<"$HOOK_INPUT" >/dev/null 2>&1; then
  jq -c '(.tool_calls // .toolCalls // .batch // [])[]' <<<"$HOOK_INPUT" | while IFS= read -r item; do
    name="$(jq -r '.tool_name // .toolName // .tool // empty' <<<"$item")"
    if [[ "$name" == "Skill" ]]; then
      path="$(jq -r '.tool_input.name // .tool_input.skill // empty' <<<"$item")"
    else
      path="$(jq -r '.tool_input.file_path // empty' <<<"$item")"
    fi
    command="$(jq -r '.tool_input.command // empty' <<<"$item")"
    record_tool "$name" "$path" "$command"
  done
else
  if [[ "$tool_name" == "Skill" ]]; then
    record_tool "$tool_name" "$skill_name" "$cmd"
  else
    record_tool "$tool_name" "$file_path" "$cmd"
  fi
fi

state="$(cc_state_read)"
warnings=()
if jq -e '(.edits | length) > 0 and ((.qualityRuns | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("Quality verification is stale or missing after edits.")
fi
if jq -e '(.requestedSkills | length) > 0 and ((.skillCalls | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("A requested skill has not been recorded yet.")
fi
if jq -e '((.repeatedEditFiles // {}) | length) > 0' <<<"$state" >/dev/null; then
  warnings+=("Repeated edits detected; bug memory has been updated and a second-pass review may be required.")
fi

if (( ${#warnings[@]} > 0 )); then
  msg="$(printf '%s\n' "${warnings[@]}" | head -c 1200)"
  cc_json_emit_context "PostToolBatch" "$msg"
fi
