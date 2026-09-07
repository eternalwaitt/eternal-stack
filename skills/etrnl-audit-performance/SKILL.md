---
name: etrnl-audit-performance
description: Evidence-first full-stack performance audit and remediation workflow. Use for speed, latency, Core Web Vitals, route matrices, cold/warm timing, database queries, caching, bundles, React rendering, perceived performance, or infrastructure/network performance.
---
# ETRNL Performance Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-performance`; never stop to ask about updates. Local updates auto-apply when enabled and safe; continue the requested work.

Find the bottleneck, prove its producing path, measure it honestly, and close the loop with a comparable result. Preserve the registered six-lane envelope so direct runs and `etrnl-deep-audit` runs produce the same artifact.

Default mode is read-only audit. Enter remediation mode only when the user asks to fix, optimize, or implement.

## Required Flow

1. Locate the source checkout or installed stack root. Resolve helper paths from `scripts/` in source, `~/.codex/scripts/` in Codex, or `~/.claude/scripts/` in Claude Code. Read the `performance` entry in `scripts/lib/deep-audit-categories.mjs`.
1. Create or reuse a run-scoped artifact directory. Direct invocation creates the same worklist, receipt, report, and baseline envelope locally; it does not require the full orchestrator.
1. Load `references/audit-checks.md`. Load `references/measurement-evidence.md` before any measurement claim. Load `references/remediation-contract.md` in remediation mode.
1. Discover the complete target surface, then select critical journeys, hot operations, and representative authenticated fixtures. Record every discovered target as measured, `not_applicable`, `source_limited`, or explicitly lower priority.
1. Build every registered `perf_*` worklist before analysis. Record path, item count, and SHA-256 hash.
1. Run the six registry lanes against those immutable worklists. With an authorized agent mechanism, dispatch the registry model tier returned by `categoryLaneDispatch("performance")`; without one, execute lanes sequentially and retain identical receipts.
1. Separate static hypotheses from measured findings. Static evidence proves risk or a producing path, never a latency, byte, query-cost, rendering, or Core Web Vitals result.
1. Record each `perf-*` result exactly once as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`. Attach the evidence kind and measurement conditions.
1. Write a schema-v2 baseline for measured work. Run these commands from the source checkout; use the installed helper root resolved in step 1 on an installed copy:

```bash
node scripts/performance-baseline.mjs create < measurements.json
node scripts/performance-baseline.mjs validate <baseline-json>
```

1. In remediation mode, change one causal bottleneck or independently measurable batch at a time. Re-run under matching conditions, run correctness gates, and classify the change as keep, revert, or inconclusive.
1. Validate the category artifact:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact-json>
```

## Completion Contract

Completion requires all of these items:

- Every registry worklist has a path, count, and hash.
- Six lane receipts exist for `database-query-performance`, `server-response-caching`, `bundle-code-splitting`, `react-rendering`, `perceived-performance`, and `infrastructure-network`.
- Every discovered target has a disposition; critical journeys include status, response bytes, auth/fixture state, cold-process or cold-cache definition, and warm measurements.
- Every metric names `field`, `lab`, `trace`, `runtime`, `query_plan`, or `bundle` evidence plus source revision and environment.
- Dev compilation, process cold start, cache cold start, and warm runtime remain distinct.
- Every registered check id appears exactly once. Blockers and unmeasured targets remain explicit.
- Measured work includes a validated schema-v2 baseline and replay command. A measurement blocker names the missing dependency instead.
- Remediation work includes comparable before/after evidence, correctness gates, regression checks, and keep/revert/inconclusive disposition.
- The category envelope passes `deep-audit-artifact-check.mjs`.

## Common Rationalizations

- "It feels fast locally." -> Local caches and small fixtures hide cold starts, N+1 queries, and tail latency. Capture repeatable evidence.
- "Lighthouse proves production is fast." -> Lighthouse is lab evidence. Pair it with field data or label the field-data gap.
- "TBT is INP." -> TBT is a lab diagnostic proxy, not an INP measurement. Record it as TBT.
- "The bundle grew only a little." -> Attribute bytes to a route and import chain, then compare against its recorded baseline.
- "React Compiler handles rendering." -> It does not remove waterfalls, context churn, unstable keys, or oversized client boundaries.
- "One slow query is isolated." -> Prove call frequency, row volume, query plan, and the user-facing route that pays the cost.
- "The number improved, so keep the patch." -> A result inside noise is inconclusive, and a faster broken path is a regression.

## Red Flags

- A performance number with no command, source revision, environment, fixture, statistic, or sample count/provider-unavailable reason.
- Lab output presented as real-user experience; TBT presented as INP; one warm sample presented as a trend.
- Before/after runs with different auth, data, cache, device, network, build, or route conditions.
- Database calls in loops, unbounded collection reads, over-fetching, missing supporting indexes, or query plans captured against toy data only.
- Heavy client imports with no route/import-chain attribution, or legacy First Load JS output treated as authoritative for a current React Server Components app.
- Manual memoization proposed solely from source inspection when React Compiler is active.
- Shared cache keys that omit tenant, viewer, locale, permissions, feature flags, or other response-varying inputs.

## When NOT to use

- Input validation, auth bypass, tenancy leaks, or injection belong to `etrnl-audit-security`.
- Correctness bugs, type failures, and diff review belong to the quality and spec reviewers.
- Deployment readiness, observability wiring, and runbooks belong to `etrnl-audit-production`.
- Whole-codebase dead code and repository decay belong to `etrnl-audit-code`.
- Visual polish without a performance symptom belongs to the UI/UX audit family.

## Verification

Run counts every item. Any FAIL leaves the run incomplete:

- PASS/FAIL: all six lane receipts consume the recorded worklist hashes.
- PASS/FAIL: every discovered target and every registered check has exactly one disposition.
- PASS/FAIL: every measured claim carries an allowed evidence kind and complete comparison conditions.
- PASS/FAIL: schema-v2 baseline validation passes; lab INP and non-p75 field Core Web Vitals fail validation.
- PASS/FAIL: remediation comparisons match conditions and include correctness gates plus keep/revert/inconclusive disposition.
- PASS/FAIL: the deep-audit artifact validator exits `0`.

## References

- `references/audit-checks.md`: scope discovery, immutable worklists, six-lane checks, and report envelope.
- `references/measurement-evidence.md`: evidence hierarchy, Core Web Vitals, route matrix, repeat measurement, and schema-v2 baseline.
- `references/remediation-contract.md`: causal fixes, comparable verification, framework-safe remediation, guards, and rollback.
