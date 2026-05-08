#!/usr/bin/env bash

cc_policy_violation() {
  local text="$1"
  local suppress_re='eslint-disable|oxlint-disable|biome-disable|@ts-ignore'
  local empty_catch_re='catch[[:space:]]*\{[[:space:]]*\}'
  local null_catch_re='catch[[:space:]]*\{[[:space:]]*return[[:space:]]+null[[:space:]]*;?[[:space:]]*\}'
  local fallback_re='\|\|[[:space:]]*(""|\[\]|\{\})'
  local config_re='strict[[:space:]]*:[[:space:]]*false|skipLibCheck[[:space:]]*:[[:space:]]*true'
  if [[ "$text" =~ $suppress_re ]]; then
    printf 'lint/type suppression is not allowed; fix the code instead'
    return 0
  fi
  if [[ "$text" =~ TODO|FIXME ]]; then
    printf 'TODO/FIXME comments are not allowed; finish the work or create an issue'
    return 0
  fi
  if [[ "$text" =~ $empty_catch_re ]]; then
    printf 'empty catch blocks hide real failures'
    return 0
  fi
  if [[ "$text" =~ $null_catch_re ]]; then
    printf 'catch blocks must not return null silently'
    return 0
  fi
  if [[ "$text" =~ $fallback_re ]]; then
    printf 'silent default fallbacks are not allowed on typed code paths'
    return 0
  fi
  if [[ "$text" =~ $config_re ]]; then
    printf 'TypeScript/config weakening is not allowed'
    return 0
  fi
  return 1
}

cc_extract_edit_text() {
  jq -r '
    [
      .tool_input.content,
      .tool_input.new_string,
      ((.tool_input.edits // [])[] | .new_string)
    ] | map(select(type == "string")) | join("\n")
  ' <<<"${HOOK_INPUT:-{}}" 2>/dev/null || true
}
