# ETRNL Skills

Repo-owned skills use the `etrnl-` prefix so slash commands, hook state, and session summaries stay traceable to Eternal Stack.

Claude Code exposes them as `/etrnl-*` commands. Install writes `~/.claude/commands/etrnl-*.md` shims from each skill contract. If this stack ships as a Claude plugin later, the namespace may become `etrnl:<skill>`, but installed commands today remain `etrnl-*`.

## Namespaces

Pick the namespace that matches the job. Operations skills are host maintenance — they are not part of the dev plan → execute → commit loop.

| Prefix | Scope | When to use |
| --- | --- | --- |
| `etrnl-dev-*` | Project work | Plan, execute, test, debug, commit, PR, CI, dependencies |
| `etrnl-audit-*` | Quality gates | Code health, security, performance, docs, browser QA, deep audits |
| `etrnl-ops-*` | Host and stack maintenance | Save/restore workflow context, reclaim disk, tune agent instruction files |
| `etrnl-comm-*` | Outbound communication | Private email reply checks before send |
| `etrnl-backend-patterns`, `etrnl-frontend-patterns`, `etrnl-code-review-excellence`, `etrnl-deep-audit*` | Reference orchestrators | Load `references/` modules on demand; not thin one-shot commands |

Hooks route prompts to these skills and enforce guardrails at tool boundaries. See [hooks.md](hooks.md).

For Codex-first low-context runs (RTK proxy, minimal hook profile, MCP audit, prompt caps), see the `Codex-first efficiency profile` section in [configuration.md](configuration.md).

## Development (`etrnl-dev-*`)

Planning, execution, verification, and shipping for a codebase you are building.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-dev-brainstorm` | Model or user | Turns ambiguous ideas into approved design/spec files before planning. |
| `/etrnl-dev-plan` | Model or user | Creates a plan file with a required `Risk tier:` line (0–3), scopes review gauntlets and the parity scorecard by tier, reviews it, improves it, then finalizes it. |
| `/etrnl-dev-autoplan` | Model or user | Creates readiness-compatible execution plans with task groups, subagent candidates, verification gates, question policy, tier-scaled deep-stack artifacts, a `## Tier assessment` section with Trivial/Small/Large scope triage and per-packet agent/model/effort routing (tier 2 and above), a bounded plan-time review loop (tier 3 only), and an autoplan parity scorecard (tier 3 only). |
| `/etrnl-dev-execute` | User only | Executes an approved readiness-checked plan end to end with test-first source tasks, run ledger, write-mode implementation subagents, tier-scaled reviews, mini-packets for sequential work, model-tier routing (`fast`/`standard`/`top`) resolved into explicit Codex model and reasoning effort, a lighter Codex host profile, gate-based progress from the ledger, and verification. |
| `/etrnl-dev-test` | User only | Runs project preflight and reports or fixes failures. |
| `/etrnl-dev-debug` | User only | Debugs bugs, failing tests, CI failures, production issues, and unexpected behavior through root-cause evidence before fixes. |
| `/etrnl-dev-commit` | User only | Reviews, verifies, stages, and commits relevant work. |
| `/etrnl-dev-pr` | User only | Prepares or updates pull requests with dual-audience descriptions (TL;DR, business why/impact, add/change/remove, rollout/rollback, verification evidence), CI state, review feedback, and a closed readiness loop. |
| `/etrnl-dev-ci` | Model or user | Designs, audits, hardens, debugs, and repairs CI/CD lanes, GitHub Actions, branch protection, deploy gates, OIDC, SBOM/provenance, rollback, flaky CI, and slow builds. |
| `/etrnl-dev-deps` | User only | Handles targeted dependency maintenance with migration checks, catalog consolidation, bot PR triage, and rollback evidence. |
| `/etrnl-dev-stress-test` | Model or user | Stress-tests architecture, rollout, migration, automation, and safety assumptions. |
| `/etrnl-dev-deprecate` | User only | Runs deprecation and migration with caller audits, removal-first bias, migration paths, removal deadline/owner, and a tenant/Money/auth/validation/a11y/data-loss guard fence. |

### Plan risk tiers (`etrnl-dev-plan`, `etrnl-dev-autoplan`, `etrnl-dev-execute`)

Every final plan requires a `Risk tier:` line (0–3). Tier definitions live in `skills/etrnl-dev-execute/SKILL.md`; `plan-readiness-check.mjs` enforces proportional section requirements and auto-escalation:

| Tier | Ceremony |
| --- | --- |
| 0 | Docs/no-source/tiny change; local verification only; reduced plan sections; no deep-stack bundle. |
| 1 | One small source surface; normal tests plus completion check; reduced plan sections. |
| 2 | Multi-file/source workflow; spec reviewer, quality reviewer, simplifier, completion audit; broader plan sections. |
| 3 | Hooks, installed-home changes, auth, money, security, migrations, data-loss risk, or broad stack behavior; full deep stack plus staged install/rollback proof; completeness 10/10 and autoplan parity scorecard are tier-3-only. |

Auto-escalation is deterministic: touching `hooks/`, installers, auth, money, migrations, or tenant surfaces forces tier 3; more than eight distinct repo paths in the file map or task groups forces at least tier 2. A missing `Risk tier:` line is treated as tier 3 strictness.

Tier-3 staged install and rollback proof is execution evidence, so the plan gate accepts it as `planned` with the producing command in its `command` field and `/etrnl-dev-execute` records `passed`. Only the install-surface half of the tier-3 trigger list (`hooks/`, `scripts/install*.sh`, `scripts/update.sh`) owes that proof; a tier-3 plan driven by auth, money, migration, or tenant risk has no install to stage and records those stages `not_applicable` with evidence. `blocked` never satisfies the gate. `deep-stack-check.mjs validate-plan` adds a scope-freeze guard (`SCOPE_DRIFT_SUBSYSTEM`) that blocks new ledger/receipt/provenance-style subsystems not named in the plan Goal.

During execute, tier scales review depth (consolidated per-wave review below tier 3), reopen caps (2 rounds for tiers 0–2, 4 for tier 3), and model-tier defaults: read-only lanes → `fast`, write implementation → `standard`, tier-3 money/migration/security review → `top`. Sequential single-task work may use a 5-field mini-packet (`taskId`, goal, exact scope, verification command, write scope) without hash, lineage, reviewers, or completion receipt. Parallel or multi-file writes still require full packets. Default `maxConcurrentLanes` is 3 on Claude and 2 on Codex unless the plan's `## Parallelization strategy` justifies more in one explicit line; `ETRNL_EXECUTE_HOST` and `check-spawn` enforce the active cap.

### Codex routing and scope triage (`etrnl-dev-autoplan`, `etrnl-dev-execute`)

Both skills route Codex spawns explicitly instead of letting a child agent inherit the parent thread's flagship model. The slug map and the env overrides are documented in [configuration.md](configuration.md) under `Codex spawn model and reasoning effort`; the depth lives in `skills/etrnl-dev-execute/references/codex-execute-profile.md` and `skills/etrnl-dev-autoplan/references/tier-assessment-and-model-routing.md`.

- **Execute host profile.** `ETRNL_EXECUTE_HOST=codex` selects the Codex profile (`references/codex-execute-profile.md`); `claude` selects the Claude profile (`references/claude-execute-profile.md`); unset auto-detects the host. Codex drops `maxConcurrentLanes` to 2 and merges review into one pass per wave for tier 0–2. Claude defaults to 3 lanes. Tier 3 keeps the full reviewer chain on wave 1 and merged review from wave 2 unless the plan names full fan-out. Tier-3 gates hold at full strength under either profile.
- **Explicit spawn model.** Every `spawn_agent` or native child call sets `model` and reasoning effort from `resolveCodexModel` in `scripts/lib/codex-model-routing.mjs`. An unset `model`, or a literal `inherit`, is a packet defect to fix before re-dispatch, and `agent-task-packet-check.mjs` errors on a write packet with no `codexModel`.
- **Gate-based progress.** Rolling hour ETAs, wall-clock finish times, and elapsed-time percentages are prohibited on every host. Status is quoted from `execution-ledger.mjs history --gates`.
- **Tier assessment.** Plans at tier 2 and above carry a `## Tier assessment` section with an Agent/model/effort column per packet, where `inherit` is a plan defect rather than a default.
- **Scope triage.** `diff-triviality.mjs classify-plan --plan <path> [--json]` classifies a plan's file map as Trivial, Small, or Large. Trivial requires tier 2 or below, three files or fewer, and no behavioral, API, or schema change; it then skips reviewer fan-out and full phase scaffolding in favor of the mini-packet, while the deterministic `review-rules.mjs` guard and the plan's own verification gates still run. Classification fails safe toward Large on an unreadable plan, an empty file map, or a file-map row silent about behavior, and tier 3 is never Trivial at any file count.
- **Plan-time convergence.** Tier 3 plans run a bounded spec → quality → adversary loop before execution, capped at three cycles and stalled when the open-high count stops falling; see `skills/etrnl-dev-autoplan/references/plan-review-convergence.md`. Tier 2 and below skip it entirely.

## Audits and review (`etrnl-audit-*`, deep audit)

Whole-repo or category audits with deterministic ledgers and artifact contracts.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-audit-code` | User only | Runs the canonical code-health router: inventory, Health Stack, deterministic gates, bundled-skill audits, ledger, and no-skips closure. |
| `/etrnl-audit-docs` | Model or user | Runs documentation-health audits across READMEs, docs, ADRs, runbooks, API/runtime docs, AI context, and code comments. |
| `/etrnl-audit-security` | Model or user | Runs the registered security deep-audit category with exploitable-bug evidence and explicit non-findings. |
| `/etrnl-audit-performance` | Model or user | Runs the registered performance deep-audit category with route matrix evidence, cold/warm measurements, and lane receipts. |
| `/etrnl-audit-production` | Model or user | Runs the registered production-readiness deep-audit category with applicability gates and source-limited blockers. |
| `/etrnl-audit-tooling` | Model or user | Runs the registered tooling-ecosystem deep-audit category across local setup, lint/format/type gates, CI parity, and rollback paths. |
| `/etrnl-audit-browser` | User only | Produces browser QA reports with route, viewport, screenshot, console, network, accessibility, and responsive evidence. |
| `/etrnl-deep-audit` | Model or user | Orchestrates registered application deep-audit categories through shared worklists, category reports, lane receipts, and coverage statements. |
| `/etrnl-deep-audit-ux` | Model or user | Runs the `ui-ux-product` category separately so UI/UX depth can evolve without blocking `all_registered` orchestration. Five lanes fan out over an inventory from `ux-inventory.mjs`; `ux-audit-check.mjs coverage` blocks completion on sampled coverage, and every check carries a 0-10 `uxHealthScore` plus quick wins, so the run reports craft gaps instead of only defects. |
| `/etrnl-code-review-excellence` | Model or user | Code-excellence review and Brooks-style structural audit via on-demand `references/` modules. |

## Operations (`etrnl-ops-*`)

Host, session, and stack maintenance. These skills do not implement product features and do not replace `/etrnl-dev-execute`.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-ops-context-save` | User or model | Saves concise resumable workflow state without storing transcripts or credentials. |
| `/etrnl-ops-context-restore` | User or model | Restores a saved context summary and flags stale continuation state. |
| `/etrnl-ops-disk-cleanup` | User only | Reclaims local disk space with host/filesystem evidence, a dry-run manifest, approved transient path classes, `trash` deletion, and before/after free-space verification. Hooks pair with this skill to block `rm -rf` and unapproved paths. |
| `/etrnl-ops-agent-files` | Model or user | Maintains AGENTS.md, CLAUDE.md, rules, and agent instruction files without bloat. |
| `/etrnl-ops-ship` | User only | Verifies tiered release readiness from plan/PR evidence and `.etrnl/release.json`, bootstraps release controls when missing, then promotes by signal. Requirements are enforced at plan and PR time — not originated at deploy. |

## Communications (`etrnl-comm-*`)

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-comm-email-reply-quality` | Model or user | Checks private outgoing email replies for banned dash typography, natural Brazilian Portuguese, AI tells, and humanizer cleanup before approval or send. |

## Reference orchestrators

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-backend-patterns` | Model or user | Classifies backend tasks and loads only the needed `references/` modules (oRPC, API, data, Prisma, SQL, security, resilience, observability, architecture). |
| `/etrnl-frontend-patterns` | Model or user | Classifies frontend design tasks, checks repo `DESIGN.md`, loads only the needed `references/` modules (DESIGN.md workflow, brand presets, motion, design-review rubric), and routes to at most one bundled generation skill. |
| `/etrnl-router` | Model or user | Routes a request to the right `etrnl-*` skill or agent via a decision tree over dev/audit/ops families plus reviewer/worker agents, with an always-on operating-behaviors preamble. |

## Custom Commands

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/email-triage <account>` | User only | Runs private email triage in two phases: archive/label INBOX items and provider-verify Inbox Zero, then render one action/reply queue item only after verification reports `inbox_zero_verified: true`, `inbox_count: 0`, and either `gmail_mutated: true` or `queue_ready_without_mutation: true`; visible reply drafts require the local draft checker before approval. |

## Code Review Excellence

`/etrnl-code-review-excellence` is the single slash entry for code-excellence review and Brooks-style structural audit. Reference modules live under `skills/etrnl-code-review-excellence/references/` and load on demand — they are not separate owned skills or commands.

| Module file | Covers |
| --- | --- |
| `references/audit-checks.md` | Registered `code-excellence` deep-audit checks (`code-01`–`code-06`) |
| `references/brooks-foundation.md` | Iron Law findings, severity, health score, decay risks, report envelope |
| `references/brooks-architecture.md` | Module dependency graph, layering, Conway's Law, testability seams |
| `references/brooks-onboarding.md` | Codebase tour and new-developer orientation |

Brooks bundled content for this stack; prefer these references over a separate `brooks-audit` install.

## Backend Patterns

`/etrnl-backend-patterns` is the single slash entry for server-side design work. Reference modules live under `skills/etrnl-backend-patterns/references/` and are loaded on demand by the orchestrator — they are not separate owned skills or commands.

| Module file | Covers |
| --- | --- |
| `references/orpc.md` | oRPC contract-first procedures, middleware stack order, Hono mount, TanStack Query, event iterators, errors, thin handlers, 100/100 checklist |
| `references/api.md` | REST/GraphQL contracts, status codes, idempotency, pagination, versioning, error envelopes, middleware order, surface selection vs oRPC |
| `references/data.md` | Schemas, indexes, N+1 prevention, transactions, repositories, cache-aside, surface selection vs Prisma/SQL modules |
| `references/prisma.md` | Prisma schema, migrations, client queries, connection pool, transactions, multi-tenancy, 100/100 checklist |
| `references/sql-optimization.md` | EXPLAIN ANALYZE, index design, pagination, aggregates, monitoring, Prisma-emitted SQL, 100/100 checklist |
| `references/security.md` | Authn/authz, validation, secrets, OWASP-oriented server hardening |
| `references/resilience.md` | Timeouts, retries, circuit breakers, bulkheads, distributed limits, DLQs |
| `references/observability.md` | Structured logs, tracing, RED metrics, SLI/SLO, health checks, error handling |
| `references/architecture.md` | Service layers, boundaries, events/outbox, CQRS, sagas |

Bundled backend guidance for this stack; supersedes a separate `backend-patterns` install.

## Frontend Patterns

`/etrnl-frontend-patterns` is the single slash entry for frontend design work. Reference modules live under `skills/etrnl-frontend-patterns/references/` and are loaded on demand by the orchestrator — they are not separate owned skills or commands.

| Module file | Covers |
| --- | --- |
| `references/design-md-workflow.md` | Repo-root `DESIGN.md` artifact convention (token YAML + prose intent), when agents read or refresh it, and token export notes |
| `references/design-presets/linear.md` | Brand `DESIGN.md` starting points (also `stripe.md`, `vercel.md`, `notion.md`) |
| `references/motion-interaction.md` | Motion, easing, duration, and interruptibility patterns for product UI |
| `references/design-review-rubric.md` | Per-dimension 0–10 design review rubric consumed by `etrnl-design-reviewer` |

Generation-skill routing (load at most one per task):

| Scope | Bundled skill |
| --- | --- |
| Baseline visual direction when building new UI | `frontend-design` |
| Product-UI craft: critique, audit, polish | `impeccable` |
| Landing pages, portfolios, marketing redesigns | `design-taste-frontend` |
| WCAG/a11y audit or remediation depth | `wcag-accessibility` |
| UX research: personas, journey mapping, usability testing | `ux-researcher-designer` |

`etrnl-frontend-patterns` is the routing authority for these bundled skills; for whole-product UI audits use `/etrnl-deep-audit-ux` instead.

## Deep Audit Skills

`/etrnl-deep-audit` is the thin orchestrator. `all_registered` means every orchestrator-included category from `orchestratorCategoryIds()` in `scripts/lib/deep-audit-categories.mjs`, currently `code-excellence`, `production-readiness`, `security`, `performance`, `shared-reuse`, `repo-hygiene`, and `tooling-ecosystem`; it is not a claim that API/data, payments, privacy/compliance, or UI/UX/product ran. `ui-ux-product` runs separately via `/etrnl-deep-audit-ux`. Categories `shared-reuse` and `repo-hygiene` are bundled under the orchestrator; standalone category skills remain for production, security, performance, tooling, code-excellence, and UI/UX.

Quick validator path:

```bash
node scripts/deep-audit-artifact-check.mjs validate-fixtures
node scripts/deep-audit-artifact-check.mjs validate-registry --root .
node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.valid.json
```

Direct category examples:

```bash
/etrnl-audit-production --category production-readiness
/etrnl-audit-security --category security
/etrnl-audit-performance --category performance
/etrnl-code-review-excellence --category code-excellence
/etrnl-deep-audit-ux
/etrnl-deep-audit --category shared-reuse
/etrnl-deep-audit --category repo-hygiene
/etrnl-audit-tooling --category tooling-ecosystem
```

## Bundled skills

Eternal Stack installs two cooperating layers:

1. **`etrnl-*` orchestration** — repo-owned commands, hooks, scripts, and agents from this repository.
2. **Bundled review and domain skills** — policy, simplification, dedupe, domain, auth, and payments skills that complete the loops `etrnl-*` workflows enforce.

Bundled skills are vendored under `skills/bundled/<name>/` in this repository. `scripts/install.sh` copies each tree to `~/.claude/skills/<name>` and `~/.codex/skills/<name>`. Maintainers refresh vendored copies from canonical host trees with `scripts/vendor-bundled-skills.sh`.

When the same guidance exists under `skills/etrnl-*/references/`, prefer the repo module first; load the bundled skill when the task needs the full surface or hooks require it by name.

Hindsight is not an ETRNL execution skill and is not compact handoff authority. It is optional semantic recall/export behind `scripts/canary-hindsight.sh`; accepted lessons are first stored as ETRNL `lesson` events.

Beads is not an ETRNL bundled execution skill. It is allowed as explicit backlog, blocker, dependency, claim, and discovered-follow-up state only. Active ETRNL tasks, phases, checks, compact handoff packets, execution-ledger evidence, and review evidence stay in ETRNL state and ledgers. Raw `bd prime --full` output is rejected by `node scripts/etrnl-state.mjs bead-prime-audit`.

| Skill | Bundle role | Used for |
| --- | --- | --- |
| `eternal-best-practices` | Bundled policy | Auth, tenant isolation, money, i18n, Prisma, soft deletes, and domain-sensitive work. |
| `domain-*` | Bundled domain | Cloud, web, fintech, IoT, embedded, ML, and similar review gates. |
| `better-auth` | Bundled auth | Auth implementation review on protected auth paths. |
| `tenant-isolation-patterns` | Bundled tenancy | Multi-tenant data and permission boundaries. |
| `money-vo-discipline` | Bundled finance | Money/value-object discipline on financial and billing paths. |
| `i18n-localization` | Bundled i18n | Locale and translation review on user-facing surfaces. |
| `stripe-best-practices` | Bundled payments | Stripe payment and billing review. |
| `abacatepay-integration` | Bundled payments | AbacatePay PIX integration review. |
| `ci-cd` | Bundled CI | Helper scripts such as `audit_github_actions.py` referenced by `skills/etrnl-dev-ci/SKILL.md`. |
| `code-simplifier` | Bundled review | Clarity and simplification pass before final scoring or completion. |
| `finding-duplicate-functions` | Bundled review | Dedupe review for repeated logic and consolidation work. |
| `prisma-expert` | Inlined + bundled | Prisma depth; default to `etrnl-backend-patterns/references/prisma.md` in this repo. |
| `sql-optimization-patterns` | Inlined + bundled | SQL optimization depth; default to `etrnl-backend-patterns/references/sql-optimization.md`. |
| `orpc-patterns` | Inlined + bundled | oRPC depth; default to `etrnl-backend-patterns/references/orpc.md`. |
| `brooks-audit` | Inlined + bundled | Default to `etrnl-code-review-excellence/references/brooks-*.md`; full skill also vendored under `skills/bundled/`. |
| `backend-patterns` | Superseded | Use `/etrnl-backend-patterns` instead. |
| `frontend-design` | Bundled frontend | Baseline visual direction and aesthetic choices when building new UI. |
| `impeccable` | Bundled frontend | Product-UI craft: critique, audit, and polish of application interfaces (vendored fork; upstream scripts and self-update removed). |
| `design-taste-frontend` | Bundled frontend | Landing pages, portfolios, and marketing redesigns only. |
| `wcag-accessibility` | Bundled frontend | WCAG 2.1/2.2 accessibility audits and remediation on explicit a11y asks. |
| `ux-researcher-designer` | Bundled frontend | Personas, journey mapping, usability-test frameworks, and research synthesis. |

### Optional upstream installs (not vendored — no license)

These upstream skills are useful but not vendored in Eternal Stack — they lack a license, carry an un-auditable reference corpus, or both. Install them directly from upstream when you need them:

| Upstream | Install from | Why not vendored |
| --- | --- | --- |
| `web-design-guidelines`, `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | No license in upstream repository |
| AccessLint skills | [AccessLint/skills](https://github.com/AccessLint/skills) | No license in upstream repository |
| `ui-ux-pro-max-skill` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Heavy 43-file reference corpus; reference value does not justify vendored surface area |

## Deterministic Helpers

| Helper | Installed Path | Purpose |
| --- | --- | --- |
| `lib/audit-exclusions.mjs` | `~/.claude/scripts/lib/audit-exclusions.mjs` | Centralizes no-skips audit exclusions so vendor, build, cache, generated, fixture, local agent, worktree, log, and `.audit` artifacts are listed or skipped with reasons instead of audited as source/docs. |
| `code-health-inventory.mjs` | `~/.claude/scripts/code-health-inventory.mjs` | Inventories tracked files and classifies audit coverage for no-skips code-health runs. |
| `code-health-ledger-check.mjs` | `~/.claude/scripts/code-health-ledger-check.mjs` | Blocks code-health completion unless inventory, action-item counters, terminal findings, resolution plan, and final gate evidence are present. |
| `documentation-comment-health.mjs` | `~/.claude/scripts/documentation-comment-health.mjs` | Inventories exported JS/TS targets and their leading TSDoc/JSDoc coverage so documentation-health runs cannot pass with comment sampling only. |
| `documentation-health-ledger-check.mjs` | `~/.claude/scripts/documentation-health-ledger-check.mjs` | Blocks documentation-health completion unless coverage, source-truth, freshness/drift, comment, AI-context, terminal-ledger, and validation evidence are present. |
| `disk-cleanup-manifest.mjs` | `~/.claude/scripts/disk-cleanup-manifest.mjs` | Validates disk-cleanup dry-run manifests with absolute paths, byte estimates, risk tiers, approval requirements, and no recursive `rm` or whole-Trash cleanup. Used by `/etrnl-ops-disk-cleanup`, not dev workflows. |
| `merge-settings.mjs` | `~/.claude/scripts/merge-settings.mjs` | Merges etrnl hooks into existing Claude settings without replacing unrelated local configuration. |
| `plan-readiness-check.mjs` | `~/.claude/scripts/plan-readiness-check.mjs` | Rejects thin plans before they are marked final or executed; enforces tier-proportional section requirements, deterministic auto-escalation, and deep-stack artifact requirements scaled by `Risk tier:` (0–3). |
| `deep-stack-check.mjs` | `~/.claude/scripts/deep-stack-check.mjs` | Creates and validates the Hybrid Deep Stack artifact bundle for final plans: sanitized source manifest, skill matrix, review phase records, TDD evidence, reuse inventory/bindings, findings ledger, completion audit/reconciliation, risk tier, TypeScript trigger evidence, and install proof. |
| `deep-audit-artifact-check.mjs` | `~/.claude/scripts/deep-audit-artifact-check.mjs` | Validates deep-audit category artifacts, registry/docs/install alignment, registered check coverage, lane receipts, consumed worklist hashes, redaction, and stable problem/cause/fix diagnostics. |
| `lib/deep-audit-categories.mjs` | `~/.claude/scripts/lib/deep-audit-categories.mjs` | Defines registered deep-audit categories, known unimplemented domains, check ids, lane ids, required worklists, and reference paths. Every lane is built through a factory that refuses to construct a lane without a `modelTier`, so a new category cannot reintroduce model inherit; `resolveLaneDispatch(lane)` and `categoryLaneDispatch(categoryId)` return the explicit model and reasoning effort for a lane spawn. |
| `lib/deep-stack-artifacts.mjs` | `~/.claude/scripts/lib/deep-stack-artifacts.mjs` | Shared deep-stack artifact schema and validators used by readiness, packet, install, and operator-facing section checks. |
| `agent-task-packet-check.mjs` | `~/.claude/scripts/agent-task-packet-check.mjs` | Enforces structured subagent packet contracts with task identity, lineage identity, packet hashes, lane limits, child-agent policy, completion receipts, spec/quality reviewer contracts, reuse/TDD/simplifier fields for new-surface or deep-stack writes, and `modelTier` (`fast`/`standard`/`top`) with template defaults and a justification warning for read-only `top`. A write packet that omits `codexModel` is an error, not a warning, so no spawn silently inherits the parent thread's model; `--template read-only\|write\|mini` emits a starting packet with the resolved slug and reasoning effort already filled in. |
| `lib/codex-model-routing.mjs` | `~/.claude/scripts/lib/codex-model-routing.mjs` | Single source of truth for Codex spawn routing. `resolveCodexModel({ modelTier, codexModel, codexReasoningEffort, modelTierJustification })` returns `{ model, reasoningEffort }` — `fast` → `gpt-5.6-luna`/low, `standard` → `gpt-5.6-terra`/medium, `top` → `gpt-5.6-terra`/high — honoring packet fields first, then `ETRNL_CODEX_MODEL_<TIER>`, then the static map. It throws rather than inheriting, and permits `gpt-5.6-sol` only when `modelTierJustification` names an integration-owner or adversarial escalation. |
| `codex-rollout-baseline.mjs` | `~/.claude/scripts/codex-rollout-baseline.mjs` | Aggregates a parent Codex rollout JSONL plus every subagent rollout it spawned into one measurement: wall duration, billed tokens split parent vs subagent, compaction count, `spawn_agent` count, explicit-vs-inherited spawn models, and turn-model distribution. `baseline` and `trend` persist under `${ETRNL_ARTIFACTS_DIR}/codex-baselines/` with the same schema and permission conventions as `ux-audit-check.mjs`. |
| `agent-output-contract.mjs` | `~/.claude/scripts/agent-output-contract.mjs` | Validates a subagent's `ETRNL_CONTRACT: v1` block — status enum, per-finding grammar, and per-agent required keys — against `schemas/agent-contract-v1.json`; exit 0/1/2 fail-closed. Invoked by `hooks/cc-subagentstop-record.sh` and backstopped by `hooks/cc-stop-verifier.sh`. |
| `performance-baseline.mjs` | `~/.claude/scripts/performance-baseline.mjs` | Creates, validates, and compares performance baseline artifacts with next-run thresholds. |
| `ux-inventory.mjs` | `~/.claude/scripts/ux-inventory.mjs` | Enumerates UI/UX worklists (routes, components, states, styles, copy, accessibility) with hashes, coverage axes (viewports, themes, locales, auth states, data volumes, zoom), and a mechanical anti-pattern scan so a UI/UX audit has a denominator. |
| `ux-audit-check.mjs` | `~/.claude/scripts/ux-audit-check.mjs` | Blocks UI/UX audit completion when coverage counters fall short of the inventory without a `coverageExceptions` reason; also persists `uxHealthScore` baselines and computes run-over-run trend. |
| `pr-preflight.mjs` | `~/.claude/scripts/pr-preflight.mjs` | PR workflow gate: branch/dirty/existing PR status, dual-audience body `template`, and structural `validate-body` before `gh pr create`. Release class (`routine`, `guarded`, `migration`) drives Rollout & rollback blockers via `lib/release-controls.mjs`. |
| `release-controls-init.mjs` | `~/.claude/scripts/release-controls-init.mjs` | Release-controls bootstrap library and CLI (`detect`, `init`, `check`, `ensure`). App repos receive `.etrnl/release.json` plus gate/telemetry scaffolds **automatically** when `pr-preflight` or `plan-readiness-check` hits a guarded/migration class — users do not run this manually. |
| `guard-override-token.mjs` | `~/.claude/scripts/guard-override-token.mjs` | Issues and verifies one-time signed override tokens for safety-critical prod/secret commands. |
| `settings-audit.mjs` | `~/.claude/scripts/settings-audit.mjs` | Audits and repairs duplicate hook commands, overlapping matcher groups, legacy rate-limiter registrations, outside-settings plugin hooks, risky top-level settings, and memory plugin config posture. |
| `etrnl-state.mjs` | `~/.claude/scripts/etrnl-state.mjs` | Appends and queries canonical local ETRNL state for compact pre/post events, bounded handoff restore, stale-verification Stop checks, context entries, tool signals, settings observations, accepted lessons, dry-run Beads backlog links, and raw Beads doctrine rejection. |
| `codex-rtk-pre-tool-use.sh` | `~/.claude/scripts/codex-rtk-pre-tool-use.sh` | Source-controlled Codex RTK PreToolUse hook; syncs to `~/.codex/hooks/rtk-pre-tool-use.sh` to rewrite commands with `updatedInput`, proxy unsafe `rg` forms, and block broad `.codex` scans. |
| `update-check.mjs` | `~/.claude/scripts/update-check.mjs` | Compares installed metadata with the recorded source checkout, reports local/remote drift, emits `--explain` diagnostics, and can run local auto-update when enabled. |
| `skill-update-prompt.mjs` | `~/.claude/scripts/skill-update-prompt.mjs`, `~/.codex/scripts/skill-update-prompt.mjs` | Auto-repairs local etrnl drift through update-check, then converts remaining remote and CodeGraph/Beads drift into the per-skill prompt used by Claude hooks and the first Codex skill step. |
| `replay-hook-fixtures.mjs` | `~/.claude/scripts/replay-hook-fixtures.mjs` | Replays scrubbed regression fixtures through live hooks and asserts allow/deny/block outcomes. |
| `execution-ledger.mjs` | `~/.claude/scripts/execution-ledger.mjs` | Creates, validates, and checks local ETRNL run ledgers, including task lineage, packet-bound write evidence, reviews with tier-scaled reopen caps, atomic `record-task-bundle` evidence, `record-decision`, `check-spawn --task-name <name> --wave <id> [--explain]` (deterministic spawn guard on Claude and Codex: lane cap, wave 2+ merged review, review round cap, batch adoption, spawn registry; hooks record spawns), `record-spawn-registry`, `history --progress` (with `--renegotiation-check`), `history --gates [--plan <path>]` for the gate checklist that replaces time estimates in user-facing status, `record-trajectory --wave <id>` for the per-wave review-economy counters, `reconcile` for pointer, session-bucket, and cross-worktree divergence, TDD/simplifier/specialist/completion/install evidence rows, mandatory phase recording during plan execution, conditional workstream metadata, UAT completion gates, and content-addressed `treeHash` on checks. |
| `review-scope.mjs` | `~/.claude/scripts/review-scope.mjs` | Classifies tier 0–2 diff-size review scope (`deterministic_only`, `merged_quality`, `full_lenses`); tier ≥3 always `full_lenses`. Integrated into `check-spawn` for reviewer-class spawns. |
| `execution-wave-check.mjs` | `~/.claude/scripts/execution-wave-check.mjs` | Groups planned tasks by wave, detects file overlap, and reports worktree eligibility. |
| `review-log.mjs` | `~/.claude/scripts/review-log.mjs` | Appends, validates, redacts, fingerprints, and summarizes durable review findings. |
| `review-rules.mjs` | `~/.claude/scripts/review-rules.mjs` | Runs pre-push deterministic CodeRabbit-preemption guards (ast-grep and literal rules from `review-rules.json`) over changed files; block-mode matches fail the gate, warn-mode reports. `check --report-only` returns the same findings with status `report-only` and exits 0, so an advisory pass never escalates a block-mode match. |
| `review-learn.mjs` | `~/.claude/scripts/review-learn.mjs` | Fully-automatic learning loop: classifies a PR's review findings, tracks recurrence in `review-learnings.json`, and at three recurrences auto-promotes a template-matching class to a warn-mode `review-rules.json` guard (escalating to block after two clean runs) or a checklist candidate for autoplan. |
| `review-merge.mjs` | `~/.claude/scripts/review-merge.mjs` | `merge` folds parallel reviewer findings JSON into one artifact (`--scoped` for fix-round targeted synthesis with `--fix-base-sha`, `--fix-head-sha`, `--finding-ids`): fingerprint dedup with cross-reviewer confidence boost, confidence gates with reported (never silent) drops, and `autofix_class` routing into `blocking` (P0/P1), `safe_auto`, and `residual`; exit 1 only on blocking findings. `capDecision` resolves what happens when the loop ends — `close`, `reopen`, `proceed-with-residuals`, or `owner-decision` — so a spent reopen cap or a park closes the stream on its own unless a P0/P1 survived every round, the one case that reaches the user. It also owns the review economy: named park thresholds on `recurringFindingCount` (3), `streamAlternationCount` (4), and `roundsSinceProgress` (2), each overridable by env, park a stream before the reopen cap is exhausted; `skip-plan --scope wave or repo` proposes skipping a reviewer after five consecutive zero-finding dispatches, counting them in an additive `reviewerDispatches` key inside the private overlay ledger at `~/.claude/review-learnings/<repo-key>/review-learnings.json` (repo scope is a logical repository key, not a tracked repo file). Security lenses, tenancy lenses, and every deep-audit lane are exempt, with the lane list derived live from the deep-audit registry so new categories are covered automatically and an unloadable registry reports `skipEvaluation: unavailable` and skips nothing. Every skip carries a machine-readable `reasonCode`. Canonical review synthesis step in `references/bounded-review.md`. |
| `etrnl-retro.mjs` | `~/.claude/scripts/etrnl-retro.mjs` | Automatic retro loop: distills rules-only lessons (env remedies, redundant gates at one tree hash, compaction-stale resets, recurring reviewer fingerprints) from ETRNL state events into `retro-lessons.jsonl`; serves bounded `hints` for SessionStart/PostCompact injection, `prune` with confidence decay, lossless pre-compact session `snapshot`, `.etrnl/STEERING.md` once-per-update hints, and canary-gated Hindsight retain/reflect. |
| `lib/coderabbit-classifier.mjs` | `~/.claude/scripts/lib/coderabbit-classifier.mjs` | Pure CodeRabbit finding classifier (kind, severity, control type, deterministic-template match, recurrence key) used by `review-learn.mjs`; keyword maps only, no receipt/hash/ledger machinery. |
| `diff-triviality.mjs` | `~/.claude/scripts/diff-triviality.mjs` | `classify` checks a changed-path set against `schemas/review-classification-rules-v1.json` and reports whether the whole set is non-runtime (documentation, asset, generated, vendor, metadata). Powers the Stop-verifier triviality fast-path (classifying the recorded edits unioned with the git working tree); fail-safe — any code/schema/script/test/CI/migration/data-or-config or unclassified path marks the diff non-trivial. `classify-plan --plan <path> [--json]` applies the same taxonomy to a plan's `## File map` rows and returns a `trivial`/`small`/`large` scope for autoplan triage, with tier-3 plans and tier-3 escalation paths always `large`. |
| `browser-qa-report.mjs` | `~/.claude/scripts/browser-qa-report.mjs` | Creates, migrates, hashes, and validates browser QA artifacts; v2 `complete` reports require route/viewport matrix rows, screenshot hashes, fresh capture timestamps, provenance, and numeric console/network counts. |
| `context-state.mjs` | `~/.claude/scripts/context-state.mjs` | Saves, validates, lists, and restores concise workflow context with stale-state detection. |
| `canary-codex-hindsight.mjs` | `~/.claude/scripts/canary-codex-hindsight.mjs` | Reports Codex Hindsight runtime posture without overclaiming Claude plugin health as Codex recall support. |
| `live-hook-noise-report.mjs` | `~/.claude/scripts/live-hook-noise-report.mjs` | Summarizes recent Claude hook success/error events from local JSONL logs, redacts private paths and emails, classifies Stop categories/actioned follow-ups, reports top no-action Stop reasons, estimates token volume from usage metadata, and can fail strict thresholds. |
| `session-deep-dive.mjs` | `~/.claude/scripts/session-deep-dive.mjs` | Scans recent Claude and Codex local session JSON/JSONL with privacy-safe aggregate output for CodeGraph, Beads, Hindsight, read/search/edit volume, Stop outcomes, and high-work sessions without CodeGraph. The `why <file>:<line>` lookup surfaces commit-anchored provenance recorded by `provenance.mjs`. |
| `token-savings.mjs` | `~/.claude/scripts/token-savings.mjs` | Measures per-agent subagent output-token cost, excluding a ~10% holdout, flags net-negative agents whose output cost outweighs their value, and emits the doctor summary line. |
| `provenance.mjs` | `~/.claude/scripts/provenance.mjs` | Records commit-anchored provenance via git notes, powering the `session-deep-dive` `why <file>:<line>` lookup that traces a line back to the decision that produced it. |
| `session-audit.mjs` | `~/.claude/scripts/session-audit.mjs` | Produces a privacy-bounded recent-session summary across Claude hook noise and Codex rollout-memory keyword signals. |
| `workflow-health.mjs` | `~/.claude/scripts/workflow-health.mjs` | Summarizes recent ETRNL workflow runs, filtered `status --json`, doctor/prune diagnostics, stale runs, missing artifacts, UAT state, and next local action from local files. `status --markdown [--write <path>]` renders a ≤60-line per-project health handoff, and `--exit-code` fails on tasks-per-hour or compaction-median threshold breaches. |
| `tool-effectiveness.mjs` | `~/.claude/scripts/tool-effectiveness.mjs` | Summarizes sanitized local CodeGraph, Beads, Codex-import, and hook-pattern signals into deterministic keep/enforce/repo-specific/remove-watch/insufficient-data verdicts plus quick-win remediation hints. |
| `tool-stack-check.mjs` | `~/.claude/scripts/tool-stack-check.mjs` | Checks installed CodeGraph and Beads versions, cached latest versions, missing tools, available updates, optional project-local `.codegraph`/`.beads` health and Beads issue posture, Claude Hindsight plugin/config health, and separate Codex Hindsight runtime evidence. |
| `stack-profile-check.mjs` | `~/.claude/scripts/stack-profile-check.mjs` | Validates public `core` and `full` stack manifests, including Hindsight, Beads, CodeGraph, rollback, and privacy requirements. |
| `bootstrap-tools.sh` | `~/.claude/scripts/bootstrap-tools.sh` | Installs or checks full-profile CodeGraph, Beads, and Hindsight tooling, refreshes CodeGraph MCP registration, and bootstraps project-local CodeGraph and Beads state when explicitly requested. |
| `prompt-budget-check.mjs` | `~/.claude/scripts/prompt-budget-check.mjs` | Fails oversized skills or agents before prompt bloat becomes default context. |
| `port-guard.mjs` | `~/.claude/scripts/port-guard.mjs` | Checks or picks explicit free local dev-server ports before commands run. |
| `project-buglog.mjs` | `~/.claude/scripts/project-buglog.mjs` | Records and suggests project-local repeated bug memories with cross-session fingerprints, secret redaction, prompt-injection neutralization (chat-template markers and instruction-override phrases are defanged before a note is persisted or surfaced back into model context), file/project JSON output, stale-hint filtering, and no transcript storage. |
| `changelog-release-check.mjs` | `~/.claude/scripts/changelog-release-check.mjs` | Enforces Keep a Changelog categories, `VERSION` alignment, tag parity, and empty `## Unreleased` on release commits (`--strict-unreleased`); `--active-dev` tolerates a populated `## Unreleased` and pre-first-release repos for day-to-day work. |
| `changelog-scaffold.mjs` | `~/.claude/scripts/changelog-scaffold.mjs` | `detect` reports whether a project is release-managed; `scaffold` creates a Keep a Changelog `CHANGELOG.md` and seeds `VERSION` (from the latest `v` tag or `0.1.0`) only when absent — never overwrites, fail-open for non-release-managed projects. |
| `release.mjs` | source checkout only | Maintainer helper: `prepare <X.Y.Z>`, `tag`, and `check` for semver releases. See `docs/RELEASING.md`. |
| `skill-contract-check.mjs` | `~/.claude/scripts/skill-contract-check.mjs` | Fails when repo-owned skills drift from docs, helper scripts, readiness contracts, directive-language rules, model/context inheritance, SessionStart hints, or installed copies. |
| `skill-behavior-smoke.mjs` | `~/.claude/scripts/skill-behavior-smoke.mjs` | Runs end-to-end helper smoke checks for the skill behaviors that must fail closed before live use. |
| `doctor-etrnl.sh` | `~/.claude/scripts/doctor-etrnl.sh` | Checks installed hooks, settings, skills, agents, docs, scripts, strict/default mode, and workflow state. |
| `update.sh` | `~/.claude/scripts/update.sh` | Re-enters the recorded source checkout and runs the normal installer for local upgrades. |
| `uninstall.sh` | `~/.claude/scripts/uninstall.sh` | Prints the rollback command and refuses destructive automatic deletion. |
| `rollback-local.sh` | `~/.claude/scripts/rollback-local.sh` | Restores the latest installer backup and removes/restores repo-owned agents, skills, hooks, and settings safely. |
| `post-upgrade-canary.sh` | `~/.claude/scripts/post-upgrade-canary.sh` | Verifies installed critical hooks, update-check/browser-QA scripts, executable bits, settings JSON, and completed browser-QA rejection after an upgrade. |

## Installed Agents

These repo-owned agents are installed by default into `~/.claude/agents/`. They are bounded instruments for `/etrnl-dev-execute`, not autonomous project managers.

| Agent | Role |
| --- | --- |
| `etrnl-executor` | Bounded implementation worker for a single task packet. |
| `etrnl-spec-reviewer` | Read-only plan and task-packet review before implementation. |
| `etrnl-quality-reviewer` | Read-only post-implementation quality review. |
| `etrnl-consumer-tracer` | Read-only cross-consumer tracer: enumerates every call site of a changed field/filter/helper and reports which siblings the diff left stale. |
| `etrnl-investigator` | Read-only root-cause diagnosis for repeated failures or blockers. |
| `etrnl-scout` | Read-only repo discovery and existing-pattern mapping. |
| `etrnl-adversary` | Read-only Codex-style challenge pass for plans, diffs, and completion claims. |
| `etrnl-design-reviewer` | Read-only UI/design reviewer with per-dimension 0–10 rubric scoring, repo `DESIGN.md` check, hierarchy, states, accessibility, and responsiveness. |
| `etrnl-dx-reviewer` | Read-only developer-experience reviewer for install, commands, docs, errors, and rollback. |
| `etrnl-browser-qa` | Browser evidence collector that produces `browser-qa-report.json` artifacts. |
| `etrnl-test-wiring-auditor` | Read-only, diff-driven test-wiring auditor: maps each behavioral change to its required test and emits `PASS`/`ADD_REQUIRED` with `required_tests[]`; never proposes removing a test or weakening a gate. |
