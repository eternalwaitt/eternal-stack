# Production Readiness Audit Checks

This reference defines the `production-readiness` deep-audit category. It rewrites the source audit into repo-owned directive language and aligns every check with `scripts/lib/deep-audit-categories.mjs`.

## Category Contract

- Category id: `production-readiness`
- Skill name: `etrnl-production-readiness`
- Execution mode: sequential
- Registered check ids: `prod-01-state-coverage` through `prod-17-error-boundaries`
- Report envelope: same schema used by `etrnl-deep-audit`
- Direct invocation: create `requestedCategories: ["production-readiness"]` or route to `etrnl-deep-audit --category production-readiness`
- Completion gate: validate the final artifact with `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>`

## Evidence Rules

- Use a run-scoped artifact directory. Do not write unscoped audit worklists outside it.
- Reuse orchestrator-generated worklists when present. Do not create category-local inventory after shared worklists exist.
- Store every worklist with `path`, `count`, `sha256`, and the generation command.
- Count each search result before analysis. Empty worklists still become report rows.
- Read every file in each required worklist. Sampling blocks completion.
- Inspect file contents before recording a completed check.
- For zero-finding checks, emit `CONFIRMED_CLEAN` with the check id and evidence summary.
- For blocked checks, emit `CHECKS_SKIPPED` with check id, worklist id, and reason.
- For absent features, emit `not_applicable` with the applicability gate and source evidence.
- Keep source-limited blockers distinct from `CONFIRMED_CLEAN`.
- Do not place local absolute paths, accounts, secrets, transcript excerpts, or private memory content in tracked artifacts.

## Applicability Discovery

Record the stack facts before running checks:

- runtime and framework;
- API layer and validation library;
- ORM and schema path;
- auth provider and session model;
- queue, worker, cron, webhook, notification, upload, and export surfaces;
- deployment and serverless model;
- market locale, timezone, currency, and compliance jurisdiction;
- tenancy and location model;
- logger and validated env schema.

Use `not_applicable` instead of a finding when evidence proves a feature class is absent. This applies to tenancy, location scoping, soft deletion, money value objects, i18n, serverless deployment, queues, crons, webhooks, uploads, exports, and market-specific identifiers.

## Worklists

Use these ids and generated files in the shared artifact directory:

| Worklist id | Contents | Baseline command |
| --- | --- | --- |
| `prod_pages` | routed page files | `fd -g 'page.tsx' --exclude node_modules --exclude .next` |
| `prod_procedures` | internal API procedure files | `rg "createProcedure\|publicProcedure\|protectedProcedure\|router\\(" --type ts -g '!**/generated/**' -l` |
| `prod_routes` | route handler files | `fd -g 'route.ts' --exclude node_modules --exclude .next` |
| `prod_actions` | server action files | `rg "'use server'" --type ts -g '!**/generated/**' -l` |
| `prod_webhooks` | webhook handlers | route handler worklist filtered for webhook handling |
| `prod_queues` | worker and queue files | `rg "new Worker\|new Queue\|createWorker\|inngest\\.createFunction" --type ts -g '!**/generated/**' -l` |
| `prod_crons` | cron and scheduled work | `rg "cron\|schedule\|vercel.*cron" --type ts -g '!**/generated/**' -g '!**/*.test.*' -l` |
| `prod_notifications` | notification send sites | `rg "sendEmail\|sendSMS\|sendWhatsApp\|sendPush\|sendNotification\|notify" --type ts -g '!**/generated/**' -g '!**/*.test.*' -l` |
| `prod_uploads` | upload and object-storage handlers | `rg "upload\|putObject\|presign" --type ts -g '!**/generated/**' -g '!**/*.test.*' -l` |
| `prod_exports` | export features | `rg "export.*csv\|export.*pdf\|createObjectURL\|\\.xlsx" --type ts -g '!**/generated/**' -l` |
| `prod_schema` | ORM schema files | ORM-specific schema glob, such as `schema.prisma` |
| `prod_client` | client components | `rg "'use client'" -g '*.tsx' -l` |
| `prod_mutations` | mutation surfaces | `rg "useMutation\|useActionState\|startTransition\|\\.mutate\\(" --type ts -g '!**/generated/**' -l` |
| `prod_tenant` | tenant and location scoping surfaces | `rg "tenantId\|organizationId\|orgId\|locationId" --type ts -g '!**/generated/**' -l` |
| `prod_dates` | date, locale, and formatting surfaces | `rg "new Date\|Date\\.now\|toISOString\|dayjs\|date-fns\|format.*date" --type ts -g '!**/generated/**' -g '!**/*.test.*' -l` |
| `prod_raw_env_files` | raw env access files | `rg "process\\.env\\." --type ts -g '!**/generated/**' -g '!**/*.test.*' -l` |
| `prod_error_boundaries` | App Router error boundaries | `fd -g 'error.tsx' --exclude node_modules --exclude .next` |

Auxiliary searches belong under the same artifact directory and inherit generated/test exclusions.

## Check Order

### `prod-01-state-coverage` - State Coverage Matrix

Gate: Next.js pages or equivalent routed views exist.

Required worklists: `prod_pages`.

For every page, record coverage for loading, success, empty, error, partial data, unauthorized, and exporting states. Use sibling `loading.tsx`, `error.tsx`, Suspense boundaries, data null checks, auth redirects, empty-state branches, and export-progress indicators as evidence. Flag the highest-risk pages with missing error, empty, partial, or unauthorized handling.

### `prod-02-transition-integrity` - Transition Integrity

Gate: Client or server mutations exist.

Required worklists: `prod_mutations`.

Inspect every mutation path for double-submit races, stale data flashes, optimistic updates without rollback, swallowed errors, duplicate toasts, stuck spinners, missing revalidation, and conflicting concurrent transitions. Record optimistic-update and revalidation searches as auxiliary evidence when present.

### `prod-03-validation-boundaries` - Validation At Trust Boundaries

Gate: API routes, procedures, or server actions exist.

Required worklists: `prod_procedures`, `prod_routes`, `prod_actions`.

Verify that each external input is parsed at the server boundary with the target validation library. Check procedures, route handlers, and server actions for schema parsing, bounded strings, bounded numbers, enum checks, file input constraints, and owner or tenant scoping on update/delete operations. Treat client-side validation as insufficient.

### `prod-04-timezone-locale-market` - Timezone, Locale, And Market Correctness

Gate: Date, timezone, locale, or market-specific behavior exists.

Required worklists: `prod_dates`.

Verify local timezone handling, local-midnight boundaries, schedule and appointment time correctness, cron timezone behavior, currency formatting, market phone or identifier validation, compliance-sensitive PII handling, and i18n coverage for user-facing strings. Record `not_applicable` rows for market checks absent from the target domain.

### `prod-05-concurrent-write-safety` - Concurrent Write Safety

Gate: Write paths or booking-like mutations exist.

Required worklists: `prod_procedures`, `prod_actions`, `prod_routes`.

Inspect read-then-write sequences, balance or quota updates, seat limits, booking or appointment claims, queue position claims, commission calculations, and transaction boundaries. Flag paths lacking atomic writes, unique constraints, locking, serializable transactions, idempotency keys, or conflict handling.

### `prod-06-auth-tier-enforcement` - Auth Edge Cases And Tier Enforcement

Gate: Authentication, permissions, tiers, or protected routes exist.

Required worklists: `prod_procedures`, `prod_routes`, `prod_pages`.

Match every UI-only gate to server enforcement. Inspect auth expiry, deleted users, disabled tenants, role changes, tier downgrades, feature limits, protected deep links, unauthorized redirects, and privilege checks inside handlers. A client-only check is a finding.

### `prod-07-webhook-safety` - Webhook Safety

Gate: Webhook handlers exist.

Required worklists: `prod_webhooks`.

For every webhook handler, verify signature verification before processing, idempotency across duplicate delivery, fast response with heavy work deferred, retry and backoff behavior, and rejection of unsigned public calls. Flag any handler that mutates state before signature verification.

### `prod-08-notification-deduplication` - Notification Deduplication

Gate: Notification send sites exist.

Required worklists: `prod_notifications`.

For every notification send site, verify dedup keys, cooldowns, user preference checks, opt-out handling, and multiple trigger paths for the same event. Record duplicate-send risks across webhooks, cron retries, manual actions, and mutation retries.

### `prod-09-serverless-platform-failures` - Serverless Platform Failures

Gate: Serverless, cron, worker, or queue surfaces exist.

Required worklists: `prod_queues`, `prod_crons`, `prod_routes`.

Determine deployment reality before flagging platform issues. For Vercel or similar serverless platforms, flag workers started inside API routes, WebSocket or Socket.io handlers in serverless functions, route handlers that exceed function duration without explicit max duration, streaming paths without timeout handling, cold-start database timeouts below 10 seconds, missing ORM singleton patterns, missing error monitoring, missing source-map upload evidence, and missing trace propagation across worker boundaries.

Record `not_applicable` when the target uses a persistent server, managed realtime service, external worker host, or no queue/cron surface.

### `prod-10-tenant-isolation` - Multi-Tenant Data Isolation

Gate: Tenant or location-scoped data exists.

Required worklists: `prod_tenant`, `prod_schema`.

Run this check only when schema or code evidence shows tenant, organization, account, workspace, store, clinic, location, or equivalent scoped data. Verify tenant filters on reads and writes, tenant-aware aggregates, tenant-scoped realtime channels, location filters inside tenant scope, and soft-delete filters for models that implement soft deletion. Do not flag missing tenant filters for single-tenant targets.

### `prod-11-file-upload-atomicity` - File Upload Atomicity

Gate: Upload or object-storage handlers exist.

Required worklists: `prod_uploads`.

Inspect upload-then-save paths, database rollback cleanup, orphaned object cleanup, large-file transfer through serverless functions, presigned URL use, tenant-scoped storage keys, signed URL access for sensitive files, and file deletion on record deletion. Flag storage writes that can succeed while the database write fails without cleanup.

### `prod-12-migration-pii-logs` - Migration Safety And PII In Logs

Gate: Database schema or migration-sensitive data exists.

Required worklists: `prod_schema`.

Inspect migrations and schema changes for non-null columns without defaults, enum value removal, lock-heavy index creation, mixed data and schema migrations, destructive relations, and rollback gaps. Inspect logging paths for production `console.log`, `console.warn`, `console.debug`, raw request bodies, full user/session/client objects, patient or customer records, tokens, and payment identifiers. Structured logger use is not clean evidence when it logs sensitive objects.

### `prod-13-schema-correctness` - Schema Correctness

Gate: ORM schema exists.

Required worklists: `prod_schema`.

Inspect schema types, constraints, relations, delete behavior, soft-delete relation behavior, self-referential relations, dead schema fields, and enum drift. Keep performance index findings out of this check. Flag money stored as floats, unsafe decimal-to-number arithmetic, unbounded `findMany` calls, and string fields lacking explicit bounded types where the domain requires bounded values.

### `prod-14-export-parity` - Export Parity

Gate: Export features exist.

Required worklists: `prod_exports`.

For every export feature, compare UI filters, exported filters, visible columns, exported columns, totals, timezone and locale formatting, empty state behavior, error handling, and progress indicators. If no export features exist, record `not_applicable` and `CONFIRMED_CLEAN` with evidence from `prod_exports`.

### `prod-15-path-route-correctness` - Path And Route Correctness

Gate: Routed pages, dynamic links, redirects, or route handlers exist.

Required worklists: `prod_pages`, `prod_routes`.

Inspect dynamic routes, links, redirects, notFound handling, invalid ids, deleted resources, expired sessions on deep links, auth redirects, tenant or locale prefix preservation, back-button behavior after mutations, stale cached pages, and route handler status codes.

### `prod-16-raw-env-access` - Raw Environment Variable Access

Gate: Environment variables are accessed.

Required worklists: `prod_raw_env_files`.

Verify that env access flows through the validated env module. Every raw `process.env` read outside env schema files is a finding unless the target lacks an env validation module and the report records that absence as a source-limited blocker. Confirm each referenced variable exists in the env schema with startup validation.

### `prod-17-error-boundaries` - Missing Error Route Boundaries

Gate: Route segments can throw during data fetching.

Required worklists: `prod_pages`, `prod_error_boundaries`.

For every route segment with async data fetching, verify a sibling or ancestor `error.tsx` boundary that gives a recoverable user path. Flag async pages that fetch from database or network sources without a route boundary. Record the fetched resource and expected user-visible failure behavior.

## Report Rows

Findings use this shape:

```markdown
| Check id | Severity | File | Evidence | Impact | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
```

Use severities:

- `P0`: production data corruption, cross-tenant access, payment or auth bypass, deployment architecture that fails in production.
- `P1`: high-probability runtime failure, data loss, invalid billing or scheduling, webhook duplicate processing, broken export correctness.
- `P2`: localized production defect, missing recovery state, missing validation bound, route edge case, observability gap.
- `P3`: low-risk cleanup tied to this category.

Clean rows use:

```text
CONFIRMED_CLEAN: <check id> - <check label> - 0 findings - evidence: <worklists inspected>
```

Skipped rows use:

```text
CHECKS_SKIPPED: <check id> - worklist <worklist id> - reason: <blocker>
```

Not-applicable rows use:

```text
not_applicable: <check id> - gate: <applicability gate> - evidence: <source evidence>
```

## Synthesis

The category summary contains:

- manifest counts and worklist hashes;
- completed check ids;
- findings sorted by severity;
- worst production risks;
- quick fixes that require one small source patch;
- systemic fixes that require design or runtime decisions;
- `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, `not_applicable`, and source-limited blocker rows;
- exact artifact validation command and result.
