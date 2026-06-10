# Eternal Stack

> Hooks and skills that keep Claude Code honest about "done."

I kept hitting the same failure modes: the agent marking work complete without running checks, drifting off the plan we agreed on, or improvising a safer subset halfway through.

Eternal Stack is hooks, skills, and install profiles for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that encode the habits I actually want — read before editing, verify before claiming done, finish the approved plan — in places the model cannot quietly skip.

I run this daily on real projects. The defaults are conservative; strict blockers are opt-in.

**Current release:** [VERSION](VERSION) — [CHANGELOG](CHANGELOG.md)

---

## The problems it solves

Most power users eventually hit the same wall: the agent is capable but undisciplined. It declares victory early, switches approach mid-task, or drifts from what you agreed to build.

| The thing that keeps happening | What Eternal Stack does about it |
| --- | --- |
| Agent says "done", nothing is verified | Stop hooks block completion claims without passing a checklist |
| Skills installed locally drift from source | `skill-contract-check.mjs` and install metadata detect drift on every session |
| Thin plans get shipped to execution without pushback | `plan-readiness-check.mjs` gates any plan that's missing scope, risks, or rollback steps |
| Parallel edits spiral out of control | Task packets, wave overlap checks, and write-scope enforcement keep changes bounded |
| Settings get overwritten on reinstall | Merge-in-place hooks, settings audit, and rollback backups protect your config |

---

## Quick start

```bash
git clone https://github.com/eternalwaitt/eternal-stack.git
cd eternal-stack
./scripts/install.sh --profile core
./scripts/doctor.sh
```

That's it. The `core` profile is the right default for almost everyone — it installs the observer stack, repo-owned `etrnl-*` agents, and verification tests. The `full` profile adds optional CodeGraph, Beads, and Hindsight companions for heavier setups.

See [docs/install.md](docs/install.md) for profiles, strict mode, rollback, and migration.

Install writes `~/.claude/etrnl/install.json` and `~/.codex/etrnl/install.json` so each host can detect source drift. Local auto-update from your checkout is on by default; set `ETRNL_AUTO_UPDATE=0` to opt out.

```bash
~/.claude/scripts/update.sh    # or ./scripts/update.sh from the repo
./scripts/doctor.sh            # optional: ./scripts/doctor.sh --jobs 8
tests/test-hooks.sh
```

---

## What ships with it

**Hooks** — enforcement at tool boundaries. Full catalog and lifecycle wiring: [docs/hooks.md](docs/hooks.md). Pretool and stop rules: [docs/guards.md](docs/guards.md). Regression: [tests/test-hooks.sh](tests/test-hooks.sh).

**Skills** — repeatable workflows as `/etrnl-*` commands, grouped by namespace (`dev`, `audit`, `ops`, `comm`). Inventory: [docs/skills.md](docs/skills.md).

**Scripts** — deterministic helpers for ledgers, browser QA, workflow health, code-health inventory, deep-audit validation, and release hygiene.

**Agents** — bounded subagents (`etrnl-executor`, reviewers, scout, adversary, browser-QA) installed to `~/.claude/agents/`. They have narrow scopes and write limits by design.

---

## Profiles

| Profile | What it includes |
| --- | --- |
| `core` | Hooks, skills, agents, doctor, rollback, and ETRNL state. Start here. |
| `full` | Everything in `core`, plus CodeGraph/Beads bootstrap paths and Hindsight canaries |

Want the hard blockers — the ones that refuse to let an agent proceed at all? Enable strict mode after you've run doctor, passed hook tests, rehearsed rollback, and done a smoke pass:

```bash
ETRNL_ENABLE_STRICT=1 ./scripts/install.sh
```

Don't skip those steps. Strict mode with untested hooks will interrupt things you didn't want interrupted.

---

## Documentation

| Doc | What it covers |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent and contributor rules — how this repo works |
| [CLAUDE.md](CLAUDE.md) | Thin Claude Code wrapper that imports `AGENTS.md` |
| [docs/hooks.md](docs/hooks.md) | Hook reference: every `cc-*` entrypoint, events, default vs strict |
| [docs/guards.md](docs/guards.md) | Pretool deny catalog, stop-verifier gates, fail-open matrix |
| [docs/install.md](docs/install.md) | Install, update, uninstall, profiles, strict mode |
| [docs/skills.md](docs/skills.md) | `etrnl-*` skills by namespace and bundled inventory |
| [docs/health-stack.md](docs/health-stack.md) | Code and documentation health gates |
| [docs/eternal-stack-coverage.md](docs/eternal-stack-coverage.md) | Capability coverage map |
| [docs/RELEASING.md](docs/RELEASING.md) | Maintainer release workflow |
| [CREDITS.md](CREDITS.md) | Vendored and inspirational sources |

---

## Safety

Emergency bypass — use it when something is legitimately blocked and you know why:

```bash
export CLAUDE_GUARD_DISABLED=1
```

This repository is public-safe. Private identity, accounts, credentials, transcripts, local memories, plans, and background notes don't belong in tracked files and won't be here.

---

## Acknowledgments

To my mentor and friend [@PierreAndreis](https://github.com/PierreAndreis): thank you. You have been a steady source of inspiration in how you build, how you teach, and how you treat people along the way. Eternal Stack carries more of your influence than any changelog line could capture, and I'm grateful for it.

## Credits

Inlined reference modules (Brooks, oRPC, Prisma, SQL), bundled skill attribution, and the projects that inspired specific patterns are documented in [CREDITS.md](CREDITS.md).
