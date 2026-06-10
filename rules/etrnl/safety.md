# Safety

- Emergency bypass for broken guards: `CLAUDE_GUARD_DISABLED=1`.
- Use the bypass only to repair hook configuration, then remove it.
- Preserve unrelated user changes in dirty worktrees.
- Do not run destructive git or filesystem commands unless the user clearly requested them.
- Keep secrets, local account details, transcripts, and memories out of this repo.
