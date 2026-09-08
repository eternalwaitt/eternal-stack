# Runtime Memory Incidents

Load this playbook when a deploy provider, runtime log, alert stream, or user report identifies server memory pressure, an OOM, `exceededMemory`, eviction, restart, or a burst of co-terminated requests.

## Evidence Intake

A provider incident is primary `provider_runtime` evidence that the failure occurred. Preserve a sanitized evidence label or private artifact pointer and record:

- provider incident/event identity, timestamp window, deployment/source revision, runtime and region;
- event count, recurrence, termination class, and the provider memory/isolate limit when exposed;
- every route or procedure in the burst, their overlap window, page journey, auth/fixture shape, and observed response outcome;
- any provider metric with its exact name, value, unit, statistic, and sampling semantics;
- `unavailableReason` for peak heap, RSS, allocation, or GC data the provider does not expose.

Never invent a memory value. Missing peak instrumentation limits mechanism attribution. It does not cancel the incident, reduce severity, or justify `confirmed_clean`/`source_limited` when the producing path is known.

## Resolve the Producing Path

Build the page -> procedure -> query/relation journey graph from `perf_pages`, `perf_procedures`, `perf_request_graph`, `perf_queries`, and `perf_relations`.

For each implicated procedure:

1. Prove the root collection bound, selected fields, serialized body volume, and worst representative row count.
1. Walk every nested `include`, `select`, mapper, enrichment, and secondary lookup. Record its independent bound and multiplicative cardinality.
1. Identify materialization copies: ORM result, enrichment maps, `Promise.all` arrays, serialization buffers, cached snapshots, and response clones.
1. Map which procedures a page starts together and which share one isolate. Separate required initial work from tab, scroll, or interaction work.
1. Check whether retries, duplicate plain/enriched endpoints, or client query behavior overlap the same data.

An unbounded response is a finding, not a way to declare discovery complete. Continue across every page journey because safe responses can still accumulate memory in a long-lived shared isolate.

If the provider names a likely route/procedure and source confirms the materializing path, mark `producingPathStatus: known` and remediate or leave the finding open. If attribution truly depends on unavailable external evidence, record one `blocked_external` dependency with the owner/system, exact action, and evidence needed.

## Remediate

Apply the smallest causal changes that reduce simultaneous live data:

- paginate root results and nested relations completely, compute bounded aggregates, or defer complete detail behind an explicit interaction; never add an arbitrary cap that drops required financial, workflow, or notification truth;
- narrow selects and remove duplicate enriched/plain materialization;
- batch with an explicit maximum and release references between batches;
- sequence or defer page procedures whose concurrency creates the shared-isolate peak;
- move a genuinely large bounded operation to a runtime with a measured suitable limit.

Do not treat a larger runtime limit, build-heap change, smaller client bundle, or one successful fresh-process request as root-cause closure.

## Verification and Closure

Before deployment, add deterministic tests for root and nested cardinality, response shape, authorization/tenancy, and the page request schedule. This is enough to make a producing-path fix deployable when the provider exposes no local peak-heap control.

After deployment, replay the same affected journey and representative fixture in the actual runtime:

1. Run every page and procedure in the affected journey and consume every response body.
1. Repeat the affected journey with representative overlapping requests in the actual runtime and include the original burst width when safe and authorized.
1. Record status, latency, response/body volume, provider event outcome, source/deployment identity, sample count, and memory metric when available.
1. Recheck provider alerts through the defined observation window. If peak heap remains unavailable, say so; rely on bounded-path tests, same-runtime outcomes, and provider non-recurrence only for the claims they support.

Closure requires `status: resolved`, a known producing path, a remediation receipt, deterministic root/nested cardinality coverage, all pages and procedures in the affected journey, representative overlapping requests, same-journey post-deployment actual-runtime results, and provider recurrence evidence. Provider peak heap and isolate identity can remain unavailable when named honestly; their absence does not block a verified producing-path fix.

Record whole-repository accumulated-process coverage separately from incident closure. Exercise every discovered page sequentially with response consumption and representative concurrency. If a managed runtime cannot prove process/isolate reuse, record `isolateIdentityUnavailableReason` and limit the claim to all-pages actual-runtime coverage.

Use this artifact shape under the performance category report:

```yaml
runtimeIncidents:
  - incidentId:
    evidenceKind: provider_runtime
    evidenceLabel:
    environment:
    symptom:
    status: open|blocked_external|resolved
    metricDomain: runtime_memory
    observedMetric: # omit when unavailable; never fabricate it
      name:
      value:
      unit:
    unavailableMetricReason: # required when no observedMetric exists
    producingPathStatus: known|unknown
    producingPath:
    concreteDependency: # required for blocked_external/unknown
      owner:
      action:
      evidenceNeeded:
    remediationReceipt: # required for resolved
      producingPath:
      change:
      correctnessGates:
      regressionGuard:
    cardinalityVerification: # required for resolved
      rootCollections:
      nestedRelations:
      regressionTest:
    runtimeVerification: # required for resolved
      scope: affected_journey
      pagesTotal:
      pagesExercised:
      proceduresTotal:
      proceduresExercised:
      responseBodiesConsumed: true
      overlappingRequests: true
      concurrencyLevels: [1, 4]
      actualRuntime: true
      postDeployment: true
      sameJourney: true
      providerRecurrenceChecked: true
      metricDomain: runtime_memory
      journeyGraphArtifact:
      outcomeEvidence:
      latencyEvidence:
      bodyVolumeEvidence:
      peakMemoryUnavailableReason:
wholeRepositoryRuntimeCoverage:
  scope: all_pages_accumulated
  pagesTotal:
  pagesExercised:
  responseBodiesConsumed: true
  concurrencyLevels: [1, 4]
  actualRuntime: true
  sharedIsolateObserved: false
  isolateIdentityUnavailableReason:
```
