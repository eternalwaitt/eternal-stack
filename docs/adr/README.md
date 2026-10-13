# Architecture Decision Records

This directory holds durable Eternal Stack decisions that should outlive one implementation plan.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-documentation-and-decision-model.md) | accepted | Keep root docs short, put operational detail in focused docs/skills/rules, keep implementation plans outside tracked docs, and use ADRs for durable future decisions. |
| [0002](0002-etrnl-state-and-compact-handoff.md) | accepted | Keep Claude in charge of compaction, use bounded local ETRNL JSONL state for compact handoff, keep Beads backlog-only, and keep Dolt out of hook hot paths. |
| [0003](0003-exodia-cross-host-rules.md) | accepted | Single-source rule modules with generated host twins (Claude `.claude/rules/`, Cursor `.mdc`, Codex `AGENTS.md`); copies not symlinks; profiles explicit; byte budget read from config; checksums track drift; privacy banned-token gate. |
| [0004](0004-coderabbit-preemption-lean.md) | superseded for current routing | Historical decision about deterministic review rules and recurring-finding learning; it no longer defines required planning, reviewer, or convergence policy. |
| [2026-10](2026-10-portable-core.md) | superseded in v0.12.0 | Earlier guidance-only Core reset. The current candidate adds one native router and a private on-demand library while retaining alternative optional profiles. |
| [2026-10 project state](2026-10-project-state.md) | accepted | Keep one durable authored project overview with bounded ledger-derived evidence and source-bound completion acknowledgement; native guidance and deterministic helper enforcement remain distinct. |

## Policy

- Use ADRs for architecture, install topology, hook model, documentation system, public workflow contracts, or security boundaries that future changes must preserve.
- Keep new implementation plans in ignored local planning paths; they are execution records, not active decision policy. Older tracked files under `docs/plans/` are historical unless a current guide explicitly points to one.
- Supersede ADRs with a new ADR instead of editing history after a decision has shipped.
- Older decisions may remain as historical records; the status and successor must make clear that they are not active workflow policy.
