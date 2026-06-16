# Client Links

## RPCLink

```ts
import type { RouterClient } from "@orpc/server";
import { createORPCClient, createSafeClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

type ClientContext = { cache?: RequestCache };

const link = new RPCLink<ClientContext>({
  url: "/api/rpc",
  headers: ({ context }) => ({
    "x-cache-mode": context?.cache ?? "default",
  }),
  fetch: (request, init, { context }) =>
    fetch(request, { ...init, cache: context?.cache }),
});

export const client: RouterClient<typeof router, ClientContext> = createORPCClient(link);
export const safeClient = createSafeClient(client);
```

Use `safeClient` when a codebase defaults to tuple errors broadly. Use normal clients with `safe(...)` only at specific call sites when throwing remains the project default.

## Client Context

Client context can drive headers, methods, fetch options, and batching groups. If a context property is required, oRPC enforces that callers provide it.

## GET Requests

`RPCLink` defaults to `POST`. Override `method` only for safe reads and make sure the server route is marked `method: "GET"` because strict GET handling rejects unmarked GET calls.

## Contract Clients

```ts
import type { ContractRouterClient } from "@orpc/contract";

export const client: ContractRouterClient<typeof contract> = createORPCClient(link);
```

Use `inferRPCMethodFromContractRouter(contract)` when method must follow contract metadata.

## Other Links

- `OpenAPILink`: use against OpenAPI-compatible endpoints.
- WebSocket `RPCLink`: use for bidirectional or long-lived interactive connections.
- `DynamicLink`: switch between links based on runtime, region, tenant, or feature flag.

## Interceptors

Use client interceptors for error reporting, tracing, auth refresh, and request decoration. Avoid hiding failures behind silent fallback responses.
