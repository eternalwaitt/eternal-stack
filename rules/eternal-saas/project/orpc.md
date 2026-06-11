---
id: eternal-saas-orpc
paths:
  - "apps/web/src/lib/orpc/**"
globs:
  - "apps/web/src/lib/orpc/**"
description: "oRPC route patterns: middleware order, auth context, error handling, deprecated packages."
hosts: [claude, codex, cursor]
verify: "pnpm guard:essential"
---

# oRPC Rules

## packages/api/ is deprecated

All new routers go in `apps/web/src/lib/orpc/routers/`. Never create routes in `packages/api/`.

## Middleware order

Always this sequence:

```text
rateLimitPreset() → requirePermission() → requireFeature() → requireLimit() → auditMiddleware()
```

Rate limit BEFORE permission. All mutation routes need `requireFeature()` and/or `requireLimit()` for plan enforcement.

## requireLimit sentinel

`-1` means unlimited. Check is `maxAllowed !== -1 && currentCount >= maxAllowed`. Never simplify to bare `>=`.

## Auth context by call site

| Call site | Function |
| --- | --- |
| Server Components | `getTenantContextFromAuth()` |
| oRPC Handlers | `ensureAuthenticatedContext(ctx)` |
| Client Components | `useSession()` |

## Error messages are i18n keys

`error.message` is `"errors.internal"`, not human text. Always use `getErrorMessage(error, t)` from `@/lib/error-utils` — never display `error.message` directly.

## Shared schemas

Do not redefine schemas across routers. Import shared input/output schemas from the routers' shared-schemas file.

## Standards doc

Create `docs/standards/ORPC_ROUTE_STANDARDS.md` in the target project to document oRPC route patterns and conventions for this codebase.

## verify

```bash
pnpm guard:essential
```
