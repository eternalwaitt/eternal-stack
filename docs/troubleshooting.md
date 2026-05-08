# Troubleshooting

If Claude gets blocked incorrectly:

1. Run `CLAUDE_GUARD_DISABLED=1 claude` for emergency repair.
2. Run `~/.claude/hooks/test-hooks.sh`.
3. Run `~/.claude/scripts/doctor.sh`.
4. Restore the latest backup with `~/.claude/scripts/rollback-local.sh`.

Common causes:

- invalid JSON emitted by a hook
- missing `jq`, `node`, `rg`, `fd`, or `sg`
- stale state under `$TMPDIR/claude-guard-*.json`
- hook event payload changed after a Claude Code update

