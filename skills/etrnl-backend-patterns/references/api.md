# Backend API Design

REST and GraphQL contracts for public and third-party surfaces. For typesafe app-client APIs (oRPC, TanStack Query, streaming), load `orpc.md` instead or alongside this file.

## API Surface Selection

| Surface | Use for | Module |
| --- | --- | --- |
| oRPC | Internal app client ↔ server, typed hooks, SSE | `orpc.md` |
| REST / GraphQL | Public APIs, webhooks, partner integrations | This file |
| Server Actions | Same-origin form mutations (Next.js App Router) | `eternal-best-practices` when installed |

When the prompt names procedures, `@orpc/*`, or typesafe RPC, load `orpc.md` first. When it names webhooks, OpenAPI consumers, or REST versioning, stay on this file.

Design the contract first. Treat the URL, status code, body shape, and error envelope as a public interface that outlives the implementation.

## Resource Modeling

- Map one noun to one resource collection. Use plural nouns and hierarchy for ownership.
- Reserve verbs for actions that do not map to CRUD; expose them as sub-resources (`POST /orders/:id/refunds`).
- Keep filtering, sorting, and pagination in query params, never in the path.

```text
GET    /api/markets            list
GET    /api/markets/:id        read
POST   /api/markets            create
PUT    /api/markets/:id        replace
PATCH  /api/markets/:id        partial update
DELETE /api/markets/:id        remove
GET    /api/markets?status=active&sort=volume&limit=20&cursor=abc123
```

## Status Codes

- Return 200 for reads, 201 with a `Location` header for creates, 204 for deletes with no body.
- Return 400 for malformed input, 401 for missing auth, 403 for denied auth, 404 for absent resources, 409 for conflicts, 422 for semantic validation failures, 429 for throttling.
- Map 5xx to internal faults only. Never leak a stack trace in the body.

## Idempotency

Require an `Idempotency-Key` header on every non-read that moves money, sends messages, or triggers external side effects. Store the key with the first response and replay it on retries.

```ts
async function withIdempotency(key: string, op: () => Promise<Result>) {
  const prior = await store.get(key)
  if (prior) return prior
  const result = await op()
  await store.set(key, result, { ttlSeconds: 86_400 })
  return result
}
```

## Pagination

Standardize on cursor pagination for any collection that grows. Offset pagination breaks under concurrent writes and scans large tables.

- Return `{ data, nextCursor }`. Encode the cursor from a stable sort key plus a tie-breaker id.
- Cap `limit` server-side. Reject `limit` above the cap with 400.

## Versioning

- Pin the contract with a URI segment (`/api/v1/...`) or an `Accept` version header. Hold one scheme per service.
- Add fields without a version bump. Remove or repurpose fields only behind a new version.

## Error Envelope

Return one stable shape for every error so clients parse failures uniformly.

```json
{ "error": { "code": "market_closed", "message": "Market is closed", "requestId": "req_123" } }
```

- Use a machine `code` that stays fixed across wording changes. Put human text in `message`.
- Echo a `requestId` that ties back to a log line.

## Middleware Order

Fix the chain so cross-cutting concerns run in a known sequence:

1. Request id and trace context.
2. Structured access log open.
3. Body size limit and content-type checks.
4. Authentication.
5. Rate limit.
6. Authorization.
7. Input validation.
8. Handler.
9. Error normalizer to the envelope above.

## Edge Rate Limiting

Throttle at the boundary before auth-heavy work runs. Use a token bucket per principal plus one per IP. Return 429 with `Retry-After`. Move shared counters to `resilience.md` when limits span instances.

Route auth, money, and tenancy endpoints through `eternal-best-practices` and `better-auth` when installed.
