---
name: prisma-expert
description: "Prisma ORM expertise - schema design, migrations, query optimization, connection management, transactions"
version: 1.0.0
source: unknown
category: universal
---
# Prisma ORM Expert

## Purpose

Expert guidance for Prisma ORM across schema design, migrations, query optimization, relations, and database operations for PostgreSQL, MySQL, and SQLite.

## Schema Design

### Basic Models

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@index([role])
}

enum Role {
  USER
  ADMIN
  MODERATOR
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String   @db.Text
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  tags      Tag[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
  @@index([published])
}
```

### Relations

**One-to-One**
```prisma
model User {
  id      String   @id @default(uuid())
  profile Profile?
}

model Profile {
  id     String @id @default(uuid())
  bio    String
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**One-to-Many**
```prisma
model User {
  id    String @id @default(uuid())
  posts Post[]
}

model Post {
  id       String @id @default(uuid())
  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  @@index([authorId]) // IMPORTANT: Index foreign keys
}
```

**Many-to-Many (Explicit Join Table)**
```prisma
model Post {
  id   String     @id @default(uuid())
  tags PostTag[]
}

model Tag {
  id    String     @id @default(uuid())
  name  String     @unique
  posts PostTag[]
}

model PostTag {
  postId String
  tagId  String
  post   Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([postId, tagId])
  @@index([tagId])
}
```

### Composite Keys and Unique Constraints

```prisma
model UserRole {
  userId String
  role   String
  user   User   @relation(fields: [userId], references: [id])

  @@id([userId, role]) // Composite primary key
}

model Product {
  id   String @id @default(uuid())
  sku  String
  name String

  @@unique([sku, name]) // Composite unique constraint
}
```

### Indexes for Performance

```prisma
model Post {
  id        String   @id
  title     String
  content   String
  published Boolean
  authorId  String
  createdAt DateTime

  // Single-column indexes
  @@index([authorId])
  @@index([published])

  // Composite index (order matters!)
  @@index([published, createdAt(sort: Desc)])

  // Covering index (PostgreSQL only)
  @@index([authorId], type: Hash)
}
```

## Migrations

### Create Migration

```bash
# Create migration (development)
npx prisma migrate dev --name add_user_role

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (DESTRUCTIVE - dev only)
npx prisma migrate reset
```

### Migration Conflicts

**Problem:** Multiple devs create conflicting migrations

**Solution:**
```bash
# Pull latest migrations
git pull origin main

# Check migration status
npx prisma migrate status

# If conflicts:
# 1. Delete your local migration folder
rm -rf prisma/migrations/YYYYMMDDHHMMSS_your_migration

# 2. Pull schema changes
git pull

# 3. Create new migration
npx prisma migrate dev --name your_feature
```

### Failed Migration Recovery

```bash
# Check status
npx prisma migrate status

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Or mark as applied (if manually fixed)
npx prisma migrate resolve --applied MIGRATION_NAME

# Then retry
npx prisma migrate deploy
```

### Schema Drift Detection

```bash
# Compare schema vs database
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

## Query Optimization

### Prevent N+1 Queries

**❌ Bad - N+1 Problem**
```typescript
// Fetches users, then N separate queries for posts
const users = await prisma.user.findMany();

for (const user of users) {
  const posts = await prisma.post.findMany({
    where: { authorId: user.id }
  });
}
```

**✅ Good - Use Include**
```typescript
// Single query with join
const users = await prisma.user.findMany({
  include: {
    posts: true
  }
});
```

### Select Only Needed Fields

**❌ Bad - Over-fetching**
```typescript
const users = await prisma.user.findMany(); // Gets ALL fields
```

**✅ Good - Selective Fields**
```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    name: true
    // Excludes password, createdAt, etc.
  }
});
```

### Pagination

```typescript
// Cursor-based (recommended for large datasets)
const posts = await prisma.post.findMany({
  take: 10,
  skip: 1, // Skip the cursor
  cursor: {
    id: lastPostId
  },
  orderBy: {
    createdAt: 'desc'
  }
});

// Offset-based (simpler, less efficient)
const posts = await prisma.post.findMany({
  take: 10,
  skip: page * 10,
  orderBy: {
    createdAt: 'desc'
  }
});
```

### Aggregations

```typescript
// Count
const userCount = await prisma.user.count({
  where: { role: 'USER' }
});

// Aggregate
const stats = await prisma.post.aggregate({
  _count: true,
  _avg: { viewCount: true },
  _sum: { viewCount: true },
  where: { published: true }
});

// Group by
const postsByAuthor = await prisma.post.groupBy({
  by: ['authorId'],
  _count: {
    id: true
  },
  where: { published: true }
});
```

### Raw Queries (Complex Operations)

```typescript
// Raw query with type safety
const result = await prisma.$queryRaw<User[]>`
  SELECT * FROM "User"
  WHERE "email" LIKE ${`%${search}%`}
  LIMIT 10
`;

// Raw execute (no return value)
await prisma.$executeRaw`
  UPDATE "User"
  SET "lastLogin" = NOW()
  WHERE "id" = ${userId}
`;
```

## Connection Management

### Connection Pool Configuration

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public&connection_limit=20&pool_timeout=10"

# Connection parameters:
# connection_limit: Max connections (default: num_cpus * 2 + 1)
# pool_timeout: Seconds to wait for connection (default: 10)
# connect_timeout: Seconds to wait for initial connection (default: 5)
```

### Serverless Configuration

```typescript
// pages/api/users.ts (Next.js API route)
import { PrismaClient } from '@prisma/client';

// Singleton pattern for serverless
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Handler
export default async function handler(req, res) {
  const users = await prisma.user.findMany();
  res.json({ users });
}
```

### Connection Pooling (External)

```typescript
// Use PgBouncer for production
// DATABASE_URL points to PgBouncer
DATABASE_URL="postgresql://user:password@pgbouncer:6432/mydb"

// Direct database URL for migrations
DIRECT_DATABASE_URL="postgresql://user:password@postgres:5432/mydb"
```

### Graceful Shutdown

```typescript
// server.ts
import { prisma } from './prisma';

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

## Transactions

### Interactive Transactions

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Create user
  const user = await tx.user.create({
    data: { email: 'user@example.com', name: 'User' }
  });

  // Create profile
  const profile = await tx.profile.create({
    data: { userId: user.id, bio: 'Hello' }
  });

  // Create initial post
  const post = await tx.post.create({
    data: {
      title: 'First Post',
      content: 'Content',
      authorId: user.id
    }
  });

  return { user, profile, post };
});

// If any operation fails, entire transaction rolls back
```

### Batch Transactions

```typescript
const [users, deletedPosts] = await prisma.$transaction([
  prisma.user.findMany(),
  prisma.post.deleteMany({ where: { published: false } })
]);
```

### Isolation Levels (PostgreSQL)

```typescript
await prisma.$transaction(
  async (tx) => {
    // Your operations
  },
  {
    isolationLevel: 'ReadCommitted', // Default
    // Other options: ReadUncommitted, RepeatableRead, Serializable
    maxWait: 5000, // Max wait to get connection (ms)
    timeout: 10000 // Max transaction time (ms)
  }
);
```

### Optimistic Concurrency Control

```prisma
model Post {
  id      String @id @default(uuid())
  title   String
  version Int    @default(0) // Version field
}
```

```typescript
// Update with version check
const updated = await prisma.post.updateMany({
  where: {
    id: postId,
    version: currentVersion // Only update if version matches
  },
  data: {
    title: newTitle,
    version: { increment: 1 }
  }
});

if (updated.count === 0) {
  throw new Error('Post was modified by another user');
}
```

## Debugging and Logging

### Enable Query Logging

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' }
  ]
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Params: ' + e.params);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### Prisma Studio (GUI)

```bash
# Launch database browser
npx prisma studio
# Opens at http://localhost:5555
```

### Validate Schema

```bash
# Check schema for errors
npx prisma validate

# Format schema
npx prisma format

# Generate Prisma Client
npx prisma generate
```

## Common Anti-Patterns

### ❌ Not Using Indexes

```prisma
// Missing index on foreign key
model Post {
  authorId String
  author   User @relation(fields: [authorId], references: [id])
  // ❌ No @@index([authorId])
}
```

### ❌ Over-fetching Relations

```typescript
// Gets ALL posts, ALL comments, ALL users
const user = await prisma.user.findUnique({
  where: { id },
  include: {
    posts: {
      include: {
        comments: {
          include: { user: true }
        }
      }
    }
  }
});
```

### ❌ Using FindMany in Loops

```typescript
// N+1 query problem
for (const userId of userIds) {
  const posts = await prisma.post.findMany({
    where: { authorId: userId }
  });
}

// ✅ Better: Single query
const posts = await prisma.post.findMany({
  where: { authorId: { in: userIds } }
});
```

### ❌ Not Handling Unique Constraint Errors

```typescript
try {
  await prisma.user.create({
    data: { email: 'existing@example.com' }
  });
} catch (error) {
  if (error.code === 'P2002') {
    // Unique constraint violation
    throw new Error('Email already exists');
  }
  throw error;
}
```

## Best Practices

✅ **Index foreign keys** - Always add `@@index` on relation fields
✅ **Use transactions** - For multi-step operations that must succeed together
✅ **Select specific fields** - Avoid fetching unnecessary data
✅ **Use include wisely** - Prevent N+1 but don't over-fetch
✅ **Connection pooling** - Configure appropriate pool size for your workload
✅ **Handle errors** - Check for Prisma-specific error codes
✅ **Version control migrations** - Commit migration files to git
✅ **Use enums** - For fields with fixed options
✅ **Validate on application layer** - Don't rely solely on database constraints
✅ **Monitor query performance** - Enable logging in development

## Multi-Tenancy Pattern

```prisma
model Tenant {
  id    String @id @default(uuid())
  name  String
  users User[]
}

model User {
  id       String @id @default(uuid())
  email    String
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  posts    Post[]

  @@unique([email, tenantId]) // Email unique per tenant
  @@index([tenantId])
}

model Post {
  id       String @id @default(uuid())
  tenantId String // Denormalized for performance
  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  @@index([tenantId])
  @@index([authorId])
}
```

```typescript
// Tenant-scoped queries — pair with tenant-isolation-patterns for middleware and auth gates.
function withTenant(tenantId: string) {
  const enforceTenantWhere = (where: Record<string, unknown> = {}) => {
    if ("tenantId" in where && where.tenantId !== tenantId) {
      throw new Error("Cross-tenant access denied");
    }
    return { ...where, tenantId };
  };
  const enforceTenantData = (data: Record<string, unknown>) => {
    if ("tenantId" in data && data.tenantId !== tenantId) {
      throw new Error("Cross-tenant write denied");
    }
    return { ...data, tenantId };
  };

  return {
    user: {
      findMany: (args: { where?: Record<string, unknown> } = {}) =>
        prisma.user.findMany({
          ...args,
          where: enforceTenantWhere(args.where),
        }),
      create: (args: { data: Record<string, unknown> }) =>
        prisma.user.create({
          ...args,
          data: enforceTenantData(args.data),
        }),
    },
  };
}

// Usage
const tenantPrisma = withTenant(currentTenantId);
const users = await tenantPrisma.user.findMany();
```

## Integration

Use with:
- `nodejs-backend-patterns` - Repository layer implementation
- `sql-optimization-patterns` - Query optimization
- `auth-implementation-patterns` - User/session storage
- `testing` - Database testing patterns
- `zod-4` - Input validation before database operations
