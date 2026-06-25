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
| `etrnl-backend-patterns`, `etrnl-code-review-excellence`, `etrnl-deep-audit*` | Reference orchestrators | Load `references/` modules on demand; not thin one-shot commands |

Hooks route prompts to these skills and enforce guardrails at tool boundaries. See [hooks.md](hooks.md).

## Development (`etrnl-dev-*`)

Planning, execution, verification, and shipping for a codebase you are building.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-dev-brainstorm` | Model or user | Turns ambiguous ideas into approved design/spec files before planning. |
| `/etrnl-dev-plan` | Model or user | Creates a plan file, reviews it, improves it, then finalizes it. |
| `/etrnl-dev-autoplan` | Model or user | Creates readiness-compatible execution plans with task groups, subagent candidates, verification gates, question policy, mandatory deep-stack artifacts, and an autoplan parity scorecard. |
| `/etrnl-dev-execute` | User only | Executes an approved readiness-checked plan end to end with test-first source tasks, run ledger, write-mode implementation subagents, reviews, and verification. |
| `/etrnl-dev-test` | User only | Runs project preflight and reports or fixes failures. |
| `/etrnl-dev-debug` | User only | Debugs bugs, failing tests, CI failures, production issues, and unexpected behavior through root-cause evidence before fixes. |
| `/etrnl-dev-commit` | User only | Reviews, verifies, stages, and commits relevant work. |
| `/etrnl-dev-pr` | User only | Prepares or updates pull requests with verification evidence, CI state, review feedback, and a closed readiness loop. |
| `/etrnl-dev-ci` | Model or user | Designs, audits, hardens, debugs, and repairs CI/CD lanes, GitHub Actions, branch protection, deploy gates, OIDC, SBOM/provenance, rollback, flaky CI, and slow builds. |
| `/etrnl-dev-deps` | User only | Handles targeted dependency maintenance with migration checks, catalog consolidation, bot PR triage, and rollback evidence. |
| `/etrnl-dev-stress-test` | Model or user | Stress-tests architecture, rollout, migration, automation, and safety assumptions. |

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
| `/etrnl-deep-audit-ux` | Model or user | Runs the `ui-ux-product` category separately so UI/UX depth can evolve without blocking `all_registered` orchestration. |
| `/etrnl-code-review-excellence` | Model or user | Code-excellence review and Brooks-style structural audit via on-demand `references/` modules. |

## Operations (`etrnl-ops-*`)

Host, session, and stack maintenance. These skills do not implement product features and do not replace `/etrnl-dev-execute`.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-ops-context-save` | User or model | Saves concise resumable workflow state without storing transcripts or credentials. |
| `/etrnl-ops-context-restore` | User or model | Restores a saved context summary and flags stale continuation state. |
| `/etrnl-ops-disk-cleanup` | User only | Reclaims local disk space with host/filesystem evidence, a dry-run manifest, approved transient path classes, `trash` deletion, and before/after free-space verification. Hooks pair with this skill to block `rm -rf` and unapproved paths. |
| `/etrnl-ops-agent-files` | Model or user | Maintains AGENTS.md, CLAUDE.md, rules, and agent instruction files without bloat. |

## Communications (`etrnl-comm-*`)

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-comm-email-reply-quality` | Model or user | Checks private outgoing email replies for banned dash typography, natural Brazilian Portuguese, AI tells, and humanizer cleanup before approval or send. |

## Reference orchestrators

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-backend-patterns` | Model or user | Classifies backend tasks and loads only the needed `references/` modules (oRPC, API, data, Prisma, SQL, security, resilience, observability, architecture). |

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
| `brooks-audit` | Inlined | Default to `etrnl-code-review-excellence/references/brooks-*.md`. |
| `backend-patterns` | Superseded | Use `/etrnl-backend-patterns` instead. |

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
| `plan-readiness-check.mjs` | `~/.claude/scripts/plan-readiness-check.mjs` | Rejects thin plans before they are marked final or executed; final plans require a validated deep-stack artifact bundle unless a legacy transitional flag is explicitly used. |
| `deep-stack-check.mjs` | `~/.claude/scripts/deep-stack-check.mjs` | Creates and validates the Hybrid Deep Stack artifact bundle for final plans: sanitized source manifest, skill matrix, review phase records, TDD evidence, reuse inventory/bindings, findings ledger, completion audit/reconciliation, risk tier, TypeScript trigger evidence, and install proof. |
| `deep-audit-artifact-check.mjs` | `~/.claude/scripts/deep-audit-artifact-check.mjs` | Validates deep-audit category artifacts, registry/docs/install alignment, registered check coverage, lane receipts, consumed worklist hashes, redaction, and stable problem/cause/fix diagnostics. |
| `lib/deep-audit-categories.mjs` | `~/.claude/scripts/lib/deep-audit-categories.mjs` | Defines registered deep-audit categories, known unimplemented domains, check ids, lane ids, required worklists, and reference paths. |
| `lib/deep-stack-artifacts.mjs` | `~/.claude/scripts/lib/deep-stack-artifacts.mjs` | Shared deep-stack artifact schema and validators used by readiness, packet, install, and operator-facing section checks. |
| `agent-task-packet-check.mjs` | `~/.claude/scripts/agent-task-packet-check.mjs` | Enforces structured subagent packet contracts with task identity, lineage identity, packet hashes, lane limits, child-agent policy, completion receipts, spec/quality reviewer contracts, and reuse/TDD/simplifier fields for new-surface or deep-stack writes. |
| `performance-baseline.mjs` | `~/.claude/scripts/performance-baseline.mjs` | Creates, validates, and compares performance baseline artifacts with next-run thresholds. |
| `pr-preflight.mjs` | `~/.claude/scripts/pr-preflight.mjs` | Reports PR readiness inputs: branch, upstream, dirty files, GitHub auth, existing PR, checks, and suggested local gate. |
| `guard-override-token.mjs` | `~/.claude/scripts/guard-override-token.mjs` | Issues and verifies one-time signed override tokens for safety-critical prod/secret commands. |
| `settings-audit.mjs` | `~/.claude/scripts/settings-audit.mjs` | Audits and repairs duplicate hook commands, overlapping matcher groups, legacy rate-limiter registrations, outside-settings plugin hooks, risky top-level settings, and memory plugin config posture. |
| `etrnl-state.mjs` | `~/.claude/scripts/etrnl-state.mjs` | Appends and queries canonical local ETRNL state for compact pre/post events, bounded handoff restore, stale-verification Stop checks, context entries, tool signals, settings observations, accepted lessons, dry-run Beads backlog links, and raw Beads doctrine rejection. |
| `codex-rtk-pre-tool-use.sh` | `~/.claude/scripts/codex-rtk-pre-tool-use.sh` | Source-controlled Codex RTK PreToolUse hook; syncs to `~/.codex/hooks/rtk-pre-tool-use.sh` to rewrite commands with `updatedInput`, proxy unsafe `rg` forms, and block broad `.codex` scans. |
| `update-check.mjs` | `~/.claude/scripts/update-check.mjs` | Compares installed metadata with the recorded source checkout, reports local/remote drift, emits `--explain` diagnostics, and can run local auto-update when enabled. |
| `skill-update-prompt.mjs` | `~/.claude/scripts/skill-update-prompt.mjs`, `~/.codex/scripts/skill-update-prompt.mjs` | Auto-repairs local etrnl drift through update-check, then converts remaining remote and CodeGraph/Beads drift into the per-skill prompt used by Claude hooks and the first Codex skill step. |
| `replay-hook-fixtures.mjs` | `~/.claude/scripts/replay-hook-fixtures.mjs` | Replays scrubbed regression fixtures through live hooks and asserts allow/deny/block outcomes. |
| `execution-ledger.mjs` | `~/.claude/scripts/execution-ledger.mjs` | Creates, validates, and checks local ETRNL run ledgers, including task lineage, packet-bound write evidence, reviews, TDD/simplifier/specialist/completion/install evidence rows, mandatory phase recording during plan execution, conditional workstream metadata, and UAT completion gates. |
| `execution-wave-check.mjs` | `~/.claude/scripts/execution-wave-check.mjs` | Groups planned tasks by wave, detects file overlap, and reports worktree eligibility. |
| `review-log.mjs` | `~/.claude/scripts/review-log.mjs` | Appends, validates, redacts, fingerprints, and summarizes durable review findings. |
| `browser-qa-report.mjs` | `~/.claude/scripts/browser-qa-report.mjs` | Creates, migrates, hashes, and validates browser QA artifacts; v2 `complete` reports require route/viewport matrix rows, screenshot hashes, fresh capture timestamps, provenance, and numeric console/network counts. |
| `context-state.mjs` | `~/.claude/scripts/context-state.mjs` | Saves, validates, lists, and restores concise workflow context with stale-state detection. |
| `canary-codex-hindsight.mjs` | `~/.claude/scripts/canary-codex-hindsight.mjs` | Reports Codex Hindsight runtime posture without overclaiming Claude plugin health as Codex recall support. |
| `live-hook-noise-report.mjs` | `~/.claude/scripts/live-hook-noise-report.mjs` | Summarizes recent Claude hook success/error events from local JSONL logs, redacts private paths and emails, classifies Stop categories/actioned follow-ups, reports top no-action Stop reasons, estimates token volume from usage metadata, and can fail strict thresholds. |
| `session-deep-dive.mjs` | `~/.claude/scripts/session-deep-dive.mjs` | Scans recent Claude and Codex local session JSON/JSONL with privacy-safe aggregate output for CodeGraph, Beads, Hindsight, read/search/edit volume, Stop outcomes, and high-work sessions without CodeGraph. |
| `session-audit.mjs` | `~/.claude/scripts/session-audit.mjs` | Produces a privacy-bounded recent-session summary across Claude hook noise and Codex rollout-memory keyword signals. |
| `workflow-health.mjs` | `~/.claude/scripts/workflow-health.mjs` | Summarizes recent ETRNL workflow runs, filtered `status --json`, doctor/prune diagnostics, stale runs, missing artifacts, UAT state, and next local action from local files. |
| `tool-effectiveness.mjs` | `~/.claude/scripts/tool-effectiveness.mjs` | Summarizes sanitized local CodeGraph, Beads, Codex-import, and hook-pattern signals into deterministic keep/enforce/repo-specific/remove-watch/insufficient-data verdicts plus quick-win remediation hints. |
| `tool-stack-check.mjs` | `~/.claude/scripts/tool-stack-check.mjs` | Checks installed CodeGraph and Beads versions, cached latest versions, missing tools, available updates, optional project-local `.codegraph`/`.beads` health and Beads issue posture, Claude Hindsight plugin/config health, and separate Codex Hindsight runtime evidence. |
| `stack-profile-check.mjs` | `~/.claude/scripts/stack-profile-check.mjs` | Validates public `core` and `full` stack manifests, including Hindsight, Beads, CodeGraph, rollback, and privacy requirements. |
| `bootstrap-tools.sh` | `~/.claude/scripts/bootstrap-tools.sh` | Installs or checks full-profile CodeGraph, Beads, and Hindsight tooling, refreshes CodeGraph MCP registration, and bootstraps project-local CodeGraph and Beads state when explicitly requested. |
| `prompt-budget-check.mjs` | `~/.claude/scripts/prompt-budget-check.mjs` | Fails oversized skills or agents before prompt bloat becomes default context. |
| `port-guard.mjs` | `~/.claude/scripts/port-guard.mjs` | Checks or picks explicit free local dev-server ports before commands run. |
| `project-buglog.mjs` | `~/.claude/scripts/project-buglog.mjs` | Records and suggests project-local repeated bug memories with cross-session fingerprints, redaction, file/project JSON output, stale-hint filtering, and no transcript storage. |
| `changelog-release-check.mjs` | `~/.claude/scripts/changelog-release-check.mjs` | Enforces Keep a Changelog categories, `VERSION` alignment, tag parity, and empty `## Unreleased` on release commits (`--strict-unreleased`). |
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
| `etrnl-investigator` | Read-only root-cause diagnosis for repeated failures or blockers. |
| `etrnl-scout` | Read-only repo discovery and existing-pattern mapping. |
| `etrnl-adversary` | Read-only Codex-style challenge pass for plans, diffs, and completion claims. |
| `etrnl-design-reviewer` | Read-only UI/design reviewer for hierarchy, states, accessibility, and responsiveness. |
| `etrnl-dx-reviewer` | Read-only developer-experience reviewer for install, commands, docs, errors, and rollback. |
| `etrnl-browser-qa` | Browser evidence collector that produces `browser-qa-report.json` artifacts. |
