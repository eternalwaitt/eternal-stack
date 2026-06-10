# Eternal Stack Agent Guide

This repo builds Eternal's opinionated stack of skills, hooks, and rules for Claude Code. Public home: [eternal-stack](https://github.com/eternalwaitt/eternal-stack). Keep tracked files free of private identity, accounts, transcripts, credentials, and local memories.

## Rules

- Reuse before create: inspect existing hooks, scripts, docs, skills, templates, and tests before adding new surfaces.
- Minimize diffs and keep changes tied to the original plan or verified gap.
- Put deterministic enforcement in hooks and repeatable process in skills.
- When the user asks to implement or execute a plan, complete every item in the plan's `Execution scope` or stop with a concrete blocker. Minimal diffs constrain how each item is implemented; they do not permit silently choosing the first phase, first patch, MVP, or safer subset.
- Keep startup guidance short; move detail to namespaced rules, docs, or skill references.
- Keep `AGENTS.md` and the Claude startup wrapper aligned: shared guidance belongs in `AGENTS.md`; `CLAUDE.md` at the repo root and `templates/CLAUDE.md` (installed copy) both import it instead of duplicating it.
- Run `tests/test-hooks.sh` and `scripts/doctor.sh` before claiming the stack is healthy.
- Keep `VERSION`, `CHANGELOG.md` (Keep a Changelog categories under each release), `docs/skills.md`, and `docs/health-stack.md` current when adding repo-owned workflows; follow `docs/RELEASING.md` before tagging.
- When changing install surfaces, public docs, or vendored references, update `README.md`, `CREDITS.md`, and `docs/eternal-stack-coverage.md` in the same change when the map or attribution shifts.

## Documentation map

| Doc | Use when |
| --- | --- |
| [README.md](README.md) | Public onboarding, profiles, doc index |
| [docs/install.md](docs/install.md) | Install, update, rollback, strict mode |
| [docs/skills.md](docs/skills.md) | Owned vs companion skills and script inventory |
| [docs/health-stack.md](docs/health-stack.md) | Doctor gates and audit workflows |
| [docs/RELEASING.md](docs/RELEASING.md) | Semver, changelog categories, tags |
| [CREDITS.md](CREDITS.md) | Vendored and inspirational attribution |
| [docs/eternal-stack-coverage.md](docs/eternal-stack-coverage.md) | Capability coverage status |

Historical execution plans live under `docs/plans/`; durable decisions live under `docs/adr/`.

## Boundaries

- Repo-owned skills use the `etrnl-*` namespace.
- Companion skills such as `eternal-best-practices`, `code-simplifier`, and `finding-duplicate-functions` are mapped but not vendored; `brooks-audit` is vendored into `etrnl-code-review-excellence/references/brooks-*.md`.
- Live migration of memory systems, plugins, MCPs, and broad permissions is a local rollout step, not a blind install-time side effect.
- Whole-codebase audits use `etrnl-audit-code` plus `scripts/code-health-inventory.mjs`; no tracked file may vanish from the coverage map.
