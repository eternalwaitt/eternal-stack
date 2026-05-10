#!/usr/bin/env bash

cc_policy_violations() {
  local text="$1"
  local suppress_re='eslint-disable|oxlint-disable|biome-disable|@ts-ignore'
  local empty_catch_re='catch[[:space:]]*(\([[:space:]]*[^)]*[[:space:]]*\)[[:space:]]*)?\{[[:space:]]*\}'
  local null_catch_re='catch[[:space:]]*(\([[:space:]]*[^)]*[[:space:]]*\)[[:space:]]*)?\{[[:space:]]*return[[:space:]]+null[[:space:]]*;?[[:space:]]*\}'
  local fallback_re='\|\|[[:space:]]*(""|\[\]|\{\})'
  local config_re='strict[[:space:]]*:[[:space:]]*false|skipLibCheck[[:space:]]*:[[:space:]]*true'
  local violations=()
  if [[ "$text" =~ $suppress_re ]]; then
    violations+=("lint/type suppression is not allowed; fix the code instead")
  fi
  if [[ "$text" =~ TODO|FIXME ]]; then
    violations+=("TODO/FIXME comments are not allowed; finish the work or create an issue")
  fi
  if [[ "$text" =~ $empty_catch_re ]]; then
    violations+=("empty catch blocks hide real failures")
  fi
  if [[ "$text" =~ $null_catch_re ]]; then
    violations+=("catch blocks must not return null silently")
  fi
  if [[ "$text" =~ $fallback_re ]]; then
    violations+=("silent default fallbacks are not allowed on typed code paths")
  fi
  if [[ "$text" =~ $config_re ]]; then
    violations+=("TypeScript/config weakening is not allowed")
  fi
  if (( ${#violations[@]} > 0 )); then
    printf '%s\n' "${violations[@]}"
    return 0
  fi
  return 1
}

cc_policy_violation() {
  local text="$1"
  local output
  if output="$(cc_policy_violations "$text")"; then
    printf '%s' "$output"
    return 0
  fi
  return 1
}

cc_evidence_discipline_violation() {
  local text="$1"
  local lower lead
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  lead="${lower:0:900}"

  case "$lead" in
    *"you're right"*|*"you are right"*|*"youre right"*|*"you’re right"*|*"you're correct"*|*"you are correct"*|*"good catch"*|*"i agree"*|*"fair point"*|*"absolutely"*|*"exactly"*)
      printf 'Evidence-before-agreement violation. Rewrite without reflexive agreement. Start with what is verified or not yet verified, then name the evidence check or correction.'
      return 0
      ;;
  esac

  if [[ "$lead" =~ (sorry|apolog) ]] && [[ "$lead" =~ (let[[:space:]]+me|i[[:space:]]+(will|can)[[:space:]]+(check|search|verify|look|inspect)) ]]; then
    printf 'Apology-before-evidence violation. Do not apologize and promise to check; state the current evidence state and perform or name the concrete check.'
    return 0
  fi

  if [[ "$lead" =~ (let[[:space:]]+me[[:space:]]+(check|search|verify|look|inspect)) ]] && [[ "$lead" =~ (right|correct|agree|catch|sorry) ]]; then
    printf 'Validation-theater violation. Do not agree before checking; use the evidence-first correction protocol.'
    return 0
  fi

  return 1
}

cc_sycophancy_violation() {
  cc_evidence_discipline_violation "$1"
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
