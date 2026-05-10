# Claude Control Plane

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
- track local run ledgers under `~/.claude/control-plane/runs/`
- track durable review, browser QA, and context artifacts under `~/.claude/control-plane/artifacts/`
- avoid command loops
- force local dev servers onto explicit checked ports
- block silent fallbacks and suppressions
- enforce evidence before agreement when the user challenges a claim
- keep side-effect workflows user-invoked
- preserve rollback and diagnostics before stricter rollout
- namespace repo-owned skills and agents as `etrnl-*`
- keep companion review skills mapped without pretending this repo owns them
- run whole-codebase health through a deterministic inventory and findings ledger

## Install

```bash
git clone <repo>
cd claude-control-plane
./scripts/install.sh
./scripts/doctor.sh
```

The installer backs up `~/.claude`, copies control-plane assets, installs repo-owned ETRNL agents by default, and merges the safe observer layer by default.
See [docs/install.md](docs/install.md) for full install/update behavior, including `CLAUDE_CONTROL_PLANE_INSTALL_STARTUP`, `AGENTS.md`/`CLAUDE.md`, `docs/skills.md`, `etrnl-*` migration, and companion skill mapping.

Hard blockers are shipped but not enabled automatically. Enable them after tests, doctor, rollback, and a fresh Claude smoke pass.

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
```

`port-guard.mjs pick` scans the `--start` to `--end` range, defaulting from `CLAUDE_GUARD_PORT_START` and `CLAUDE_GUARD_PORT_END`. Keep ranges narrow because `pickPort` calls `portIsFree` for each candidate; if hundreds of ports are occupied, narrow the range before considering a shorter timeout or parallel probing.

Use `docs/control-plane-coverage.md` to compare the repo against the original implementation plan and identify live-gated operations.

## Safety

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Private identity, accounts, credentials, transcripts, memories, and local permissions do not belong in this repo.
