# Install

```bash
./scripts/install.sh
./scripts/doctor.sh
```

The installer:

- backs up existing Claude settings and `CLAUDE.md`
- copies reusable hooks, hook libraries, fixtures, docs, skills, and ETRNL agent templates
- copies control-plane assets:
  - public `AGENTS.md` baseline
  - tiny `CLAUDE.md` wrapper
  - namespaced rules
  - rollback script
  - canaries
  - hook test harness
  - execution ledger, task-packet, wave-check, review-log, browser-QA, context-state, workflow-health, prompt-budget, changelog release, settings audit, and port guard helpers
- stores startup templates under `~/.claude/docs/templates/`
- only overwrites existing `AGENTS.md`/`CLAUDE.md` when `CLAUDE_CONTROL_PLANE_INSTALL_STARTUP=1`
- moves legacy repo-owned skill folders into the install backup before copying `etrnl-*` skills
  - legacy examples: `writing-plans`, `execute-plan`, `etrnl-run-plan`, `eternal-control-writing-plans`, or `eternal-*` control-plane folders
- installs repo-owned `etrnl-*` agents into `~/.claude/agents/` by default
- writes `~/.claude/control-plane/install.json` with the source checkout, commit, version, and installed source fingerprint
- installs `~/.claude/scripts/update-check.mjs` and `~/.claude/scripts/update.sh` so installed Claude sessions can detect and repair drift from the source checkout
- runs `settings-audit.mjs --fix` so duplicate hook commands are compacted and the legacy race-prone rate limiter is replaced with `cc-rate-limiter.sh`
- runs the hook and workflow-tool test harnesses
- merges safe observer hooks into existing settings by default
- merges strict blocker hooks, including `PreToolUse`, `Stop`, and `SubagentStop`, only when `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1`
- records the evidence-before-agreement lesson to Hindsight only as a stable upsert when Hindsight is configured

Rollback:

```bash
~/.claude/scripts/rollback-local.sh
```

Rollback removes current repo-owned `etrnl-*` agent files and restores backed-up versions when they existed before install.

Update:

```bash
~/.claude/scripts/update.sh
```

The installed updater (`~/.claude/scripts/update.sh`) delegates back to the recorded source checkout and runs the normal installer. To fetch the upstream branch before reinstalling, run `./scripts/update.sh --pull` while inside the recorded source checkout and only when that checkout is clean (no uncommitted changes). Dirty source checkouts are never reset or stashed automatically.

Startup update checks are cached and local-first.

- `CLAUDE_CONTROL_PLANE_UPDATE_CHECK=0`: disable startup update checks.
- `CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK=1`: also check the git upstream.
- `CLAUDE_CONTROL_PLANE_AUTO_UPDATE=1`: auto-update from the recorded source checkout when the installed fingerprint is stale.
