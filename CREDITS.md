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
| SkillsMP backend-development patterns | `skills/etrnl-backend-patterns/references/*.md` | Six-topic backend suite adapted into Eternal Stack reference modules |
| [google-labs-code/design.md](https://github.com/google-labs-code/design.md) (Apache-2.0) | `skills/etrnl-frontend-patterns/references/design-md-workflow.md` | Repo-root `DESIGN.md` artifact format (token YAML + prose intent) |
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT) | `skills/etrnl-frontend-patterns/references/design-presets/*.md` | Brand `DESIGN.md` starting presets (linear, stripe, vercel, notion) |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) | `skills/etrnl-frontend-patterns/references/motion-interaction.md` | Motion, easing, duration, and interruptibility module |
| [educlopez/ui-craft](https://github.com/educlopez/ui-craft) (MIT) | `skills/etrnl-frontend-patterns/references/design-review-rubric.md` | Nielsen×laws critique dimensions in the design-review rubric |
| gstack `plan-design-review` (MIT) | `skills/etrnl-frontend-patterns/references/design-review-rubric.md` | Per-dimension 0–10 scoring methodology; scoring lineage also cites [OpenAI — Designing Delightful Frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) (Mar 2026) per gstack's design hard rules |

Vendored files are adapted for Eternal Stack conventions. Check upstream projects when you need canonical versions or license text.

## Bundled stack skills

Eternal Stack is designed as a complete skill family. Policy, review, simplification, domain, auth, tenancy, and payments skills are vendored under `skills/bundled/`, installed by `scripts/install.sh`, and routed by hooks and `etrnl-*` workflows - they are not a separate optional layer outside the stack.

| Skill | Typical use | Attribution |
| --- | --- | --- |
| `eternal-best-practices` | Multi-tenant SaaS policy router | Eternal engineering practice |
| `code-simplifier` | Clarity pass before completion | Personal / community skill bundle |
| `finding-duplicate-functions` | Dedupe and consolidation review | Personal / community skill bundle |
| `better-auth`, `tenant-isolation-patterns`, `money-vo-discipline` | Auth, tenancy, and money discipline | Community / upstream skill bundles |
| `stripe-best-practices`, `abacatepay-integration` | Payments review | Community / upstream skill bundles |
| `ci-cd` | CI helper scripts referenced by `/etrnl-dev-ci` | Community skill bundle |
| `domain-*`, `i18n-localization`, and related domain skills | Domain-specific review gates | Community / upstream skill bundles |
| `orpc-patterns`, `prisma-expert`, `sql-optimization-patterns`, `brooks-audit` | Backend and review depth; also inlined as `etrnl-*/references/` modules | Community / upstream skill bundles |
| `frontend-design` | Baseline visual direction when building new UI | [anthropics/skills](https://github.com/anthropics/skills) `frontend-design` (Apache-2.0, vendored) |
| `impeccable` | Product-UI craft: critique, audit, and polish | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, vendored fork — upstream `scripts/` and self-update flow removed) |
| `design-taste-frontend` | Landing pages, portfolios, and marketing redesigns | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, vendored as `design-taste-frontend`) |
| `wcag-accessibility` | WCAG 2.1/2.2 accessibility audits and remediation | [mrKanoh/claude-wcag-accessibility-skill](https://github.com/mrKanoh/claude-wcag-accessibility-skill) (MIT, vendored) |
| `ux-researcher-designer` | Personas, journey mapping, usability testing | [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) `ux-researcher-designer` (MIT, vendored) |

The full inventory and routing notes live in [docs/skills.md](docs/skills.md). These four skills are both vendored under `skills/bundled/` and inlined as `references/` modules; see the [Inlined reference modules](#inlined-reference-modules) table above for their inlined homes.

## Design inspiration

Eternal Stack reimplements useful mechanisms from public agent-tooling projects without shipping private background notes or raw analysis artifacts.

| Project | How Eternal Stack uses it |
| --- | --- |
| [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | Optional local code-graph MCP; bootstrap and health checks in `full` profile |
| [hyhmrright/brooks-lint](https://github.com/hyhmrright/brooks-lint) | Review finding shape (Symptom → Source → Consequence → Remedy); vendored Brooks modules |
| [rtk-ai/rtk](https://github.com/rtk-ai/rtk) | Codex deterministic command rewrite via `codex-rtk-pre-tool-use.sh` |
| [GitHub/spec-kit](https://github.com/github/spec-kit) | Plan/readiness executability gates |
| [Chachamaru127/claude-code-harness](https://github.com/Chachamaru127/claude-code-harness) | Quality gates, browser artifact contracts, review plateau ideas |
| [infinri/Writ](https://github.com/infinri/Writ) | Mandatory-rule mechanical enforcement |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | Workflow state and context breadcrumbs benchmark |
| [gstack](https://github.com/garrytan/gstack) | QA, browser, ship, and review workflow patterns referenced in bundled skill mappings; per-dimension design-review rubric scoring adapted in `skills/etrnl-frontend-patterns/references/design-review-rubric.md` (scoring methodology cites an OpenAI blog post per gstack lineage) |

## Claude Code

Eternal Stack targets [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook and skill surfaces. Codex parity helpers install under `~/.codex/etrnl/` when you use both hosts.

## Contributing upstream

If you maintain one of the projects above and want a more formal attribution line or link correction, open an issue or PR in this repository.
