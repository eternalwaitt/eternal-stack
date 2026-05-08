#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${CLAUDE_GUARD_DISABLED:-0}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/lib/json.sh"
source "$SCRIPT_DIR/lib/state.sh"
source "$SCRIPT_DIR/lib/paths.sh"

cc_json_read_stdin
cc_json_require_jq || exit 0
cc_json_valid || exit 0
cc_state_init

cwd="$(cc_project_cwd)"
tool_name="$(cc_json_get '.tool_name // .toolName // .tool')"
cmd="$(cc_json_get '.tool_input.command // .input.command // .command')"
file_path="$(cc_json_get '.tool_input.file_path // .tool_input.path')"

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
      if [[ "$command" =~ (^|[[:space:]])(rg|fd|sg|git[[:space:]]+grep)([[:space:]]|$) ]]; then
        cc_state_mark_path searches "$command"
      fi
      if [[ "$command" =~ (typecheck|lint|test|build|pytest|ruff|mypy|cargo[[:space:]]+(test|clippy|build)|curl|playwright|browser) ]]; then
        cc_state_append_value verificationRuns "$command"
      fi
      ;;
    Edit|Write|MultiEdit)
      cc_state_mark_path edits "$(cc_abs_path "$path" "$cwd")"
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
    path="$(jq -r '.tool_input.file_path // .tool_input.path // .tool_input.name // empty' <<<"$item")"
    command="$(jq -r '.tool_input.command // empty' <<<"$item")"
    record_tool "$name" "$path" "$command"
  done
else
  record_tool "$tool_name" "$file_path" "$cmd"
fi

state="$(cc_state_read)"
warnings=()
if jq -e '(.edits | length) > 0 and ((.verificationRuns | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("Verification is stale or missing after edits.")
fi
if jq -e '(.requestedSkills | length) > 0 and ((.skillCalls | length) == 0)' <<<"$state" >/dev/null; then
  warnings+=("A requested skill has not been recorded yet.")
fi

if (( ${#warnings[@]} > 0 )); then
  msg="$(printf '%s\n' "${warnings[@]}" | head -c 1200)"
  cc_json_emit_context "PostToolBatch" "$msg"
fi

