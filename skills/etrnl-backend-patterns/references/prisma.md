# Prisma ORM

Vendored from the `prisma-expert` companion skill. Apply for schema design, migrations, client queries, connection management, and transactions on PostgreSQL, MySQL, or SQLite.

When debugging slow queries, missing indexes, or EXPLAIN plans, load `sql-optimization.md`. For repository and cache-aside patterns, load `data.md`. For multi-tenant enforcement beyond schema hints, load `tenant-isolation-patterns` when installed.

## Schema Design

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@unique([email, tenantId])
  @@index([tenantId])
  @@index([email])
}

model Post {
  id        String   @id @default(uuid())
  title     String
  authorId  String
  tenantId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  published Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([authorId])
  @@index([tenantId])
  @@index([published, createdAt(sort: Desc)])
}
```

Rules:

- Index every foreign key and every `tenantId` column.
- Encode soft deletes with nullable `deletedAt`; filter in repositories, not ad hoc in callers.
- Use enums for fixed option sets. Use composite `@@unique` for tenant-scoped uniqueness.
- Many-to-many: explicit join model with `@@id([postId, tagId])` and indexes on both FK columns.

## Migrations (Production-Safe)

```bash
npx prisma migrate dev --name add_user_role    # development only
npx prisma migrate deploy                      # production apply
npx prisma migrate status                      # drift check before deploy
npx prisma migrate resolve --rolled-back NAME  # failed migration recovery
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

- Commit every migration folder to git. Never run `prisma db push` against production-looking URLs; the stack hooks block it without migration evidence and override tokens.
- Use `DIRECT_DATABASE_URL` for migrations when `DATABASE_URL` points at PgBouncer.
- Run `npx prisma validate` and `npx prisma generate` after schema edits.

## Query Patterns

**N+1 prevention:**

```typescript
const users = await prisma.user.findMany({
  where: { tenantId },
  include: { posts: { where: { published: true }, take: 5 } },
})
```

**Select only needed fields:**

```typescript
const users = await prisma.user.findMany({
  where: { tenantId },
  select: { id: true, email: true, name: true },
})
```

**Cursor pagination (large lists):**

```typescript
const posts = await prisma.post.findMany({
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
})
```

**Aggregations:**

```typescript
const stats = await prisma.post.aggregate({
  _count: true,
  _avg: { viewCount: true },
  where: { tenantId, published: true },
})
```

**Raw SQL (complex paths only):**

```typescript
await prisma.$queryRaw<User[]>`
  SELECT id, email FROM "User"
  WHERE "tenantId" = ${tenantId} AND email ILIKE ${`%${term}%`}
  LIMIT 20
`
```

Parameterize all values. Never interpolate user input into SQL strings.

## Transactions

```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email, tenantId } })
  await tx.profile.create({ data: { userId: user.id, bio: '' } })
}, {
  isolationLevel: 'Serializable', // money balances and inventory
  maxWait: 5000,
  timeout: 10000,
})
```

- Wrap multi-row invariants in one interactive transaction.
- Keep transactions short; no external HTTP inside an open transaction.
- Optimistic locking: `version Int @default(0)` with `updateMany` where `version` matches, then `version: { increment: 1 }`.

## Connection Management

```typescript
const globalForPrisma = global as unknown as { prisma: PrismaClient }
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

```env
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/db?connection_limit=20&pool_timeout=10"
DIRECT_DATABASE_URL="postgresql://user:pass@postgres:5432/db"
```

- Singleton client in serverless. Call `$disconnect()` on graceful shutdown.
- Size `connection_limit` to workload; default `num_cpus * 2 + 1` is a starting point only — measure pool saturation.

## Error Handling

```typescript
import { Prisma } from '@prisma/client'

async function createUser(data: CreateUserInput) {
  return prisma.user.create({ data }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('EMAIL_EXISTS')
    }
    throw error
  })
}
```

Map `P2002` (unique), `P2025` (record not found), and `P2034` (transaction conflict) to domain errors at the repository edge.

## Multi-Tenancy

Every query and mutation must scope `tenantId` from authenticated context — in repositories, not in procedure handlers alone.

```typescript
function tenantRepo(tenantId: string) {
  return {
    users: {
      findMany: (args?: Prisma.UserFindManyArgs) =>
        prisma.user.findMany({ ...args, where: { ...args?.where, tenantId, deletedAt: null } }),
    },
  }
}
```

Cross-check with `tenant-isolation-patterns` for middleware and authorization gates.

## Anti-Patterns

- Missing `@@index` on foreign keys or `tenantId`.
- `findMany` inside loops (N+1).
- Deep nested `include` trees that over-fetch relations.
- `prisma db push` in shared or production environments.
- Global `prisma` queries without `tenantId` in multi-tenant apps.

## 100/100 Checklist

Before marking Prisma work complete, verify:

- [ ] Schema validates; client regenerated; migration committed (not `db push` for shared envs).
- [ ] Every FK and `tenantId` indexed; composite indexes match query sort/filter order.
- [ ] Soft-delete columns filtered in repositories.
- [ ] No N+1: `include`, `select`, or batched `in` queries for related reads.
- [ ] Pagination is cursor-based on hot list endpoints.
- [ ] Multi-step writes run inside transactions with correct isolation level.
- [ ] Connection pool and `DIRECT_DATABASE_URL` configured when PgBouncer is in path.
- [ ] Prisma errors mapped to domain codes at the repository boundary.
- [ ] Slow queries traced with `prisma.$on('query')` or APM; cross-check `sql-optimization.md`.
