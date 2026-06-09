---
name: etrnl-backend-resilience
description: ETRNL backend resilience reference. Use when adding timeouts, retries with backoff, circuit breakers, bulkheads, distributed rate limiting, or background jobs with dead-letter queues.
---
# Backend Resilience

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-backend-resilience`; on update, ask update/snooze/continue.

Assume every dependency fails, slows, or duplicates. Bound every wait, cap every retry, and isolate every failure so one slow dependency never sinks the service.

## Timeouts

- Set an explicit timeout on every network call. An unbounded wait is a latent outage.
- Budget timeouts down the call chain: the caller's deadline must exceed the sum of downstream deadlines plus retries.

## Retry With Backoff

Retry only idempotent or idempotency-keyed operations. Use exponential backoff with full jitter and a hard attempt cap. Capture each outcome by chaining on the promise so the helper stays a plain loop.

```ts
async function retry<T>(op: () => Promise<T>, max = 3): Promise<T> {
  let attempt = 0
  while (true) {
    const outcome = await op().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    )
    if (outcome.ok) return outcome.value
    attempt += 1
    if (attempt >= max || !isRetryable(outcome.error)) throw outcome.error
    const base = 100 * 2 ** (attempt - 1)
    await sleep(Math.random() * base)               // full jitter
  }
}
```

## Circuit Breaker

Stop calling a failing dependency so it recovers and callers fail fast.

- Closed: pass through, count failures.
- Open: after a failure threshold, short-circuit for a cooldown and return a fallback.
- Half-open: allow a probe; close on success, reopen on failure.

## Bulkhead

Cap concurrency per dependency with a semaphore so one saturated pool never starves the others. Give critical paths their own pool, separate from batch work.

## Distributed Rate Limiting

Hold limits in a shared store so they bind across instances. Run a token-bucket or sliding-window counter in Redis with an atomic script.

```lua
-- token bucket: KEYS[1]=bucket ARGV[1]=rate ARGV[2]=now ARGV[3]=cost
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[1])
local ts = tonumber(b[2]) or tonumber(ARGV[2])
tokens = math.min(tonumber(ARGV[1]), tokens + (ARGV[2]-ts)*tonumber(ARGV[1]))
if tokens < tonumber(ARGV[3]) then return 0 end
redis.call('HMSET', KEYS[1], 'tokens', tokens-tonumber(ARGV[3]), 'ts', ARGV[2])
return 1
```

Pair this with edge throttling from `etrnl-backend-api`.

## Background Jobs And Dead-Letter Queues

- Move slow or failure-prone work off the request path into a queue. Make every consumer idempotent.
- Cap retries per message; route exhausted messages to a dead-letter queue with the failure cause.
- Alert on DLQ depth and drain it with a documented replay path.

Route event and queue topology through `etrnl-backend-architecture`.
