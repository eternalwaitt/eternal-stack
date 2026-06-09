---
name: etrnl-backend-architecture
description: ETRNL backend architecture reference. Use when defining service layers, drawing microservice boundaries, designing event-driven flows, applying CQRS or event sourcing, or coordinating sagas across services.
---
# Backend Architecture

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-backend-architecture`; on update, ask update/snooze/continue.

Draw boundaries around behavior that changes together. Keep business rules independent of transport and storage, and split services only when the seam earns its operational cost.

## Service Layer

Hold business logic in a service layer between transport and persistence. Keep handlers thin and repositories dumb.

```ts
class MarketService {
  constructor(private repo: MarketRepository, private events: EventBus) {}
  async close(id: string, actor: Actor): Promise<Market> {
    const market = await this.repo.findById(id)
    if (!market) throw new NotFound()
    authorize(actor, "market:close", market)
    const closed = market.close()                  // domain rule lives on the entity
    await this.repo.update(id, closed)
    await this.events.publish("market.closed", { id })
    return closed
  }
}
```

- Keep transport (controllers) free of business rules. Keep persistence (repositories) free of decisions.
- Put invariants on domain entities so they hold regardless of caller.

## Microservice Boundaries

- Split a service around a bounded context that owns its data. One service writes a table; others read through its API or events.
- Hold the seam as a monolith module first. Extract a service only when scaling, deploy cadence, or team ownership forces it.
- Forbid cross-service database access. Integration runs through contracts, never shared tables.

## Event-Driven Flows

- Emit a domain event after a state change commits. Name events in past tense (`order.placed`).
- Make consumers idempotent and order-tolerant. Carry a version on the payload.
- Use the outbox pattern to publish atomically with the write, then relay from the outbox table.

```ts
await db.transaction(async (tx) => {
  await tx.orders.insert(order)
  await tx.outbox.insert({ topic: "order.placed", payload: order, id: order.id })
})
// a relay polls outbox and publishes, marking rows sent
```

## CQRS And Event Sourcing

- Split the write model from read models when read and write shapes diverge sharply. Project read models from events.
- Reach for event sourcing only when a full audit trail or temporal replay is a hard requirement; accept the rebuild and versioning cost.

## Sagas And Workflow

- Coordinate a multi-service transaction as a saga of local steps, each with a compensating action. Avoid distributed two-phase commit.
- Drive the saga from an explicit state machine. Persist the current step so a crash resumes, not restarts.
- Make every step and every compensation idempotent.

Route queue topology and DLQ handling through `etrnl-backend-resilience`, and per-service data design through `etrnl-backend-data`.
