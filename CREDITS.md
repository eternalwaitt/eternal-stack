# Credits and attributions

Eternal Stack is an opinionated Claude Code stack: hooks, skills, scripts, and install profiles. It combines Eternal engineering practice with ideas and reference material from the wider agent-tooling community.

## Inlined reference modules

Selected upstream guidance is rewritten in directive voice and shipped inside repo-owned `references/` modules. These are part of the Eternal Stack bundle even when a fuller skill also exists on the host.

| Source skill / material | Eternal Stack home | Notes |
| --- | --- | --- |
| [brooks-audit](https://github.com/hyhmrright/brooks-lint) (Brooks-style architecture review) | `skills/etrnl-code-review-excellence/references/brooks-*.md` | Foundation, architecture, and onboarding modules |
| `orpc-patterns` (oRPC / typesafe API patterns) | `skills/etrnl-backend-patterns/references/orpc.md` | Contract-first procedures, middleware order, Hono integration |
| `prisma-expert` (Prisma ORM patterns) | `skills/etrnl-backend-patterns/references/prisma.md` | Schema, migrations, queries, multi-tenancy |
| `sql-optimization-patterns` | `skills/etrnl-backend-patterns/references/sql-optimization.md` | EXPLAIN ANALYZE, indexes, pagination |
| SkillsMP backend-development research | `skills/etrnl-backend-patterns/references/*.md` | Six-topic backend suite informed by public skill marketplace research (`docs/research/2026-06-04-etrnl-skillsmp-comparison.md`) |

Vendored files are adapted for Eternal Stack conventions. Check upstream projects when you need canonical versions or license text.

## Bundled stack skills

Eternal Stack is designed as a complete skill family. Policy, review, simplification, domain, auth, tenancy, and payments skills are vendored under `skills/bundled/`, installed by `scripts/install.sh`, and routed by hooks and `etrnl-*` workflows — they are not a separate optional layer outside the stack.

| Skill | Typical use | Attribution |
| --- | --- | --- |
| `eternal-best-practices` | Multi-tenant SaaS policy router | Eternal engineering practice |
| `code-simplifier` | Clarity pass before completion | Personal / community skill bundle |
| `finding-duplicate-functions` | Dedupe and consolidation review | Personal / community skill bundle |
| `better-auth`, `tenant-isolation-patterns`, `money-vo-discipline` | Auth, tenancy, and money discipline | Community / upstream skill bundles |
| `stripe-best-practices`, `abacatepay-integration` | Payments review | Community / upstream skill bundles |
| `ci-cd` | CI helper scripts referenced by `/etrnl-dev-ci` | Community skill bundle |
| `domain-*`, `i18n-localization`, and related domain skills | Domain-specific review gates | Community / upstream skill bundles |

The full inventory and routing notes live in [docs/skills.md](docs/skills.md).

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
| [gstack](https://github.com/gruckion/gstack) (George Mack stack) | QA, browser, ship, and review workflow patterns referenced in bundled skill mappings |

Full starred-repo notes: [docs/research/2026-06-03-starred-agent-stack-map.md](docs/research/2026-06-03-starred-agent-stack-map.md).

## Claude Code

Eternal Stack targets [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook and skill surfaces. Codex parity helpers install under `~/.codex/etrnl/` when you use both hosts.

## Contributing upstream

If you maintain one of the projects above and want a more formal attribution line or link correction, open an issue or PR in this repository.
