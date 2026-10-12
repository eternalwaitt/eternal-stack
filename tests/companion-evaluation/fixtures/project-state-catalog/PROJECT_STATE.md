# Catalog project state

## Current scope

Small local catalog formatter. No deployed service or production verification.

## Features and status

- In-stock filtering: implemented, existing local test covers exhausted inventory.
- Price-range filtering and formatted currency: not implemented.

## Pending work

- P1: Add translations after the catalog API stabilizes; outside the current implementation.

## Lessons and mistakes

- L1: Previous boundary regression showed that zero inventory must be excluded; preserve its regression test.
