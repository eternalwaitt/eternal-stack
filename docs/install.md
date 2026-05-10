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
  - execution ledger, task-packet, wave-check, review-log, browser-QA, context-state, workflow-health, and prompt-budget helpers
- stores startup templates under `~/.claude/docs/templates/`
- only overwrites existing `AGENTS.md`/`CLAUDE.md` when `CLAUDE_CONTROL_PLANE_INSTALL_STARTUP=1`
- moves legacy repo-owned skill folders into the install backup before copying `etrnl-*` skills
  - legacy examples: `writing-plans`, `execute-plan`, `etrnl-run-plan`, `eternal-control-writing-plans`, or `eternal-*` control-plane folders
- installs repo-owned `etrnl-*` agents into `~/.claude/agents/` by default
- runs the hook test harness
- merges safe observer hooks into existing settings by default
- merges strict blocker hooks, including `PreToolUse`, `Stop`, and `SubagentStop`, only when `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1`
- records the evidence-before-agreement lesson to Hindsight only as a stable upsert when Hindsight is configured

Rollback:

```bash
~/.claude/scripts/rollback-local.sh
```

Rollback removes current repo-owned `etrnl-*` agent files and restores backed-up versions when they existed before install.
