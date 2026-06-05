---
status: accepted
date: 2026-06-05
---

# ADR 0002: ETRNL State And Compact Handoff

## Context

Claude Code owns context-window pressure and the actual compact operation. The control plane can observe `PreCompact`, `PostCompact`, `SessionStart(source=compact)`, `SessionEnd`, and `Stop`, but it should not guess when Claude should compact or call `/compact` from hooks.

The previous compact path mixed tmp-only hook state, generic companion hooks, async restore timing, execution ledgers, context snapshots, and workflow-health projections. That made compact recovery noisy and fragile: reminders could appear before Claude needed them, compact context could arrive late, and completion claims could reuse verification evidence captured before compaction.

## Decision

Use a small append-only ETRNL state stream as the canonical local compact and workflow event substrate.

- JSONL under `~/.claude/control-plane/state` is canonical for the first implementation.
- Hooks append bounded typed events through `scripts/etrnl-state.mjs`.
- Materialized views under `views/` are rebuildable projections, not source of truth.
- `SessionStart(source=compact)` is the restore point. It synchronously queries `compact-handoff` and injects only the bounded handoff packet.
- `PostCompact` records Claude's compact summary and marks verification stale. It does not inject context.
- `Stop` blocks completion claims when the newest compact event is newer than the latest relevant verification evidence.
- `execution-ledger.mjs`, `context-state.mjs`, `workflow-health.mjs`, and `tool-effectiveness.mjs` remain public compatibility surfaces during migration.

The schema includes `session`, `run`, `run_event`, `check`, `artifact`, `context_entry`, `compact_pre`, `compact_post`, `handoff`, `tool_signal`, `settings_observation`, `lesson`, `bead_link`, and `projection_error` event kinds.

## Privacy Boundary

The state layer rejects raw prompts, transcript text, transcript paths, secret-looking tokens, private project names, private home paths, and absolute changed-file lists before append. Hooks may write hashes, counts, known hook names, event kinds, compact summaries from Claude, next-action labels, and stale-verification booleans.

The public repo must never commit local state files. The tracked fixtures are synthetic.

## Hook Budget

Compact lifecycle hooks must stay local, bounded, and deterministic.

- Allowed: shell envelope, small Node CLI append/query, JSON stdout, file locks, bounded summaries.
- Rejected: model summarization, raw transcript reads, `claude -p`, hook-triggered `/compact`, Beads CLI, Dolt SQL, long database commands, and broad startup dumps.

Failure mode: append/query failures fail open with a short warning unless the explicit setting/install/Stop gate is designed to fail closed.

## Beads Boundary

Beads is backlog and dependency state only. It can link durable backlog items, blockers, dependencies, claims, and discovered follow-ups after compact recovery is already proven.

Beads must not mirror active ETRNL tasks, phases, checks, execution-ledger evidence, or compact handoff packets into issue comments. Raw `bd prime` output is never injected into startup, resume, or compact context.

## Semantic Memory Boundary

Hindsight is optional semantic recall/export. It is not compact state, execution state, or verification authority. A Hindsight lesson export must start from an accepted ETRNL `lesson` event, and a red Hindsight canary means recall is unavailable rather than partially trusted.

## Dolt Boundary

Dolt is not a hook-runtime dependency. It remains an optional future projection target for richer history after JSONL fixtures prove a query bottleneck and after a separate adapter plan is approved.

## Migration

1. Keep existing tmp guard state as a session cache during dual-write.
2. Append compact/session/tool events to ETRNL state.
3. Rebuild compact handoff views from JSONL.
4. Teach workflow-health, context-state, tool-effectiveness, and Stop verifier to read projections.
5. Harden settings/install/update so installed homes match the source lifecycle contract.
6. Keep live install gated behind explicit approval and staged rollback evidence.

## Consequences

- Compact recovery becomes native-lifecycle-aligned instead of reminder-driven.
- Installed settings drift is now a first-class failure, not a docs note.
- Beads remains valuable without competing with ETRNL execution authority.
- JSONL keeps rollback simple, but future relational queries require an explicit projection layer.
- The state schema must stay small. New event kinds need tests, privacy fixtures, and an ADR or plan update.

## Rejected Alternatives

- Tool-count compact reminders as the main behavior: rejected because they do not know Claude's real context pressure.
- Async compact restore: rejected because compact handoff context can arrive after the model has already continued.
- Beads or Dolt as canonical runtime state: rejected for hook hot-path reliability and authority conflicts.
- Model-generated summaries inside hooks: rejected for latency, cost, privacy, and nondeterminism.
- Startup replay of broad history: rejected because compact recovery should inject the latest handoff, not a memory dump.
