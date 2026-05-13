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

cc_test_quality_violations() {
  local text="$1"
  local path="${2:-}"
  local lower_path
  lower_path="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower_path" =~ (\.test\.|\.spec\.|/tests?/|__tests__) ]] || return 1

  local violations=()
  local empty_test_re='\b(it|test)[[:space:]]*\([^,]+,[[:space:]]*(async[[:space:]]*)?\([^)]*\)[[:space:]]*=>[[:space:]]*\{[[:space:]]*\}[[:space:]]*\)'
  local commented_assertion_re=$'(^|\n)[[:space:]]*(//|#)[[:space:]]*(await[[:space:]]+)?(expect|assert|should|self\\.assert)'
  local trivial_assertion_re=$'(expect|assert)[^\n;]{0,120}(true|1)[[:space:]]*\\)?[[:space:]]*;?'
  if [[ "$text" =~ (describe|it|test|suite)\.skip[[:space:]]*\( || "$text" =~ (^|[^A-Za-z0-9_])(xit|xtest)[[:space:]]*\( ]]; then
    violations+=("skipped tests are not allowed")
  fi
  if [[ "$text" =~ (describe|it|test|suite)\.only[[:space:]]*\( ]]; then
    violations+=("focused .only tests must not be committed")
  fi
  if [[ "$text" =~ $commented_assertion_re ]]; then
    violations+=("commented-out assertions are not allowed")
  fi
  if [[ "$text" =~ $empty_test_re ]]; then
    violations+=("empty tests are not allowed")
  fi
  if [[ "$text" =~ $trivial_assertion_re ]]; then
    violations+=("trivial always-true assertions are not allowed")
  fi
  if (( ${#violations[@]} > 0 )); then
    printf '%s\n' "${violations[@]}"
    return 0
  fi
  return 1
}

cc_test_quality_violation() {
  local text="$1"
  local path="${2:-}"
  local output
  if output="$(cc_test_quality_violations "$text" "$path")"; then
    printf '%s' "$output"
    return 0
  fi
  return 1
}

cc_text_has_safety_category() {
  local text="$1"
  local category="$2"
  case "$category" in
    error-handling)
      [[ "$text" =~ (^|[^A-Za-z])(try|catch|except|raise|throw[[:space:]]+new)([^A-Za-z]|$)|\.(catch)[[:space:]]*\( ]]
      ;;
    validation)
      [[ "$text" =~ (safeParse|parse[[:space:]]*\(|validate|validation|schema|z\.|assert|invariant|precondition|require[[:space:]]*\() ]]
      ;;
    access-guard)
      [[ "$text" =~ (authorize|permission|role|tenant|auth|deletedAt|soft[-_[:space:]]?delete|guard) ]]
      ;;
    failure-logging)
      [[ "$text" =~ logger\.(error|warn)|console\.error ]]
      ;;
    *) return 1 ;;
  esac
}

cc_safety_removal_violation() {
  local old_text="$1"
  local new_text="$2"
  local category
  [[ -n "$old_text" && -n "$new_text" ]] || return 1
  for category in error-handling validation access-guard failure-logging; do
    if cc_text_has_safety_category "$old_text" "$category" && ! cc_text_has_safety_category "$new_text" "$category"; then
      printf 'Safety-removal violation. This edit removes %s. Keep the protection or replace it with an explicit equivalent in the same change.' "$category"
      return 0
    fi
  done
  return 1
}

cc_line_count() {
  local text="$1"
  local count=0
  while IFS= read -r _line; do
    count=$((count + 1))
  done <<<"$text"
  if [[ -z "$text" ]]; then
    count=0
  fi
  printf '%s\n' "$count"
}

cc_large_change_violation() {
  local old_text="$1"
  local new_text="$2"
  local tool_name="${3:-Edit}"
  local old_lines new_lines delta churn
  old_lines="$(cc_line_count "$old_text")"
  new_lines="$(cc_line_count "$new_text")"
  delta=$((new_lines - old_lines))
  (( delta < 0 )) && delta=$((0 - delta))
  churn=$((old_lines + new_lines))

  if [[ "$tool_name" == "Write" && "$old_lines" == "0" && "$new_lines" -gt 220 ]]; then
    printf 'Large-change violation. New source files over 220 lines must be split or generated through a focused tool.'
    return 0
  fi
  if (( delta > 120 || churn > 260 )); then
    printf 'Large-change violation. Split this edit into smaller reviewable steps, or first record a plan/review artifact for the larger change.'
    return 0
  fi
  return 1
}

cc_evidence_discipline_violation() {
  local text="$1"
  local lower lead
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  lead="${lower:0:2000}"

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

  if violation="$(cc_ownership_deflection_violation "$lead")"; then
    printf '%s' "$violation"
    return 0
  fi

  return 1
}

cc_ownership_deflection_violation() {
  local lead="$1"
  local pattern
  local patterns=(
    'pre[-[:space:]]?existing[[:space:]]+(issue|bug|failure|error|problem|test|warning)'
    'existing[[:space:]]+(issue|bug|failure|error|problem|test|warning)'
    '(not|isn.?t|wasn.?t)[[:space:]]+(from|caused[[:space:]]+by|introduced[[:space:]]+by)[[:space:]]+(my|this|these|our)[[:space:]]+(change|changes|work)'
    'unrelated[[:space:]]+(failure|error|issue|bug|problem|test|warning)'
    'unrelated[[:space:]]+to[[:space:]]+(my|this|these|our)[[:space:]]+(change|changes|work)'
    '(out[[:space:]]+of[[:space:]]+scope|outside[[:space:]]+scope)[^.]{0,160}(fix|failure|error|bug|issue|test|warning|lint|typecheck|build)'
    '(fix|failure|error|bug|issue|test|warning|lint|typecheck|build)[^.]{0,160}(out[[:space:]]+of[[:space:]]+scope|outside[[:space:]]+scope)'
    'bigger[[:space:]]+refactor'
    'defer(red|ring)?[[:space:]]+(the|this|that|it|fix|issue|bug|failure|error|test|warning|cleanup|refactor)'
    '(leave|leaving)[[:space:]]+(it|this|that)[[:space:]]+(for|to)[[:space:]]+(later|follow[-[:space:]]?up)'
  )
  for pattern in "${patterns[@]}"; do
    if [[ "$lead" =~ $pattern ]]; then
      printf 'Ownership-deflection violation. Do not label failures as pre-existing, unrelated, out of scope, or deferred. Fix issues found during the work, or state the exact file, line, command, and technical blocker.'
      return 0
    fi
  done
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

cc_extract_old_edit_text() {
  jq -r '
    [
      .tool_input.old_string,
      ((.tool_input.edits // [])[] | .old_string)
    ] | map(select(type == "string")) | join("\n")
  ' <<<"${HOOK_INPUT:-{}}" 2>/dev/null
}
