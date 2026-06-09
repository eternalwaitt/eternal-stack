---
name: etrnl-audit-performance
description: ETRNL performance deep-audit category skill. Use when the user asks for a performance audit, speed audit, latency audit, bundle audit, route matrix audit, cold/warm timing pass, database query performance review, React rendering performance review, perceived performance review, or infrastructure/network performance review.
---
# ETRNL Performance Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-performance`; on update, ask update/snooze/continue.

Run the registered `performance` deep-audit category with shared worklists, route/runtime evidence, six lane receipts, and the same artifact envelope used by `etrnl-audit`.

This is a category skill, not the full orchestrator. Use `/etrnl-audit` for `all_registered` coverage across every registered category.

## Required Flow

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `performance` registry entry.
1. Create or reuse the run-scoped deep-audit artifact directory supplied by `/etrnl-audit`.
1. If invoked directly, route through `/etrnl-audit --category performance` or create the same report envelope locally.
1. Build every `perf_*` worklist from the registry before lane analysis starts.
1. Record each worklist path, item count, and content hash in the artifact envelope.
1. Load `references/audit-checks.md` before auditing.
1. Run the six registered lanes against the shared worklists only.
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

## References

- `references/audit-checks.md`: performance worklists, six-lane check matrix, evidence rules, and report format.
