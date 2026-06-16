---
id: eternal-saas-tcg-contract
paths:
  - "apps/**/*tcg*/**"
  - "apps/**/*tcg-card*/**"
  - "apps/**/*trading-card*/**"
  - "apps/**/*collectible-card*/**"
  - "packages/**/*tcg*/**"
  - "packages/**/*tcg-card*/**"
  - "packages/**/*trading-card*/**"
  - "packages/**/*collectible-card*/**"
globs:
  - "apps/**/tcg*"
  - "apps/**/tcg-card*"
  - "apps/**/trading-card*"
  - "apps/**/collectible-card*"
  - "packages/**/tcg*"
  - "packages/**/tcg-card*"
  - "packages/**/trading-card*"
  - "packages/**/collectible-card*"
description: "TCG rules: collectible-card domain contracts, inventory safety, and market-data verification."
hosts: [claude, cursor]
alwaysApply: false
verify: "pnpm test"
---

# TCG Contract Rules

Use these rules for collectible-card marketplace, inventory, pricing, and catalog workflows.

## Domain contracts

- Treat card identity, edition, language, condition, finish, and quantity as separate fields.
- Validate external marketplace and catalog data at the import boundary before it reaches domain logic.
- Keep inventory mutation flows auditable: every stock adjustment needs a source event or operator action.

## Price and market data

- Store the source, captured timestamp, currency, and condition assumptions with every market snapshot.
- Do not mix retail listing prices, completed-sale prices, and manually-entered fallback prices without a typed source discriminator.
- Reconcile duplicate marketplace matches before accepting automated bulk updates.
