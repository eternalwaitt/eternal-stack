# Troubleshooting

If Claude gets blocked incorrectly:

1. Run `CLAUDE_GUARD_DISABLED=1 claude` for emergency repair.
2. Run `~/.claude/hooks/test-hooks.sh`.
3. Run `~/.claude/hooks/test-workflow-tools.sh`.
4. Run `~/.claude/scripts/doctor-control-plane.sh`.
5. Run `node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json`.
6. Restore the latest backup with `~/.claude/scripts/rollback-local.sh`.

The installer creates `doctor-control-plane.sh` and symlinks `doctor.sh` to it, so both names work; the explicit name avoids ambiguity with project doctors.

Common causes:

- invalid JSON emitted by a hook
- missing `jq`, `node`, `rg`, `fd`, or `sg`
- stale state under `$TMPDIR/claude-guard-*.json`
- duplicated hook commands or overlapping matchers in `~/.claude/settings.json`
- legacy `~/.claude/hooks/rate-limiter.sh` registrations that should be migrated to `cc-rate-limiter.sh`
- incomplete run ledger under `~/.claude/control-plane/runs/`
- open UAT findings recorded in the active execution ledger
- missing required artifact under `~/.claude/control-plane/artifacts/`
- completed browser QA reports missing real console/network summaries or v2 route/viewport matrix counts
- subagent output missing `ETRNL_TASK_ID`
- multi-file `etrnl-execute` work missing implementation, spec-review, or quality-review subagent evidence
- `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0` disabled prompt-context reinjection
- `CLAUDE.md` prompt context clipped by `CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS` or `CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS`
- markdown `@*.md` references skipped because they resolve outside the allowed global/project root, exceed the five-hop recursion cap, or point to non-markdown files
- hook event payload changed after a Claude Code update

To inspect install and settings drift:

```bash
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
~/.claude/scripts/post-upgrade-canary.sh
```

To repair duplicated hooks and legacy rate-limiter registrations:

```bash
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --fix
~/.claude/scripts/doctor-control-plane.sh
```

To replay scrubbed hook regressions against the installed hooks:

```bash
node ~/.claude/scripts/replay-hook-fixtures.mjs
```

To inspect recent workflow state:

```bash
~/.claude/scripts/workflow-health.mjs
~/.claude/scripts/workflow-health.mjs status
~/.claude/scripts/workflow-health.mjs status --json
~/.claude/scripts/execution-ledger.mjs history
~/.claude/scripts/review-log.mjs summary
~/.claude/scripts/browser-qa-report.mjs summary
~/.claude/scripts/context-state.mjs list
```
