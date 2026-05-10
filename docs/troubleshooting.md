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
- incomplete run ledger under `~/.claude/control-plane/runs/`
- missing required artifact under `~/.claude/control-plane/artifacts/`
- subagent output missing `ETRNL_TASK_ID`
- hook event payload changed after a Claude Code update

To inspect recent workflow state:

```bash
~/.claude/scripts/workflow-health.mjs
~/.claude/scripts/execution-ledger.mjs history
~/.claude/scripts/review-log.mjs summary
~/.claude/scripts/browser-qa-report.mjs summary
~/.claude/scripts/context-state.mjs list
```
