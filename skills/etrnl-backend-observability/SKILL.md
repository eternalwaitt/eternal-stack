---
name: etrnl-backend-observability
description: ETRNL backend observability reference. Use when adding structured logging, distributed tracing, metrics, SLI and SLO definitions, health checks, or centralized error handling.
---
# Backend Observability

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-backend-observability`; on update, ask update/snooze/continue.

Make the running system explain itself. Emit structured signals keyed to a request id so any failure traces back to one line and one span.

## Structured Logging

- Log JSON, one event per line. Include `timestamp`, `level`, `requestId`, `service`, and the event fields.
- Propagate a request id from edge middleware through every downstream call and log line.
- Redact secrets and PII before serialization. Log decisions and state transitions, not raw payloads.

```ts
log.info({ event: "market_created", requestId, marketId, actorId, latencyMs })
```

## Distributed Tracing

- Open a span at the edge and a child span per outbound call. Carry the trace context across service and queue hops.
- Tag spans with the resource id, status, and error flag. Sample heavily in development, sparsely in production with tail-based capture of errors.

## Metrics

Emit the four signals that drive alerts:

- Rate: requests per second per route.
- Errors: 5xx and 4xx counts per route.
- Duration: latency histogram, read p50/p95/p99.
- Saturation: pool, queue, and connection utilization.

Use counters for totals, histograms for latency, gauges for live levels. Keep label cardinality bounded.

## SLI And SLO

- Define an SLI as a ratio of good events to valid events (requests under 300 ms, responses without 5xx).
- Set an SLO target and an error budget. Drive alerts off budget burn rate, not raw thresholds.
- Page on fast burn; ticket on slow burn.

## Health Checks

- Expose `/health/live` for process liveness and `/health/ready` for dependency readiness.
- Make readiness check the database, cache, and critical upstreams with short timeouts. Fail readiness to drain traffic without killing the process.

## Centralized Error Handling

Normalize every error in one place so logs, the response envelope, and metrics stay consistent.

```ts
function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500
  log.error({ event: "request_error", requestId: req.id, code: err.code, status, msg: err.message })
  res.status(status).json({ error: { code: err.code ?? "internal_error", message: publicMessage(err), requestId: req.id } })
}
```

- Distinguish operational errors (expected, mapped to 4xx) from programmer errors (unexpected, mapped to 500 with a generic body).
- Pair the envelope here with the contract in `etrnl-backend-api`.
