---
status: accepted
date: 2026-10-12
---

# Durable project overview with ledger-derived evidence

## Context

Private execution ledgers, compact handoffs and review-learning stores preserve useful evidence but do not provide a portable, current feature overview. Requiring users to request bookkeeping repeatedly leaves project state stale; creating parallel state files or inferring lessons from exit codes would add conflicting information.

## Decision

Maintain one tracked `PROJECT_STATE.md`, or bind an existing supported project overview. Its authored current scope, feature status, pending work and curated lessons are the durable project summary. A bounded generated block projects evidence from the canonical execution ledger. Do not add another task database, snapshot index or automatically inferred causal lesson store.

The canonical workflow contract selects state acknowledgement requirements. Authored updates precede final checks/review; acknowledgement binds task, source and authored content. Only the exact structurally valid generated evidence block is hash-neutral. Ledger evidence remains authoritative for captured checks and reviews; an authored feature label is not proof of readiness.

Shared native guidance requests maintenance without repeated user reminders. Supported helper completion checks enforce required freshness deterministically when used. Core remains free of automatic hooks and background services; optional host registration and actual behavior must be reported separately.

## Relationship to existing decisions

This extends [ADR 0001](0001-documentation-and-decision-model.md): a durable project overview is tracked, while private implementation plans and raw evidence remain local. It does not replace [ADR 0002](0002-etrnl-state-and-compact-handoff.md)'s compact event substrate, execution ledger or backlog boundaries. The overview links to those records rather than mirroring them as another database.

For commands, document selection and maintenance guidance, use [Project state](../project-state.md). Semantic accuracy remains an agent/reviewer responsibility; deterministic checks establish structure and freshness rather than inventing project facts.
