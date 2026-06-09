# oRPC Typesafe API Layer

oRPC (v1.12+) combines RPC with OpenAPI for end-to-end type-safe TypeScript APIs. Use Standard Schema validators (Zod, Valibot, Arktype). Vendored from the `orpc-patterns` companion skill and aligned with Eternal dual-API practice.

## Surface Selection

| Surface | Use for | Module |
| --- | --- | --- |
| oRPC | App client ↔ server, TanStack Query, SSE/streaming, internal mutations | This file |
| REST | Public APIs, webhooks, third-party integrations | `api.md` |
| Server Actions | Same-origin form posts with progressive enhancement | `eternal-best-practices` when installed |

Load `api.md` with this file when the task spans both internal oRPC and external REST.

## Project Layout

Organize by domain modules with paired contract and router files:

```text
src/
  index.ts                 # Hono/app + handler mount
  middlewares/
    auth-middleware.ts
  modules/
    contract.ts            # root barrel
    router.ts              # root barrel
    health/
      health.contract.ts
      health.router.ts
    user/
      user.contract.ts
      user.router.ts
```

Export root barrels as `{ health, user, ... }`.

## Contract-First

Define contracts before handlers. Routers implement contracts with TypeScript enforcement.

```ts
import { oc } from "@orpc/contract"
import { z } from "zod"

const userContract = oc.route({ tags: ["user"] }).errors({ UNAUTHORIZED: {} })

const searchUser = userContract
  .route({ method: "POST", path: "/user/search" })
  .input(z.object({ query: z.string() }))
  .output(z.array(userSchema))

export default { searchUser }
```

```ts
import { implement } from "@orpc/server"
import contract from "./user.contract"

const router = implement(contract).$context<{ headers: Headers }>()

const searchUser = router.searchUser
  .use(authMiddleware)
  .handler(async ({ input, context }) => { /* ... */ })

export default { searchUser }
```

## Procedures

```ts
import { os } from "@orpc/server"

const example = os
  .use(aMiddleware)
  .input(z.object({ name: z.string() }))
  .output(z.object({ id: z.number() }))
  .handler(async ({ input, context }) => ({ id: 1 }))
```

- `.handler` is required; `.input` and `.output` validate at the boundary.
- Set `.output` on hot paths to speed inference.
- Reuse bases: `const protectedProcedure = os.$context<Ctx>().use(authMiddleware)`.

## Middleware Stack Order (Mandatory)

Do not reorder this stack. Error handling stays outermost.

```ts
const myProcedure = os
  .use(withErrorHandling())          // 1 outermost — catches all downstream errors
  .use(withLogging("api.resource"))  // 2 request/response logs
  .use(withTracing())                // 3 OpenTelemetry parent span
  .use(requireAuth())                // 4 identity before rate limit / permission
  .use(rateLimitPreset("standard"))  // 5 per-user limits need identity
  .use(requirePermission(PERM))      // 6 authorization
  .input(Schema)                     // 7 validation
  .output(Schema)                    // 8 output validation
  .handler(async ({ input, context }) => { /* ... */ })
```

Pre-built bases:

```ts
export const publicProcedure = os
  .use(withErrorHandling())
  .use(withLogging("api.public"))
  .use(withTracing())

export const authenticatedProcedure = publicProcedure.use(requireAuth())
```

Auth middleware injects session user:

```ts
export const authMiddleware = os
  .$context<{ headers: Headers }>()
  .middleware(async ({ context, next }) => {
    const session = await auth.api.getSession({ headers: context.headers })
    if (!session) throw new ORPCError("UNAUTHORIZED")
    return next({ context: { ...context, user: session.user } })
  })
```

Input-aware guards stack after auth:

```ts
export const membershipGuard = os
  .$context<{ user: User }>()
  .middleware(async ({ context, next }, input: { uuid: string }) => {
    if (!await isMember(context.user.id, input.uuid)) throw new ORPCError("FORBIDDEN")
    return next()
  })
```

## Error Handling

```ts
import { ORPCError } from "@orpc/server"

throw new ORPCError("NOT_FOUND")
throw new ORPCError("BAD_REQUEST", { message: "Invalid input" })

const contract = oc.errors({
  RATE_LIMITED: { data: z.object({ retryAfter: z.number() }) },
})

const proc = implement(contract).handler(async ({ errors }) => {
  throw errors.RATE_LIMITED({ data: { retryAfter: 60 } })
})
```

On the client, use `safe()` and `isDefinedError()` for contract-typed errors. Map operational errors to stable codes; never leak stack traces in responses. Pair with `observability.md` for centralized error normalization.

## Hono Mount

```ts
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { Hono } from "hono"

const handler = new OpenAPIHandler(router, { /* plugins, interceptors */ })

const app = new Hono()
  .basePath("/api")
  .use("/rpc/*", async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix: "/api/rpc",
      context: { headers: c.req.raw.headers },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })
```

## TanStack Query

```ts
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

const orpc = createTanstackQueryUtils(client)

useQuery(orpc.user.search.queryOptions({ input: { query } }))
useMutation(orpc.vehicle.add.mutationOptions())

useInfiniteQuery(orpc.feed.list.infiniteOptions({
  input: (pageParam) => ({ cursor: pageParam, limit: 20 }),
  initialPageParam: undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
}))

queryClient.invalidateQueries({ queryKey: orpc.vehicle.key() })
```

Use cursor pagination from `api.md` for infinite queries.

## Event Iterator (SSE / Streaming)

```ts
import { eventIterator } from "@orpc/server"

const live = os
  .output(eventIterator(z.object({ message: z.string() })))
  .handler(async function* ({ signal }) {
    for await (const payload of publisher.subscribe("topic", { signal })) {
      yield payload
    }
  })
```

Use `EventPublisher` for typed pub/sub between handlers. Abort via `signal` on client disconnect.

## Client Links

```ts
import { RPCLink } from "@orpc/client/fetch"
import { createORPCClient } from "@orpc/client"

const link = new RPCLink({
  url: "http://localhost:3000/api/rpc",
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
})

export const client = createORPCClient(link)
```

WebSocket transport: `@orpc/client/websocket`. Add retry and batch links from `resilience.md` when calls cross unreliable networks.

## Procedure Thinness (Eternal Stack)

Keep procedures thin: validate → authorize → delegate to domain service → persist → return DTO.

- Domain rules live in entities/services, not in procedure handlers.
- Repositories enforce `tenantId` on every query when multi-tenant.
- No Prisma or framework imports inside domain packages.

Load `architecture.md` and `data.md` when adding a new domain module.

## 100/100 Checklist

Before marking an oRPC change complete, verify:

- [ ] Contract and router files exist per domain; root barrels export both.
- [ ] Contract defines `.errors()` for every user-visible failure mode.
- [ ] Middleware stack order matches the mandatory sequence above.
- [ ] `.input` and `.output` schemas are strict; unknown fields rejected.
- [ ] Auth runs before rate limit and permission checks.
- [ ] Tenant isolation enforced in repositories, not only in the procedure.
- [ ] `ORPCError` codes are stable; responses carry `requestId` when HTTP-mounted.
- [ ] TanStack Query keys use `orpc.*.key()` for invalidation after mutations.
- [ ] Streaming handlers honor `signal` and backpressure.
- [ ] Tracing middleware wraps every procedure in production routers.

Route Better Auth session flows through `better-auth`, tenancy through `tenant-isolation-patterns`, and stack-wide policy through `eternal-best-practices` when installed.
