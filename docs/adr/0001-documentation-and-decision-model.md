---
status: accepted
date: 2026-06-03
---

# ADR 0001: Documentation And Decision Model

## Context

The control plane is a public, shareable Claude Code hook and workflow layer. It must stay free of private identity, credentials, transcripts, and local memories while still giving agents enough current context to operate safely.

The repo already has several documentation surfaces:

- `README.md` for orientation and install entrypoints.
- `AGENTS.md` for Codex-facing repo rules.
- `templates/AGENTS.md` and `templates/CLAUDE.md` for installed startup guidance.
- `docs/*.md` for install, configuration, hooks, health stack, skills, troubleshooting, and coverage.
- `skills/etrnl-*/SKILL.md` for repo-owned workflow contracts.
- `rules/etrnl/*.md` for namespaced reusable rules.
- Ignored local planning paths, such as `.claude/plans/` and `.planning/`, for implementation plans and evidence packets.

Without an ADR policy, durable decisions can blend into historical plans and become hard to distinguish from shipped operating rules.

## Decision

Use this documentation model:

- Root docs stay concise and link to focused canonical docs.
- `docs/hooks.md`, `docs/guards.md`, `docs/health-stack.md`, `docs/skills.md`, `docs/install.md`, `docs/configuration.md`, and `docs/troubleshooting.md` are canonical for their scopes.
- `skills/etrnl-*/SKILL.md` files are canonical workflow contracts for repo-owned skills.
- `rules/etrnl/*.md` files are canonical shared rule modules.
- Implementation plans and evidence packets stay outside tracked docs.
- `docs/adr/*.md` files are the durable decision log for architecture, install topology, hook model, documentation system, public workflow contracts, and security boundaries.
- Supersede decisions with a new ADR instead of rewriting accepted ADR history.

## Consequences

- Future contributors can tell whether a statement is current policy, operational documentation, a workflow contract, or historical plan evidence.
- Documentation-health audits have a canonical ADR surface to inspect instead of treating missing ADRs as an accepted risk.
- Local plans remain useful evidence without competing with current docs.

## Implementation Notes

- Link durable decisions from `docs/adr/README.md`.
- Keep release notes and health-stack docs synchronized when ADR policy changes.
