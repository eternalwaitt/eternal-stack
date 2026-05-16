---
name: etrnl-documentation-health
description: ETRNL documentation-health audit and remediation workflow. Use when the user asks for "documentation health", "docs health", "documentation audit", "docs drift", "stale docs", "README/ADR/runbook/API docs audit", "TSDoc/JSDoc health", "code documentation health", onboarding docs, or a "100/100 documentation pass".
model: opus
effort: high
---
# ETRNL Documentation Health

Run documentation health as an evidence-led repo workflow. Inspect actual files, commands, contracts, scripts, tests, routes, schemas, and runtime docs before judging whether documentation is accurate.

This is the documentation specialist. Use `etrnl-code-health` for whole-codebase health, and use this skill when the documentation layer itself is the target.

## Modes

- `audit`: read-only inventory, drift analysis, findings, scorecard, and required fixes.
- `fix`: audit, patch valid documentation/comment issues, rerun validation, and close every finding.
- `gate`: decide whether documentation health passes a release or merge bar.
- `deep-dive`: exhaustively document one subsystem, app, package, feature, API, runbook, or module.
- `starter-kit`: create or repair a minimal documentation system for a young repo.

Infer mode from the request. If the user says "run", "execute", "fix", "bring to 100", or similar, use `fix` mode unless the user explicitly asks for report-only. If the user says "audit", "review", or "check", keep the first pass read-only unless the repo instructions say audits include remediation.

## Required Flow

1. Read repo instructions first: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, docs policy, and local health stack.
2. Inspect git status and preserve unrelated local edits.
3. Build an inventory before forming conclusions:
   - Use `node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked` when installed.
   - If unavailable, use `node scripts/code-health-inventory.mjs --json --include-untracked`.
   - Fall back to tracked-file inventory with explicit `CHECKS_SKIPPED` reasons.
4. Classify every documentation surface as `canonical`, `secondary`, `stale`, `misleading`, `archive`, `generated`, `duplicate`, `delete_candidate`, or `missing`.
5. Map each important doc claim to a source of truth: scripts, package manifests, routes, schemas, migrations, tests, hooks, CI, deployment config, typed env modules, or actual installed/runtime state when relevant.
6. Run deterministic documentation gates when available:
   - `markdownlint-cli2`, `cspell`, `vale`, link checkers, TypeDoc/API Extractor, or repo-specific docs scripts.
   - For this control plane, include `node scripts/skill-contract-check.mjs`, `tests/test-hooks.sh`, and `scripts/doctor.sh` after any repo-owned skill/docs change.
7. Create a findings ledger with severity, evidence, disposition, and verification.
8. In `fix` mode, patch the smallest canonical surface. Update stale docs instead of adding competing docs. Add local READMEs or comments only where they prevent real misuse.
9. Rerun validation. Do not claim 100/100 with open findings unless each one is blocked or accepted with owner and evidence.
10. Final completion is hook-gated. A short narrative such as "docs look healthy" is not valid completion. The final report must include coverage counters, source-of-truth mapping, documentation classifications, a findings ledger with severity/disposition/verification, skipped-check reasons, and the full scorecard.

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

## Comment Health

Do not require comments everywhere. Require useful comments on public or risky surfaces:

- public package exports, SDK/library APIs, route/RPC/contract definitions;
- schema/env boundaries, database/storage/vector/search helpers;
- security/auth/permission logic and domain invariants;
- complex algorithms, operational scripts, integration clients;
- reusable UI components with non-obvious behavior.

Classify comments as `useful`, `missing`, `noise`, `stale`, `misleading`, or `wrong-format`. For TypeScript, use TSDoc. Do not duplicate TypeScript types in comments. Use `@param name - Description`, `@remarks`, `@throws`, `@deprecated` with replacement policy, and `{@link Symbol}` only when they add real value.

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
5. In `fix` mode, rerun the checks that prove edited docs match source behavior.
6. Report scores 1-10 for root clarity, discoverability, freshness, architecture clarity, structure clarity, API/contract docs, runtime docs, ADRs, AI context, comments, onboarding, enforcement, and overall health.

The stop hook enforces this contract with `documentation-health-ledger-check.mjs`.
For this control plane, use `node ~/.claude/scripts/code-health-inventory.mjs --json --include-untracked` before conclusions and run at least one deterministic docs/skill validation gate before final completion.

## References

- `references/audit-matrix.md`: detailed no-skips documentation audit matrix.
- `references/parallel-subagents.md`: lane design and task packet templates.
- `references/ledger-and-report.md`: findings schema, scorecard, and final report format.
