---
name: etrnl-context-restore
description: ETRNL context-restore workflow for Claude Code. Use when resuming prior work, loading a saved handoff, recovering after compaction, or checking what remains from an earlier run.
model: haiku
effort: low
disable-model-invocation: true
---
# ETRNL Context Restore

Restore local-only workflow context without replaying transcripts.

## Workflow

1. List saved contexts when no explicit path is provided:
   - `node ~/.claude/scripts/context-state.mjs list`
2. Show the selected context:
   - `node ~/.claude/scripts/context-state.mjs restore <context-path>`
3. Compare current branch/status with the saved branch/status.
4. Resume from the saved remaining work only after checking current repo truth.

## Output

- Restored context title/path
- Saved branch/head versus current branch/head
- Decisions to preserve
- Remaining work
- Blockers and stale-context risks
