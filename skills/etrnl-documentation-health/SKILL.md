---
name: etrnl-documentation-health
description: ETRNL documentation-health audit and remediation workflow. Use when the user asks for "documentation health", "docs health", "documentation audit", "docs drift", "stale docs", "README/ADR/runbook/API docs audit", "TSDoc/JSDoc health", "code documentation health", onboarding docs, or a "100/100 documentation pass".
---
# ETRNL Documentation Health

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-documentation-health`; on update, ask update/snooze/continue.

Run documentation health as an evidence-led repo workflow. Inspect actual files, commands, contracts, scripts, tests, routes, schemas, and runtime docs before judging whether documentation is accurate.

This is the documentation specialist. Use `etrnl-code-health` for whole-codebase health, and use this skill when the documentation layer itself is the target.

## Modes

- `audit`: read-only inventory, drift analysis, findings, scorecard, actionable findings ledger, and remediation plan.
- `fix`: audit, patch valid documentation/comment issues, rerun validation, and close or terminally dispose every finding.
- `execute`: same as `fix`; remediate findings or record a terminal disposition with evidence.
- `gate`: decide whether documentation health passes a release or merge bar.
- `deep-dive`: exhaustively document one subsystem, app, package, feature, API, runbook, or module.
- `starter-kit`: create or repair a minimal documentation system for a young repo.

Infer mode from the request. If the user says "run", "execute", "fix", "bring to 100", or similar, use `fix`/`execute` mode unless the user explicitly asks for report-only. If the user says "audit", "review", or "check", keep the first pass read-only unless the repo instructions say audits include remediation.

## Execution Contract

Documentation health is never satisfied by prose alone.

- In `audit` mode, produce an actionable findings ledger and remediation plan. Every finding must include evidence, severity, owner/action needed when known, and the exact next remediation or terminal disposition path.
- In `fix`/`execute` mode, remediate every valid item or terminally dispose it as `false_positive_with_evidence`, `accepted_risk_with_owner`, or `blocked` with evidence. Do not leave `open` items in the final state.
- Baseline, ratchet, waiver, or snapshot creation is not remediation. Use it only when the user explicitly requests it, and record the unresolved item as `blocked` or `accepted_risk_with_owner` with owner, evidence, and reason.
- Lowering the bar, creating a new baseline, or deferring work cannot be counted as a fix, a health improvement, or a closed finding unless the terminal disposition above is complete.
- Deterministic docs gates and overall documentation health are separate. A green repo-owned docs gate proves the gate only; it does not prove documentation freshness against code, current runtime, active plans, or renamed architecture.
- `FINAL_DOC_HEALTH_SCORE: 100/100` requires zero remaining stale docs, misleading docs, outdated claims, and stale active-plan/work-queue docs. Accepted or blocked stale documentation can close the ledger, but it lowers the final score.
- `FINAL_DOC_HEALTH_SCORE: 100/100` also requires every documentation file in scope to be reviewed or explicitly excluded, plus recent commit and PR/change evidence checked for documentation impact.
- Historical date stamps are not enough to treat stale text as harmless. A plan, handover, queue, migration note, or runbook is `archive` only when its path, title, or banner clearly marks it non-current and it cannot be mistaken for live architecture or operations.

## Required Flow

1. Read repo instructions first: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, docs policy, and local health stack.
2. Inspect git status and preserve unrelated local edits.
3. Build an inventory before forming conclusions:
   - Use `node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked` when installed.
   - If unavailable, use `node scripts/code-health-inventory.mjs --json --include-untracked`.
   - Fall back to tracked-file inventory with explicit `CHECKS_SKIPPED` reasons.
   - List vendor, dependency, build output, cache, generated, fixture, local agent state, worktree, log, and audit-artifact paths as explicit exclusions with reasons. Do not audit them as documentation or comment action items.
4. Run comment health inventory before conclusions:
   - Use `node ~/.claude/scripts/documentation-comment-health.mjs --root . --json --include-untracked` when installed.
   - If unavailable, use `node scripts/documentation-comment-health.mjs --root . --json --include-untracked`.
   - If the repo has no JS/TS source surface, write `COMMENT_HEALTH_NOT_APPLICABLE:` with evidence from inventory.
5. Classify every documentation surface as `canonical`, `secondary`, `stale`, `misleading`, `archive`, `generated`, `duplicate`, `delete_candidate`, or `missing`.
6. Map each important doc claim to a source of truth: scripts, package manifests, routes, schemas, migrations, tests, hooks, CI, deployment config, typed env modules, or actual installed/runtime state when relevant.
7. Build a freshness and drift proof before scoring:
   - Inspect recent local commits with `git log --name-status` and, when GitHub is available for the repo, latest merged/open PRs with `gh pr list`/`gh pr view` or `gh api`; record unavailable GitHub access in `CHECKS_SKIPPED` with the exact command and reason.
   - Extract renamed systems, removed components, deprecated model names, old domains, old ports, old providers, old env names, old commands, and architecture labels from code, config, recent diffs, and known source-truth docs.
   - Search docs, AI context, active plans, handovers, queues, runbooks, and comments for those stale references with `rg`; use structural search for code-like references when installed, and record `CHECKS_SKIPPED` when unavailable or not applicable.
   - Record search terms, hit counts, inspected hits, false positives, fixed hits, and remaining hits.
   - Count active plan, work-queue, roadmap, handover, migration, and status docs separately because stale current-work docs create high-confidence agent drift.
8. Run deterministic documentation gates when available:
   - `markdownlint-cli2`, `cspell`, `vale`, link checkers, TypeDoc/API Extractor, or repo-specific docs scripts.
   - For this control plane, include `node scripts/skill-contract-check.mjs`, `tests/test-hooks.sh`, and `scripts/doctor.sh` after any repo-owned skill/docs change.
9. Create an actionable findings ledger and remediation plan with severity, evidence, disposition, owner/action needed when known, verification, and exact next step.
10. In `fix`/`execute` mode, patch the smallest canonical surface and remediate every valid finding. Update stale docs instead of adding competing docs. Add local READMEs or comments only where they prevent real misuse.
11. Terminally dispose unresolved findings before final completion. Allowed terminal non-fixed states are `false_positive_with_evidence`, `accepted_risk_with_owner`, and `blocked`; each needs evidence and owner/action where relevant.
12. Do not create a baseline, ratchet, waiver, or snapshot as a substitute for remediation unless explicitly requested. If requested, record the unresolved item as `blocked` or `accepted_risk_with_owner` with owner, evidence, and reason.
13. Rerun validation. Do not claim 100/100 with stale, misleading, or outdated documentation remaining, even when every remaining item has a terminal owner disposition.
14. Final completion is hook-gated. A short narrative such as "docs look healthy" is not valid completion. The final report must include coverage counters, freshness and drift counters, comment-health counters, source-of-truth mapping, documentation classifications, a findings ledger with severity/disposition/verification, skipped-check reasons, and the full scorecard.

## Parallel Subagent Fan-Out

Use parallel subagents for broad audits when lanes can be read-only or disjoint. Keep the parent session responsible for inventory, lane assignment, integration, final edits, and verification.

Default read-only lanes:

- root and contributor docs: README, CONTRIBUTING, install, troubleshooting, changelog, license, security.
- architecture and ADRs: docs architecture, dependency direction, durable decisions, supersession links.
- API/data/runtime docs: routes, contracts, schemas, env, migrations, deployment, runbooks, observability.
- AI context and skills: AGENTS, CLAUDE, rules, `.cursorrules`, skill docs, agent prompts.
- code comments: public exports, schemas, security/auth, domain policies, scripts, integrations, non-obvious UI components.
- link and drift sweep: deleted paths, renamed commands, stale ports, providers, tools, old product names.

For detailed packet templates, read `references/parallel-subagents.md`.

## Audit Surfaces

Load `references/audit-matrix.md` when the repo is broad, when scoring matters, or when the user asks for no-skips coverage. It contains the detailed checks for root docs, local docs, architecture, API contracts, data/runtime docs, ADRs, AI context, comments, plans, drift checks, and documentation-system rules.

High-priority drift checks:

- README commands vs package/task files.
- env docs vs examples and typed env modules.
- API docs vs route/RPC/GraphQL/OpenAPI/schema files.
- data docs vs schemas, migrations, seeds, buckets, queues, workers, jobs.
- deployment/runbooks vs Docker, CI, host config, install scripts, update scripts.
- skill/AI docs vs actual skills, hooks, settings, and agent files.
- changelog vs recent commits, tags, release notes, and shipped behavior.
- links and paths vs actual files.

## Freshness And Drift Proof

Freshness proof is mandatory for every scored run. Do not infer freshness from a passing lint/link/doc gate.

Required evidence:

- recent-change review covering local commits and GitHub PRs when available, including changed source files, changed docs, merged/open PR context, and docs-impact conclusions;
- source-truth matrix covering current commands, active architecture, runtime topology, API/data contracts, env/secrets surfaces, install/update/rollback paths, and agent-facing workflow contracts;
- stale reference search terms derived from current code/config and renamed or removed concepts, not only generic words like `deprecated`;
- active plan, work-queue, handover, roadmap, migration, and status-doc review with path classifications;
- explicit disposition for every hit that implies a current architecture, command, provider, model, queue, migration, or runtime that no longer exists.

Required final counters:

- `DOC_CLAIMS_CHECKED:`
- `RECENT_COMMITS_REVIEWED:`
- `RECENT_PRS_REVIEWED:`
- `RECENT_CHANGE_DOC_IMPACT_CHECKS:`
- `SOURCE_TRUTH_MAPPINGS_REVIEWED:`
- `STALE_REFERENCE_SEARCHES_RUN:`
- `OUTDATED_DOC_CLAIMS_FOUND:`
- `OUTDATED_DOC_CLAIMS_REMAINING:`
- `STALE_DOCS_FOUND:`
- `STALE_DOCS_REMAINING:`
- `MISLEADING_DOCS_FOUND:`
- `MISLEADING_DOCS_REMAINING:`
- `ACTIVE_PLAN_QUEUE_DOCS_REVIEWED:`
- `ACTIVE_PLAN_QUEUE_DOCS_STALE:`

Score rules:

- 100/100 requires all `*_REMAINING` stale/outdated/misleading counters and `ACTIVE_PLAN_QUEUE_DOCS_STALE` to be `0`.
- 100/100 requires `DOCS_FILES_REVIEWED` to equal `DOCS_FILES_TOTAL` unless excluded paths are listed with reasons outside the total.
- A run with no stale-reference searches, no checked doc claims, or no source-truth mappings is incomplete no matter how many repo gates passed.
- A run with no recent commits reviewed or no recent-change docs-impact checks is incomplete. If GitHub PR access is unavailable, record `RECENT_PRS_REVIEWED: 0` and the exact `CHECKS_SKIPPED` reason; do not claim GitHub evidence was reviewed.
- Accepted risk or blocked stale documentation is allowed as a ledger disposition only. It is incompatible with 100/100 overall documentation health.

## Comment Health

Do not require comments everywhere. Require useful comments on public or risky surfaces:

- public package exports, SDK/library APIs, route/RPC/contract definitions;
- schema/env boundaries, database/storage/vector/search helpers;
- security/auth/permission logic and domain invariants;
- complex algorithms, operational scripts, integration clients;
- reusable UI components with non-obvious behavior.

Classify comments as `useful`, `missing`, `noise`, `stale`, `misleading`, or `wrong-format`. For TypeScript, use TSDoc. Do not duplicate TypeScript types in comments. Use `@param name - Description`, `@remarks`, `@throws`, `@deprecated` with replacement policy, and `{@link Symbol}` only when they add real value.

The final report must include these exact counters from the comment inventory:

- `TSDOC_JSDOC_FILES_SCANNED:`
- `COMMENT_TARGETS_REVIEWED:`
- `COMMENT_TARGETS_DOCUMENTED:`
- `COMMENT_TARGETS_MISSING_DOCS:`
- `COMMENT_TARGETS_WRONG_FORMAT:`

Do not report `MISSING_TSDOC_JSDOC_TARGETS: 0` from sampled source files. Use the comment-health inventory count or record `COMMENT_HEALTH_NOT_APPLICABLE:` with evidence.

## Findings Ledger

Use `references/ledger-and-report.md` for the full schema and final report format.

Required disposition states:

- `open`
- `fixed`
- `false_positive_with_evidence`
- `accepted_risk_with_owner`
- `blocked`

Terminal states cannot be vague. Avoid `later`, `TODO`, `follow-up`, `probably`, and blank status.

Severity:

- `P0`: actively misleading, dangerous, or blocks setup/operation.
- `P1`: major onboarding, architecture, API, security, or runtime documentation gap.
- `P2`: important clarity, drift, or coverage issue.
- `P3`: polish, consistency, or low-risk improvement.

## Completion Contract

Before final completion:

1. Reconcile subagent lane outputs into one deduplicated ledger.
2. Verify every relevant surface is current, fixed, classified, accepted, blocked, or explicitly excluded.
3. List exclusions with evidence, not assumptions.
4. Run the target repo health stack. If a gate is unavailable, record it in `CHECKS_SKIPPED` with reason.
5. In `fix`/`execute` mode, rerun the checks that prove edited docs match source behavior and confirm no finding remains `open`.
6. Include freshness and drift counters from the active source-truth review and stale-reference search proof.
7. Provide comment-health counters from `documentation-comment-health.mjs` or `COMMENT_HEALTH_NOT_APPLICABLE:` with evidence.
8. Score 1-10 for root clarity, discoverability, freshness, architecture clarity, structure clarity, API/contract docs, runtime docs, ADRs, AI context, comments, onboarding, enforcement, and overall health.

The stop hook enforces this contract with `documentation-health-ledger-check.mjs`.
For this control plane, use `node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked` before conclusions and run at least one deterministic docs/skill validation gate before final completion.

## References

- `references/audit-matrix.md`: detailed no-skips documentation audit matrix.
- `references/parallel-subagents.md`: lane design and task packet templates.
- `references/ledger-and-report.md`: findings schema, scorecard, and final report format.
