---
name: etrnl-audit-performance
description: Evidence-first full-stack performance audit and remediation workflow. Use for speed, latency, Core Web Vitals, route matrices, cold/warm timing, database queries, caching, bundles, React rendering, perceived performance, or infrastructure/network performance.
---
# ETRNL Performance Audit

Resolve the source or installed helper root before execution. Run `performance-audit.mjs parity <source-root> <installed-root>` when both exist. Report drift and use one coherent source toolchain; do not update global copies without authorization.

Find the bottleneck, prove its producing path, measure it honestly, and close the loop with a comparable result. Preserve the registered six-lane envelope so direct runs and `etrnl-deep-audit` runs produce the same artifact.

Default mode is read-only audit. Enter remediation mode only when the user asks to fix, optimize, or implement.

## Required Flow

1. Load `references/audit-kernel.md`. Run `node scripts/performance-audit.mjs discover <target-git-root>` into the run directory. Reconcile its inventory against runtime routes and topology, then classify surfaces and journeys. This conservative seed cannot pass before reconciliation. Attach it as `categoryReports[].performanceContract`; each fine check from `scripts/lib/performance-contract.mjs` needs its own receipt.
1. Load `references/conditional-performance.md`. Reconcile stack features, run `performance-audit.mjs experts <contract.json>`, read every selected specialist and retain hashed load receipts. oRPC, Prisma, SQL and React/Next expertise is mandatory when present; load other expertise only when applicable.
1. Load only the domain references selected by those checks: `domains-database.md`, `domains-runtime.md`, `domains-browser.md`, and `domains-operations.md`. External contributors are conditional and consume/return the same receipts; unavailable contributors use the built-in playbook or a named blocker.
1. Locate the source checkout or installed stack root. Resolve helper paths from `scripts/` in source, `~/.codex/scripts/` in Codex, or `~/.claude/scripts/` in Claude Code. Read the `performance` entry in `scripts/lib/deep-audit-categories.mjs`.
1. Create or reuse a run-scoped artifact directory. Direct invocation creates the same worklist, receipt, report, and baseline envelope locally; it does not require the full orchestrator.
1. Load `references/audit-checks.md`. Load `references/measurement-evidence.md` before any measurement claim. Load `references/runtime-memory-incidents.md` whenever a provider, runtime, deploy log, or user report identifies server memory pressure. Load `references/remediation-contract.md` in remediation mode. When a TypeScript or framework build exhausts memory, is killed near type validation, or passes only with a larger V8 heap, also load `references/typescript-build-memory.md`.
1. Discover the complete target surface, then select critical journeys, hot operations, and representative authenticated fixtures. Record every discovered target as measured, `not_applicable`, `source_limited`, or blocked with an exact dependency; priority never removes investigation.
1. Build every registered `perf_*` worklist before analysis. Record path, item count, and SHA-256 hash. For provider incidents, preserve and reconcile unresolved prior ids, fetch user-linked evidence, query provider/deploy errors and alerts when access exists, and record exact access failures; never truncate the incident list before reconciliation or infer zero from an untouched empty file.
1. Run the six registry lanes against those immutable worklists. With an authorized agent mechanism, dispatch the registry model tier returned by `categoryLaneDispatch("performance")`; without one, execute lanes sequentially and retain identical receipts.
1. Separate static hypotheses from measured findings. Static evidence proves risk or a producing path, never a latency, byte, query-cost, rendering, or Core Web Vitals result.
1. Record each `perf-*` result exactly once as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`. Attach the evidence kind and measurement conditions.
1. Write a schema-v2 baseline for measured work. Run these commands from the source checkout; use the installed helper root resolved in step 1 on an installed copy:

```bash
node scripts/performance-baseline.mjs create < measurements.json
node scripts/performance-baseline.mjs validate <baseline-json>
```

1. In remediation mode, change one causal bottleneck or independently measurable batch at a time. Re-run under matching conditions, run correctness gates, and classify the change as keep, revert, or inconclusive.
1. Run `performance-audit.mjs cells <contract.json>`. Investigate every check/surface cell in producer-tracing and coverage-challenge rounds. Continue full challenge rounds until a round adds no findings. Retain the complete ledger without a finding cap. Search previous reports and reconcile every prior/current fingerprint; record missed findings as audit-quality failures.
1. Validate the category artifact:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact-json>
```

## Completion Contract

Completion requires all of these items:

- Mandatory specialist receipts, every cell in two or more distinct sweeps, a final sweep adding no findings, and prior-run reconciliation are present.
- Every registry worklist has a path, count, and hash.
- Six lane receipts exist for `database-query-performance`, `server-response-caching`, `bundle-code-splitting`, `react-rendering`, `perceived-performance`, and `infrastructure-network`.
- Every discovered target has a disposition; critical journeys include status, response bytes, auth/fixture state, cold-process or cold-cache definition, and warm measurements.
- Every metric names `field`, `lab`, `trace`, `runtime`, `query_plan`, `bundle`, or `provider_runtime` evidence plus source revision and environment.
- Dev compilation, process cold start, cache cold start, and warm runtime remain distinct.
- Build memory, server runtime memory, and client bundle/transfer bytes remain separate evidence domains. One cannot close another.
- Every registered check id appears exactly once. Blockers and unmeasured targets remain explicit.
- Measured work includes a validated schema-v2 baseline and replay command. A measurement blocker names the missing dependency instead.
- Remediation work includes comparable before/after evidence, correctness gates, regression checks, and keep/revert/inconclusive disposition.
- A provider-reported runtime memory incident remains an actionable finding. It closes only with causal remediation, bounded root/nested cardinality, all affected-journey coverage, representative overlapping replay in the actual runtime, and provider recurrence evidence; otherwise it remains open with one concrete external dependency. Record whole-repository accumulated-process coverage separately and limit that broader claim when isolate identity is unavailable.
- The category envelope passes `deep-audit-artifact-check.mjs`.

## Common Rationalizations

- "The lane looks clean." -> Close every fine receipt with retained evidence; source inspection alone remains a hypothesis.
- "The contributor is unavailable." -> Execute the built-in domain reference or retain the exact dependency blocker.
- "The build uses less memory." -> That cannot close a server runtime incident; preserve affected-journey and provider recurrence evidence.

## Red Flags

Missing surfaces, unmeasured clean claims, one-sample proof, mismatched experiments, missing raw artifacts and hidden provider incidents leave the audit incomplete. Read the kernel and domain references for detailed checks.

## When NOT to use

- Input validation, auth bypass, tenancy leaks, or injection belong to `etrnl-audit-security`.
- Correctness bugs, ordinary type errors, and diff review belong to the quality and spec reviewers. Type-check/build resource exhaustion with a performance symptom belongs to the conditional build-memory playbook here.
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
- `references/runtime-memory-incidents.md`: provider evidence intake, request-graph and relation-cardinality attribution, accumulated-process replay, concurrency, and closure.
- `references/typescript-build-memory.md`: phase isolation, compiler-graph attribution, declaration boundaries, heap containment, and fail-closed framework builds.
