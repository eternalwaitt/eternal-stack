---
id: eternal-saas-money
paths:
  - "packages/domain/**"
  - "packages/core-domain/**"
  - "apps/web/src/modules/billing/**"
globs:
  - "packages/domain/**"
  - "packages/core-domain/**"
  - "apps/web/src/modules/billing/**"
description: "Money handling: Money value object, Prisma.Decimal conversion, DEFAULT_CURRENCY."
hosts: [claude, cursor]
verify: "pnpm guard:essential"
---

# Money Rules

## No raw float or number for money

Use the `Money` value object. Never store or pass money as `number` or `Float`.

```typescript
// CORRECT
const total = Money.fromDecimal(order.totalAmount)
const fee = Money.fromCents(500)

// WRONG
const total = parseFloat(order.totalAmount.toString())
```

## DB boundary conversions

```typescript
// DB → domain (reading)
const total = decimalToMoney(order.totalAmount)   // Prisma.Decimal → Money

// Domain → DB (writing)
const stored = moneyToDecimal(total)               // Money → Prisma.Decimal

// API serialization only
const cents = total.toCents()
```

Import helpers from the billing shared money-helpers module.

## DEFAULT_CURRENCY, not "BRL"

Use `DEFAULT_CURRENCY` from the shared-constants package everywhere. Never hardcode `"BRL"`.

## verify

```bash
pnpm guard:essential
```
