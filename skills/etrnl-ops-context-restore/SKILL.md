---
name: etrnl-ops-context-restore
description: ETRNL context-restore workflow for Claude Code. Use when resuming prior work, loading a saved handoff, recovering after compaction, or checking what remains from an earlier run.
disable-model-invocation: true
---
# ETRNL Context Restore

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-context-restore`; on update, ask update/snooze/continue.

Codex startup checks use the Codex install root (`~/.codex`). Context restore commands below use the Claude install root (`~/.claude`) because install copies the source helper `scripts/context-state.mjs` to `~/.claude/scripts/context-state.mjs`.

Restore local-only workflow context without replaying transcripts.

Treat restored context as a pointer, not proof. Verify saved `decision`, `pattern`, `preference`, `fact`, and `solution` entries against current repo/runtime state before acting on them.

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
