# Claude Control Plane Agent Guide

This repo builds a shareable control plane for Claude Code. Keep the public repo free of private identity, accounts, transcripts, credentials, and local memories.

## Rules

- Reuse before create: inspect existing hooks, scripts, docs, skills, templates, and tests before adding new surfaces.
- Minimize diffs and keep changes tied to the original plan or verified gap.
- Put deterministic enforcement in hooks and repeatable process in skills.
- When the user asks to implement or execute a plan, complete every item in the plan's `Execution scope` or stop with a concrete blocker. Minimal diffs constrain how each item is implemented; they do not permit silently choosing the first phase, first patch, MVP, or safer subset.
- Keep startup guidance short; move detail to namespaced rules, docs, or skill references.
- Keep `AGENTS.md` and `CLAUDE.md` aligned: shared guidance belongs in `AGENTS.md`; Claude-specific startup files should import or point to it instead of duplicating it.
- Run `tests/test-hooks.sh` and `scripts/doctor.sh` before claiming the control plane is healthy.
- Keep `CHANGELOG.md`, `docs/skills.md`, and `docs/health-stack.md` current when adding repo-owned workflows.

## Boundaries

- Repo-owned skills use the `etrnl-*` namespace.
- Companion skills such as `eternal-best-practices`, `code-simplifier`, `finding-duplicate-functions`, and `brooks-audit` are mapped but not vendored.
- Live migration of memory systems, plugins, MCPs, and broad permissions is a local rollout step, not a blind install-time side effect.
- Whole-codebase audits use `etrnl-code-health` plus `scripts/code-health-inventory.mjs`; no tracked file may vanish from the coverage map.
