#!/usr/bin/env bash

get_etrnl_skill_hint() {
  local script_dir skill_lists message joined
  local skills=()
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  if [[ -n "$script_dir" ]]; then
    skill_lists="$script_dir/../../scripts/lib/skill-lists.sh"
  else
    skill_lists=""
  fi
  if [[ -n "$skill_lists" && -r "$skill_lists" ]]; then
    # shellcheck source=scripts/lib/skill-lists.sh
    source "$skill_lists"
    if [[ -n "${OWNED_SKILLS+x}" && "${#OWNED_SKILLS[@]}" -gt 0 ]]; then
      skills=("${OWNED_SKILLS[@]}")
    fi
  fi
  if [[ "${#skills[@]}" -eq 0 ]]; then
    skills=(
      etrnl-agent-files
      etrnl-autoplan
      etrnl-brainstorm
      etrnl-code-health
      etrnl-commit
      etrnl-context-restore
      etrnl-context-save
      etrnl-deps
      etrnl-execute
      etrnl-fix-issue
      etrnl-parallel
      etrnl-plan
      etrnl-pr
      etrnl-qa-browser
      etrnl-review
      etrnl-stress-test
      etrnl-test
    )
  fi
  joined="$(IFS=', '; printf '%s' "${skills[*]}")"
  message="ETRNL skills: ${joined}"
  message+=". "
  message+="Companion passes (when installed): "
  message+="eternal-best-practices, code-simplifier, finding-duplicate-functions, brooks-audit."
  printf '%s\n' "$message"
}
