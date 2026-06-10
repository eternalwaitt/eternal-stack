# Eternal Stack

> Hooks and skills that make Claude Code actually finish what it starts.

I got tired of AI agents that say "done" when they aren't. That mark tasks complete without verifying. That skip the plan you approved and start improvising halfway through. That drift silently until something breaks.

Eternal Stack is my answer to that. It's a set of hooks, skills, and install profiles for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that enforce the habits that matter — read before editing, verify before claiming done, finish the plan you agreed to — and make them impossible to quietly skip.

I run this in production every day to build real software. It's opinionated by design.

**Current release:** [VERSION](VERSION) — [CHANGELOG](CHANGELOG.md)

---

## The problems it solves

Every Claude Code power user eventually hits the same wall: the agent is *smart* but it isn't *disciplined*. It wants to be helpful so badly that it'll declare victory prematurely, silently switch approaches mid-task, or drift away from what you actually agreed to build.

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

**Hooks** — the enforcement layer. PreToolUse guards, PostToolBatch observer, prompt routing, compact recovery, stop verification, sycophancy blockers, port guard, and more. [tests/test-hooks.sh](tests/test-hooks.sh) exercises 85+ fixtures. These run automatically; you don't think about them.

**Skills** — the orchestration layer. Repo-owned `/etrnl-*` commands for planning, execution, audits, CI, commits, PRs, and operations. They call each other cleanly and stay namespaced so they don't collide with anything else you've installed. Full inventory in [docs/skills.md](docs/skills.md).

**Scripts** — deterministic helpers for ledgers, browser QA, workflow health, code-health inventory, deep-audit validation, and release hygiene. Boring in the best way — they do one thing and always do it the same way.

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
| [docs/install.md](docs/install.md) | Install, update, uninstall, profiles, strict mode |
| [docs/skills.md](docs/skills.md) | `etrnl-*` orchestration and bundled skill inventory |
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
