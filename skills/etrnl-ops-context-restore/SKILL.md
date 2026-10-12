---
name: etrnl-ops-context-restore
description: ETRNL context-restore workflow for Claude Code and Codex. Use when resuming prior work, loading a saved handoff, recovering after compaction, or checking what remains from an earlier run.
disable-model-invocation: true
---
# ETRNL Context Restore


Use the portable context helper from the Eternal library. The companion resolves the active Claude or Codex home and keeps saved state host-local; do not read another host's state by default.

Restore local-only workflow context without replaying transcripts.

Treat restored context as a pointer, not proof. Verify saved `decision`, `pattern`, `preference`, `fact`, and `solution` entries against current repo/runtime state before acting on them.

## Workflow

1. List saved contexts when no explicit path is provided:
   - `node {{ETRNL_COMPANION}} run scripts/context-state.mjs -- list`
2. Show the selected context:
   - `node {{ETRNL_COMPANION}} run scripts/context-state.mjs -- restore <context-path>`
3. Read the existing bound project-state overview and compare current branch/status with the saved branch/status. It supplies durable project context; the host-local snapshot supplies session continuation. Do not create or rewrite shared state merely to answer a read-only restore question.
4. Reconcile the existing task/run identity, remaining contract budget, check source/configuration freshness, worker status and owned process handles. Resume the same run; restoration does not replenish attempts or authorize repeat side effects.
5. Read only changed or missing evidence needed for the next action. If the checkpoint is absent or stale, recover from current source and a bounded relevant history lookup; explain unresolved facts rather than repeatedly restoring or replaying full transcripts.
6. Resume the saved remaining scope after reconciliation. Preserve settled decisions unless new evidence or user direction contradicts them.

## Output

- Restored context title/path
- Saved branch/head versus current branch/head
- Decisions to preserve
- Remaining work
- Blockers and stale-context risks
