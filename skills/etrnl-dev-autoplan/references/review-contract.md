# Review Contract

Canonical engineering review criteria for autoplan and plan review. Execution uses `etrnl-spec-reviewer` and `etrnl-quality-reviewer` agents instead of a separate review skill.

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
   - `etrnl-code-review-excellence` for Brooks structural and excellence modules when the diff touches architecture or quality boundaries.
   - Use `../common/typescript-triggers.md` to decide when `typescript-advanced-types` review is required.
5. Run the focused review lenses before reading implementation details too deeply:
   - Tests first: read changed tests, fixtures, and test names before production code; flag tests that assert implementation details instead of behavior.
   - Dependency discipline: flag new packages that duplicate built-ins, existing helpers, or framework primitives; verify peer and runtime impact.
   - Change size: flag diffs that are too large to review safely, especially broad formatting churn, mixed refactor plus behavior, or more than 800 changed source lines without a split rationale.
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

## Finding Format

Use confidence when the finding depends on concrete code or diff evidence:

`[P1] (confidence: 9/10) file:line - finding`

Put findings first, ordered by severity. Include "What already exists", "NOT in scope", failure modes, and test/parallelization gaps when reviewing a plan.
