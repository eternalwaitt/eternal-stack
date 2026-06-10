# Eternal Stack

Deterministic hooks, skills, and install profiles for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Eternal Stack turns the habits that matter into checks agents cannot quietly skip: read before editing, verify before claiming done, finish approved plans, and keep repo-owned workflows in the `etrnl-*` namespace.

**Current release:** see [VERSION](VERSION) and [CHANGELOG.md](CHANGELOG.md).

## Why Eternal Stack

| Problem | Eternal Stack response |
| --- | --- |
| Agents skip verification | Stop hooks and ledgers block unverified completion claims |
| Silent skill drift | `skill-contract-check.mjs` and install metadata detect source vs installed drift |
| Thin plans shipped to execution | `plan-readiness-check.mjs` and deep-stack artifacts gate final plans |
| Unbounded parallel edits | Task packets, wave overlap checks, and write-scope enforcement |
| Settings rot on reinstall | Merge-in-place hooks, settings audit, rollback backups |

## Quick start

```bash
git clone https://github.com/eternalwaitt/eternal-stack.git
cd eternal-stack
./scripts/install.sh --profile core
./scripts/doctor.sh
```

The `core` profile installs the observer stack, repo-owned `etrnl-*` agents, and verification tests. The `full` profile adds optional CodeGraph, Beads, and Hindsight companions. See [docs/install.md](docs/install.md) for profiles, strict mode, rollback, and migration.

Install writes `~/.claude/etrnl/install.json` and `~/.codex/etrnl/install.json` so each host can detect source drift. Local auto-update from your checkout is on by default; set `ETRNL_AUTO_UPDATE=0` to disable.

```bash
~/.claude/scripts/update.sh    # or ./scripts/update.sh from the repo
./scripts/doctor.sh            # optional: ./scripts/doctor.sh --jobs 8
tests/test-hooks.sh
```

## What you get

- **Hooks:** PreToolUse guards, PostToolBatch observer, prompt routing, compact recovery, stop verification, sycophancy blockers, port guard, and more ([tests/test-hooks.sh](tests/test-hooks.sh) exercises 85+ fixtures).
- **Skills:** Repo-owned `/etrnl-*` commands for planning, execution, audits, CI, commits, PRs, and operations ([docs/skills.md](docs/skills.md)).
- **Scripts:** Deterministic helpers for ledgers, browser QA, workflow health, code-health inventory, deep-audit validation, and release hygiene.
- **Agents:** Bounded `etrnl-executor`, reviewers, scout, adversary, and browser-QA subagents installed to `~/.claude/agents/`.

## Profiles

| Profile | Includes |
| --- | --- |
| `core` | Hooks, skills, agents, doctor, rollback, and ETRNL state. Safe default. |
| `full` | Everything in `core` plus CodeGraph/Beads bootstrap paths and Hindsight canaries |

Enable hard blockers only after doctor, hooks tests, rollback rehearsal, and a fresh Claude smoke pass:

```bash
ETRNL_ENABLE_STRICT=1 ./scripts/install.sh
```

## Documentation

| Doc | Contents |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent and contributor rules |
| [CLAUDE.md](CLAUDE.md) | Tiny Claude Code wrapper (imports `AGENTS.md`) |
| [docs/install.md](docs/install.md) | Install, update, uninstall, profiles |
| [docs/eternal-stack-coverage.md](docs/eternal-stack-coverage.md) | Capability coverage map |
| [docs/skills.md](docs/skills.md) | `etrnl-*` orchestration and bundled skills |
| [docs/health-stack.md](docs/health-stack.md) | Code and documentation health gates |
| [docs/RELEASING.md](docs/RELEASING.md) | Semver, changelog categories, tagging |
| [CREDITS.md](CREDITS.md) | Vendored and inspirational sources |

## Releasing

Eternal Stack uses [Semantic Versioning](https://semver.org/) with [Keep a Changelog](https://keepachangelog.com/) categories. Maintainers cut releases with:

```bash
node scripts/release.mjs prepare 0.4.0
node scripts/changelog-release-check.mjs --strict-unreleased
node scripts/release.mjs tag
```

See [docs/RELEASING.md](docs/RELEASING.md) for the full workflow.

## Safety

Emergency bypass (use sparingly):

```bash
export CLAUDE_GUARD_DISABLED=1
```

This repository is public-safe. Private identity, accounts, credentials, transcripts, local memories, plans, artifacts, and background notes do not belong in tracked files.

The public release keeps `CHANGELOG.md` as the durable project history. The public git branch can start from a clean root commit so local development history and planning context stay out of the public repository.

## Acknowledgments

To my mentor and friend [@PierreAndreis](https://github.com/PierreAndreis): thank you. You have been a steady source of inspiration in how you build, how you teach, and how you treat people along the way. Eternal Stack carries more of your influence than any changelog line could capture, and I am grateful for it.

## Credits

Inlined Brooks, oRPC, Prisma, and SQL reference modules, bundled skill attribution, and public inspiration sources are documented in [CREDITS.md](CREDITS.md).
