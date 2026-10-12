---
name: money-vo-discipline
description: "Money value-object guidance; use when the target project has an established money type and adapt examples to its currency and package"
version: 1.0.0
source: unknown
category: backend
tags: [money, value-object, currency, prices, amounts, fees, budgets, prisma-json, formatters]
---
# Money Value Object Discipline

## Purpose

Use the target project's established monetary representation to prevent rounding and currency errors. These examples assume a `Money` type with the shown methods; inspect the real package and serialization contract before applying them. Do not add a new abstraction or migrate a project to these example imports as a side effect of reading this skill. Integer minor-unit storage can be appropriate when the currency scale, rounding, and API boundaries are explicit.

## The Rule

Avoid floating-point arithmetic for money. Use the project's money type or an explicitly documented integer-minor-unit representation; do not treat every numeric field or every monetary API boundary as a `Money` instance.

## Package

```typescript
import { Money } from '@your-project/domain'; // Replace with the target project's actual package.
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
import { formatMoney } from '~/lib/formatters'; // Example path; use the target formatter.

formatMoney(price); // "R$ 10,00"
```

## Prisma JSON Columns

A persisted JSON field is not automatically a valid Money value. Validate its amount representation, currency and scale through the project's decoder before construction; a TypeScript assertion performs no runtime validation:

```typescript
import { Money, type MoneyJSON } from '@your-project/domain'; // Example package only.

// Reading from Prisma
const raw = projectMoneySchema.parse(deal.dealValue); // Illustrative project-owned decoder returning MoneyJSON.
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

// WRONG only if this boundary omits integer/range/currency validation
function applyFee(amountInCents: number) { /* ... */ }
```

## Correct End-to-End Example

```typescript
import { Money, type MoneyJSON } from '@your-project/domain'; // Example package only.
import { formatMoney } from '~/lib/formatters'; // Example path; use the target formatter.

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

This example uses **BRL (Brazilian Real)**. Use the target's supported currencies and locale policy; do not assume BRL or pt-BR formatting outside that context.

- Example format: `R$ X.XXX,XX` (period as thousands separator, comma as decimal)
- Use the target project's formatter; `~/lib/formatters` is only an example path.

## Integration

Use with:
- `tenant-isolation-patterns` - enforce the trusted tenant boundary when the monetary record is tenant-owned
- `orpc-patterns` - Validate monetary input with Zod (e.g. `z.number().int().nonnegative()` for cents) before constructing a Money instance
