---
name: etrnl-dev-review
description: ETRNL control-plane review workflow for Claude Code. Use for code reviews, plan reviews, final review passes, pitfalls, loose ends, risks, and quick wins.
---
# Code Review

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-review`; on update, ask update/snooze/continue.

Lead with findings. Treat the original request, written plan, actual diff, installed surface, and verification evidence as separate truth sources.

## Review Order

1. Reconstruct the intended outcome from the user request, plan file, and any relevant session evidence the user named.
2. Inventory actual state: repo files, installed files, settings, hooks, docs, scripts, skills, tests, and live/runtime surfaces when relevant.
3. Compare planned versus implemented behavior and classify each gap:
   - blocking correctness
   - missing enforcement
   - missing install/update/rollback coverage
   - missing verification
   - documentation or naming drift
   - intentional live-gated operation
4. Check companion passes when installed:
   - `eternal-best-practices` for domain-sensitive code.
   - `code-simplifier` for clarity and avoidable complexity.
   - `finding-duplicate-functions` for duplicate logic.
   - `brooks-audit` for health/quality mode expectations.
   - Use `../common/typescript-triggers.md` to decide when `typescript-advanced-types` review is required.
5. Run the focused review lenses before reading implementation details too deeply:
   - Tests first: read changed tests, fixtures, and test names before production code; flag tests that assert implementation details instead of behavior.
   - Dependency discipline: flag new packages that duplicate built-ins, existing helpers, or framework primitives; verify peer and runtime impact.
   - Change size: flag diffs that are too large to review safely, especially broad formatting churn, mixed refactor plus behavior, or more than 800 changed source lines without a split rationale.
   - Split-lens trigger: create or invoke sibling review skills only when router history, prompt-budget failures, or repeated review overload show that this single review prompt is dropping required findings.
6. Apply the engineering review frame:
   - Scope: existing code reused, minimal change set, explicit NOT in scope, distribution/install coverage.
   - Architecture: boundaries, dependency graph, data flow, scaling, auth/data access, rollback, and one failure scenario per new integration.
   - Code quality: organization, DRY, error handling, over/under-engineering, stale diagrams, and accidental complexity.
   - Tests: code paths, user flows, error states, regressions, E2E/eval needs, and exact commands.
   - Performance: N+1 queries, memory, caching, slow paths, and work on hot paths.
   - Parallelization: safe lanes, shared modules, dependencies, and conflict risks.
7. Point to exact files, commands, or plan sections.
8. Apply the smallest fix that closes the risk when in fix/remediation mode; otherwise record the smallest fix that closes the risk.
9. When findings are durable, record them with `node ~/.claude/scripts/review-log.mjs add --finding "<finding>" --severity <severity> --status open`.
10. For deep-stack plans, validate `Deep stack artifacts:` with `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` or the installed `~/.claude/scripts/deep-stack-check.mjs` equivalent.
11. Say clearly when no blocking findings remain, and name any live-gated follow-up.

## Hybrid Deep Stack Review Contract

For non-trivial plan, autoplan, or review work:

- Run CEO, engineering, DX, adversarial, specialist, reuse, simplifier, and findings convergence.
- Verify `reviewPhases[]`, `tddEvidence[]`, `completionReconciliation[]`, `reuseBindings[]`, `typeTriggerEvidence[]`, and `installProof` when the artifact declares them required.
- Keep execution risk tiers out of planning shortcuts. Tiers apply only after deep review passes.
- Block completion while any high/blocker finding is open, unless the repository owner explicitly accepts the risk.
- Review completion with a `DONE`, `PARTIAL`, `NOT_DONE`, `CHANGED`, or `BLOCKED` audit when an implementation plan exists.
- Verify that source manifests are sanitized and do not include `/tmp`, home paths, transcripts, account material, or secrets.

## Research Flow (required_process)

When reviewing strategy decisions, new skill designs, or hook behavior changes:

1. Check whether a research artifact exists at `docs/research/capability-evidence.json` or `docs/research/top10-lock.json`.
   - Use `capability-evidence.json` for row-level, code-cited review findings when it exists.
   - Use `top10-lock.json` for competitor selection context and snapshot provenance when row-level evidence is missing.
2. For any finding that changes a capability: cite the source row from the evidence file, or name the explicit gap from `docs/research/etrnl-parity-backlog.md`.
3. Strategy-change findings without code-level evidence must be marked `(unverified — no source row)` and cannot be P0/P1 severity.
4. If neither artifact exists and the scope warrants one, flag this as a missing precondition and ask for artifact generation before treating strategy findings as high-confidence.

## TDD Review Protocol (required_process)

When reviewing implementation work:

1. Confirm that failing tests were recorded before fixes were applied. If test evidence is missing, flag as a process gap.
2. Confirm `tddEvidence[]` or ledger `record-tdd` rows include red command/status/failure and green command/status, or a specific not-test-first rationale.
3. For any new code path that lacks tests: flag as a missing coverage finding with the specific file and behavior that must be tested.

## Verification Gate (hook_enforced)

`hooks/cc-stop-verifier.sh` enforces completion-time evidence only: it blocks completion if edits exist but no verification/test run is recorded in guard state, and `/etrnl-dev-execute` source edits now require task-bound agent/reviewer, TDD, simplifier, reuse, TypeScript trigger, and install-proof evidence where triggered. It does not prove semantic red-before-green correctness; reviewers still enforce that via the TDD Review Protocol above.

## Finding Format

Use confidence when the finding depends on concrete code or diff evidence:

`[P1] (confidence: 9/10) file:line - finding`

Suppress low-confidence speculation unless the severity would be P0/P1. Outside-voice findings are informational until the user approves them; present agreement as an evidence note, not a decision.

## Output

Put findings first, ordered by severity. Include "What already exists", "NOT in scope", failure modes, and test/parallelization gaps when reviewing a plan. Keep summaries short and secondary. Do not bury an unverified assumption in reassuring prose.

If a review log entry is written, include the log path or fingerprint in the final evidence.
