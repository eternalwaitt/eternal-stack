# Runtime, requests and caching

Activate for servers, functions, CLI workloads and long-lived processes in any language. Inventory route registrations, RPC, middleware, serializers, uploads/downloads, workers, caches and external calls; reconcile source routes against runtime manifests. Expand immutable worklists with a new hash when following producing paths. A filename scan is only a seed.

| Receipts | Evidence required | Causal experiment and guard |
| --- | --- | --- |
| runtime.cpu / saturation | CPU profile with hot stacks; utilization, request CPU, throttling and offered/completed load at the same time. | Reduce hot algorithm/materialization work; compare CPU per operation and tail latency. |
| runtime.event-loop / thread-pool | Event-loop delay/utilization, synchronous span duration, pending work and pool contention. | Bound synchronous work, batch or offload measured CPU; verify worker overhead and queue growth. |
| runtime.gc | Allocation rate, GC count/duration and pause distribution correlated with requests. | Reduce temporary allocation or retained live set; compare pauses and throughput. |
| runtime.heap-retention / native-rss | Repeated journeys in the same process, quiescent retained heap slope, dominator/retainer paths, RSS/external/native memory and cache growth. | Bound caches and lifetimes; repeat sequential, concurrent and soak workload. RSS growth alone does not prove a JS leak. |
| runtime.handles-io | File descriptors, sockets/connections, disk/network throughput, waits and error counts. | Close resources, bound parallelism; replay resource acquisition/release cycles. |
| runtime.cold-start / concurrency | Distinguish fresh process, empty cache, warm process and dev compilation; overlap representative journeys. | Optimize initialization or limits; preserve same isolate identity and load conditions. |
| cache.keys-invalidation / capacity | Vary tenant, viewer, locale, permissions and flags; measure hit/miss/eviction and retained bytes. | Bound size/TTL, correct invalidation and key semantics; cross-viewer correctness tests. |
| cache.stampede / coalescing | Coordinated misses/expiry, upstream request counts and waiter latency. | Single-flight with cancellation/error cleanup, jitter or stale policy; burst and failure replay. |
| requests.route-coverage | Every manifest route, method and critical authenticated/dynamic journey: status, redirects, consumed body bytes, cold/warm distributions. | Fix producing route; persist complete matrix and budgets, including blocked fixtures. |
| requests.waterfalls / serialization | Correlated request graph including deferred tabs/scroll, remote latency, encode/decode and materialization. | Parallelize independent work; bound serialized relations and avoid duplicate enrichment. |
| requests.external-retries | Dependency latency, timeouts, attempt count, backoff, request amplification and cancellation. | Retry budget/circuit breaking with idempotency; inject timeout and recovery locally. |

Node examples: `node --cpu-prof app.mjs`, `node --trace-gc app.mjs`, `monitorEventLoopDelay`, `performance.eventLoopUtilization`, `process.memoryUsage`. Select equivalent .NET, JVM, Python, Go or native profilers for the discovered runtime. Linux perf is not a Windows prerequisite; use supported runtime profiles or ETW. Profiling overhead belongs in conditions. Heap snapshots can pause/exhaust the process and contain secrets: collect on an authorized replica, restrict access, sanitize retained evidence.

Use the existing `runtime-memory-incidents.md` without weakening any provider incident rule. Known OOMs remain findings even when attribution tooling is unavailable. Build memory and browser memory never close server incidents.

Primary references: [Node diagnostics](https://nodejs.org/en/learn/diagnostics/flame-graphs), [perf_hooks](https://nodejs.org/api/perf_hooks.html), [memoryUsage](https://nodejs.org/api/process.html#processmemoryusage).
