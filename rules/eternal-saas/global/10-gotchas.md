---
id: eternal-saas-global-gotchas
globs: ["**"]
description: "Top 15 cross-repo mistakes in the Eternal SaaS stack."
hosts: [claude, codex, cursor]
alwaysApply: false
---

# Top 15 Gotchas

Recurring mistakes from incident history. Enforcement guards named where they exist.

## 1. packages/api/ is deprecated

All new routers go in `apps/web/src/lib/orpc/routers/`. Never add to `packages/api/`.

## 2. DB migrations only — no push or seed wipes in production

Use `pnpm db:migrate`. `db:push`, force reset, and full-database seed wipes are forbidden in production. Acceptable only for explicitly listed seed account identities.

## 3. PgBouncer: never use `include: { _count }` on create/update

Triggers `startInternalTransaction` → 500 crash.
- `create`: hardcode zero counts in return value
- `update`: split into `update()` write + separate `findUnique()` read

## 4. Tenant isolation is mandatory on every query

All queries must filter `where: { tenantId }`. Use tenant-safe repositories. Multi-location tenants also need `locationId`. Enforced by `pnpm guard:tenant-safety`.

## 5. requireLimit sentinel: -1 means unlimited

Check is `maxAllowed !== -1 && currentCount >= maxAllowed`. Never simplify to bare `>=`.

## 6. oRPC error messages are i18n keys

`error.message` is `"errors.internal"`, not human text. Always use `getErrorMessage(error, t)` — never display `error.message` directly.

## 7. logger.ts is server-only

`@/lib/logger` imports server env — crashes in `"use client"` components. Use `@/lib/client-logger` instead.

## 8. useCallback / useMemo / memo are banned

React Compiler (React 19+) handles memoization. Adding manual memoization fights the compiler.

## 9. Button asChild Link pattern (WCAG 4.1.2)

```tsx
// CORRECT
<Button asChild><Link href="...">Label</Link></Button>

// WRONG — violates WCAG 4.1.2
<Link href="..."><Button>Label</Button></Link>
```

## 10. Zod output schema nullability must match Prisma

`String?` in Prisma → `z.string().nullable()` in Zod (not `.optional()`). Mismatch causes silent `errors.internal`.

## 11. DEFAULT_CURRENCY, not "BRL"

Use `DEFAULT_CURRENCY` from the shared-constants package everywhere. Never hardcode `"BRL"`.

## 12. next-intl v4 non-string params require double cast

```typescript
t("key", { count: 42 as unknown as string })
```

## 13. Upstash Redis is forbidden

Rate limiting is fail-open in-memory. Do NOT add `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or suggest Upstash.

## 14. Campaign data: no new direct Prisma access

Do not add new `prisma.campaign` callers. Use `PrismaCampaignRepository`. Enforced by `pnpm guard:campaign-access`.

## 15. pnpm catalog versions go in pnpm-workspace.yaml

Update dependency versions in `pnpm-workspace.yaml` (the catalog), not in individual `package.json` files.

## verify

```bash
pnpm guard:essential
```
