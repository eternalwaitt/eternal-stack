# Backend Module Router

Match prompt signals to reference modules. Load the smallest set that covers the task.

| If the task involves… | Load |
| --- | --- |
| oRPC, typesafe RPC, `@orpc/*`, procedures, contract-first routers, TanStack Query hooks, event iterators, SSE streaming, Hono oRPC mount | `orpc.md` |
| REST/GraphQL contracts, status codes, pagination, versioning, idempotency keys, error envelopes, middleware order, edge rate limits, webhooks | `api.md` |
| Relational schemas, indexes, N+1 queries, transactions, repositories, cache-aside | `data.md` |
| Prisma schema, migrations, `schema.prisma`, Prisma Client, connection pooling, `$transaction` | `prisma.md` |
| Slow queries, EXPLAIN ANALYZE, missing indexes, query plans, `pg_stat_statements`, SQL tuning | `sql-optimization.md` |
| Authentication, authorization, RBAC/ABAC, input validation, secrets, OWASP gaps | `security.md` |
| Timeouts, retries, backoff/jitter, circuit breakers, bulkheads, distributed rate limits, DLQs | `resilience.md` |
| Structured logs, tracing, RED metrics, SLI/SLO, health checks, centralized errors | `observability.md` |
| Service layers, microservice boundaries, events, outbox, CQRS, sagas, bounded contexts | `architecture.md` |

## Common Pairs

- New typesafe app endpoint: `orpc.md` + `security.md` (+ `architecture.md` when adding a domain)
- New public REST or webhook: `api.md` + `security.md`
- Dual-stack product (app + partners): `orpc.md` + `api.md` + `security.md`
- New domain service: `architecture.md` + `data.md`
- Prisma schema or migration work: `data.md` + `prisma.md`
- Slow Prisma or SQL endpoint: `sql-optimization.md` + `prisma.md` (+ `data.md` when repository shape is in scope)
- Async worker or queue consumer: `architecture.md` + `resilience.md`
- Production hardening pass: `resilience.md` + `observability.md`

## Anti-Patterns

- Do not load all nine modules for a narrow question (for example, only pagination design).
- Do not implement oRPC procedures with only `api.md`; load `orpc.md`.
- Do not use this router for security audits of existing code; route those to `etrnl-audit-security`.
