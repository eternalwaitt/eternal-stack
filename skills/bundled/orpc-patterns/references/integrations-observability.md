# Integrations And Observability

## Server Actions

Use `.actionable()` for React Server Action compatibility and `.callable()` for local function-style server calls. Keep validation, auth, and typed errors in the procedure so all invocation paths share behavior.

## Better Auth

```ts
import { ORPCError } from "@orpc/server";

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({ headers: context.headers });
  if (!sessionData?.session || !sessionData?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      session: sessionData.session,
      user: sessionData.user,
    },
  });
});
```

If Better Auth's request headers plugin is in use, follow the project's established context field names.

## AI SDK

Use AI SDK v5+ with `streamToEventIterator`. Use `@orpc/ai-sdk` for `createTool`, `implementTool`, and typed tool metadata when procedures/contracts become AI SDK tools.

## OpenTelemetry

Install `@orpc/otel` and register `ORPCInstrumentation`. Server-only tracing is enough in many apps. Name middleware functions to make spans readable.

```ts
import { ORPCInstrumentation } from "@orpc/otel";

new ORPCInstrumentation();
```

## Sentry

Sentry can use the same OpenTelemetry instrumentation path. Configure tracing and error capture centrally; do not add ad hoc handler-level reporting everywhere.

## Pino

Use Pino integration or central interceptors for structured logs. Include procedure path, request ID, tenant/user identifiers when allowed, and status/error code. Redact secrets.

## React SWR And Pinia Colada

Official integrations exist. Prefer them over hand-rolled cache wrappers if a project uses SWR or Pinia Colada instead of TanStack Query.

## Rate Limit

`@orpc/experimental-ratelimit` supports in-memory, Redis, and Upstash-style adapters. Treat it as experimental and verify current docs before production changes.
