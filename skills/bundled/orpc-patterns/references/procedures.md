# Procedures

## Core Builder

Use `os` from `@orpc/server` for direct service-first procedures.

```ts
import { ORPCError, os } from "@orpc/server";
import * as z from "zod";

export const findProject = os
  .route({ method: "GET", path: "/projects/{id}" })
  .input(z.object({ id: z.string() }))
  .output(Project)
  .errors({
    NOT_FOUND: { data: z.object({ id: z.string() }) },
  })
  .handler(async ({ input, errors }) => {
    const project = await db.project.find(input.id);
    if (!project) throw errors.NOT_FOUND({ data: { id: input.id } });
    return project;
  });
```

## Rules

- `.handler(...)` is the only required step.
- `.input(...)` validates external input.
- `.output(...)` is documented for public/shared APIs and inference stability.
- `.route(...)` matters for OpenAPI and GET/POST semantics.
- `.errors(...)` gives clients typed error branches.
- Throw `ORPCError` or `errors.CODE(...)`, not string literals.

## Callable And Actionable

```ts
export const createProject = os
  .input(CreateProjectInput)
  .handler(async ({ input }) => createProject(input))
  .callable()
  .actionable();
```

- Use `.callable()` when server-side code must call the procedure like a local function.
- Use `.actionable()` when React Server Actions or framework server functions must call it.
- Keep auth, validation, and errors in the procedure chain so RPC and action callers share behavior.

## Route Methods

- Use `GET` only for safe reads.
- Mutations must stay `POST`, `PUT`, `PATCH`, or `DELETE`.
- `RPCHandler` with the HTTP adapter enables strict GET handling by default; procedures must explicitly opt into GET.

## Output Validation

For direct procedures, output schemas document and validate server responses. For contract-first clients, request/response validation plugins can use the contract schemas at the link layer.
