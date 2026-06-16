---
name: orpc-patterns
description: Provides oRPC 1.x TypeScript API architecture and implementation rules, refreshed for v1.14+. Use when building, reviewing, or modifying code that imports @orpc/*, mentions oRPC, type-safe RPC, OpenAPI-backed RPC contracts, RPC procedures, server route handlers, Hono/Next.js/TanStack Start adapters, TanStack Query clients, React Server Actions, AI SDK tools or streams, Better Auth middleware, WebSocket or event iterator features, file upload/download, CORS, observability, or oRPC security and migration decisions.
---

# oRPC Patterns

Use this skill to build and review oRPC APIs with current v1.14+ patterns. Defaults to the project's existing oRPC layout before introducing new folders or abstractions.

## Workflow

1. Inspect existing `@orpc/*` imports, router/context/client helpers, and package boundaries.
2. Pick direct procedures or contract-first based on the decision guide.
3. Load only the relevant reference file below.
4. Implement with project-standard schemas, auth, errors, and logging.
5. Verify with the repo's typecheck/tests and, for version-sensitive work, check current oRPC docs or npm release notes.

## Fast Decision Guide

- Need typed TypeScript calls only: use direct `os` procedures and a router.
- Need OpenAPI, public clients, SDK generation, or cross-team contracts: use `@orpc/contract` plus `implement(...).router(...)`.
- Need Next.js form mutations or server functions: use Server Actions with `.actionable()` where appropriate.
- Need React data fetching: use `@orpc/tanstack-query` utilities; do not invent custom query keys unless the project needs cache partitioning.
- Need streaming: use Event Iterator, WebSocket, or AI SDK stream helpers based on transport and client needs.
- Need non-TypeScript or hard multi-language guarantees: compare OpenAPI output, ConnectRPC, GraphQL, or TypeSpec before assuming oRPC is enough.
- Need generated clients from existing specs: check whether router-to-contract or OpenAPI-to-contract fits before hand-writing duplicate contracts.

## Current Imports

```ts
import { oc } from "@orpc/contract";
import { createORPCClient, createSafeClient, isDefinedError, safe } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { ORPCError, implement, os } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
```

Use `OpenAPIHandler` from `@orpc/openapi/fetch` only when serving OpenAPI-compatible endpoints or OpenAPI reference/spec workflows. For normal RPC clients, default to `RPCHandler`.

## Baseline Procedure Pattern

```ts
import { ORPCError, os } from "@orpc/server";
import * as z from "zod";

const base = os.$context<{ headers: Headers }>();

const requireUser = base.middleware(async ({ context, next }) => {
  const user = await getUserFromHeaders(context.headers);
  if (!user) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user } });
});

export const protectedProcedure = base.use(requireUser);

export const createProject = protectedProcedure
  .input(z.object({ name: z.string().min(1) }))
  .output(z.object({ id: z.string(), name: z.string() }))
  .errors({
    NAME_TAKEN: { data: z.object({ name: z.string() }) },
  })
  .handler(async ({ input, context, errors }) => {
    if (await projectNameExists(input.name, context.user.id)) {
      throw errors.NAME_TAKEN({ data: { name: input.name } });
    }

    return createProjectForUser(context.user.id, input);
  });
```

Rules:

- Validate inputs at every external boundary.
- Add `.output(...)` on public or shared procedures to document shape and improve inference stability.
- Throw `ORPCError` or contract-defined typed errors, not string literals or opaque generic errors.
- Put auth and permission checks in middleware or procedure-local guards close to the handler.
- Stack middleware intentionally; deduplication only works when router middleware is a leading subset in the same order.
- Keep cross-package routers/contracts in a shared package only when multiple apps consume them; otherwise colocate by domain.

## References

Load only the reference needed for the task:

- `references/version-notes.md`: checked version, source links, and refresh rules.
- `references/getting-started.md`: prerequisites, installs, first router/server/client.
- `references/procedures.md`: direct `os` procedures, routes, outputs, errors, callable/actionable.
- `references/middleware-context.md`: context, auth, guards, middleware order, lifecycle hooks.
- `references/contracts.md`: `oc`, `implement`, `.router`, router-to-contract, OpenAPI-to-contract.
- `references/handlers-adapters.md`: `RPCHandler`, `OpenAPIHandler`, HTTP and framework adapters.
- `references/client-links.md`: `RPCLink`, `OpenAPILink`, WebSocket, dynamic links, safe clients.
- `references/tanstack-query.md`: query utilities, defaults, keys, hydration, conditional queries.
- `references/plugins-security.md`: CORS, validation, batching, retry, CSRF, strict GET, body limits.
- `references/streaming-files-serialization.md`: Event Iterator, AI streams, files, serializers.
- `references/integrations-observability.md`: Server Actions, Better Auth, AI SDK, OTel, Sentry, Pino.
- `references/testing-monorepo.md`: testing, mocking, project references, package boundaries.
- `references/migrations-cookbook.md`: tRPC, REST/OpenAPI, server-actions, and common recipes.
