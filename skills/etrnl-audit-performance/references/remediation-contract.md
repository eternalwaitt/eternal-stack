# Performance Remediation Contract

Load this reference only when the user asks for implementation.

## Authorization Boundary

- Audit remains read-only by default.
- A request to optimize authorizes scoped source and test changes.
- Deployment, migrations, production configuration, destructive cache operations, and live traffic changes require their own authority.
- Preserve tracking, forms, authentication, authorization, tenancy, localization, accessibility, SEO, URLs, query parameters, and conversion behavior.

## Causal Loop

For each bottleneck:

1. Name the user-visible symptom and producing path.
1. Capture the before baseline under `measurement-evidence.md`.
1. State the causal hypothesis and the metric expected to move.
1. Change one cause or independently measurable batch.
1. Run the same measurement command under matching conditions.
1. Run correctness, security, tenancy, accessibility, and functional regression gates affected by the change.
1. Classify the result:
   - `keep`: improvement exceeds noise and every correctness gate passes;
   - `revert`: regression exceeds the limit or behavior breaks;
   - `inconclusive`: conditions differ, samples are insufficient, or movement stays inside the uncertainty band.
1. Persist the evidence, rollback command, and a guard for retained changes.

Do not stack unrelated optimizations before attribution exists.

## Database and Server

- Remove N+1 work through set-based reads, bounded includes/selects, batching, or data-loader boundaries.
- Bound collections with pagination or a proven finite domain invariant.
- Run query plans against representative data before and after query or index changes.
- Add an index only after the filter/order/join path and write/storage cost are recorded.
- Parallelize independent I/O. Preserve ordering when a data dependency exists.
- Cache only stable computations or reads with an explicit invalidation path.
- Include every response-varying dimension in a cache key: tenant, viewer/role, locale, permissions, feature flags, query inputs, and data version.
- Test stale data, invalidation, cross-tenant isolation, and authorization before retaining a cache change.
- Never hide a timeout or failure behind stale/default data unless the product contract explicitly defines that behavior.

## Bundle and Loading

- Remove or replace heavy dependencies only after route/import-chain attribution.
- Keep lightweight metadata and configuration in modules that do not statically import heavy payloads. Locale catalogs, generated registries, fixtures, or other bulk data belong behind a server-only or dynamic loader; prove removal from client chunks with the emitted graph.
- Move client boundaries downward; do not convert server behavior into client behavior to chase a bundle score.
- Lazy-load below-fold or interaction-only code while preserving focus, navigation, error, and loading behavior.
- Preserve analytics events, campaign parameters, forms, and conversion flows during public-page work.
- Add route-level byte guards from emitted artifacts for retained reductions.

## React and Perceived Performance

- Use a profiler or interaction trace to locate render cost.
- With React Compiler active, do not add manual `memo`, `useMemo`, or `useCallback` without a named compiler limitation and measured win.
- Fix waterfalls, oversized client boundaries, high-tree state, coarse contexts, unstable keys, synchronous expensive work, and unbounded lists at their cause.
- Virtualize only lists that cross a measured render threshold; retain keyboard and screen-reader behavior.
- Use transitions or deferred values for non-urgent updates after interaction evidence identifies blocking work.
- Preserve focus, announcements, disabled/pending states, failure recovery, and submitted values in optimistic flows.
- Optimize the LCP resource only after the trace identifies the actual LCP candidate.

## Infrastructure and Network

- Match runtime placement to dependencies; filesystem/database work stays on a compatible runtime.
- Change compression, cache headers, CDN placement, connection pooling, or image policy with response-header and runtime evidence.
- Test cold-process behavior after singleton, pool, snapshot, or initialization changes.
- Keep private/user-specific responses out of public and shared caches.
- For TypeScript or framework build-memory exhaustion, follow `typescript-build-memory.md`. A larger V8 heap is containment until compiler-graph evidence rules out a structural cause.

## Guard Selection

Retained fixes add the smallest deterministic guard that detects the same regression:

- query-count or query-plan fixture for N+1/index work;
- route latency trend with a named noise/regression threshold;
- emitted route-byte budget for bundle work;
- interaction trace or render-count fixture for rendering work;
- cache-key/isolation/invalidation test for caching work;
- Core Web Vitals field monitor for real-user regressions.

A guard failure is a regression signal, not permission to loosen the threshold.

## Remediation Receipt

```yaml
symptom:
producing_path:
hypothesis:
before_baseline:
change:
after_baseline:
trend_verdict:
correctness_gates:
regression_guard:
rollback_command:
disposition: keep|revert|inconclusive
```

No remediation finding closes without this receipt.

## Workflow Lineage

- [Addy Osmani `performance-optimization`](https://github.com/addyosmani/web-quality-skills/tree/main/skills/performance-optimization): measure, identify, fix, verify, and guard loop.
- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices): current React and Next.js producing-path rules.
- [Brunno `performance-audit`](https://github.com/BrunnoSkarzinski/agent-skills/tree/main/skills/performance-audit): lab/field separation and preservation of public conversion behavior.
