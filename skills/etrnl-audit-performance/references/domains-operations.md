# Capacity, delivery, background work and builds

Discover topology from deploy manifests, infrastructure definitions, process commands, schedules, queues, storage and external systems. Include non-web and non-Vercel applications. Unknown topology is a blocker, never an empty worklist proving absence.

| Receipts | Investigation / evidence | Remediation and verification |
| --- | --- | --- |
| delivery.cdn-compression / assets | Actual response headers, cache status, encoding, transfer sizes, asset origins and invalidation. | Versioned assets, compression and cache policy; compare real responses and freshness. |
| delivery.placement / network-io | Client/server/database regions, DNS/TLS/connect/TTFB/body phases, packet loss and storage/network waits. | Reduce causal round trips or relocate supported work; replay regional cohorts. |
| load.traffic-mix / smoke | Sanitized authenticated journeys with weights, data scale and arrival model; correctness first. | Verify target identity and fixture cleanup before increasing offered load. |
| load.steady / stress / spike / soak | Each mode has its own receipt: stable load, increasing saturation, abrupt burst, sustained retention respectively. Record duration, offered/completed requests, p50/p95/p99, throughput, errors and time-series resources. | Compare same traffic and infrastructure; identify degradation cause and recovery. Never infer soak from a brief burst. |
| load.headroom / autoscaling | Saturation knee, queue delay, resource limits, scaling lag/cold-start and recovery. | Define operating range from observed SLO crossing and recovery; no universal safe percentage. |
| load.generator | Generator CPU/network, dropped iterations, achieved arrivals and pacing. Open arrival models avoid the load taper of closed loops under slowdown. | Increase generator capacity or limit claims; retain tool config and raw series. |
| background.queues / backpressure | Arrival/service rate, oldest-message age, retries, dead letters and worker concurrency. | Bound backlog, batch or backpressure; verify ordering/idempotency and overload recovery. |
| background.scheduled-jobs | Overlapping cron, fanout, locks and interactive workload contention. | Stagger or bound work; replay overlap and cancellation. |
| build.cpu / memory / incremental-cache | Phase timing, CPU profile, peak heap/RSS, cold/incremental cache and compiler graph. | Load `typescript-build-memory.md` for observed failures. Never hide type checks or confuse build resources with server memory. |
| platform.provider-signals / resource-limits | Correct project/account, deployment revision, incident history, memory/CPU throttling, quotas and recurrence window. | Correlate producing route/job with limits; preserve runtime-memory incident closure requirements. |

Load execution requires an explicitly authorized target and scope. Default audit is read-only: prepare the scenario and name the missing load authorization; never run production load tests automatically. Before any execution record target/environment, duration, max concurrency/rate, abort latency/error/resource thresholds, cleanup and owner. Abort on threshold breach; an aborted experiment is partial evidence. Do not fabricate p99 confidence from a small sample.

For Vercel, a compatible Optimize contributor collects scoped production signals. CLI authentication, linked project and observability entitlement are separate dependencies. No account linking, purchase, deploy or global installation is implied. Missing entitlement limits provider coverage; built-in runtime and source investigations still run.

Primary references: [k6 arrival models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/), [abort thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/), [Vercel Optimize source](https://github.com/vercel-labs/agent-skills/tree/main/skills/vercel-optimize).
