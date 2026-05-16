#!/usr/bin/env bash
# Keep RTK token-saving rewrites active while preserving rg semantics that
# `rtk grep` does not support.

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

if ! command -v rtk >/dev/null 2>&1; then
  exit 0
fi

INPUT="$(cat)"
CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)"

if [[ -z "$CMD" ]]; then
  exit 0
fi

trim_leading() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "$value"
}

is_direct_rg_command() {
  local trimmed
  trimmed="$(trim_leading "$1")"
  [[ "$trimmed" == "rg" || "$trimmed" == rg[[:space:]]* ]]
}

has_unsafe_shell_control() {
  local command="$1"
  [[ "$command" == *$'\n'* || "$command" == *";"* || "$command" == *"&&"* || "$command" == *"||"* || "$command" == *"\`"* || "$command" == *'$('* ]]
}

rg_needs_proxy() {
  local command="$1"
  local trimmed rest first_arg
  is_direct_rg_command "$command" || return 1
  has_unsafe_shell_control "$command" && return 1

  trimmed="$(trim_leading "$command")"
  rest="$(trim_leading "${trimmed#rg}")"
  first_arg="${rest%%[[:space:]]*}"

  case "$trimmed" in
    rg\ --version*|rg\ --help*|rg\ -h*) return 0 ;;
    *" --version"*|*" --help"*) return 0 ;;
    *" -l"*|*"--files-with-matches"*|*"--files-without-match"*) return 0 ;;
    *" --json"*|*" --files"*|*" --count"*|*" -c"*) return 0 ;;
    *" -g "*|*" --glob "*|*" --iglob "*|*" --include "*|*" --include="*) return 0 ;;
    *" -i "*|*" -li "*|*" -il "*) return 0 ;;
  esac

  if [[ "$first_arg" == -* && "$first_arg" != "-n" && "$first_arg" != "--line-number" ]]; then
    return 0
  fi

  return 1
}

if ! rg_needs_proxy "$CMD"; then
  exit 0
fi

UPDATED_INPUT="$(jq --arg cmd "rtk proxy --ultra-compact $(trim_leading "$CMD")" '.tool_input.command = $cmd | .tool_input' <<<"$INPUT" 2>/dev/null || true)"

if [[ -z "$UPDATED_INPUT" ]]; then
  exit 0
fi

jq -n \
  --argjson updated "$UPDATED_INPUT" \
  '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "updatedInput": $updated
    }
  }'
