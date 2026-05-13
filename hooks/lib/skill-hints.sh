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
  if [[ -n "$skill_lists" && ! -f "$skill_lists" ]]; then
    printf 'claude-guard warning: skill list not found: %s\n' "$skill_lists" >&2
    skill_lists=""
  elif [[ -n "$skill_lists" && ! -r "$skill_lists" ]]; then
    printf 'claude-guard warning: skill list not readable: %s\n' "$skill_lists" >&2
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
    printf 'claude-guard warning: OWNED_SKILLS missing; run scripts/doctor.sh to restore skill list sync\n' >&2
    skills=("unknown")
  fi
  joined="$(IFS=', '; printf '%s' "${skills[*]}")"
  message="ETRNL skills: ${joined}"
  message+=". "
  message+="Companion passes (when installed): "
  message+="eternal-best-practices, code-simplifier, finding-duplicate-functions, brooks-audit."
  printf '%s\n' "$message"
}
