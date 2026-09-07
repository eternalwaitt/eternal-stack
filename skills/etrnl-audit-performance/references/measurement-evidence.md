# Performance Measurement Evidence

Use this contract before reporting a performance number or comparing two runs.

## Evidence Kinds

Every metric carries exactly one evidence kind:

| Kind | Proves | Does not prove |
| --- | --- | --- |
| `field` | real-user distribution for the named cohort and window | producing-path cause |
| `lab` | repeatable synthetic result under named device and network conditions | real-user experience |
| `trace` | main-thread, interaction, render, or request chronology in one captured scenario | fleet-wide prevalence |
| `runtime` | endpoint or operation behavior in the named runtime and fixture | browser rendering or field experience |
| `query_plan` | database execution strategy and cost for the named data shape | end-to-end route latency |
| `bundle` | emitted bytes and import ownership for the named build and route | download, parse, render, or user impact by itself |

Static source inspection identifies a hypothesis and producing path. It never receives a measurement row.

## Core Web Vitals

- Record LCP, INP, and CLS field distributions at the 75th percentile.
- Record cohort, date window, form factor, available geography, navigation type, and sample source.
- Record the provider sample count. When a field provider withholds it, set `sampleCount` to `null` and name `conditions.sampleCountUnavailableReason`; never invent a count.
- Record Lighthouse LCP and CLS as `lab`. Lighthouse does not measure INP without a real interaction.
- Record Total Blocking Time as `tbt`; never rename it to INP.
- Use an interaction trace for local INP diagnosis and retain the exact interaction sequence.
- Apply the current good thresholds as scorecard context: LCP at or below 2,500 ms, INP at or below 200 ms, and CLS at or below 0.1. A threshold crossing is a finding only for a representative target and cohort.

## Repeat Measurement

- Exclude compile/setup time and documented warm-up runs from runtime samples.
- Use at least three measured samples for a lab or runtime before/after verdict. Use five or more when variance changes the verdict.
- Store the sample count and statistic. Use median for repeatable lab/runtime comparisons and p75 for field Core Web Vitals. Use the explicit provider-unavailable form above for field counts that are not exposed.
- Store raw sample artifacts or a private evidence path when the data carries tenant or user content.
- Treat a single trace or observation as diagnostic evidence, not a trend.
- Calculate noise from an unchanged control or repeated baseline. Set `noisePct` in `nextRun.thresholds`.

## Comparison Conditions

Before and after rows match only when these response-affecting conditions match:

- target route or operation and metric;
- environment, build mode, runtime region, and runtime version;
- device/CPU profile and network profile for browser work;
- auth role, tenant-safe fixture shape, locale, feature flags, and experiment cohort;
- process-cold, cache-cold, or warm state;
- request method, payload shape, and response consumption;
- statistic and unit.

Record `sourceRevision` on each row. Revisions differ across a code change and remain outside the comparison key. The trend validator treats any other condition mismatch as removed plus added, not as a valid delta.

## Cold-State Vocabulary

- `process_cold`: a new application process handles the first request.
- `cache_cold`: the relevant application/data cache is empty while the process state is named.
- `warm`: process and named caches have completed the documented warm-up.
- `browser_cold`: browser cache and storage state are cleared under the named profile.

Never use the bare word `cold` in a measurement row.

## Route Inventory

Record one inventory row for every discovered user-facing page and route handler:

```yaml
route:
source:
kind: page|route_handler|rpc|asset|other
disposition: measured|lower_priority|not_applicable|source_limited
auth:
fixture:
status:
redirect:
response_bytes:
process_cold_ms:
cache_cold_ms:
warm_median_ms:
sample_count:
evidence_kind:
environment:
source_revision:
notes:
```

Measure every critical journey and suspected hotspot. Inventory lower-priority targets without fabricating measurements. A non-2xx response, unexpected redirect, auth loop, or broken fixture stays visible.

## Bundle Evidence

- Use the current framework analyzer or emitted build graph.
- Attribute browser bytes to a route and server/client import chain.
- Separate raw, compressed transfer, parsed JavaScript, and loaded-on-interaction bytes.
- For current Next.js React Server Components builds, do not treat legacy First Load JS summaries as authoritative.
- Tie a byte reduction to lab or field evidence before claiming user-visible time saved.

## Query Evidence

- Attribute a query to its request, procedure, job, or page path.
- Record call count, selected columns, row estimate and actual rows, planning/execution time, and data scale.
- Use representative sanitized data. Toy-data plans remain `source_limited` for production-scale claims.
- Capture the plan before and after index/query changes. Record write/storage cost for new indexes.
- Separate ORM query duration from connection acquisition, network, serialization, and end-to-end request latency.

## Schema-v2 Baseline

```json
{
  "schemaVersion": 2,
  "baselineId": "checkout-lcp-before",
  "targetLabel": "checkout",
  "measurements": [
    {
      "route": "/checkout",
      "metric": "lcp",
      "value": 2180,
      "unit": "ms",
      "evidenceKind": "lab",
      "statistic": "median",
      "sampleCount": 5,
      "direction": "lower",
      "capturedAt": "2026-09-07T12:00:00Z",
      "conditions": {
        "environment": "local-production-build",
        "sourceRevision": "before-revision",
        "device": "desktop-emulation",
        "network": "cable",
        "cacheState": "browser_cold",
        "auth": "member",
        "fixture": "tenant-safe-checkout"
      }
    }
  ],
  "nextRun": {
    "command": "pnpm perf:checkout",
    "thresholds": {
      "noisePct": 5,
      "minImprovementPct": 8,
      "maxRegressionPct": 5
    }
  }
}
```

Run:

```bash
node scripts/performance-baseline.mjs validate <baseline-json>
node scripts/performance-baseline.mjs trend --before <before-json> --after <after-json>
```

The trend output labels numeric movement as `improved`, `regressed`, `no_change`, `inconclusive`, `added`, or `removed`. Correctness gates still decide keep versus revert.

## Primary Source Anchors

- [Google web.dev Web Vitals](https://web.dev/articles/vitals): field percentile and Core Web Vitals definitions.
- [Chrome Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring): lab metric and scoring boundaries.
- [Next.js package bundling](https://nextjs.org/docs/app/guides/package-bundling): current server/client bundle analysis.
- [React Compiler](https://react.dev/learn/react-compiler): compiler behavior and migration boundaries.
- [Prisma query optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance): query attribution and optimization patterns.
