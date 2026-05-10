---
name: etrnl-review
description: ETRNL control-plane review workflow for Claude Code. Use for code reviews, plan reviews, final review passes, pitfalls, loose ends, risks, and quick wins.
model: opus
effort: high
---
# Code Review

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
5. Apply the engineering review frame:
   - Scope: existing code reused, minimal change set, explicit NOT in scope, distribution/install coverage.
   - Architecture: boundaries, dependency graph, data flow, scaling, auth/data access, rollback, and one failure scenario per new integration.
   - Code quality: organization, DRY, error handling, over/under-engineering, stale diagrams, and accidental complexity.
   - Tests: code paths, user flows, error states, regressions, E2E/eval needs, and exact commands.
   - Performance: N+1 queries, memory, caching, slow paths, and work on hot paths.
   - Parallelization: safe lanes, shared modules, dependencies, and conflict risks.
6. Point to exact files, commands, or plan sections.
7. Recommend or apply the smallest fix that closes the risk.
8. Say clearly when no blocking findings remain, and name any live-gated follow-up.

## Finding Format

Use confidence when the finding depends on concrete code or diff evidence:

`[P1] (confidence: 9/10) file:line - finding`

Suppress low-confidence speculation unless the severity would be P0/P1. Outside-voice findings are informational until the user approves them; present agreement as a recommendation, not a decision.

## Output

Put findings first, ordered by severity. Include "What already exists", "NOT in scope", failure modes, and test/parallelization gaps when reviewing a plan. Keep summaries short and secondary. Do not bury an unverified assumption in reassuring prose.
