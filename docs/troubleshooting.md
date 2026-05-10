# Troubleshooting

If Claude gets blocked incorrectly:

1. Run `CLAUDE_GUARD_DISABLED=1 claude` for emergency repair.
2. Run `~/.claude/hooks/test-hooks.sh`.
3. Run `~/.claude/scripts/doctor-control-plane.sh`.
4. Restore the latest backup with `~/.claude/scripts/rollback-local.sh`.

The installer creates `doctor-control-plane.sh` and symlinks `doctor.sh` to it, so both names work; the explicit name avoids ambiguity with project doctors.

Common causes:

- invalid JSON emitted by a hook
- missing `jq`, `node`, `rg`, `fd`, or `sg`
- stale state under `$TMPDIR/claude-guard-*.json`
- hook event payload changed after a Claude Code update
