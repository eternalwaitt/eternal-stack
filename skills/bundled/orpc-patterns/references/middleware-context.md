# Middleware And Context

## Context Types

```ts
import { os } from "@orpc/server";

type InitialContext = { headers: Headers };
type AuthContext = { user: User; session: Session };

export const base = os.$context<InitialContext>();
```

Initial context comes from the adapter/handler call. Middleware can add execution context for downstream middleware and handlers.

## Auth Middleware

```ts
import { ORPCError } from "@orpc/server";

export const requireAuth = base.middleware(async ({ context, next }) => {
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

export const protectedProcedure = base.use(requireAuth);
```

## Input-Aware Guards

When a guard depends on input, place it after `.input(...)` or use the middleware input mapping pattern supported by the project. Keep permission checks close to the handler they protect.

```ts
export const updateProject = protectedProcedure
  .input(z.object({ projectId: z.string(), name: z.string() }))
  .use(async ({ input, context, next }) => {
    const allowed = await canEditProject(context.user.id, input.projectId);
    if (!allowed) throw new ORPCError("FORBIDDEN");
    return next();
  })
  .handler(async ({ input }) => updateProject(input));
```

## Ordering And Dedupe

- Middleware runs in the order it is chained.
- Router middleware can be deduped only when it is a leading subset of procedure middleware in the same order.
- Name middleware used with OpenTelemetry so spans are readable.

## Lifecycle Hooks

Use oRPC lifecycle helpers/interceptors such as start, success, error, and finish handling for logging, metrics, and cleanup. Prefer central interceptors for cross-cutting concerns over handler-local logging.
