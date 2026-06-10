# Troubleshooting

## Repo vs installed paths

This repository ships sources under `./hooks`, `./scripts`, and `./tests`. After install, the live Claude home uses `~/.claude/hooks/`, `~/.claude/scripts/`, and `~/.claude/scripts/doctor-etrnl.sh` (not `./scripts/doctor.sh`). Run repo health gates from the checkout with `./scripts/doctor.sh` and `tests/test-hooks.sh`; run installed-home checks with `~/.claude/scripts/doctor-etrnl.sh` when validating a personal rollout.

If Claude gets blocked incorrectly:

1. Run `CLAUDE_GUARD_DISABLED=1 claude` for emergency repair.
2. Run `~/.claude/hooks/test-hooks.sh`.
3. Run `~/.claude/hooks/test-workflow-tools.sh`.
4. Run `~/.claude/scripts/doctor-etrnl.sh`.
5. Run `node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json`.
6. Restore the latest backup with `~/.claude/scripts/rollback-local.sh`.

The installer creates `doctor-etrnl.sh` and symlinks `doctor.sh` to it, so both names work; the explicit name avoids ambiguity with project doctors.

Common causes:

- invalid JSON emitted by a hook
- missing `jq`, `node`, `rg`, `fd`, or `sg`
- stale state under `$TMPDIR/claude-guard-*.json`
- duplicated hook commands or overlapping matchers in `~/.claude/settings.json`
- legacy `~/.claude/hooks/rate-limiter.sh` registrations that should be migrated to `cc-rate-limiter.sh`
- stale command-rewrite hooks such as pre-v4 `rtk-rewrite.sh` running before the etrnl guard; these can turn valid `rg` commands into broken `rtk grep` commands
- stale Codex RTK hook installs under `~/.codex/hooks/rtk-pre-tool-use.sh`; current installs rewrite through `updatedInput`, proxy unsafe `rg` forms, and block broad `.codex` scans before huge session output
- legacy CLI blockers such as `enforce-cli-toolkit.sh` on `PreToolUse:Bash`; these can deny raw commands before RTK/default command routing gets a chance to handle them
- incomplete run ledger under `~/.claude/etrnl/runs/`
- open UAT findings recorded in the active execution ledger
- missing required artifact under `~/.claude/etrnl/artifacts/`
- completed browser QA reports missing real console/network summaries or v2 route/viewport matrix counts
- subagent output missing `ETRNL_TASK_ID`
- multi-file `etrnl-dev-execute` work missing implementation, spec-review, or quality-review subagent evidence
- `ETRNL_INJECT_CLAUDE_MD=0` disabled prompt-context reinjection
- `CLAUDE.md` prompt context clipped by `ETRNL_CLAUDE_MD_MAX_CHARS` or `ETRNL_USERPROMPT_CONTEXT_MAX_CHARS`
- markdown `@*.md` references skipped because they resolve outside the allowed global/project root, exceed the five-hop recursion cap, or point to non-markdown files
- hook event payload changed after a Claude Code update
- ledger or doctor scripts returning empty stdin under load; run `tests/test-read-stdin.sh` and confirm `scripts/lib/read-stdin.mjs` is installed - hooks and Node scripts retry on `EAGAIN` from non-blocking stdin instead of dropping partial JSON
- local auto-update disabled unexpectedly; unset `ETRNL_AUTO_UPDATE` or leave it unset so SessionStart and requested-skill paths repair from the recorded source checkout; set `ETRNL_AUTO_UPDATE=0` only when you want non-mutating drift checks
- Claude Code plugins look disabled or missing after a session start; the Eternal Stack does **not** delete `~/.claude/plugins/cache`, but SessionStart auto-update runs `install.sh`, which (on a fresh install path) rewrites `settings.json` down to `{ enabledPlugins, statusLine?, hooks }` and drops other top-level keys. Updates through `update.sh` now pass `--preserve-settings`, and auto-update skips when the recorded source checkout is dirty unless `ETRNL_AUTO_UPDATE_DIRTY=1`. While developing the Eternal Stack with uncommitted changes, set `ETRNL_AUTO_UPDATE=0` to stop the reinstall loop. If `enabledPlugins` was wiped (invalid JSON during concurrent writes), restore from the newest `~/.claude/backups/etrnl-install-*/settings.json` backup. False `TOOL_STACK_MISSING` lines for Hindsight when the plugin cache exists but `claude` is not on the hook PATH are fixed in recent `tool-stack-check.mjs` / `update-check.mjs` builds - run `bash scripts/install.sh --update` from the repo checkout to deploy them.

To inspect install and settings drift:

```bash
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --strict-conflicts
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
~/.claude/scripts/post-upgrade-canary.sh
```

To repair duplicated hooks and legacy rate-limiter registrations:

```bash
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --fix
~/.claude/scripts/doctor-etrnl.sh
```

`settings-audit.mjs --json` reports `externalHooks` and `conflictingHooks`.
Use `--strict-conflicts` when the audit is a health gate; it fails closed on
known conflicting hooks. It does not delete external hooks automatically. For
`rtk-rewrite.sh`, upgrade the hook to v4 or newer so unsupported `rg` flags route
through `rtk proxy --ultra-compact rg` instead of broken `rtk grep` rewrites.
For Codex, sync `scripts/codex-rtk-pre-tool-use.sh` to
`~/.codex/hooks/rtk-pre-tool-use.sh` so RTK wrapping is applied before command
execution instead of after a failed first attempt. Set
`CODEX_RTK_HOOK_DENY_REWRITE=1` only as a compatibility fallback if the host
does not honor `updatedInput`.
For `enforce-cli-toolkit.sh`, remove or replace the hook so `rtk hook claude`
and `cc-pretooluse-guard.sh` own command routing and safety checks. The
repo-owned `cc-rtk-rg-compat.sh` prehook protects native RTK hooks such as
`rtk hook claude`, while leaving compact-safe searches like `rg -n "term"
src/file.ts` available for RTK's compact `rtk grep` rewrite.

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
