#!/usr/bin/env bash

get_etrnl_skill_hint() {
  local message
  # Keep this in sync with skills/etrnl-*/SKILL.md and scripts/lib/skill-lists.sh.
  message="ETRNL skills: etrnl-agent-files, etrnl-brainstorm, etrnl-code-health, "
  message+="etrnl-commit, etrnl-deps, etrnl-execute, etrnl-fix-issue, etrnl-parallel, "
  message+="etrnl-plan, etrnl-pr, etrnl-review, etrnl-stress-test, etrnl-test. "
  message+="Companion passes (when installed): "
  message+="eternal-best-practices, code-simplifier, finding-duplicate-functions, brooks-audit."
  printf '%s\n' "$message"
}
