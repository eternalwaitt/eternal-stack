# Getting Started

## Prerequisites

- Node.js 18+ works; Node.js 24+ is default for new projects.
- Bun, Deno, and Cloudflare Workers are supported through adapters.
- TypeScript strict mode is documented.
- oRPC supports Zod, Valibot, Arktype, and any Standard Schema implementation.

## Install

```sh
pnpm add @orpc/server @orpc/client
```

Add opt-in packages only when needed:

```sh
pnpm add @orpc/contract @orpc/openapi @orpc/tanstack-query @orpc/otel
```

## First Router

```ts
import { ORPCError, os } from "@orpc/server";
import * as z from "zod";

const Planet = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().optional(),
});

export const router = {
  planet: {
    list: os
      .input(z.object({ cursor: z.number().int().min(0).default(0) }))
      .output(z.array(Planet))
      .handler(async ({ input }) => listPlanets(input.cursor)),

    create: os
      .$context<{ headers: Headers }>()
      .use(async ({ context, next }) => {
        const user = await getUser(context.headers);
        if (!user) throw new ORPCError("UNAUTHORIZED");
        return next({ context: { user } });
      })
      .input(Planet.omit({ id: true }))
      .output(Planet)
      .handler(async ({ input, context }) => createPlanet(context.user.id, input)),
  },
};
```

## First Server

```ts
import { RPCHandler } from "@orpc/server/fetch";

const handler = new RPCHandler(router);

export async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { headers: request.headers },
  });

  return response ?? new Response("Not Found", { status: 404 });
}
```

## First Client

```ts
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const link = new RPCLink({ url: "/api/rpc" });

export const client: RouterClient<typeof router> = createORPCClient(link);
```
