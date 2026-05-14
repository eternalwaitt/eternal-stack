#!/usr/bin/env bash
#
# Centralized skill identifiers for the ETRNL control plane.
# Used by install, doctor, and domain-sensitive hook gates.
# Add new repo-owned skills to OWNED_SKILLS by directory name only, then run doctor.
# The parity-scorecard schema does not hardcode OWNED_SKILLS count; rerun tests/test-workflow-tools.sh when skills change.
# Keep hooks/lib/skill-hints.sh fallback `skills=(...)` synchronized with OWNED_SKILLS.
# LEGACY_SKILLS names are moved into the install backup during migration.

OWNED_SKILLS=(
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

OWNED_AGENTS=(
  etrnl-adversary
  etrnl-browser-qa
  etrnl-design-reviewer
  etrnl-dx-reviewer
  etrnl-executor
  etrnl-investigator
  etrnl-quality-reviewer
  etrnl-scout
  etrnl-spec-reviewer
)

CRITICAL_HOOKS=(
  cc-pretooluse-guard.sh
  cc-rate-limiter.sh
  cc-posttoolbatch-observer.sh
  cc-stop-verifier.sh
  cc-posttoolusefailure-diagnose.sh
)

CRITICAL_SCRIPTS=(
  execution-ledger.mjs
  execute-evidence-check.mjs
  plan-readiness-check.mjs
  agent-task-packet-check.mjs
  guard-override-token.mjs
  lib/bash-array-parser.mjs
  lib/cli-args.mjs
  lib/evidence-trace.mjs
  lib/plan-headings.mjs
  lib/text-matchers.mjs
  lib/research-intel-core.mjs
  lib/research-intel-render.mjs
  lib/research-intel-validators.mjs
  lib/skill-lists.sh
  merge-settings.mjs
  settings-audit.mjs
  replay-hook-fixtures.mjs
  research-competitor-intel.mjs
  skill-contract-check.mjs
  skill-behavior-smoke.mjs
  update-check.mjs
)

LEGACY_SKILLS=(
  agent-file-doctor
  code-health
  code-review
  commit
  deps
  devils-advocate
  etrnl-run-plan
  execute-plan
  fix-issue
  parallel-fan-out
  pr
  test
  writing-plans
  eternal-control-agent-file-doctor
  eternal-control-brainstorming
  eternal-control-code-health
  eternal-control-code-review
  eternal-control-commit
  eternal-control-deps
  eternal-control-devils-advocate
  eternal-control-execute-plan
  eternal-control-fix-issue
  eternal-control-parallel-fan-out
  eternal-control-pr
  eternal-control-test
  eternal-control-writing-plans
  eternal-agent-file-doctor
  eternal-code-health
  eternal-code-review
  eternal-commit
  eternal-deps
  eternal-devils-advocate
  eternal-execute-plan
  eternal-fix-issue
  eternal-parallel-fan-out
  eternal-pr
  eternal-test
  eternal-writing-plans
)

# Companion/domain-sensitive skills that gate protected edits in hooks.
DOMAIN_COMPANION_SKILL_PATTERN='^(eternal-best-practices|domain-[a-z0-9_-]+|better-auth|tenant-isolation(-patterns)?|money-vo-discipline|prisma-expert|i18n-localization|stripe-best-practices|abacatepay-integration)$'

# Keep shellcheck aware these sourced constants are intentionally read by callers.
: "${OWNED_SKILLS[*]}" "${OWNED_AGENTS[*]}" "${CRITICAL_HOOKS[*]}" "${CRITICAL_SCRIPTS[*]}" "${LEGACY_SKILLS[*]}" "$DOMAIN_COMPANION_SKILL_PATTERN"
