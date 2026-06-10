#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "RTK Codex hook requires jq, but jq is not on PATH." >&2
  exit 2
fi

if ! command -v rtk >/dev/null 2>&1; then
  echo "RTK Codex hook requires rtk, but rtk is not on PATH." >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/codex-memory-scan.sh
source "$SCRIPT_DIR/lib/codex-memory-scan.sh"

input="$(cat)"
if ! cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"; then
  echo "RTK Codex hook received invalid JSON input." >&2
  exit 2
fi

if [ -z "$cmd" ]; then
  exit 0
fi

trim_leading() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "$value"
}

deny_reason() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": $reason
      }
    }'
}

emit_rewrite() {
  local rewritten="$1" updated
  if ! updated="$(jq --arg command "$rewritten" '.tool_input.command = $command | .tool_input' <<<"$input" 2>/dev/null)"; then
    echo "RTK Codex hook failed to rewrite tool_input JSON." >&2
    exit 2
  fi
  if [[ "${CODEX_RTK_HOOK_DENY_REWRITE:-0}" == "1" ]]; then
    deny_reason "Use RTK for this command: $rewritten"
    return 0
  fi
  jq -n \
    --argjson updated "$updated" \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "updatedInput": $updated
      },
      "systemMessage": "RTK wrapped the Bash command before execution."
    }'
}

is_direct_rg_command() {
  local trimmed
  trimmed="$(trim_leading "$1")"
  [[ "$trimmed" == "rg" || "$trimmed" == rg[[:space:]]* ]]
}

has_shell_control() {
  local command="$1"
  local subshell_start parameter_start
  printf -v subshell_start '%s' "\$("
  printf -v parameter_start '%s' "\${"
  [[ "$command" == *$'\n'* || "$command" == *";"* || "$command" == *"&&"* || "$command" == *"||"* || "$command" == *"|"* || "$command" == *"&"* || "$command" == *"<"* || "$command" == *">"* || "$command" == *"\`"* || "$command" == *"$subshell_start"* || "$command" == *"$parameter_start"* ]]
}

rg_needs_proxy() {
  local command="$1" trimmed rest first_arg
  is_direct_rg_command "$command" || return 1
  has_shell_control "$command" && return 1

  trimmed="$(trim_leading "$command")"
  rest="$(trim_leading "${trimmed#rg}")"
  first_arg="${rest%%[[:space:]]*}"

  case "$trimmed" in
    rg\ --version*|rg\ --help*|rg\ -h*) return 0 ;;
    *" --version"*|*" --help"*) return 0 ;;
    *" -l "|*" -l"|*"--files-with-matches"*|*"--files-without-match"*) return 0 ;;
    *" --json"*|*" --files"*|*" --count"*|*" -c"*) return 0 ;;
    *" -g "*|*" --glob "*|*" --iglob "*|*" --include "*|*" --include="*) return 0 ;;
    *" -i "*|*" -il "*|*" -li "*) return 0 ;;
  esac

  if [[ "$first_arg" == -* && "$first_arg" != "-n" && "$first_arg" != "--line-number" ]]; then
    return 0
  fi

  return 1
}

if is_broad_codex_memory_scan "$cmd"; then
  deny_reason "Broad ~/.codex scans are blocked to prevent runaway session/memory output. Search ~/.codex/memories/MEMORY.md first, then one specific rollout_summaries file with a bounded query."
  exit 0
fi

if rg_needs_proxy "$cmd"; then
  emit_rewrite "rtk proxy --ultra-compact $(trim_leading "$cmd")"
  exit 0
fi

rewritten=""
set +e
rewritten="$(rtk rewrite "$cmd" 2>/dev/null)"
status=$?
set -e

case "$status" in
  0|3)
    if [ "$cmd" = "$rewritten" ] || [ -z "$rewritten" ]; then
      exit 0
    fi
    emit_rewrite "$rewritten"
    exit 0
    ;;
  1|2)
    exit 0
    ;;
  *)
    echo "rtk rewrite failed while checking command for Codex." >&2
    exit 2
    ;;
esac
