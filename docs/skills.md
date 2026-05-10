# ETRNL Skills

ETRNL is the Claude control-plane skill family. Every skill shipped by this repo uses the `etrnl-` prefix so its origin is obvious in slash commands, hook state, and session summaries.

Claude Code personal and project skills use hyphenated command names. If this control plane later ships as a Claude plugin, the plugin namespace can become `etrnl:<skill>`, but the installed skill commands in this repo are `etrnl-*`.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-agent-files` | Model or user | Maintains AGENTS.md, CLAUDE.md, rules, and agent instruction files without bloat. |
| `/etrnl-brainstorm` | Model or user | Turns ambiguous ideas into approved design/spec files before implementation planning. |
| `/etrnl-code-health` | Model or user | Runs the canonical code-health router: inventory, Health Stack, deterministic gates, companion audits, ledger, and no-skips closure. |
| `/etrnl-review` | Model or user | Reviews code, plans, risks, loose ends, and final pass readiness. |
| `/etrnl-commit` | User only | Reviews, verifies, stages, and commits relevant work. |
| `/etrnl-deps` | User only | Handles targeted dependency maintenance with migration checks. |
| `/etrnl-stress-test` | Model or user | Stress-tests architecture, rollout, migration, automation, and safety assumptions. |
| `/etrnl-execute` | User only | Executes a written implementation plan task by task with phase gates and verification. |
| `/etrnl-fix-issue` | User only | Reproduces and fixes tracked issues with focused verification. |
| `/etrnl-parallel` | User only | Splits work across parallel agents with explicit ownership. |
| `/etrnl-pr` | User only | Prepares or updates pull requests with verification evidence. |
| `/etrnl-test` | User only | Runs project preflight and reports or fixes failures. |
| `/etrnl-plan` | Model or user | Creates a plan file, reviews it, improves it, then finalizes it. |

## Companion Skills

These skills are not owned by this repo, but the control plane knows about them and routes to them when installed. Keeping them outside the `etrnl-*` family avoids hiding the repo boundary while preserving the stronger workflow from the original planning sessions.

| Skill | Owner | Used For |
| --- | --- | --- |
| `eternal-best-practices` | External/personal eternal skill | Stack policy router for auth, tenant isolation, money, i18n, Prisma, soft deletes, and domain-sensitive work. |
| `code-simplifier` | External skill | Clarity and simplification pass before final scoring/completion. |
| `finding-duplicate-functions` | External skill | Dedupe review for repeated logic and consolidation work. |
| `brooks-audit` | External/local skill | Brooks review/audit/debt/test/health/sweep modes where installed. |

## Deterministic Helpers

| Helper | Installed Path | Purpose |
| --- | --- | --- |
| `code-health-inventory.mjs` | `~/.claude/scripts/code-health-inventory.mjs` | Inventories tracked files and classifies audit coverage for no-skips code-health runs. |
| `plan-readiness-check.mjs` | `~/.claude/scripts/plan-readiness-check.mjs` | Rejects thin plans before they are marked final or executed. |
