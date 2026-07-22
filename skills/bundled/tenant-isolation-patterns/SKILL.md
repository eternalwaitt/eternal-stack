---
name: tenant-isolation-patterns
description: "Multi-tenant data isolation rules for agency-tbd - every Prisma query must be scoped to the current tenant to prevent cross-tenant data leaks"
version: 1.0.0
source: unknown
category: backend
tags: [prisma, tenantId, multi-tenant, saas, data-isolation, agency-tbd, security, database, critical]
---
# Tenant Isolation Patterns - agency-tbd

## Purpose

Enforce strict per-tenant data isolation in every database query. Missing a `tenantId` filter is a data leak - it exposes one customer's data to another. This is the highest-priority correctness rule in the codebase.

## The Rule

**Every Prisma query MUST include `where: { tenantId: ctx.tenantId }` - no exceptions.**

## How `tenantId` Reaches the Handler

The `requirePermission()` middleware resolves the authenticated user's tenant and injects `ctx.tenantId` automatically. It is always present inside any handler that uses `requirePermission`. Never derive `tenantId` from user input - always use `ctx.tenantId`.

```typescript
.use(requirePermission('resource:read'))
.handler(async ({ ctx }) => {
  // ctx.tenantId is guaranteed here - use it in every query
});
```

## Correct Pattern

```typescript
// Single record
const campaign = await prisma.campaign.findFirst({
  where: {
    id: input.id,
    tenantId: ctx.tenantId,
  },
});

// Multiple records
const campaigns = await prisma.campaign.findMany({
  where: { tenantId: ctx.tenantId },
});

// Create - always attach tenantId
const deal = await prisma.deal.create({
  data: {
    ...input,
    tenantId: ctx.tenantId,
  },
});

// Update - scope the lookup before updating
const updated = await prisma.campaign.update({
  where: {
    id: input.id,
    tenantId: ctx.tenantId,
  },
  data: { name: input.name },
});
```

## Wrong Patterns - Data Leaks

```typescript
// WRONG - returns records from ALL tenants
const campaigns = await prisma.campaign.findMany();

// WRONG - fetches by id alone; any tenant's record is accessible
const campaign = await prisma.campaign.findUnique({
  where: { id: input.id },
});

// WRONG - trusting user-supplied tenantId from input
const campaigns = await prisma.campaign.findMany({
  where: { tenantId: input.tenantId }, // user can forge this
});
```

## Nested Queries

Include `tenantId` in nested `where` clauses too. Relations do not inherit the parent's tenant filter.

```typescript
const campaign = await prisma.campaign.findFirst({
  where: {
    id: input.campaignId,
    tenantId: ctx.tenantId,
  },
  include: {
    deals: {
      where: {
        tenantId: ctx.tenantId, // nested filter required
        deletedAt: null,
      },
    },
  },
});
```

## Soft Deletes

Use `deletedAt: null` alongside `tenantId` in every read query. Never hard-delete records.

```typescript
// Correct read
const influencers = await prisma.influencer.findMany({
  where: {
    tenantId: ctx.tenantId,
    deletedAt: null,
  },
});

// Correct soft delete
await prisma.influencer.update({
  where: {
    id: input.id,
    tenantId: ctx.tenantId,
  },
  data: { deletedAt: new Date() },
});

// WRONG - hard delete
await prisma.influencer.delete({ where: { id: input.id } });
```

## Audit Check

To find queries missing tenant isolation, search with:

```bash
sg run --pattern 'prisma.$MODEL.findMany({ where: { $$$ARGS } })' --lang typescript apps/web/src
```

Or with ripgrep for a quick scan:

```bash
rg 'prisma\.\w+\.(findMany|findFirst|findUnique|update|delete)\(' apps/web/src --type ts
```

Review every match and confirm `tenantId: ctx.tenantId` is present in the `where` clause.

## Integration

Use with:
- `orpc-patterns` - `requirePermission()` middleware is the source of `ctx.tenantId`; always use it before any handler that touches the database
- `money-vo-discipline` - Monetary fields on tenant-scoped records must use the Money VO
