# Architecture Decision Records

This directory holds durable control-plane decisions that should outlive one implementation plan.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-documentation-and-decision-model.md) | accepted | Keep root docs short, put operational detail in focused docs/skills/rules, keep historical execution plans under `docs/plans/`, and use ADRs for durable future decisions. |
| [0002](0002-etrnl-state-and-compact-handoff.md) | accepted | Keep Claude in charge of compaction, use bounded local ETRNL JSONL state for compact handoff, keep Beads backlog-only, and keep Dolt out of hook hot paths. |

## Policy

- Use ADRs for architecture, install topology, hook model, documentation system, public workflow contracts, or security boundaries that future changes must preserve.
- Keep implementation plans in `docs/plans/`; they are historical execution records, not active decision policy.
- Supersede ADRs with a new ADR instead of editing history after a decision has shipped.
