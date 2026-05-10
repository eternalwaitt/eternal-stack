# ETRNL Skills

ETRNL is the Claude control-plane skill family. Every skill shipped by this repo uses the `etrnl-` prefix so its origin is obvious in slash commands, hook state, and session summaries.

Claude Code personal and project skills use hyphenated command names. If this control plane later ships as a Claude plugin, the plugin namespace can become `etrnl:<skill>`, but the installed skill commands in this repo are `etrnl-*`.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-agent-files` | Model or user | Maintains AGENTS.md, CLAUDE.md, rules, and agent instruction files without bloat. |
| `/etrnl-autoplan` | Model or user | Creates execution-ready plans with task groups, subagent candidates, verification gates, and question policy. |
| `/etrnl-brainstorm` | Model or user | Turns ambiguous ideas into approved design/spec files before implementation planning. |
| `/etrnl-code-health` | Model or user | Runs the canonical code-health router: inventory, Health Stack, deterministic gates, companion audits, ledger, and no-skips closure. |
| `/etrnl-context-save` | User or model | Saves concise resumable workflow state without storing transcripts or credentials. |
| `/etrnl-context-restore` | User or model | Restores a saved context summary and flags stale continuation state. |
| `/etrnl-review` | Model or user | Reviews code, plans, risks, loose ends, and final pass readiness. |
| `/etrnl-commit` | User only | Reviews, verifies, stages, and commits relevant work. |
| `/etrnl-deps` | User only | Handles targeted dependency maintenance with migration checks. |
| `/etrnl-stress-test` | Model or user | Stress-tests architecture, rollout, migration, automation, and safety assumptions. |
| `/etrnl-execute` | User only | Executes an approved implementation plan end to end with run ledger, bounded subagents, reviews, and verification. |
| `/etrnl-fix-issue` | User only | Reproduces and fixes tracked issues with focused verification. |
| `/etrnl-parallel` | User only | Thin explicit fanout helper; `/etrnl-execute` owns normal plan orchestration. |
| `/etrnl-pr` | User only | Prepares or updates pull requests with verification evidence. |
| `/etrnl-qa-browser` | User only | Produces browser QA reports with route, viewport, screenshot, console, network, accessibility, and responsive evidence. |
| `/etrnl-test` | User only | Runs project preflight and reports or fixes failures. |
| `/etrnl-plan` | Model or user | Creates a plan file, reviews it, improves it, then finalizes it. |

## Companion Skills

These skills are not owned by this repo, but the control plane knows about them and routes to them when installed. Keeping them outside the `etrnl-*` family avoids hiding the repo boundary while preserving the stronger workflow from the original planning sessions.

| Skill | Owner | Used For |
| --- | --- | --- |
| `eternal-best-practices` | External/personal eternal skill | Stack policy router for auth, tenant isolation, money, i18n, Prisma, soft deletes, and domain-sensitive work. |
| `domain-*` | External domain skills | Domain-specific review gates for cloud, web, fintech, IoT, embedded, ML, and similar surfaces when installed. |
| `better-auth` | External backend skill | Auth-specific implementation review when protected auth paths are edited. |
| `tenant-isolation-patterns` | External backend skill | Tenant boundary review for multi-tenant data and permission paths. |
| `money-vo-discipline` | External domain skill | Money/value-object discipline for financial and billing paths. |
| `prisma-expert` | External data skill | Prisma schema, migration, and query review for database-sensitive work. |
| `i18n-localization` | External domain skill | Locale and translation review for user-facing internationalized surfaces. |
| `stripe-best-practices` | External payment skill | Stripe payment and billing review when installed. |
| `abacatepay-integration` | External payment skill | AbacatePay payment integration review when installed. |
| `code-simplifier` | External skill | Clarity and simplification pass before final scoring/completion. |
| `finding-duplicate-functions` | External skill | Dedupe review for repeated logic and consolidation work. |
| `brooks-audit` | External/local skill | Brooks review/audit/debt/test/health/sweep modes where installed. |

## Deterministic Helpers

| Helper | Installed Path | Purpose |
| --- | --- | --- |
| `code-health-inventory.mjs` | `~/.claude/scripts/code-health-inventory.mjs` | Inventories tracked files and classifies audit coverage for no-skips code-health runs. |
| `plan-readiness-check.mjs` | `~/.claude/scripts/plan-readiness-check.mjs` | Rejects thin plans before they are marked final or executed. |
| `agent-task-packet-check.mjs` | `~/.claude/scripts/agent-task-packet-check.mjs` | Aggregates missing fields in subagent task packets before delegation. |
| `execution-ledger.mjs` | `~/.claude/scripts/execution-ledger.mjs` | Creates, validates, and checks local ETRNL run ledgers under `~/.claude/control-plane/runs/`. |
| `execution-wave-check.mjs` | `~/.claude/scripts/execution-wave-check.mjs` | Groups planned tasks by wave, detects file overlap, and reports worktree eligibility. |
| `review-log.mjs` | `~/.claude/scripts/review-log.mjs` | Appends, validates, redacts, fingerprints, and summarizes durable review findings. |
| `browser-qa-report.mjs` | `~/.claude/scripts/browser-qa-report.mjs` | Creates and validates browser QA artifact JSON for UI verification evidence. |
| `context-state.mjs` | `~/.claude/scripts/context-state.mjs` | Saves, validates, lists, and restores concise workflow context with stale-state detection. |
| `workflow-health.mjs` | `~/.claude/scripts/workflow-health.mjs` | Summarizes recent ETRNL workflow runs, stale runs, and artifact freshness from local files. |
| `prompt-budget-check.mjs` | `~/.claude/scripts/prompt-budget-check.mjs` | Fails oversized skills or agents before prompt bloat becomes default context. |

## Installed Agents

These repo-owned agents are installed by default into `~/.claude/agents/`. They are bounded instruments for `/etrnl-execute`, not autonomous project managers.

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
