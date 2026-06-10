# Handlers And Adapters

## Handler Choice

- `RPCHandler`: default for oRPC RPC clients.
- `OpenAPIHandler`: use for OpenAPI-compatible HTTP surfaces and OpenAPI reference/spec workflows.

## Fetch/HTTP Handler

```ts
import { RPCHandler } from "@orpc/server/fetch";

const handler = new RPCHandler(router, {
  plugins: [],
  interceptors: [],
});

const { response } = await handler.handle(request, {
  prefix: "/api/rpc",
  context: { headers: request.headers },
});
```

The Node HTTP adapter uses `@orpc/server/node`; fetch-compatible frameworks use `@orpc/server/fetch`.

## Hono

```ts
import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/fetch";

const handler = new RPCHandler(router);

export const app = new Hono()
  .basePath("/api")
  .use("/rpc/*", async (c, next) => {
    const { response } = await handler.handle(c.req.raw, {
      prefix: "/api/rpc",
      context: { headers: c.req.raw.headers },
    });

    if (response) return c.newResponse(response.body, response);
    return next();
  });
```

If Hono body parsing runs before oRPC, request bodies can become unavailable. Keep body-reading middleware after or outside the oRPC route.

## Next.js

Use a catch-all route and export `GET`/`POST` handlers. Build context from the `Request`, not scattered globals.

## TanStack Start

Use the Start server route API and pass the route `request` into `RPCHandler.handle(...)`.

## Adapter Map

Official docs cover HTTP/fetch, WebSocket, MessagePort, Astro, Browser, Electron, Elysia, Express, Fastify, H3, Hono, Next.js, Nuxt, React Native, Remix, Solid Start, SvelteKit, TanStack Start, Web Workers, and Worker Threads. Pick the adapter matching the runtime and test streaming/batching on that runtime.

## OpenAPI Surface

When serving OpenAPI, decide whether docs/spec routes are public. Protect OpenAPI reference UI in production unless it is intentionally part of the public API.
