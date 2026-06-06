# ETRNL Parity Backlog

<!-- Generated file. Do not edit manually. -->
<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->

| Skill | Priority | Milestone | Gaps |
| --- | --- | --- | --- |
| etrnl-autoplan | P0 | M1 | research_flow:add mandatory top-10 competitor compare stage before plan finalization; verification_gates:block final plans lacking code-level citations in evidence section |
| etrnl-code-health | P0 | M1 | verification_gates:gate health completion on evidence validator and scorecard completeness; parallelism_safety:add overlap-safe split for research extraction and parity generation tasks |
| etrnl-execute | P0 | M1 | subagent_orchestration:upgrade task packet contract to require competitor-evidence ownership per wave; parallelism_safety:add mandatory research-wave overlap checks before parity rewrites |
| etrnl-plan | P0 | M1 | research_flow:force explicit competitor matrix inputs as a hard precondition for final plan status |
| etrnl-review | P0 | M1 | research_flow:require code-level competitor citations in review findings for strategy/skill recommendations; verification_gates:fail review completion if recommendation lacks source row references |
| etrnl-test | P0 | M1 | tdd_enforcement:codify red-green-refactor evidence requirements in test plans; verification_gates:require explicit pass/fail gate snapshots for every mandatory command |
| etrnl-brainstorm | P1 | M1 | research_flow:require competitor landscape section with explicit does/does-not outputs |
| etrnl-documentation-health | P1 | M2 | verification_gates:add a machine-checkable documentation ledger validator for inventory coverage and terminal dispositions; telemetry_proactive:emit docs-drift summaries when docs, skills, changelog, or AI-context files change |
| etrnl-systematic-debugging | P1 | M2 | tdd_enforcement:require failing test reference before fix implementation for skill/hook regressions |
| etrnl-parallel | P1 | M2 | parallelism_safety:add strict no-overlap contract check for research subagent lanes; verification_gates:require verification receipts from each lane before merge phase |
| etrnl-qa-browser | P1 | M2 | telemetry_proactive:publish proactive QA drift summary when competitor-facing surfaces regress |
| etrnl-stress-test | P1 | M2 | rollback_guardrails:attach deterministic rollback steps for each stress test failure mode; telemetry_proactive:emit stress telemetry summary with retry/failure thresholds |
| etrnl-agent-files | P2 | M2 | telemetry_proactive:emit proactive drift report when AGENTS/CLAUDE baselines diverge |
| etrnl-commit | P2 | M2 | rollback_guardrails:require rollback snippet for high-risk hook/script changes in commit summary |
| etrnl-context-restore | P2 | M3 | telemetry_proactive:track stale context restores and emit follow-up recommendations |
| etrnl-context-save | P2 | M3 | verification_gates:block save when verification artifacts are missing for execution runs |
| etrnl-deps | P2 | M2 | rollback_guardrails:require dependency rollback command sequence in dependency upgrades |
| etrnl-pr | P2 | M3 | verification_gates:require matrix/backlog artifact diffs in PR checklist when parity work is touched |
