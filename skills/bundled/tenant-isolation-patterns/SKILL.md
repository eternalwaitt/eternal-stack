---
name: tenant-isolation-patterns
description: "Patterns for reviewing tenant isolation in multi-tenant Prisma applications; adapt field names and authorization boundaries to the target project"
version: 1.0.0
source: unknown
category: backend
tags: [prisma, tenantId, multi-tenant, saas, data-isolation, security, database]
---
# Tenant Isolation Patterns

## Purpose

Use these patterns when the target contains tenant-owned data. First identify which records are tenant-scoped, which are intentionally global, the trusted source of tenant identity, and any database or repository-level isolation policy. Missing scope on tenant-owned records can leak data; adding an invented filter to global records or unrelated query shapes can also break behavior.

## The Rule

**Every access to tenant-owned records must enforce the current tenant boundary at a trusted layer.** The field and enforcement point depend on the target schema; a `tenantId` predicate is one common implementation, not a universal Prisma requirement for every query.

## How `tenantId` Reaches the Handler

If the target's `requirePermission()` middleware derives tenant context from the authenticated identity, use that trusted context after confirming its implementation. Do not assume this helper or `ctx.tenantId` exists in another project. Never treat a client-supplied tenant identifier as authorization.

```typescript
.use(requirePermission('resource:read'))
.handler(async ({ ctx }) => {
  // Example only: confirm this middleware actually guarantees the context field.
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

Trace nested access as well: a parent filter alone does not prove every related record is authorized. Use the target's tenant predicates, tenant-safe relation constraints or verified database isolation; do not add nonexistent fields to unrelated or global models.

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

When the project's retention and privacy policy uses soft deletion, include both the tenant boundary and active-record condition in relevant reads. A soft-delete convention does not replace required hard deletion, retention expiry, or user erasure.

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
sg run --pattern 'prisma.$MODEL.findMany({ where: { $$$ARGS } })' --lang typescript <source-root>
```

Or with ripgrep for a quick scan:

```bash
rg 'prisma\.\w+\.(findMany|findFirst|findUnique|update|delete)\(' <source-root> --type ts
```

Review each match against the target's ownership model and confirm that tenant-owned records are scoped through a trusted boundary. Do not flag intentionally global lookup tables or records protected through another verified layer.

## Integration

Use with:
- `orpc-patterns` - if the target actually uses `requirePermission()`, verify that its tenant context is derived from authenticated state and applied to the relevant operation
- `money-vo-discipline` - preserve the project's validated exact monetary representation and currency policy
