---
id: eternal-saas-auth-tenancy
paths:
  - "packages/domain/**"
  - "packages/core-domain/**"
  - "apps/web/src/lib/auth/**"
globs:
  - "packages/domain/**"
  - "packages/core-domain/**"
  - "apps/web/src/lib/auth/**"
description: "Auth and tenant isolation: context helpers, Better-Auth, tenant-safe queries."
hosts: [claude, codex, cursor]
verify: "pnpm guard:all"
---

# Auth and Tenancy Rules

## Auth context by call site

| Call site | Function |
| --- | --- |
| Server Components | `getTenantContextFromAuth()` |
| oRPC Handlers | `ensureAuthenticatedContext(ctx)` |
| Client Components | `useSession()` |

Never share the same context helper across call sites — each has different availability and safety guarantees.

## Tenant isolation

Every DB query must filter `where: { tenantId }`. Queries that must span tenants require explicit review and must be named in the domain service contract.

Multi-location tenants also need `locationId` on most queries. Do not omit it to get "all locations" — use an explicit all-locations query instead.

## oRPC routes are public by default

Auth is handled inside each oRPC handler, not at the middleware level. Do not add auth to the proxy middleware matcher.

## Domain layer: throw exceptions

Domain code throws exceptions (not neverthrow — evaluated and not adopted, see project ADR). oRPC boundary converts domain exceptions to `ORPCError`.

## Soft deletes

Always include `deletedAt: null` in queries unless explicitly retrieving deleted records.

## verify

```bash
pnpm guard:all
```
