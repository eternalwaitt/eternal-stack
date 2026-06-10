# Credits and attributions

Eternal Stack is an opinionated Claude Code control plane: hooks, skills, scripts, and install profiles. It combines Eternal engineering practice with ideas and reference material from the wider agent-tooling community.

## Vendored reference material

These companion skills are **not** shipped as separate install surfaces. Selected content is rewritten in directive voice and vendored under repo-owned `references/` modules.

| Source skill / material | Eternal Stack home | Notes |
| --- | --- | --- |
| [brooks-audit](https://github.com/hyhmrright/brooks-lint) (Brooks-style architecture review) | `skills/etrnl-code-review-excellence/references/brooks-*.md` | Foundation, architecture, and onboarding modules |
| `orpc-patterns` (oRPC / typesafe API patterns) | `skills/etrnl-backend-patterns/references/orpc.md` | Contract-first procedures, middleware order, Hono integration |
| `prisma-expert` (Prisma ORM patterns) | `skills/etrnl-backend-patterns/references/prisma.md` | Schema, migrations, queries, multi-tenancy |
| `sql-optimization-patterns` | `skills/etrnl-backend-patterns/references/sql-optimization.md` | EXPLAIN ANALYZE, indexes, pagination |
| SkillsMP backend-development research | `skills/etrnl-backend-patterns/references/*.md` | Six-topic backend suite informed by public skill marketplace research (`docs/research/2026-06-04-etrnl-skillsmp-comparison.md`) |

Vendored files are adapted for Eternal Stack conventions. They remain separate from upstream licenses and update paths — check upstream projects when you need the canonical versions.

## Mapped companion skills (not vendored)

When installed locally, Eternal Stack routes to these external skills but does **not** copy them into this repository:

| Skill | Typical use |
| --- | --- |
| `eternal-best-practices` | Multi-tenant SaaS policy router |
| `code-simplifier` | Clarity pass before completion |
| `finding-duplicate-functions` | Dedupe and consolidation review |
| `better-auth`, `tenant-isolation-patterns`, `money-vo-discipline` | Auth, tenancy, and money discipline |
| `stripe-best-practices`, `abacatepay-integration` | Payments review when installed |
| `ci-cd` | CI helper scripts referenced by `/etrnl-dev-ci` |

See [docs/skills.md](docs/skills.md) for the full companion table.

## Research and design inspiration

Public research in `docs/research/` records competitive and starred-repo analysis used to shape enforcement — mechanisms are reimplemented here, not forked wholesale.

| Project | How Eternal Stack uses it |
| --- | --- |
| [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | Optional local code-graph MCP; bootstrap and health checks in `full` profile |
| [hyhmrright/brooks-lint](https://github.com/hyhmrright/brooks-lint) | Review finding shape (Symptom → Source → Consequence → Remedy); vendored Brooks modules |
| [rtk-ai/rtk](https://github.com/rtk-ai/rtk) | Codex deterministic command rewrite via `codex-rtk-pre-tool-use.sh` |
| [GitHub/spec-kit](https://github.com/github/spec-kit) | Plan/readiness executability gates |
| [Chachamaru127/claude-code-harness](https://github.com/Chachamaru127/claude-code-harness) | Quality gates, browser artifact contracts, review plateau ideas |
| [infinri/Writ](https://github.com/infinri/Writ) | Mandatory-rule mechanical enforcement |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | Workflow state and context breadcrumbs benchmark |
| [gstack](https://github.com/gruckion/gstack) (George Mack stack) | QA, browser, ship, and review workflow patterns referenced in personal skill mappings |

Full starred-repo notes: [docs/research/2026-06-03-starred-agent-stack-map.md](docs/research/2026-06-03-starred-agent-stack-map.md).

## Claude Code

Eternal Stack targets [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook and skill surfaces. Codex parity helpers install under `~/.codex/etrnl/` when you use both hosts.

## Contributing upstream

If you maintain one of the projects above and want a more formal attribution line or link correction, open an issue or PR in this repository.
