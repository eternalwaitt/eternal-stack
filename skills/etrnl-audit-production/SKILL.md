---
name: etrnl-audit-production
description: ETRNL deep-audit category skill for production readiness. Use when the user asks for production readiness, launch readiness, production blockers, runtime data safety, validation boundaries, auth and tenancy enforcement, webhook reliability, serverless readiness, exports, route correctness, raw env access, or App Router error boundaries.
---
# ETRNL Production Readiness

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-production`; on update, ask update/snooze/continue.

Run the production-readiness deep-audit category against a target application. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Confirm the target repo, framework, API layer, ORM, auth provider, queue or cron model, deployment model, market locale, tenancy model, logger, and env schema.
2. Load `references/audit-checks.md`.
3. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists.
4. For direct category invocation, create the same report envelope with `requestedCategories: ["production-readiness"]`, or route the run through `etrnl-deep-audit --category production-readiness`.
5. Refuse final completion until the artifact validator command for the report has run or a concrete blocker is recorded.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `prod-01-state-coverage` through `prod-18-operability-prr`.
- Inspect file contents before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Log `CHECKS_SKIPPED` with check id, worklist id, and reason when source evidence, credentials, runtime access, or context budget blocks completion.
- Mark `not_applicable` with the applicability gate and evidence when tenancy, soft deletion, money value objects, i18n, exports, serverless deployment, queues, crons, webhooks, uploads, or market-specific rules are absent from the target.
- Keep source-limited blockers separate from clean checks.
- Keep local target paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return:

- coverage and worklist counts;
- findings by check id and severity;
- `CONFIRMED_CLEAN` rows;
- `CHECKS_SKIPPED` rows;
- `not_applicable` rows;
- source-limited blockers;
- artifact path or blocker;
- validation command and result.

Direct invocation final output includes:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>
```

## Common Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Staging looks green, so production is ready." | Staging is not production. Inspect `prod-09-serverless-platform-failures` cold-start, timeout, and payload-limit behavior against the real deployment model. |
| "The webhook worked once in testing." | Test proves happy path, not replay. Confirm `prod-07-webhook-safety` signature verification, idempotency keys, and duplicate-delivery handling before marking clean. |
| "We ship now and add the rollback path later." | No rollback path is a `prod-18-operability-prr` P0. Record the canary or rollback path and owner handoff, or log the gap as a launch blocker. |
| "Errors go to logs, that is enough observability." | Logs without SLOs, alert thresholds, and named dashboards fail `prod-18-operability-prr`. Name the metric and alert or record the observability gap. |
| "This route rarely throws, an error boundary is overkill." | Every async route that fetches from database or network needs a `prod-17-error-boundaries` sibling `error.tsx`. Confirm the boundary or file the finding. |

## Red Flags

- A route handler, queue, or cron that fetches external data with no timeout, retry cap, or dead-letter path — silent-failure surface flagged by `prod-18-operability-prr`.
- A webhook endpoint that mutates state before verifying provider signature or without an idempotency key — duplicate-processing and forgery vector under `prod-07-webhook-safety`.
- Raw `process.env.X` read outside the validated env schema module — unvalidated config surface caught by `prod-16-raw-env-access`; every such read is a finding unless no env module exists.
- An async page or layout that fetches from database or network with no sibling or ancestor `error.tsx` — uncaught-throw surface under `prod-17-error-boundaries`.
- A deployment config that sets `output: "standalone"` or otherwise assumes an architecture the target platform does not serve — `prod-09-serverless-platform-failures` P0.
- A create/update mutation with no optimistic-lock or transaction guard under concurrent writers — lost-write and corruption path flagged by `prod-05-concurrent-write-safety`.

## When NOT to use

- Tenant-isolation query auditing, auth bypass classes, injection, and secret-exposure surfaces beyond config reads: route those to `etrnl-audit-security`.
- Build pipelines, CI gates, lint/type configuration, and dependency-supply integrity: route those to `etrnl-audit-tooling`.
- Latency, bundle size, query cost, and render-performance regressions: route those to `etrnl-audit-performance`.
- Diff-scoped correctness review of one change before merge: route that to `etrnl-quality-reviewer`, not a full production-readiness sweep.

## Verification

Run this after producing the report artifact. It exits non-zero when a check status is unsupported, a `finding` row carries no evidence, or a private path leaks into the artifact.

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>
```

Expected exit code: `0` on a clean, complete artifact; `1` on any validation defect. Any FAIL below marks the run incomplete:

- PASS/FAIL: every check `prod-01-state-coverage` through `prod-18-operability-prr` carries a status of `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
- PASS/FAIL: every `finding` check carries at least one finding row with file and evidence.
- PASS/FAIL: every `confirmed_clean` check carries the `CONFIRMED_CLEAN` marker.
- PASS/FAIL: every `not_applicable` check names its applicability gate and evidence.
- PASS/FAIL: the artifact contains zero private paths, account identifiers, or secret material.
- PASS/FAIL: the validate command above prints `ok:` and returns exit code `0`.
