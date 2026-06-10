# Install

Public home: [github.com/eternalwaitt/eternal-stack](https://github.com/eternalwaitt/eternal-stack). Overview and doc map: [README.md](../README.md). Hook reference: [hooks.md](hooks.md). Guard rules: [guards.md](guards.md).

```bash
./scripts/install.sh --profile core
./scripts/doctor.sh
```

Default install is intentionally usable but conservative: `--profile core` installs observer hooks, prompt routing, prompt expansion, once-per-session `CLAUDE.md` reinjection, the locked advisory rate limiter, post-tool observation, session cleanup, scripts, docs, rules, skills, and agents. Hard blockers and global memory/backlog/codegraph services stay opt-in.

Breaking install behavior: managed `~/.claude/settings.json` is backed up and reset to a vanilla settings shell before the stack is applied unless `--preserve-settings` is supplied. Existing `enabledPlugins` entries are preserved so installs do not disable already-enabled Claude Code plugins. Live migration of memory systems, plugins, MCPs, broad permissions, and private overlays is a separate local rollout step, not an automatic install-time side effect.

Full stack install:

```bash
./scripts/install.sh --profile full --yes
./scripts/doctor.sh
~/.claude/scripts/doctor-etrnl.sh
```

The full profile runs the core install plus CodeGraph, Beads, and Hindsight provisioning. It fails closed in non-interactive mode unless `--yes` is supplied. Use `--skip-codegraph`, `--skip-beads`, or `--skip-hindsight` only when the skip is intentional and recorded in the rollout evidence.

Strict local install:

```bash
ETRNL_ENABLE_STRICT=1 ./scripts/install.sh
./scripts/doctor.sh
~/.claude/scripts/doctor-etrnl.sh
```

The installer:

- backs up existing Claude settings and `CLAUDE.md`
- resets managed `~/.claude/settings.json` to a vanilla settings shell before applying the selected etrnl stack, preserving `enabledPlugins` unless `--preserve-settings` is explicitly supplied
- backs up pre-existing repo-owned hooks, skills, and agent files so rollback can restore them or remove newly installed copies
- copies reusable hooks, hook libraries, fixtures, docs, skills, generated `etrnl-*` slash command shims, and ETRNL agent templates
- copies etrnl assets:
  - public `AGENTS.md` baseline
  - tiny `CLAUDE.md` wrapper
  - namespaced rules
  - rollback script
  - canaries
  - hook test harness
  - execution ledger, task-packet, wave-check, review-log, browser-QA, context-state, workflow-health, prompt-budget, changelog release, update drift, settings audit, and port guard helpers
- stores startup templates under `~/.claude/docs/templates/`
- only overwrites existing `AGENTS.md`/`CLAUDE.md` when `ETRNL_INSTALL_STARTUP=1`
- moves legacy repo-owned skill folders into the install backup before copying `etrnl-*` skills
  - legacy examples: `writing-plans`, `execute-plan`, `etrnl-run-plan`, `eternal-control-writing-plans`, or `eternal-*` etrnl folders
- installs `~/.claude/commands/etrnl-*.md` slash command shims generated from the matching repo-owned skill contracts
- installs repo-owned `etrnl-*` agents into `~/.claude/agents/` by default
- writes `~/.claude/etrnl/install.json` with the source checkout, commit, version, installed source fingerprint, and settings mode
- writes the selected stack profile into install metadata
- copies stack profile manifests and Hindsight config templates under `~/.claude/templates/` and `~/.codex/templates/`
- installs `~/.claude/scripts/update-check.mjs`, `update.sh`, and `uninstall.sh` so installed Claude sessions can explain, detect, and repair drift from the source checkout
- installs `~/.claude/scripts/tool-stack-check.mjs` and `bootstrap-tools.sh` so CodeGraph, Beads, MCP config, and repo-local indexes/databases can be checked or bootstrapped from the installed Eternal Stack
- installs `~/.claude/scripts/stack-profile-check.mjs` so profile manifests can be validated before install, staged rollout, and doctor runs
- installs repo-owned `etrnl-*` skills and bundled skills from `skills/bundled/` into `~/.claude/skills/` and `~/.codex/skills/`
- installs scripts, script libraries, and `~/.codex/etrnl/install.json` into `~/.codex` so Codex sessions can run the same skill helpers without depending on `~/.claude`
- runs `settings-audit.mjs --fix` so duplicate hook commands are compacted and the legacy race-prone rate limiter is replaced with `cc-rate-limiter.sh`
- runs the hook and workflow-tool test harnesses plus the post-upgrade canary
- applies safe observer hooks after the vanilla reset, including once-per-session `UserPromptSubmit` `CLAUDE.md` reinjection and the advisory rate limiter
- merges strict-only blocker hooks (`PreToolUse` guard, post-write quality/sycophancy, `PostToolUseFailure`, `SubagentStop`) only when `ETRNL_ENABLE_STRICT=1`; default install already registers observer hooks, compact recovery, RTK `rg` compat, and the `Stop` verifier
- records the evidence-before-agreement lesson to ETRNL state first, then exports it to Hindsight only when the Hindsight canary is green

## Hindsight Marketplace Access

The full profile installs Hindsight through the Claude CLI marketplace identifier `vectorize-io/hindsight`. That requires marketplace access in the active Claude CLI account. Without that access, the Hindsight install step can fail before plugin configuration is written. Use `--skip-hindsight` when marketplace access is unavailable or when you intentionally want CodeGraph/Beads without Hindsight.
The local daemon template defaults to port `9077`; check port availability or change `apiPort` in the installed Hindsight config before starting another local daemon.

Post-install verification:

```bash
./scripts/doctor.sh
~/.claude/scripts/doctor-etrnl.sh
node ~/.claude/scripts/settings-audit.mjs ~/.claude/settings.json --json
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
node ~/.claude/scripts/tool-stack-check.mjs --explain --project "$PWD"
node ~/.claude/scripts/stack-profile-check.mjs ~/.claude/templates/stack-profile.full.json
node ~/.codex/scripts/update-check.mjs --json
node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-plan --json
~/.claude/scripts/post-upgrade-canary.sh
```

`settings-audit.mjs` should report no duplicate hooks, no legacy `rate-limiter.sh` registrations, and no risky top-level settings such as `autoCompactWindow` or `skipAutoPermissionPrompt`. A normal install removes those from managed `settings.json` by resetting it before applying the stack, while preserving `enabledPlugins`. Its JSON output also lists plugin hook manifests and known outside-settings sources for audit visibility. `update-check.mjs --json` should show the recorded source checkout, installed/source commits, version, dirty-state flag, installed skill/agent counts, settings mode, stale installed script count, and whether a local or remote update is available.

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

- `ETRNL_UPDATE_CHECK=0`: disable startup update checks.
- `ETRNL_REMOTE_UPDATE_CHECK=1`: also check the git upstream.
- `ETRNL_AUTO_UPDATE=0`: disable automatic local etrnl repair from the recorded source checkout. Local auto-update is enabled by default when the installed fingerprint is stale.
- `ETRNL_TOOL_UPDATE_CHECK=0`: disable CodeGraph/Beads checks inside update-check.
- `ETRNL_SKILL_UPDATE_CHECK=0`: disable the per-skill update prompt.

Tool bootstrap:

```bash
~/.claude/scripts/bootstrap-tools.sh install --profile full --yes
~/.claude/scripts/bootstrap-tools.sh project --project "$PWD"
```

Core installs do not bootstrap global tools. Full-profile bootstrap installs or verifies CodeGraph via npm `@colbymchenry/codegraph`, refreshes global CodeGraph MCP registration, installs or verifies Beads via npm `@beads/bd`, installs or verifies the `hindsight-memory` Claude plugin from `vectorize-io/hindsight`, and writes a token-free Hindsight config. Set `ETRNL_BOOTSTRAP_PROJECTS=1` when the current source checkout should also receive project-local `.codegraph` and `.beads` state during install.

Hindsight modes:

- `local-daemon` is the default full-profile mode. It uses `templates/hindsight/claude-code.local-daemon.json`, `apiPort: 9077`, `llmProvider: claude-code`, dynamic bank isolation, and `retainToolCalls: false`.
- `external-api` requires `HINDSIGHT_API_URL`; the token comes from `HINDSIGHT_API_TOKEN` and is not written to tracked files.
- `docker-server` requires Docker and is checked explicitly before bootstrap.

Beads remains backlog-only. The installer never runs raw `bd setup claude`, raw `bd setup codex`, or injects `bd prime --full` startup doctrine.

Every requested Claude `etrnl-*` skill invocation runs the installed update checker first through the prompt router.

Codex does not expose the same prompt-submit hook in the current CLI, so every repo-owned Codex skill starts with `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill <skill>`.

If the local Eternal Stack is stale, the helper auto-updates from the recorded source checkout before the skill runs. It only prompts for remaining remote or tool-stack choices, such as a pull, CodeGraph, or Beads bootstrap, that cannot be safely completed as local repair.
