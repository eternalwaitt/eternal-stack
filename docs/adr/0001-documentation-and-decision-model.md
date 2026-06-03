# ADR 0001: Documentation And Decision Model

## Status

Accepted.

## Date

2026-06-03.

## Context

The control plane is a public, shareable Claude Code hook and workflow layer. It must stay free of private identity, credentials, transcripts, and local memories while still giving agents enough current context to operate safely.

The repo already has several documentation surfaces:

- `README.md` for orientation and install entrypoints.
- `AGENTS.md` for Codex-facing repo rules.
- `templates/AGENTS.md` and `templates/CLAUDE.md` for installed startup guidance.
- `docs/*.md` for install, configuration, hooks, health stack, skills, troubleshooting, and coverage.
- `skills/etrnl-*/SKILL.md` for repo-owned workflow contracts.
- `rules/etrnl/*.md` for namespaced reusable rules.
- `docs/plans/*.md` for historical implementation plans and evidence packets.

Without an ADR policy, durable decisions can blend into historical plans and become hard to distinguish from shipped operating rules.

## Decision

Use this documentation model:

- Root docs stay concise and link to focused canonical docs.
- `docs/health-stack.md`, `docs/skills.md`, `docs/install.md`, `docs/configuration.md`, `docs/guards.md`, and `docs/troubleshooting.md` are canonical for their scopes.
- `skills/etrnl-*/SKILL.md` files are canonical workflow contracts for repo-owned skills.
- `rules/etrnl/*.md` files are canonical shared rule modules.
- `docs/plans/*.md` files are historical implementation records.
- `docs/adr/*.md` files are the durable decision log for architecture, install topology, hook model, documentation system, public workflow contracts, and security boundaries.
- Supersede decisions with a new ADR instead of rewriting accepted ADR history.

## Consequences

- Future contributors can tell whether a statement is current policy, operational documentation, a workflow contract, or historical plan evidence.
- Documentation-health audits have a canonical ADR surface to inspect instead of treating missing ADRs as an accepted risk.
- Historical plans remain useful evidence but do not compete with current docs.
