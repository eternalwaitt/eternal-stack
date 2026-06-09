# Eternal Stack

A small, deterministic hook layer for Claude Code.

It enforces the work habits that prose cannot reliably enforce:

- read before edit
- search before creating code
- verify before claiming done
- execute approved plans without pausing between mechanical phases
- default non-trivial workflow decisions to completeness 10/10
- run autoplan through CEO, engineering, design/DX when relevant, and adversarial review
- execute in dependency waves with file-overlap checks before parallel work
- require structured task packets for subagents
- reinject global/project `CLAUDE.md` context in Claude startup order on every prompt with a kill switch
- track local run ledgers under `~/.claude/etrnl/runs/`
- track durable review, browser QA, and context artifacts under `~/.claude/etrnl/artifacts/`
- avoid command loops
- replace legacy rate limiting with a locked, debounced observer hook
- force local dev servers onto explicit checked ports
- block silent fallbacks and suppressions
- enforce evidence before agreement when the user challenges a claim
- audit and repair installed Claude settings drift
- keep side-effect workflows user-invoked
- preserve rollback and diagnostics before stricter rollout
- namespace repo-owned skills and agents as `etrnl-*`
- keep companion review skills mapped without pretending this repo owns them
- run whole-codebase health through a deterministic inventory and findings ledger

## Install

```bash
git clone <repo>
cd eternal-stack
./scripts/install.sh --profile core
./scripts/doctor.sh
# optional: ./scripts/doctor.sh --jobs 8   (or DOCTOR_JOBS=8)
```

The `core` profile is the default when `ETRNL_STACK_PROFILE` is unset; it installs the safe observer stack with repo-owned ETRNL agents and verification tests. The `full` profile adds CodeGraph, Beads, Hindsight, and canaries. See [docs/install.md](docs/install.md) for profile details, strict mode, hooks, rollback, migration behavior, and deeper references such as `AGENTS.md`, `templates/CLAUDE.md`, and `docs/skills.md`.

Installs write `~/.claude/etrnl/install.json` and `~/.codex/etrnl/install.json` so Claude and Codex can detect source/install drift from their own installed homes.
Run `~/.claude/scripts/update.sh` or `./scripts/update.sh` for manual updates.
Local auto-update from the configured source checkout is enabled by default; set `ETRNL_AUTO_UPDATE=0` to disable it.
The installed update check also reports CodeGraph and Beads drift; requested Claude `etrnl-*` skills inject an advisory update/bootstrap prompt through hooks, and Codex `etrnl-*` skills run `~/.codex/scripts/skill-update-prompt.mjs` as their first step.

Hard blockers are shipped but not enabled automatically. Enable them after tests, doctor, rollback, and a fresh Claude smoke pass.
For local strict rollout, run `ETRNL_ENABLE_STRICT=1 ./scripts/install.sh`.

## Commands

```bash
./scripts/doctor.sh
./scripts/update.sh
./scripts/uninstall.sh
./scripts/canary-websearch.sh
./scripts/canary-hindsight.sh
tests/test-hooks.sh
tests/test-install.sh
node scripts/code-health-inventory.mjs
node scripts/workflow-health.mjs
node scripts/review-log.mjs summary
node scripts/browser-qa-report.mjs summary
node scripts/context-state.mjs list
node scripts/port-guard.mjs pick --start 3100
node scripts/settings-audit.mjs ~/.claude/settings.json --json
node scripts/update-check.mjs --json
node scripts/tool-stack-check.mjs --explain --project "$PWD"
node scripts/stack-profile-check.mjs templates/stack-profile.full.json
scripts/bootstrap-tools.sh check --project "$PWD"
node scripts/replay-hook-fixtures.mjs
```

`port-guard.mjs pick` scans the `--start` to `--end` range, defaulting from `CLAUDE_GUARD_PORT_START` and `CLAUDE_GUARD_PORT_END`. Keep ranges narrow because `pickPort` calls `portIsFree` for each candidate; if hundreds of ports are occupied, narrow the range before considering a shorter timeout or parallel probing.

Use `docs/eternal-stack-coverage.md` to compare the repo against the original implementation plan and identify live-gated operations.
Use `docs/adr/README.md` for durable architecture and documentation-system decisions; `docs/plans/` remains historical implementation evidence.

## Safety

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Private identity, accounts, credentials, transcripts, memories, and local permissions do not belong in this repo.
