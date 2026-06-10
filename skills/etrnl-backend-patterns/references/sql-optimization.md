# SQL Query Optimization

Vendored from the `sql-optimization-patterns` companion skill. Apply for slow queries, index design, EXPLAIN analysis, and database-side performance on PostgreSQL-first workloads.

Load `prisma.md` when the ORM generates the query under review. Load `data.md` for repository-level batching and cache-aside.

## EXPLAIN Workflow

```sql
EXPLAIN ANALYZE
SELECT u.id, u.email, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.tenant_id = $1 AND u.created_at > NOW() - INTERVAL '30 days';

EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT ...;
```

Read the plan for:

| Signal | Meaning |
| --- | --- |
| Seq Scan on large table | Missing or unused index |
| Index Scan / Index Only Scan | Index hit (Index Only Scan is ideal for covering projections) |
| Nested Loop on large sets | Possible missing index on join key |
| Hash Join / Merge Join | Often correct for larger joins |
| High actual time vs rows | Filter or join cardinality problem |

Capture before/after plans when changing indexes or query shape.

## Index Strategies

```sql
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';
CREATE INDEX idx_users_lower_email ON users(LOWER(email));
CREATE INDEX idx_posts_search ON posts USING GIN(to_tsvector('english', title || ' ' || body));
CREATE INDEX idx_events_meta ON events USING GIN(metadata);
```

Rules:

- Composite indexes: equality columns first, range/sort columns last.
- Partial indexes for hot filtered subsets.
- Expression indexes when `WHERE` applies functions to columns.
- GIN for JSONB and full-text. BRIN for very large append-only time-series.
- Drop unused indexes; each index taxes writes.

## Core Patterns

**Avoid `SELECT *` on hot paths** - project only columns the handler needs.

**Predicate-friendly WHERE:**

```sql
-- Bad: function on column without functional index
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';

-- Good: functional index or normalized stored column
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

**JOIN order:** filter driving tables before joining wide fact tables.

**N+1 elimination:**

```sql
SELECT u.id, u.name, o.id AS order_id, o.total
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.id = ANY($1::uuid[]);
```

**Cursor pagination (not OFFSET on large tables):**

```sql
SELECT * FROM users
WHERE (created_at, id) < ($cursor_ts, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;

CREATE INDEX idx_users_cursor ON users(created_at DESC, id DESC);
```

**Correlated subquery → join or window:**

```sql
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

**Batch writes:**

```sql
INSERT INTO users (name, email) VALUES
  ('Alice', 'a@example.com'),
  ('Bob', 'b@example.com');

UPDATE users SET status = 'active' WHERE id = ANY($1::int[]);
```

## Aggregates and Counts

```sql
-- Filter before COUNT on large tables
SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '7 days';

-- Approximate count when exact total is non-critical (PostgreSQL)
SELECT reltuples::bigint FROM pg_class WHERE relname = 'orders';
```

## Advanced (When Justified)

**Materialized views** for expensive rollups - refresh on schedule or `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

**Partitioning** by date range on append-only fact tables when sequential scans dominate despite indexes.

**Maintenance:**

```sql
ANALYZE users;
VACUUM (ANALYZE) users;
REINDEX INDEX CONCURRENTLY idx_users_email;
```

## Prisma-Generated SQL

When reviewing Prisma:

- Enable query logging in development; capture SQL + duration.
- Replace looped `findMany` with `include`, nested `select`, or `where: { id: { in: [...] } }`.
- Add `@@index` matching `where`, `orderBy`, and `join` columns from logged SQL.
- Run `EXPLAIN ANALYZE` on the emitted SQL for hot endpoints.

## Monitoring (PostgreSQL)

```sql
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

SELECT schemaname, tablename, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;

SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

## Pitfalls

- Over-indexing write-heavy tables.
- Implicit type coercion blocking index use.
- Leading-wildcard `LIKE '%term'`.
- `OR` across unrelated columns without union rewrite.
- Large `OFFSET` pagination on indexed sort columns.

## 100/100 Checklist

Before marking SQL optimization work complete, verify:

- [ ] `EXPLAIN ANALYZE` captured for every changed hot query (before and after when applicable).
- [ ] Indexes match `WHERE`, `JOIN`, and `ORDER BY` columns on high-traffic paths.
- [ ] No N+1 at SQL or ORM layer.
- [ ] List endpoints use cursor pagination, not deep OFFSET.
- [ ] Aggregations filter early; no full-table counts without need.
- [ ] Unused indexes identified; new indexes justified against write cost.
- [ ] Statistics fresh (`ANALYZE` or autovacuum healthy).
- [ ] Prisma schema `@@index` entries align with emitted SQL when ORM is in use.
