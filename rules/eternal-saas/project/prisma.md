---
id: eternal-saas-prisma
paths:
  - "packages/db/**"
  - "packages/core-domain/**"
  - "apps/web/src/modules/**"
globs:
  - "packages/db/**"
  - "packages/core-domain/**"
  - "apps/web/src/modules/**"
description: "Prisma/DB rules: tenant isolation, PgBouncer crash, transactions, soft deletes, schema changes."
hosts: [claude, cursor]
verify: "pnpm guard:all"
---

# Prisma / Database Rules

## Tenant isolation (BLOCKER)

Every query must include `tenantId`. Use tenant-safe repositories from the core-domain package. Multi-location tenants also need `locationId` on most queries. `pnpm guard:tenant-safety` enforces this.

```typescript
// CORRECT
const clients = await clientRepository.findMany(tenantId, { where: { name: 'John' } })

// WRONG — exposes all tenant data
const clients = await prisma.client.findMany({ where: { name: 'John' } })
```

## PgBouncer crash: never use `include: { _count }` on write ops

`include: { _count }` on `create`/`update` triggers `startInternalTransaction` → 500 crash in transaction-mode PgBouncer.

```typescript
// CORRECT: create — hardcode zero counts
return { ...record, _count: { items: 0 } }

// CORRECT: update — split into write + separate read
await prisma.record.update({ where: { id }, data })
return await prisma.record.findUnique({ where: { id }, include: { _count: true } })
```

## Zod nullability must match Prisma

`String?` in Prisma → `z.string().nullable()` in Zod (not `.optional()`). Mismatch causes silent `errors.internal`.

## Transactions

Use `$transaction()` for any multi-step operation.

## Campaign data

Never use `prisma.campaign` directly in app code. Use `PrismaCampaignRepository` only. `pnpm guard:campaign-access` blocks regressions.

## Soft deletes

Always include `deletedAt: null` to exclude soft-deleted records.

```typescript
// CORRECT
const clients = await findManyForTenant(prisma.client, tenantId, { deletedAt: null })

// WRONG — includes deleted records
const clients = await findManyForTenant(prisma.client, tenantId, {})
```

## Schema changes

Run `pnpm db:generate:all` (not `db:generate`) after ANY Prisma schema change.

## Migrations only

- Development: `pnpm db:push` (local only)
- Production: `pnpm db:migrate`

NEVER run `db:push` in production. `migrate reset`, force reset, and full-database seed wipes are forbidden except for explicitly listed seed account identities.

## verify

```bash
pnpm guard:all
```
