# Performance Audit Checks

Use this reference after `SKILL.md` creates the shared deep-audit envelope. Keep analysis read-only unless the user explicitly asks for fixes. Use `measurement-evidence.md` for every number and `remediation-contract.md` for every code change.

## Category Scope

Own these performance surfaces:

- database query efficiency, query waterfalls, over-fetch, pagination, aggregation cost, raw SQL cost, and index impact on request latency;
- server response time, caching, dynamic rendering flags, middleware/proxy cost, cold-start behavior, page/API status, response bytes, and fallback paths;
- bundle size, code splitting, lazy loading, client-component scope, barrel imports, and heavy dependencies;
- React rendering strategy, React Compiler status, large list rendering, context churn, high-tree state, data-fetching patterns, transitions, and Suspense boundaries;
- perceived performance, route loading states, optimistic writes, debounced inputs, image loading, link prefetch, and fast shells for heavy views;
- infrastructure and network performance, runtime placement, headers, compression, image config, CDN/object-storage fit, and large public assets.

Do not score these as performance findings:

- schema correctness unrelated to measured query latency;
- memory leaks and effect cleanup;
- loading skeleton visual design quality;
- console logging and observability hygiene;
- manual `memo`, `useMemo`, or `useCallback` gaps when React Compiler is enabled.

## Phase 1 Worklists

Create worklists under the run artifact directory, for example:

```bash
AUDIT_DIR="artifacts/deep-audit/<audit-id>"
mkdir -p "$AUDIT_DIR/worklists"
rg --files -g '**/page.tsx' -g '!**/node_modules/**' -g '!**/.next/**' | sort > "$AUDIT_DIR/worklists/perf_pages.txt"
rg --files -g '**/route.ts' -g '!**/node_modules/**' -g '!**/.next/**' | sort > "$AUDIT_DIR/worklists/perf_route_handlers.txt"
rg "\\[[^/]+?\\]" "$AUDIT_DIR/worklists/perf_pages.txt" "$AUDIT_DIR/worklists/perf_route_handlers.txt" > "$AUDIT_DIR/worklists/perf_dynamic_routes.txt"
rg --files -g '**/loading.tsx' -g '!**/node_modules/**' -g '!**/.next/**' | sort > "$AUDIT_DIR/worklists/perf_loading.txt"
rg "prisma\\." --type ts -g '!**/generated/**' -g '!**/*.test.*' > "$AUDIT_DIR/worklists/perf_queries.txt"
rg "'use client'" -g '*.tsx' -l > "$AUDIT_DIR/worklists/perf_client.txt"
rg "dynamic\\(|import\\(" --type ts -g '!**/generated/**' -g '!**/*.test.*' > "$AUDIT_DIR/worklists/perf_dynamic.txt"
: > "$AUDIT_DIR/worklists/perf_deps.txt"
rg --files -g 'package.json' -g '!**/node_modules/**' -g '!**/.next/**' | while IFS= read -r file; do rg '"dependencies"' -A 100 "$file"; done > "$AUDIT_DIR/worklists/perf_deps.txt"
: > "$AUDIT_DIR/worklists/perf_large_files.txt"
for root in .cache public apps packages; do
  [ -d "$root" ] || continue
  rg --files "$root" -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/generated/**' | while IFS= read -r file; do
    stat -f "%z %N" "$file" 2>/dev/null || stat -c "%s %n" "$file"
  done
done | sort -nr > "$AUDIT_DIR/worklists/perf_large_files.txt"
rg --files -g 'next.config.*' -g '!**/node_modules/**' | sort > "$AUDIT_DIR/worklists/perf_next_configs.txt"
: > "$AUDIT_DIR/worklists/perf_compiler_status.txt"
while IFS= read -r file; do
  [ -f "$file" ] && rg "reactCompiler|babel-plugin-react-compiler|react-compiler" "$file"
done < "$AUDIT_DIR/worklists/perf_next_configs.txt" > "$AUDIT_DIR/worklists/perf_compiler_status.txt"
```

After each worklist command, run `wc -l` and record `path`, `count`, and `sha256`. If a command is not applicable to the target stack, create an empty worklist with a hash and record the applicability result.

Required manifest fields:

```yaml
TOTAL_PAGES:
TOTAL_ROUTE_HANDLERS:
TOTAL_DYNAMIC_ROUTES:
TOTAL_LOADING_FILES:
PAGES_WITHOUT_LOADING:
TOTAL_PRISMA_QUERY_LINES:
TOTAL_CLIENT_COMPONENTS:
LARGE_LOCAL_FILES_OVER_1MB:
REACT_COMPILER_ENABLED:
```

No lane starts before every registry worklist has a path, count, and hash.

## Lane Rules

- Read only from Phase 1 worklists and files referenced by those worklists.
- Record `CONFIRMED_CLEAN: <check id> - <evidence and file count>` for every clean check.
- Record `CHECKS_SKIPPED: <check id> - <reason and blocker>` for every skipped check.
- Record `not_applicable` only after the applicability gate from the registry is false.
- Record source-limited blockers for missing tables, missing migrations, missing env, missing seed data, missing local files, auth blockers, dynamic fixture blockers, and unavailable runtime targets.
- Treat non-2xx responses, unexpected redirects, auth loops, route crashes, and fixture failures as findings unless code documents that behavior as intentional.
- Separate dev compilation, process-cold startup, cache-cold execution, and warm runtime. Consume every response body. Run repeated measurements under the conditions contract from `measurement-evidence.md`.
- Measure user-facing pages and route handlers through HTTP or browser evidence. Service/procedure timings identify hotspots but do not close a route.
- Treat source inspection as hypothesis evidence. Promote it to a measured finding only after a trace, runtime sample, query plan, bundle artifact, lab run, or field result establishes impact.

## Check `perf-01-database-query-performance`

Lane id: `database-query-performance`

Use `perf_queries` and schema files. Inspect:

- loops containing Prisma/database calls;
- queries without narrowed `select` or justified `include`;
- independent sequential awaits;
- unbounded `findMany` or equivalent collection reads;
- expensive `count`, `aggregate`, and `groupBy` calls without cache boundaries;
- `Promise.all` around many individual database calls;
- raw SQL without query plan, bounded filters, or measured cost;
- filters and ordering fields that lack supporting indexes;
- multi-field filters that need compound index coverage.

For each finding, report `QUERY LOCATION`, `TYPE`, `SEVERITY`, `CURRENT`, `IMPACT`, and `FIX`. Emit a single index migration block as remediation input when index impact is part of request latency evidence.

## Check `perf-02-server-response-caching`

Lane id: `server-response-caching`

Use `perf_pages`, `perf_route_handlers`, `perf_dynamic_routes`, `perf_large_files`, and `perf_next_configs`. Inspect:

- async server-component waterfalls and repeated data fetches;
- fetch calls without explicit cache or revalidation behavior;
- pages or handlers marked dynamic without runtime need;
- middleware or proxy work that hits databases, remote APIs, or static asset paths;
- complete page/API route inventory with status, disposition, auth state, fixture state, and redirect result;
- critical-journey route measurements with process-cold or cache-cold definition, repeated warm latency, response bytes, and measurement conditions;
- payload budgets derived from a baseline, user impact, or repository policy; absent budgets remain unscored observations;
- fresh-process latency for file-backed caches, snapshots, generated data, remote storage, and singleton initialization;
- route handler, image, API, RPC, upload, download, and fallback paths.

Always consume response bodies while measuring. Use the route row in `measurement-evidence.md`.

For each finding, report `LOCATION`, `TYPE`, `SEVERITY`, `CURRENT BEHAVIOR`, `FIX`, and `TIME SAVED`.

## Check `perf-03-bundle-code-splitting`

Lane id: `bundle-code-splitting`

Use `perf_client`, `perf_dynamic`, and `perf_deps`. Inspect:

- whole-library imports from large packages when a build artifact or import trace attributes browser bytes to the route;
- star imports that force broad bundle inclusion;
- Moment, charting, rich text, map, PDF, spreadsheet, and editor dependencies in initial client bundles;
- heavy components imported at top level instead of dynamic boundaries;
- client components that contain no client-only feature;
- root barrel imports that pull large modules into browser bundles;
- current framework bundle-analysis output and server/client import chains; do not rely on removed or legacy First Load JS summaries for a React Server Components application.

For each finding, report `LOCATION`, `TYPE`, `SEVERITY`, `CURRENT SIZE`, `FIX`, and `SAVINGS`.

## Check `perf-04-react-rendering`

Lane id: `react-rendering`

Use `perf_client`, `perf_pages`, and `perf_compiler_status`. Inspect:

- React Compiler status from framework config and package references;
- `"use no memo"` escape hatches without a code comment that names the limitation;
- large list renders without virtualization;
- coarse contexts that mix fast-changing and slow-changing values;
- state stored in page, layout, root, shell, or provider layers without local need;
- client-side `useEffect` data fetching that belongs in a server boundary or pre-created promise flow;
- missing `startTransition`, `useTransition`, or `useDeferredValue` on non-urgent interactions;
- async server components lacking Suspense at the call site or a route loading boundary.

If React Compiler is enabled, do not propose manual memoization without profiler evidence and a named compiler limitation. If it is disabled, record compiler enablement as a scoped experiment whose priority follows measured render cost; do not assign severity from version alone.

For each finding, report `COMPONENT`, `TYPE`, `SEVERITY`, `ROOT CAUSE`, `FIX`, and `IMPACT`.

## Check `perf-05-perceived-performance`

Lane id: `perceived-performance`

Use `perf_pages`, `perf_loading`, and `perf_client`. Inspect:

- pages with async work and no route loading file or Suspense boundary;
- common write paths without optimistic UI or pending-state feedback;
- search, filter, query, and autosave inputs without debounce boundaries;
- raw image elements, image components without dimensions or fill, and above-fold LCP images without priority;
- links with prefetch disabled without a code reason;
- image-heavy, table-heavy, queue, admin, review, log, and media pages that block the first usable shell.

For each finding, report `LOCATION`, `TYPE`, `SEVERITY`, `CURRENT`, `IDEAL`, `FIX`, and `PERCEIVED IMPACT`.

## Check `perf-06-infrastructure-network`

Lane id: `infrastructure-network`

Use `perf_route_handlers`, `perf_next_configs`, and `perf_large_files`. Inspect:

- runtime placement for edge-suitable auth/redirect/simple transform routes and Node-required database or filesystem routes;
- cache headers, compression, image optimization, and static asset headers in framework config;
- large files in public/static paths that belong on CDN or object storage;
- connection pooling and serverless database client behavior when route evidence shows connection overhead.

For each finding, report `LOCATION`, `TYPE`, `SEVERITY`, `ISSUE`, `FIX`, and `IMPACT`.

## Synthesis

Include these sections in the category report:

- Performance Scorecard with Database Query Efficiency, Server Response Time and Caching, Route Status/Payload/Cold-Warm Behavior, Bundle Size and JS Load, React 19 Patterns and Rendering, Perceived Performance, Infrastructure, and Overall Performance.
- Route Matrix Evidence with every measured route plus slowest warm routes, slowest cold/fresh-process routes, largest responses, non-2xx responses, unexpected redirects, and blocked dynamic fixtures.
- File-Level Consolidation with one block per file that has multiple findings.
- Index Migration Block when query-latency evidence requires index additions.
- Zero-Cost Quick Wins with file-specific rows or `CONFIRMED_CLEAN: no quick wins found, all high-effort`.
- Top 5 Highest-Impact Changes ranked by user impact.
- Coverage Report with counters for completed lanes, completed checks, skipped checks, clean checks, React Compiler status, audited queries/pages/handlers, HTTP-measured routes, dynamic fixtures created and blocked, fixture cleanup, cold/warm checks, max page bytes, oversized routes, broken routes, and loading coverage.
- Next Run Input with prior fixes, known-good routes, and targeted skipped checks.
- Persisted Baseline with schema v2, `baselineId`, `targetLabel`, evidence-bound measurement rows, thresholds, and `nextRun.command`; validate it with `node scripts/performance-baseline.mjs validate <baseline-json>` from the source checkout.
- Trend Delta when a comparable prior baseline exists; compute it with `node scripts/performance-baseline.mjs trend --before <old-baseline> --after <new-baseline>`.

## Artifact Rows

Each category report row must include:

```yaml
categoryId: performance
checkId:
laneId:
status: finding|confirmed_clean|skipped|not_applicable|source_limited
severity:
evidence:
consumedWorklistHashes:
result:
```

Every lane receipt must include:

```yaml
categoryId: performance
laneId:
status:
consumedWorklistHashes:
summary:
```

Validate the final envelope:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact-json>
```
