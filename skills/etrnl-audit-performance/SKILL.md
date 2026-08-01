---
name: etrnl-audit-performance
description: ETRNL performance deep-audit category skill. Use when the user asks for a performance audit, speed audit, latency audit, bundle audit, route matrix audit, cold/warm timing pass, database query performance review, React rendering performance review, perceived performance review, or infrastructure/network performance review.
---
# ETRNL Performance Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-performance`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Run the registered `performance` deep-audit category with shared worklists, route/runtime evidence, six lane receipts, and the same artifact envelope used by `etrnl-deep-audit`.

This is a category skill, not the full orchestrator. Use `/etrnl-deep-audit` for `all_registered` coverage across every registered category.

## Required Flow

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `performance` registry entry.
1. Create or reuse the run-scoped deep-audit artifact directory supplied by `/etrnl-deep-audit`.
1. If invoked directly, route through `/etrnl-deep-audit --category performance` or create the same report envelope locally.
1. Build every `perf_*` worklist from the registry before lane analysis starts.
1. Record each worklist path, item count, and content hash in the artifact envelope.
1. Load `references/audit-checks.md` before auditing.
1. Run the six registered lanes against the shared worklists only. Each lane spawn carries an explicit model and reasoning effort from the lane's registry `modelTier` — resolve with `categoryLaneDispatch("performance")` from `scripts/lib/deep-audit-categories.mjs`; an omitted `model` inherits the parent thread model and is a dispatch defect.
1. Record one lane receipt per registry lane, including `laneId`, `categoryId`, `status`, `consumedWorklistHashes`, and `summary`.
1. For every registered `perf-*` check, record findings, `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, `not_applicable`, or `source_limited`.
1. Record a next-run baseline artifact when route, bundle, query, or infrastructure measurements exist:

```bash
node "${ETRNL_HOME:-$HOME/.claude}/scripts/performance-baseline.mjs" create < measurements.json > <baseline-json>
node "${ETRNL_HOME:-$HOME/.claude}/scripts/performance-baseline.mjs" validate <baseline-json>
```

1. Validate standalone output before final with:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact-json>
```

## Completion Contract

Completion requires all of these items:

- Phase 1 worklists exist, have counts, and have hashes.
- Six lane receipts exist for `database-query-performance`, `server-response-caching`, `bundle-code-splitting`, `react-rendering`, `perceived-performance`, and `infrastructure-network`.
- Route matrix evidence covers user-facing routes with status, cold and warm latency, response bytes, auth or fixture state, and result.
- Dev compile time is separated from runtime latency.
- Authenticated and dynamic route blockers are explicit source-limited blockers, not silent skips.
- Every registered check id from `scripts/lib/deep-audit-categories.mjs` appears exactly once in the category report.
- Measured reports include a validated performance baseline with `nextRun.command`, thresholds, and trend inputs, or a source-limited reason that blocked repeat measurement capture.
- The category report validates with `deep-audit-artifact-check.mjs`.

## Common Rationalizations

- "It feels fast on my machine." -> Local dev caches, warm connections, and seeded data hide N+1 and cold-start cost; capture measured cold and warm route latency in the artifact envelope.
- "The bundle grew a little, ship it." -> Record the byte delta per route; a route that crosses its budget is a finding, not a footnote.
- "The list only renders a few rows in dev." -> Test the paginated maximum; unbounded lists and per-row queries scale into hot-path thrash under real tenant data.
- "React Compiler handles rendering, so skip the render lane." -> The compiler does not fix waterfalls, unstable keys, or unmemoizable prop factories in render; run the `react-rendering` lane and record its receipt.
- "The slow query is one endpoint, not worth a full pass." -> One unindexed hot path degrades every tenant on that route; run `database-query-performance` and attach the query plan evidence.

## Red Flags

- Query issued inside a `.map`/`for`/`forEach` over a result set (classic N+1) instead of a batched `findMany`/`in`/`include` fetch.
- `include: { _count }` on a Prisma `create`/`update`, or an unbounded `findMany` with no `take`/pagination on a user-facing route.
- Route bundle byte size above its recorded budget, or a heavy dependency pulled into a client component with no dynamic import or code split.
- List or table render with no stable `key`, or a new object/array/function literal built inline as a child prop on every render, forcing re-render thrash.
- Blocking data fetch waterfall in a Server Component or route handler where independent fetches run sequentially instead of in parallel.
- Missing cache directive, missing index on a filtered/sorted column, or a synchronous hot-path call with no measured cold and warm latency captured.

## When NOT to use

- Input validation, auth bypass, tenant-isolation leaks, or injection belong to `etrnl-audit-security`.
- Correctness bugs, type errors, and diff-scoped review belong to `etrnl-quality-reviewer` and `etrnl-spec-reviewer`.
- Production readiness, deploy config, observability wiring, and runbook coverage belong to `etrnl-audit-production`.
- Whole-codebase inventory, dead code, and repo rot belong to `etrnl-audit-code`.

## Verification

Run counts every item. Any FAIL marks the run incomplete:

- PASS/FAIL: Six lane receipts exist for `database-query-performance`, `server-response-caching`, `bundle-code-splitting`, `react-rendering`, `perceived-performance`, and `infrastructure-network`.
- PASS/FAIL: Route matrix evidence records cold and warm latency, response bytes, and auth or fixture state for every user-facing route.
- PASS/FAIL: Every registered `perf-*` check id from `scripts/lib/deep-audit-categories.mjs` appears exactly once in the category report.
- PASS/FAIL: Measured runs attach a validated performance baseline with `nextRun.command`, thresholds, and trend inputs, or a named source-limited blocker.
- PASS/FAIL: Dev compile time is separated from runtime latency, and authenticated or dynamic route blockers are explicit source-limited entries, not silent skips.

Red-capable gate — this command exits non-zero when the category artifact is malformed, incomplete, or missing a required lane receipt:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact-json>
```

Expected exit code: `0` when the artifact validates. A non-zero exit marks the run incomplete and names the failing lane, check id, or missing evidence field.

## References

- `references/audit-checks.md`: performance worklists, six-lane check matrix, evidence rules, and report format.
