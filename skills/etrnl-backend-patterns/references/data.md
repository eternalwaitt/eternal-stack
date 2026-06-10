# Backend Data Layer

Shape data for the read paths that dominate traffic. Normalize for correctness, then denormalize the hot reads with intent.

## Schema Modeling

- Start at third normal form. Denormalize a column only with a written reason and a backfill plan.
- Make every foreign key explicit and indexed. Add `created_at` and `updated_at` on every table.
- Encode soft deletes as a nullable `deleted_at`; filter it in the repository, not in callers.

## Indexing

- Index the columns in `WHERE`, `JOIN`, and `ORDER BY` for hot queries. Order composite indexes equality-first, range-last.
- Use covering indexes to serve read-only projections without table lookups. Use GIN for JSONB and full-text columns.
- Drop unused indexes; each one taxes writes.

## N+1 Prevention

Batch related reads into one query and join in memory by key.

```ts
const markets = await getMarkets()
const creatorIds = markets.map((m) => m.creatorId)
const creators = await getUsers(creatorIds)          // one query, not N
const byId = new Map(creators.map((c) => [c.id, c]))
markets.forEach((m) => { m.creator = byId.get(m.creatorId) })
```

## Transactions

- Wrap multi-row invariants in one transaction. Pick the isolation level from the invariant: serializable for money balances, read-committed for routine writes.
- Keep transactions short. Run external calls before or after, never inside the open transaction.
- Make writes retry-safe so a serialization failure replays cleanly.

```ts
await db.transaction(async (tx) => {
  const acct = await tx.accounts.lockById(id)
  if (acct.balance < amount) throw new InsufficientFunds()
  await tx.accounts.debit(id, amount)
  await tx.ledger.append({ accountId: id, amount })
})
```

## Repository Pattern

Hide the client behind an interface so business code never touches the ORM.

```ts
interface MarketRepository {
  findAll(filters?: MarketFilters): Promise<Market[]>
  findById(id: string): Promise<Market | null>
  create(data: CreateMarketDto): Promise<Market>
  update(id: string, data: UpdateMarketDto): Promise<Market>
  delete(id: string): Promise<void>
}
```

- Return domain types, not raw rows. Translate database errors into domain errors at this edge.
- Keep query construction here so callers stay declarative.

## Cache-Aside

Wrap a repository with a caching decorator so cache logic stays out of business code.

```ts
class CachedMarketRepository implements MarketRepository {
  constructor(private base: MarketRepository, private redis: RedisClient) {}
  async findById(id: string): Promise<Market | null> {
    const key = `market:${id}`
    const hit = await this.redis.get(key)
    if (hit) return JSON.parse(hit)
    const row = await this.base.findById(id)
    if (row) await this.redis.setex(key, 300, JSON.stringify(row))  // 5 min TTL
    return row
  }
  async invalidate(id: string) { await this.redis.del(`market:${id}`) }
}
```

- Set a TTL on every entry. Invalidate on write. Guard hot keys against stampede with a short lock or request coalescing.

## Surface Selection

| Depth | Load |
| --- | --- |
| Schema modeling, repositories, cache-aside (this file) | `data.md` |
| Prisma schema, migrations, client queries, connection pool, transactions | `prisma.md` |
| Slow queries, EXPLAIN plans, index tuning, SQL-side optimization | `sql-optimization.md` |

Load `tenant-isolation-patterns` when installed for multi-tenant authorization and query scoping beyond schema hints.
