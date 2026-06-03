# ETRNL Skills

ETRNL is the Claude control-plane skill family. Every skill shipped by this repo uses the `etrnl-` prefix so its origin is obvious in slash commands, hook state, and session summaries.

Claude Code personal and project skills use hyphenated command names. If this control plane later ships as a Claude plugin, the plugin namespace can become `etrnl:<skill>`, but the installed skill commands in this repo are `etrnl-*`.

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/etrnl-agent-files` | Model or user | Maintains AGENTS.md, CLAUDE.md, rules, and agent instruction files without bloat. |
| `/etrnl-autoplan` | Model or user | Creates readiness-compatible execution plans with task groups, subagent candidates, verification gates, question policy, and mandatory deep-stack artifacts for final plans. |
| `/etrnl-brainstorm` | Model or user | Turns ambiguous ideas into approved design/spec files before implementation planning. |
| `/etrnl-code-health` | Model or user | Runs the canonical code-health router: inventory, Health Stack, deterministic gates, companion audits, ledger, and no-skips closure. |
| `/etrnl-deep-audit` | Model or user | Runs registered application deep-audit categories through a shared artifact envelope, shared worklists, category reports, lane receipts, and `all_registered` coverage statements. |
| `/etrnl-documentation-health` | Model or user | Runs documentation-health audits and fixes across READMEs, docs, ADRs, runbooks, API/runtime docs, AI context, and code comments with inventory, drift evidence, and parallel review lanes. |
| `/etrnl-context-save` | User or model | Saves concise resumable workflow state without storing transcripts or credentials. |
| `/etrnl-context-restore` | User or model | Restores a saved context summary and flags stale continuation state. |
| `/etrnl-disk-cleanup` | User only | Reclaims local disk space with host/filesystem evidence, a dry-run manifest, approved transient path classes, `trash` deletion, and before/after free-space verification. |
| `/etrnl-review` | Model or user | Reviews code, plans, risks, loose ends, and final pass readiness. |
| `/etrnl-commit` | User only | Reviews, verifies, stages, and commits relevant work. |
| `/etrnl-deps` | User only | Handles targeted dependency maintenance with migration checks. |
| `/etrnl-email-reply-quality` | Model or user | Checks VIVAZ outgoing email replies for banned dash typography, natural Brazilian Portuguese, AI tells, and humanizer cleanup before approval or send. |
| `/etrnl-stress-test` | Model or user | Stress-tests architecture, rollout, migration, automation, and safety assumptions. |
| `/etrnl-execute` | User only | Executes an approved readiness-checked implementation plan end to end with test-first source tasks, run ledger, write-mode implementation subagents for parallel-safe multi-file work, reviews, and verification. |
| `/etrnl-fix-issue` | User only | Reproduces and fixes tracked issues with focused verification. |
| `/etrnl-parallel` | User only | Thin explicit fanout helper; `/etrnl-execute` owns normal plan orchestration. |
| `/etrnl-performance-audit` | Model or user | Runs the registered performance deep-audit category with route matrix evidence, cold and warm measurements, response bytes, shared worklist hashes, and six lane receipts. |
| `/etrnl-pr` | User only | Prepares or updates pull requests with verification evidence. |
| `/etrnl-production-readiness` | Model or user | Runs the registered production-readiness deep-audit category with no-sampling checks, applicability gates, `CONFIRMED_CLEAN`, skipped-check reasons, and source-limited blockers. |
| `/etrnl-qa-browser` | User only | Produces browser QA reports with route, viewport, screenshot, console, network, accessibility, and responsive evidence. |
| `/etrnl-test` | User only | Runs project preflight and reports or fixes failures. |
| `/etrnl-plan` | Model or user | Creates a plan file, reviews it, improves it, then finalizes it. |

## Custom Commands

| Command | Invocation | Purpose |
| --- | --- | --- |
| `/email-triage <account>` | User only | Runs VIVAZ email triage in two phases: first archive/label every current INBOX item and provider-verify Inbox Zero with `vivaz-email triage guarded-run --account <account> --max-inbox 500 --apply --require-insights`, then render one action/reply queue item only after `triage verify` reports `inbox_zero_verified: true`, `inbox_count: 0`, and either `gmail_mutated: true` or `queue_ready_without_mutation: true`; visible reply drafts require `vivaz-email drafts check --draft-id <draft-id>` before approval. |

## Deep Audit Skills

`/etrnl-deep-audit` is the thin orchestrator. `all_registered` means every category exported by `scripts/lib/deep-audit-categories.mjs`, currently `production-readiness` and `performance`; it is not a claim that security, UX/accessibility, API/data, docs, payments, or privacy/compliance ran.

Quick validator path:

```bash
node scripts/deep-audit-artifact-check.mjs validate-fixtures
node scripts/deep-audit-artifact-check.mjs validate-registry --root .
node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.valid.json
```

Direct category examples:

```bash
/etrnl-production-readiness --category production-readiness
/etrnl-performance-audit --category performance
```

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
| `lib/audit-exclusions.mjs` | `~/.claude/scripts/lib/audit-exclusions.mjs` | Centralizes no-skips audit exclusions so vendor, build, cache, generated, fixture, local agent, worktree, log, and `.audit` artifacts are listed or skipped with reasons instead of audited as source/docs. |
| `code-health-inventory.mjs` | `~/.claude/scripts/code-health-inventory.mjs` | Inventories tracked files and classifies audit coverage for no-skips code-health runs. |
| `code-health-ledger-check.mjs` | `~/.claude/scripts/code-health-ledger-check.mjs` | Blocks code-health completion unless inventory, action-item counters, terminal findings, resolution plan, and final gate evidence are present. |
| `documentation-comment-health.mjs` | `~/.claude/scripts/documentation-comment-health.mjs` | Inventories exported JS/TS targets and their leading TSDoc/JSDoc coverage so documentation-health runs cannot pass with comment sampling only. |
| `merge-settings.mjs` | `~/.claude/scripts/merge-settings.mjs` | Merges control-plane hooks into existing Claude settings without replacing unrelated local configuration. |
| `plan-readiness-check.mjs` | `~/.claude/scripts/plan-readiness-check.mjs` | Rejects thin plans before they are marked final or executed; final plans require a validated deep-stack artifact bundle unless a legacy transitional flag is explicitly used. |
| `deep-stack-check.mjs` | `~/.claude/scripts/deep-stack-check.mjs` | Creates and validates the Hybrid Deep Stack artifact bundle for final plans: sanitized source manifest, skill matrix, review phase records, TDD evidence, reuse inventory/bindings, findings ledger, completion audit/reconciliation, risk tier, TypeScript trigger evidence, and install proof. |
| `deep-audit-artifact-check.mjs` | `~/.claude/scripts/deep-audit-artifact-check.mjs` | Validates deep-audit category artifacts, registry/docs/install alignment, registered check coverage, lane receipts, consumed worklist hashes, redaction, and stable problem/cause/fix diagnostics. |
| `lib/deep-audit-categories.mjs` | `~/.claude/scripts/lib/deep-audit-categories.mjs` | Defines registered deep-audit categories, known unimplemented domains, check ids, lane ids, required worklists, and reference paths. |
| `lib/deep-stack-artifacts.mjs` | `~/.claude/scripts/lib/deep-stack-artifacts.mjs` | Shared deep-stack artifact schema and validators used by readiness, packet, install, and operator-facing section checks. |
| `agent-task-packet-check.mjs` | `~/.claude/scripts/agent-task-packet-check.mjs` | Enforces structured subagent packet contracts with task identity, lineage identity, packet hashes, lane limits, child-agent policy, completion receipts, spec/quality reviewer contracts, and reuse/TDD/simplifier fields for new-surface or deep-stack writes. |
| `guard-override-token.mjs` | `~/.claude/scripts/guard-override-token.mjs` | Issues and verifies one-time signed override tokens for safety-critical prod/secret commands. |
| `settings-audit.mjs` | `~/.claude/scripts/settings-audit.mjs` | Audits and repairs duplicate hook commands, overlapping matcher groups, and legacy rate-limiter registrations in Claude settings. |
| `codex-rtk-pre-tool-use.sh` | `~/.claude/scripts/codex-rtk-pre-tool-use.sh` | Source-controlled Codex RTK PreToolUse hook; syncs to `~/.codex/hooks/rtk-pre-tool-use.sh` to rewrite commands with `updatedInput`, proxy unsafe `rg` forms, and block broad `.codex` scans. |
| `update-check.mjs` | `~/.claude/scripts/update-check.mjs` | Compares installed metadata with the recorded source checkout, reports local/remote drift, emits `--explain` diagnostics, and can run local auto-update when enabled. |
| `replay-hook-fixtures.mjs` | `~/.claude/scripts/replay-hook-fixtures.mjs` | Replays scrubbed regression fixtures through live hooks and asserts allow/deny/block outcomes. |
| `execution-ledger.mjs` | `~/.claude/scripts/execution-ledger.mjs` | Creates, validates, and checks local ETRNL run ledgers, including task lineage, packet-bound write evidence, reviews, TDD/simplifier/specialist/completion/install evidence rows, mandatory phase recording during plan execution, conditional workstream metadata, and UAT completion gates. |
| `execution-wave-check.mjs` | `~/.claude/scripts/execution-wave-check.mjs` | Groups planned tasks by wave, detects file overlap, and reports worktree eligibility. |
| `review-log.mjs` | `~/.claude/scripts/review-log.mjs` | Appends, validates, redacts, fingerprints, and summarizes durable review findings. |
| `browser-qa-report.mjs` | `~/.claude/scripts/browser-qa-report.mjs` | Creates, migrates, hashes, and validates browser QA artifacts; v2 `complete` reports require route/viewport matrix rows, screenshot hashes, fresh capture timestamps, provenance, and numeric console/network counts. |
| `context-state.mjs` | `~/.claude/scripts/context-state.mjs` | Saves, validates, lists, and restores concise workflow context with stale-state detection. |
| `workflow-health.mjs` | `~/.claude/scripts/workflow-health.mjs` | Summarizes recent ETRNL workflow runs, filtered `status --json`, doctor/prune diagnostics, stale runs, missing artifacts, UAT state, and next local action from local files. |
| `prompt-budget-check.mjs` | `~/.claude/scripts/prompt-budget-check.mjs` | Fails oversized skills or agents before prompt bloat becomes default context. |
| `port-guard.mjs` | `~/.claude/scripts/port-guard.mjs` | Checks or picks explicit free local dev-server ports before commands run. |
| `project-buglog.mjs` | `~/.claude/scripts/project-buglog.mjs` | Records and suggests project-local repeated bug memories with cross-session fingerprints, redaction, file/project JSON output, stale-hint filtering, and no transcript storage. |
| `changelog-release-check.mjs` | `~/.claude/scripts/changelog-release-check.mjs` | Enforces release hygiene so `Unreleased` does not hide shipped work on `main`. |
| `research-competitor-intel.mjs` | `~/.claude/scripts/research-competitor-intel.mjs` | Validates pinned competitor manifests, evidence rows, parity scorecards, and refresh cadence. |
| `skill-contract-check.mjs` | `~/.claude/scripts/skill-contract-check.mjs` | Fails when repo-owned skills drift from docs, helper scripts, readiness contracts, directive-language rules, SessionStart hints, or installed copies. |
| `skill-behavior-smoke.mjs` | `~/.claude/scripts/skill-behavior-smoke.mjs` | Runs end-to-end helper smoke checks for the skill behaviors that must fail closed before live use. |
| `doctor-control-plane.sh` | `~/.claude/scripts/doctor-control-plane.sh` | Checks installed hooks, settings, skills, agents, docs, scripts, strict/default mode, and workflow state. |
| `update.sh` | `~/.claude/scripts/update.sh` | Re-enters the recorded source checkout and runs the normal installer for local upgrades. |
| `uninstall.sh` | `~/.claude/scripts/uninstall.sh` | Prints the rollback command and refuses destructive automatic deletion. |
| `rollback-local.sh` | `~/.claude/scripts/rollback-local.sh` | Restores the latest installer backup and removes/restores repo-owned agents, skills, hooks, and settings safely. |
| `post-upgrade-canary.sh` | `~/.claude/scripts/post-upgrade-canary.sh` | Verifies installed critical hooks, update-check/browser-QA scripts, executable bits, settings JSON, and completed browser-QA rejection after an upgrade. |

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
