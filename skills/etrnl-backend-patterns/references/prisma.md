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

- Select indexes using query plans, constraint behavior, tenant access paths and write cost; avoid duplicating indexes already supplied by uniqueness constraints.
- When the project uses soft deletion, enforce its active-record policy at the existing trusted boundary; retain actual privacy/erasure requirements.
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

- For databases managed with Prisma Migrate, commit migration history and apply reviewed migrations through the project's deployment workflow. `db push` changes the database without recording migrations; reserve it for local prototyping or a provider workflow that explicitly recommends it. Eternal Stack Core installs no hooks, so this guidance is not an automatic command block. Check the target provider and installed Prisma major before choosing commands.
- Use a direct database URL for migrations when the project's pooled `DATABASE_URL` is not suitable, following the provider and Prisma configuration already in that repository.
- Validate the schema and regenerate the client with commands supported by the installed Prisma version after schema edits. Check the project's generator and package scripts first; generation behavior differs by version and setup.

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
- Size `connection_limit` to workload; default `num_cpus * 2 + 1` is a starting point only - measure pool saturation.

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

In a multi-tenant application, enforce tenant ownership for tenant-scoped records at a trusted repository, policy, or database boundary. Use the target's actual context field and schema; do not require every Prisma query or global lookup to carry `tenantId`.

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

## Checks to select for applicable Prisma changes

Use the relevant checks for the target change; this list is not a universal completion gate:

- [ ] Schema validates; regenerate the client when the installed generator/version requires it; use the target provider's migration or schema workflow.
- [ ] Foreign-key and tenant indexes are considered against actual query plans and provider behavior.
- [ ] Retention/soft-delete policy is applied where the target uses it.
- [ ] No N+1: `include`, `select`, or batched `in` queries for related reads.
- [ ] Pagination is cursor-based on hot list endpoints.
- [ ] Multi-step writes run inside transactions with correct isolation level.
- [ ] Connection pool and `DIRECT_DATABASE_URL` configured when PgBouncer is in path.
- [ ] Prisma errors mapped to domain codes at the repository boundary.
- [ ] Slow queries traced with `prisma.$on('query')` or APM; cross-check `sql-optimization.md`.
