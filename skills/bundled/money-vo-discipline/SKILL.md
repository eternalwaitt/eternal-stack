---
name: money-vo-discipline
description: "Money value object discipline for agency-tbd - all monetary values must use the Money VO from @agency-tbd/domain, never raw numbers. BRL (R$) primary currency."
version: 1.0.0
source: unknown
category: backend
tags: [money, value-object, currency, brl, prices, amounts, fees, budgets, deals, prisma-json, formatters, agency-tbd, critical]
---
# Money Value Object Discipline - agency-tbd

## Purpose

Prevent floating-point arithmetic bugs and inconsistent formatting by enforcing use of the `Money` value object from `@agency-tbd/domain` for every monetary value in the codebase. Raw `number` must never be used to represent money.

## The Rule

**Never store, pass, or compute money as a raw `number`. Always use `Money`.**

## Package

```typescript
import { Money } from '@agency-tbd/domain';
```

## Core Operations

### Creating Money

```typescript
// From integer cents (preferred - no floating point risk)
const price = Money.fromCents(1000); // R$ 10,00

// From decimal amount (use only when reading external input)
const price2 = Money.fromAmount(10.00); // R$ 10,00
```

### Arithmetic

```typescript
const total = price.add(price2);     // R$ 20,00
const half  = price.multiply(0.5);   // R$ 5,00
const diff  = total.subtract(half);  // R$ 15,00
```

### Display

Always use the project formatter - never call `.toFixed(2)` directly.

```typescript
import { formatMoney } from '~/lib/formatters';

formatMoney(price); // "R$ 10,00"
```

## Prisma JSON Columns

Prisma stores `Json` columns as `unknown`. When a Money value is stored as JSON, cast with double assertion:

```typescript
import { Money, type MoneyJSON } from '@agency-tbd/domain';

// Reading from Prisma
const raw = deal.dealValue as unknown as MoneyJSON;
const money = Money.fromJSON(raw);

// Writing to Prisma
await prisma.deal.create({
  data: {
    dealValue: money.toJSON(), // serialized MoneyJSON
    tenantId: ctx.tenantId,
  },
});
```

## Anti-Patterns

```typescript
// WRONG - raw number arithmetic
const total = deal.value * 1.1;

// WRONG - floating point hell
const fee = 100.50 + 50.30; // => 150.80000000000001

// WRONG - as any cast
const money = deal.dealValue as any;

// WRONG - formatting directly
const display = price.toFixed(2); // loses locale formatting (pt-BR)

// WRONG - passing cents as a plain number to a function
function applyFee(amountInCents: number) { /* ... */ }
```

## Correct End-to-End Example

```typescript
import { Money, type MoneyJSON } from '@agency-tbd/domain';
import { formatMoney } from '~/lib/formatters';

// Handler receives budget as cents integer from validated input
const budget = Money.fromCents(input.budgetCents); // e.g. 500000 => R$ 5.000,00

// Apply a 10% platform fee
const fee = budget.multiply(0.1);
const net = budget.subtract(fee);

// Persist both as JSON
await prisma.campaign.create({
  data: {
    budget: budget.toJSON(),
    platformFee: fee.toJSON(),
    netBudget: net.toJSON(),
    tenantId: ctx.tenantId,
  },
});

// Render on the client
return {
  budgetFormatted: formatMoney(budget),   // "R$ 5.000,00"
  feeFormatted: formatMoney(fee),         // "R$ 500,00"
  netFormatted: formatMoney(net),         // "R$ 4.500,00"
};
```

## Currency

Primary currency is **BRL (Brazilian Real)**.

- Format: `R$ X.XXX,XX` (period as thousands separator, comma as decimal)
- Always use `formatMoney()` from `~/lib/formatters` - it applies the correct pt-BR locale automatically

## Integration

Use with:
- `tenant-isolation-patterns` - Monetary Prisma columns always need `tenantId` in their `where` clause
- `orpc-patterns` - Validate monetary input with Zod (e.g. `z.number().int().nonnegative()` for cents) before constructing a Money instance
