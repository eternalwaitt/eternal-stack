# Credits and attributions

Eternal Stack is one maintained companion for Claude Code and Codex. The unreleased Core candidate installs shared guidance, one native router skill, and a private on-demand capability library; the `orchestrated` and `full` profiles remain alternative opt-in layouts with host-specific integrations. Eternal owns the integrated product surface, canonical modules, packaging, and maintenance. This ownership does not imply original authorship of inherited material. See the [host capability matrix](docs/host-capabilities.md) and [capability catalog](docs/skills.md).

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
| [Addy Osmani `performance-optimization`](https://github.com/addyosmani/web-quality-skills/tree/main/skills/performance-optimization), [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices), and [Brunno `performance-audit`](https://github.com/BrunnoSkarzinski/agent-skills/tree/main/skills/performance-audit) | `skills/etrnl-audit-performance/` | Measure-identify-fix-verify-guard loop, current React/Next.js performance rules, lab/field separation, and public-flow preservation adapted into the six-lane Eternal audit envelope |

Vendored files are adapted for Eternal Stack conventions. Check upstream projects when you need canonical versions or license text.

## Bundled stack skills

The private Core library includes the maintained policy, review, simplification, domain, auth, tenancy, and payments capabilities under `skills/`. The router reads selected entries on demand. The alternative optional profiles have their own installation and activation behavior; see the host matrix. Source lineage and notices remain recorded below and with adapted files.

| Skill | Typical use | Attribution |
| --- | --- | --- |
| `eternal-best-practices` | Stack-specific SaaS reference patterns | Source metadata recorded as unknown; Eternal Stack maintains this integration |
| `code-simplifier` | Clarity pass before completion | Personal / community skill bundle |
| `finding-duplicate-functions` | Dedupe and consolidation review | Personal / community skill bundle |
| `better-auth`, `tenant-isolation-patterns`, `money-vo-discipline` | Auth, tenancy, and money discipline | Community / upstream skill bundles |
| `stripe-best-practices`, `abacatepay-integration` | Payments review | Community / upstream skill bundles |
| `ci-cd` | CI helper scripts referenced by `/etrnl-dev-ci` | Community skill bundle |
| `domain-*`, `i18n-localization`, and related domain skills | Domain-specific review gates | Community / upstream skill bundles |
| `orpc-patterns`, `prisma-expert`, `sql-optimization-patterns` | Backend depth; also inlined as `etrnl-*/references/` modules | Community / upstream skill bundles |
| `frontend-design` | Baseline visual direction when building new UI | [anthropics/skills](https://github.com/anthropics/skills) `frontend-design` (Apache-2.0, vendored) |
| `impeccable` | Product-UI craft: critique, audit, and polish | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, vendored fork — upstream `scripts/` and self-update flow removed) |
| `design-taste-frontend` | Landing pages, portfolios, and marketing redesigns | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, vendored as `design-taste-frontend`) |
| `wcag-accessibility` | WCAG 2.1/2.2 accessibility audits and remediation | [mrKanoh/claude-wcag-accessibility-skill](https://github.com/mrKanoh/claude-wcag-accessibility-skill) (MIT, vendored) |
| `ux-researcher-designer` | Personas, journey mapping, usability testing | [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) `ux-researcher-designer` (MIT, vendored) |

The full inventory and routing notes live in [docs/skills.md](docs/skills.md). Where a bundled skill also has inlined reference material, the [Inlined reference modules](#inlined-reference-modules) table above identifies its Eternal home.

## Design inspiration

Eternal Stack reimplements useful mechanisms from public agent-tooling projects without shipping private background notes or raw analysis artifacts.

For a source-backed comparison of related projects and native host mechanisms, see [comparative research](docs/market-research.md). The comparison is design background; it does not imply that Eternal supports every mechanism described there.

| Project | How Eternal Stack uses it |
| --- | --- |
| [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | Optional local code-graph MCP; bootstrap and health checks in `full` profile |
| [hyhmrright/brooks-lint](https://github.com/hyhmrright/brooks-lint) | Review finding shape (Symptom → Source → Consequence → Remedy); vendored Brooks modules |
| [rtk-ai/rtk](https://github.com/rtk-ai/rtk) | Codex deterministic command rewrite via `codex-rtk-pre-tool-use.sh` |
| [GitHub/spec-kit](https://github.com/github/spec-kit) | Plan/readiness executability gates |
| [Chachamaru127/claude-code-harness](https://github.com/Chachamaru127/claude-code-harness) | Quality gates, browser artifact contracts, review plateau ideas |
| [infinri/Writ](https://github.com/infinri/Writ) | Mandatory-rule mechanical enforcement |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | Workflow state and context breadcrumbs informed earlier execution guidance. Current task requirements and budgets are owned by Eternal's canonical workflow contract; the remaining adapted context-budget guidance is documented in [configuration](docs/configuration.md). |
| [gstack](https://github.com/garrytan/gstack) | QA, browser, ship, and review patterns inform selected capabilities; per-dimension design-review rubric scoring is adapted in `skills/etrnl-frontend-patterns/references/design-review-rubric.md` (with the cited OpenAI design source). Its question-preference hook is one influence on the optional Claude hook implementation. |
| [Google web.dev performance guidance](https://web.dev/articles/vitals) and [Chrome Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) | Core Web Vitals p75 field rules, Lighthouse lab boundaries, and TBT-versus-INP evidence honesty in `skills/etrnl-audit-performance/references/measurement-evidence.md` |
| [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | Two patterns adapted: the `ce-work` trivial-work table informs the Trivial/Small/Large plan scope triage in `scripts/diff-triviality.mjs classify-plan` and `etrnl-dev-autoplan`, and its babysit trajectory fields inform the `recurringFindingCount` / `streamAlternationCount` / `roundsSinceProgress` park thresholds in `scripts/review-merge.mjs` |
| ECC (`strategic-compact` skill) | Threshold-driven compact advisory pattern behind `hooks/cc-compact-suggest.sh`; also the precedent for `minimal`/`standard`/`strict` hook profiles |

## Host integrations

The Core candidate uses the same maintained router and library sources on [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and Codex. Each host still has different tools, permissions, skill discovery, hooks, and agent mechanisms. The alternative optional package can register Claude hooks and agents; copied legacy Codex hook scripts are not active without native registration. The versioned companion lifecycle adapters are Eternal integration code based on documented [Codex 0.159.2 hook schemas](https://github.com/openai/codex/tree/rust-v0.159.2/codex-rs/hooks) and [Claude native hooks/CLI](https://code.claude.com/docs/en/hooks); no upstream implementation code is vendored by this integration. Their shared state/knowledge records preserve existing source attribution. See the [host capability matrix](docs/host-capabilities.md). Source attributions and recorded license observations describe lineage; they are not legal determinations or freshness guarantees.

## Contributing upstream

If you maintain one of the projects above and want a more formal attribution line or link correction, open an issue or PR in this repository.

## Performance research additions

The performance kernel compares mechanisms from [Vercel Optimize](https://github.com/vercel-labs/agent-skills/tree/main/skills/vercel-optimize), [Addy Osmani agent skills](https://github.com/addyosmani/agent-skills), [Pierre's Agent Laboratory](https://github.com/PierreAndreis/pierre-skills), [Skill Me Load Testing](https://github.com/SkillMedev/skills), and [Intel performance skills](https://github.com/intel/intel-performance-skills). No external text/code is vendored by this change. Exact revisions, hashes and license observations are in the [research ledger](docs/adr/performance-research-sources.json); technical anchors and adaptations are in the [design record](docs/adr/2026-09-performance-audit-kernel.md).

### Performance expertise and investigation depth

The performance contract v2 reuses the bundled `orpc-patterns` (entrypoint `orpc-fullstack`), `prisma-expert` and `sql-optimization-patterns` resources when detected, plus React/Next and conditional query-cache, runtime, queue, streaming and provider playbooks. Resource hashes and version review fence inherited examples. Every check/surface cell requires an initial investigation and bounded challenge sweeps (three total rounds by default). A final sweep with new findings ends as `budget_exhausted`, with explicit remaining work rather than a clean claim. Findings are uncapped; prior-run reconciliation exposes missed issues and audit-quality failures. See [the routing and depth contract](skills/etrnl-audit-performance/references/conditional-performance.md).

## Portable-core reset research

The reset compared AIOX, Pi, Superpowers, GSD Core, gstack, ECC, Compound Engineering, BMAD, Spec Kit and Adobe's repository harness guide, plus official Claude/Codex and Agent Skills documentation. These are design references; no external code or prose is vendored by this reset. Sources and decisions are linked in [the architecture decision](docs/adr/2026-10-portable-core.md). Some older bundled entries still lack an exact upstream revision; local vendor paths do not establish authorship or freshness.

### Skills interaction maintenance

Eternal Stack split the large taste, SaaS-pattern and accessibility entrypoints into compact selectors and preserved their detailed guides under each skill's `references/` directory. Existing upstream attribution and license notices remain applicable. The integration also adapts coordination, context recovery, payment/version guidance and project-policy boundaries; these maintenance changes do not imply original authorship of the inherited material.
