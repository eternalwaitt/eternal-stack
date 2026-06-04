# Install

```bash
./scripts/install.sh
./scripts/doctor.sh
```

Default install is intentionally usable but conservative: it installs observer hooks, prompt routing, prompt expansion, once-per-session `CLAUDE.md` reinjection, the locked advisory rate limiter, post-tool observation, session cleanup, scripts, docs, rules, skills, and agents. Hard blockers stay opt-in.

Strict local install:

```bash
CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1 ./scripts/install.sh
./scripts/doctor.sh
~/.claude/scripts/doctor-control-plane.sh
```

The installer:

- backs up existing Claude settings and `CLAUDE.md`
- backs up pre-existing repo-owned hooks, skills, and agent files so rollback can restore them or remove newly installed copies
- copies reusable hooks, hook libraries, fixtures, docs, skills, and ETRNL agent templates
- copies control-plane assets:
  - public `AGENTS.md` baseline
  - tiny `CLAUDE.md` wrapper
  - namespaced rules
  - rollback script
  - canaries
  - hook test harness
  - execution ledger, task-packet, wave-check, review-log, browser-QA, context-state, workflow-health, prompt-budget, changelog release, update drift, settings audit, and port guard helpers
- stores startup templates under `~/.claude/docs/templates/`
- only overwrites existing `AGENTS.md`/`CLAUDE.md` when `CLAUDE_CONTROL_PLANE_INSTALL_STARTUP=1`
- moves legacy repo-owned skill folders into the install backup before copying `etrnl-*` skills
  - legacy examples: `writing-plans`, `execute-plan`, `etrnl-run-plan`, `eternal-control-writing-plans`, or `eternal-*` control-plane folders
- installs repo-owned `etrnl-*` agents into `~/.claude/agents/` by default
- writes `~/.claude/control-plane/install.json` with the source checkout, commit, version, installed source fingerprint, and settings mode
- installs `~/.claude/scripts/update-check.mjs`, `update.sh`, and `uninstall.sh` so installed Claude sessions can explain, detect, and repair drift from the source checkout
- installs `~/.claude/scripts/tool-stack-check.mjs` and `bootstrap-tools.sh` so CodeGraph, Beads, MCP config, and repo-local indexes/databases can be checked or bootstrapped from the installed control plane
- installs repo-owned `etrnl-*` skills, scripts, script libraries, and `~/.codex/control-plane/install.json` into `~/.codex` so Codex sessions can run the same skill helpers without depending on `~/.claude`
- runs `settings-audit.mjs --fix` so duplicate hook commands are compacted and the legacy race-prone rate limiter is replaced with `cc-rate-limiter.sh`
- runs the hook and workflow-tool test harnesses plus the post-upgrade canary
- merges safe observer hooks into existing settings by default, including once-per-session `UserPromptSubmit` `CLAUDE.md` reinjection and the advisory rate limiter
- merges strict blocker hooks, including `PreToolUse`, `Stop`, and `SubagentStop`, only when `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1`
- records the evidence-before-agreement lesson to Hindsight only as a stable upsert when Hindsight is configured

Post-install verification:

```bash
./scripts/doctor.sh
~/.claude/scripts/doctor-control-plane.sh
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
node ~/.claude/scripts/tool-stack-check.mjs --explain --project "$PWD"
node ~/.codex/scripts/update-check.mjs --json
node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-plan --json
~/.claude/scripts/post-upgrade-canary.sh
```

`settings-audit.mjs` should report no duplicate hooks and no legacy `rate-limiter.sh` registrations. Its JSON output also lists external hooks and known conflicts such as stale pre-v4 `rtk-rewrite.sh`; these are not removed automatically. `update-check.mjs --json` should show the recorded source checkout, installed/source commits, version, dirty-state flag, installed skill/agent counts, settings mode, stale installed script count, and whether a local or remote update is available.

Rollback:

```bash
~/.claude/scripts/rollback-local.sh
```

Rollback removes current repo-owned `etrnl-*` agent, Claude/Codex skill, Codex script, and critical hook files, restores backed-up versions when they existed before install, and validates settings JSON when `jq` is available.

Update:

```bash
~/.claude/scripts/update.sh
```

The installed updater (`~/.claude/scripts/update.sh`) delegates back to the recorded source checkout and runs the normal installer. To fetch the upstream branch before reinstalling, run `./scripts/update.sh --pull` while inside the recorded source checkout and only when that checkout is clean (no uncommitted changes). Dirty source checkouts are never reset or stashed automatically.

Startup update checks are cached and local-first.

- `CLAUDE_CONTROL_PLANE_UPDATE_CHECK=0`: disable startup update checks.
- `CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK=1`: also check the git upstream.
- `CLAUDE_CONTROL_PLANE_AUTO_UPDATE=1`: auto-update from the recorded source checkout when the installed fingerprint is stale.
- `CLAUDE_CONTROL_PLANE_TOOL_UPDATE_CHECK=0`: disable CodeGraph/Beads checks inside update-check.
- `CLAUDE_CONTROL_PLANE_SKILL_UPDATE_CHECK=0`: disable the per-skill update prompt.

Tool bootstrap:

```bash
~/.claude/scripts/bootstrap-tools.sh install --yes
~/.claude/scripts/bootstrap-tools.sh project --project "$PWD"
```

Interactive installs bootstrap global CodeGraph via npm `@colbymchenry/codegraph`, refresh global CodeGraph MCP registration, and install Beads via npm `@beads/bd` unless `CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=0`. Non-interactive installs print the bootstrap command instead of mutating global tools. Set `CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=1` to force global bootstrap in non-interactive install runs, and set `CLAUDE_CONTROL_PLANE_BOOTSTRAP_PROJECTS=1` when the current source checkout should also receive project-local `.codegraph` and `.beads` state during install.

Every requested Claude `etrnl-*` skill invocation runs the installed update checker first through the prompt router.

Codex does not expose the same prompt-submit hook in the current CLI, so every repo-owned Codex skill starts with `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill <skill>`.

If the control plane, CodeGraph, or Beads is missing or stale, the helper tells the agent to ask whether to update/bootstrap now, snooze, or continue without updating.
