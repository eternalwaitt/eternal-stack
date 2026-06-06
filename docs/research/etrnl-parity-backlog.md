# ETRNL Parity Backlog

<!-- Generated file. Do not edit manually. -->
<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->

| Skill | Priority | Milestone | Gaps |
| --- | --- | --- | --- |
| etrnl-dev-autoplan | P0 | M1 | research_flow:add mandatory top-10 competitor compare stage before plan finalization; verification_gates:block final plans lacking code-level citations in evidence section |
| etrnl-audit-code | P0 | M1 | verification_gates:gate health completion on evidence validator and scorecard completeness; parallelism_safety:add overlap-safe split for research extraction and parity generation tasks |
| etrnl-dev-execute | P0 | M1 | subagent_orchestration:upgrade task packet contract to require competitor-evidence ownership per wave; parallelism_safety:add mandatory research-wave overlap checks before parity rewrites |
| etrnl-dev-plan | P0 | M1 | research_flow:force explicit competitor matrix inputs as a hard precondition for final plan status |
| etrnl-dev-review | P0 | M1 | research_flow:require code-level competitor citations in review findings for strategy/skill recommendations; verification_gates:fail review completion if recommendation lacks source row references |
| etrnl-dev-test | P0 | M1 | tdd_enforcement:codify red-green-refactor evidence requirements in test plans; verification_gates:require explicit pass/fail gate snapshots for every mandatory command |
| etrnl-dev-brainstorm | P1 | M1 | research_flow:require competitor landscape section with explicit does/does-not outputs |
| etrnl-dev-ci | P1 | M2 | telemetry_proactive:summarize CI run id, required-check status, deploy revision, and rollback evidence in workflow-health output |
| etrnl-audit | P1 | M2 | telemetry_proactive:surface stale or missing category coverage in workflow-health when the deep-audit registry changes |
| etrnl-ops-disk-cleanup | P1 | M1 | verification_gates:record before/after free-space evidence and dry-run manifest paths in cleanup reports |
| etrnl-audit-docs | P1 | M2 | verification_gates:add a machine-checkable documentation ledger validator for inventory coverage and terminal dispositions; telemetry_proactive:emit docs-drift summaries when docs, skills, changelog, or AI-context files change |
| etrnl-comm-email-reply-quality | P1 | M2 | telemetry_proactive:emit proactive draft-style drift notes when email runtime checks, command docs, or installed skill docs diverge; tdd_enforcement:require red-green fixtures for each new outgoing-reply style rule |
| etrnl-dev-debug | P1 | M2 | tdd_enforcement:require failing test reference before fix implementation for skill/hook regressions |
| etrnl-dev-parallel | P1 | M2 | parallelism_safety:add strict no-overlap contract check for research subagent lanes; verification_gates:require verification receipts from each lane before merge phase |
| etrnl-audit-browser | P1 | M2 | telemetry_proactive:publish proactive QA drift summary when competitor-facing surfaces regress |
| etrnl-dev-stress-test | P1 | M2 | rollback_guardrails:attach deterministic rollback steps for each stress test failure mode; telemetry_proactive:emit stress telemetry summary with retry/failure thresholds |
| etrnl-ops-agent-files | P2 | M2 | telemetry_proactive:emit proactive drift report when AGENTS/CLAUDE baselines diverge |
| etrnl-audit-excellence | P2 | M3 | none |
| etrnl-dev-commit | P2 | M2 | rollback_guardrails:require rollback snippet for high-risk hook/script changes in commit summary |
| etrnl-ops-context-restore | P2 | M3 | telemetry_proactive:track stale context restores and emit follow-up recommendations |
| etrnl-ops-context-save | P2 | M3 | verification_gates:block save when verification artifacts are missing for execution runs |
| etrnl-dev-deps | P2 | M2 | rollback_guardrails:require dependency rollback command sequence in dependency upgrades |
| etrnl-audit-performance | P2 | M3 | telemetry_proactive:emit lane timing and blocked-lane summaries for recurring performance-audit runs |
| etrnl-audit-production | P2 | M3 | parallelism_safety:document split-safe sublanes before turning production-readiness from sequential execution into fanout execution |
| etrnl-dev-pr | P2 | M3 | verification_gates:require matrix/backlog artifact diffs in PR checklist when parity work is touched |
| etrnl-audit-repo | P2 | M3 | none |
| etrnl-audit-reuse | P2 | M3 | none |
| etrnl-audit-security | P2 | M3 | rollback_guardrails:attach fix validation and rollback evidence to security remediation runs after read-only audit findings are accepted |
| etrnl-audit-tooling | P2 | M3 | none |
| etrnl-audit-ux | P2 | M3 | none |
