---
name: eternal-best-practices
description: "Universal engineering excellence patterns for multi-tenant SaaS. Covers tenant isolation (repositories + tenantId), financial precision (Money VO + Decimal), soft deletes, i18n, dual API architecture (oRPC + REST), response builders, centralized error codes, function length limits, type safety workarounds, Better-Auth security, domain-driven architecture, env validation, observability, optimistic locking, test fixtures, and OWASP compliance. Stack-agnostic principles for Next.js 16+, React 19, and Prisma projects."
version: 4.0.0
source: unknown
category: workflow
---
# Eternal Best Practices

> **Mission:** Build top 0.1% multi-tenant SaaS with zero security bugs, financial precision, and world-class architecture.

**Stack:** Next.js 16+ (App Router), React 19, Node 24, Prisma, oRPC, Better-Auth, Pino, OpenTelemetry

**Tools:** oxlint, oxfmt, ESLint, TypeScript 5.7+

**Auto-invoke when editing code** - Codex hooks reference this skill for blocker-level enforcement.

---

## 🏗️ Architecture Pattern: Pragmatic Hexagonal Architecture

**Decision:** Use **Hexagonal Architecture (Ports & Adapters)** for production quality with solo dev velocity.

**Layers:**
- 🟦 **Core (`packages/domain/`)** - Pure business logic, NO framework dependencies
- 🟩 **Ports (`packages/api/`)** - oRPC procedures (thin orchestration only)
- 🟨 **Adapters** - Database (`db/`), Queues (`queues/`), Auth (`auth/`), Observability (`observability/`)

**Golden Rules:**
1. **Domain layer is pure** - No Prisma, no oRPC, no Next.js imports
2. **oRPC procedures are thin** - Validate input → delegate to domain → persist
3. **Package.json exports enforce boundaries** - Frontend can't import backend code
4. **Prisma inline until duplication** - Create repositories only when queries repeated 3+ times

**Example:**
```typescript
// ✅ Domain layer (packages/domain/financial/calculations.ts)
export function calculateSplits(params: { totalValue: Decimal; taxRate: Decimal }) {
  // Pure function - easy to test, no mocks needed
  const tax = params.totalValue.mul(params.taxRate);
  return { tax, net: params.totalValue.sub(tax) };
}

// ✅ oRPC procedure (packages/api/src/routers/campaigns.ts)
export const createCampaign = protectedProcedure
  .input(CreateCampaignSchema)
  .handler(async ({ input, context }) => {
    // 1. Validate ownership
    const client = await context.db.client.findUnique({ ... });

    // 2. Delegate to domain
    const splits = calculateSplits({ totalValue, taxRate });

    // 3. Persist
    return context.db.campaign.create({ data: { ...splits } });
  })
```

**See:** [AGENTS.md - Architecture Pattern](../../../AGENTS.md#architecture-pattern-pragmatic-hexagonal-architecture) for full file structure.

---

## 🔴 BLOCKER-Level Rules (Auto-Enforce)

### 1. Multi-Tenant Isolation (CRITICAL - Security Boundary)

**The Rule:** EVERY database query MUST use tenant-safe repositories. NEVER use raw Prisma queries.

**Why:** Data leakage between tenants = business-ending security breach. Repository pattern enforces isolation.

#### ❌ NEVER (Will leak data across tenants):

```typescript
// BLOCKER: Direct Prisma access bypasses tenant isolation
const campaigns = await prisma.campaign.findMany()

// BLOCKER: Manual tenantId filter - prone to forgetting
const client = await prisma.client.findUnique({
  where: { id: clientId }  // Missing tenantId!
})

// BLOCKER: Forgot tenantId in nested queries
const campaign = await prisma.campaign.findUnique({
  where: { id: campaignId, tenantId: ctx.tenantId },
  include: {
    deliverables: true  // ❌ Deliverables not scoped!
  }
})

// BLOCKER: Update without tenantId (could update wrong tenant)
await prisma.campaign.update({
  where: { id: campaignId },
  data: { status: 'ACTIVE' }
})
```

#### ✅ ALWAYS (Tenant-safe repositories):

```typescript
// ✅ Use tenant-safe repository (preferred)
import { clientRepository } from '@core-suite/core-domain'

const clients = await clientRepository.findMany(tenantId, {
  where: { name: 'John' }
})

// ✅ Use helper for composite keys
import { findManyForTenant } from '@core-suite/core-domain/repositories'

const campaigns = await findManyForTenant(prisma.campaign, tenantId, {
  where: { status: 'ACTIVE' },
  include: {
    deliverables: true  // ✅ Auto-scoped via campaign.tenantId
  }
})

// ✅ Update with tenant-safe helper
import { updateOneForTenant } from '@core-suite/core-domain/repositories'

await updateOneForTenant(prisma.campaign, tenantId, {
  where: { id: campaignId },
  data: { status: 'ACTIVE' }
})
```

**Repository Pattern (Recommended):**

```typescript
// packages/core-domain/src/repositories/client.repository.ts
export const clientRepository = {
  findMany: async (tenantId: string, params: Prisma.ClientFindManyArgs) => {
    return prisma.client.findMany({
      ...params,
      where: {
        ...params.where,
        tenantId,
        deletedAt: null  // ✅ Auto-includes soft delete filter
      }
    })
  },

  findById: async (tenantId: string, id: string) => {
    return prisma.client.findUnique({
      where: {
        id_tenantId: {  // ✅ Composite unique constraint
          id,
          tenantId
        }
      }
    })
  },

  create: async (tenantId: string, data: Prisma.ClientCreateInput) => {
    return prisma.client.create({
      data: {
        ...data,
        tenantId  // ✅ Auto-injects tenantId
      }
    })
  }
}
```

**Multi-Location Filtering (Advanced):**

For multi-location tenants, add `locationId` filtering:

```typescript
// ✅ Multi-location tenant filtering
const appointments = await appointmentRepository.findMany(tenantId, {
  where: {
    locationId: ctx.locationId,  // ✅ Location-specific data
    scheduledStart: { gte: startOfDay }
  }
})
```

**Middleware Pattern (oRPC):**

```typescript
// packages/api/src/middleware/tenant-scope.ts
export const tenantMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.tenantId) {
    throw new ORPCError({
      code: 'FORBIDDEN',
      message: 'No tenant context'
    });
  }

  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.session.user.tenantId  // Inject into context
    }
  });
});

// Use in ALL protected procedures
export const protectedProcedure = t.procedure
  .use(authMiddleware)
  .use(tenantMiddleware);  // ✅ Auto-injects tenantId
```

**Testing Multi-Tenant Isolation:**

```typescript
// packages/api/src/routers/campaigns.test.ts
describe('Campaigns Router - Tenant Isolation', () => {
  it('should NOT return campaigns from other tenants', async () => {
    // Setup: Create campaign for Tenant A
    const tenantA = await createTenant({ name: 'Agency A' });
    const tenantB = await createTenant({ name: 'Agency B' });

    const campaignA = await createCampaign({ tenantId: tenantA.id });

    // Test: Query as Tenant B
    const result = await caller({ tenantId: tenantB.id })
      .campaigns.list();

    // Assert: Should NOT see Tenant A's campaigns
    expect(result).toHaveLength(0);
    expect(result).not.toContainEqual(
      expect.objectContaining({ id: campaignA.id })
    );
  });
});
```

**Related Skills:**
- `auth-implementation-patterns` - Session/RBAC patterns
- `semgrep` - Static analysis for missing tenantId filters
- `frontend-code-review` - Manual security review

---

### 2. Financial Precision (CRITICAL - Money Bugs)

**The Rule:** Use **Money Value Object** for all financial operations. NEVER use `Float`, `number`, or raw `Decimal`.

**Why:** Floating point math is imprecise. Money VO encapsulates precision + currency handling.

#### ❌ NEVER (Precision loss + missing currency context):

```typescript
// BLOCKER: number type for money
const totalValue = 1000.50;
const tax = totalValue * 0.11;  // ❌ 110.05500000000001

// BLOCKER: Float in Prisma schema
model Campaign {
  totalValue Float  // ❌ Will lose precision
}

// BLOCKER: Arithmetic without Money VO
const agencyCut = campaign.totalValue * 0.20;  // ❌ Imprecise + no currency
```

#### ✅ ALWAYS (Precise + currency-aware):

```typescript
// ✅ Money Value Object for all financial operations
import { Money } from '@core-suite/core-domain'

const price = Money.fromCents(15000)  // R$ 150.00
const discount = Money.fromCents(3000)  // R$ 30.00
const final = price.subtract(discount)  // R$ 120.00

// ✅ Currency validation
const usd = Money.fromCents(10000, 'USD')
const brl = Money.fromCents(5000, 'BRL')
const total = usd.add(brl)  // ❌ Throws error: Currency mismatch!

// ✅ Percentage calculations
const taxRate = 0.11
const tax = price.multiply(taxRate)  // Precise multiplication

// ✅ Comparison
if (price.greaterThan(Money.fromCents(10000))) {
  // Apply bulk discount
}

// ✅ Formatting for display
price.format('pt-BR')  // "R$ 150,00"
price.format('en-US')  // "$150.00"
```

**Prisma Schema (Store as Decimal):**

```prisma
model Campaign {
  // ✅ Store Money as cents (integer) or Decimal
  totalValueCents Int  // Recommended: No decimal precision issues
  currency        String @default("BRL")  // Store currency alongside value

  // OR use Decimal with precision
  totalValue      Decimal @db.Decimal(12, 2)  // Max: 999,999,999.99
  taxRate         Decimal @db.Decimal(5, 4)   // 0.1150 = 11.5%
}
```

**Money VO Implementation Pattern:**

```typescript
// packages/core-domain/src/value-objects/money.ts
export class Money {
  private readonly cents: number
  private readonly currency: string

  private constructor(cents: number, currency: string = 'BRL') {
    this.cents = Math.round(cents)
    this.currency = currency
  }

  static fromCents(cents: number, currency = 'BRL'): Money {
    return new Money(cents, currency)
  }

  static fromDecimal(value: Decimal, currency = 'BRL'): Money {
    return new Money(value.times(100).toNumber(), currency)
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.cents + other.cents, this.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.cents - other.cents, this.currency)
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.cents * factor), this.currency)
  }

  toDecimal(): Decimal {
    return new Decimal(this.cents).div(100)
  }

  toCents(): number {
    return this.cents
  }

  format(locale: string): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency
    }).format(this.cents / 100)
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`)
    }
  }
}
```

**Domain Layer Financial Functions:**

```typescript
// packages/domain/financial/calculate-splits.ts
export function calculateSplits(params: {
  totalValue: Money,
  agencyCutPercent: number,
  taxRate: number
}): PaymentSplit {
  const { totalValue, agencyCutPercent, taxRate } = params;

  // All operations use Money methods
  const tax = totalValue.multiply(taxRate);
  const net = totalValue.subtract(tax);
  const agencyCut = net.multiply(agencyCutPercent);

  return { tax, net, agencyCut };
}
```

**Testing Financial Logic:**

```typescript
// packages/domain/financial/calculate-splits.test.ts
import { Money } from '@core-suite/core-domain'

it('should calculate exact splits for R$ 1000 campaign', () => {
  const result = calculateSplits({
    totalValue: Money.fromCents(100000),  // R$ 1000.00
    agencyCutPercent: 0.20,
    taxRate: 0.11
  });

  // ✅ Exact assertions (no floating point errors)
  expect(result.tax.toCents()).toBe(11000);  // R$ 110.00
  expect(result.net.toCents()).toBe(89000);  // R$ 890.00
  expect(result.agencyCut.toCents()).toBe(17800);  // R$ 178.00
});
```

**When to Use Decimal vs Money:**

| Use Case | Pattern | Why |
|----------|---------|-----|
| Financial transactions | `Money` VO | Currency-aware, prevents mistakes |
| Tax rates, percentages | `Decimal` | No currency needed |
| Database storage | `Int` (cents) or `Decimal` | Persistence layer |
| Display to users | `Money.format()` | Locale-aware formatting |

**Related Skills:**
- `senior-backend` - Financial system architecture
- `property-based-testing` - Test financial edge cases
- `sql-optimization-patterns` - Decimal column indexing

---

### 3. Soft Deletes (CRITICAL - Compliance)

**The Rule:** NEVER hard delete user data, financial records, or campaigns. Use `deletedAt` timestamp.

**Why:** LGPD/GDPR require audit trails. Financial records need 7-year retention.

#### ❌ NEVER (Compliance violation):

```typescript
// BLOCKER: Hard delete loses audit trail
await prisma.campaign.delete({
  where: { id: campaignId }
});

// BLOCKER: Cascade deletes lose data
model Campaign {
  deliverables Deliverable[]  // ❌ Will delete deliverables
}
await prisma.campaign.delete({ where: { id } });  // ❌ Cascade
```

#### ✅ ALWAYS (Audit trail preserved):

```typescript
// ✅ Soft delete with timestamp
await prisma.campaign.update({
  where: {
    id_tenantId: {
      id: campaignId,
      tenantId: ctx.tenantId
    }
  },
  data: {
    deletedAt: new Date()
  }
});

// ✅ Prisma schema with deletedAt
model Campaign {
  id        String    @id @default(uuid())
  tenantId  String
  deletedAt DateTime?  // NULL = active, timestamp = deleted

  @@index([tenantId, deletedAt])  // Query active campaigns fast
}

// ✅ Helper for active-only queries
function findActiveCampaigns(tenantId: string) {
  return prisma.campaign.findMany({
    where: {
      tenantId,
      deletedAt: null  // ✅ Filter out soft-deleted
    }
  });
}
```

**Repository Pattern (Auto-includes deletedAt filter):**

```typescript
// packages/core-domain/src/repositories/helpers.ts
export const notDeleted = { deletedAt: null };

export async function findManyForTenant<T>(
  model: any,
  tenantId: string,
  params: any
): Promise<T[]> {
  return model.findMany({
    ...params,
    where: {
      ...params.where,
      tenantId,
      deletedAt: null  // ✅ Auto-includes soft delete filter
    }
  });
}
```

**Soft Delete Patterns:**

```typescript
// packages/domain/soft-delete/helpers.ts

/** Add to Prisma where clause to filter soft-deleted records */
export const notDeleted = { deletedAt: null };

/** Soft delete a record */
export async function softDelete<T extends { deletedAt: Date | null }>(
  model: any,
  where: any
): Promise<T> {
  return model.update({
    where,
    data: { deletedAt: new Date() }
  });
}

/** Restore a soft-deleted record (if within retention period) */
export async function restore<T>(
  model: any,
  where: any
): Promise<T> {
  return model.update({
    where,
    data: { deletedAt: null }
  });
}

// Usage in oRPC:
export const campaignsRouter = router({
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return softDelete(prisma.campaign, {
        id_tenantId: {
          id: input.id,
          tenantId: ctx.tenantId
        }
      });
    })
});
```

**When Hard Delete IS Allowed:**

```typescript
// ✅ OK: User exercising "right to be forgotten" (GDPR/LGPD)
async function anonymizeUser(userId: string) {
  // 1. Anonymize PII first
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted-${userId}@example.com`,
      name: '[DELETED]',
      phone: null
    }
  });

  // 2. Then soft delete
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() }
  });

  // 3. Hard delete only after retention period (30-90 days)
}

// ✅ OK: Truly temporary data (sessions, cache)
await prisma.session.delete({ where: { token } });
```

**Related Skills:**
- `frontend-code-review` - Catch hard deletes in PR review
- `semgrep` - Static analysis for `.delete()` calls

---

### 4. i18n Enforcement (CRITICAL - Global SaaS)

**The Rule:** NO hardcoded UI strings. ALWAYS use `t()` from next-intl.

**Why:** Platform launches in 3 regions (pt-BR, en-US, es-419) from day 1.

#### ❌ NEVER (Hardcoded strings):

```tsx
// BLOCKER: English-only UI
<h1>Welcome to Dashboard</h1>
<Button>Create Campaign</Button>
<span>Campaign {status}</span>

// BLOCKER: Hardcoded dates/numbers
<span>{new Date().toLocaleDateString()}</span>  // US format only
<span>${amount}</span>  // Dollar sign hardcoded
```

#### ✅ ALWAYS (Internationalized):

```tsx
// apps/web/src/app/[locale]/dashboard/page.tsx
import { useTranslations } from 'next-intl';

export default function DashboardPage() {
  const t = useTranslations('dashboard');

  return (
    <>
      <h1>{t('welcome')}</h1>  {/* ✅ Translatable */}
      <Button>{t('actions.createCampaign')}</Button>
    </>
  );
}

// ✅ Use formatting helpers
import { useFormatter } from 'next-intl';

function CampaignCard({ campaign }) {
  const t = useTranslations('campaigns');
  const format = useFormatter();

  return (
    <div>
      {/* ✅ Date formatting (locale-aware) */}
      <span>{format.dateTime(campaign.startDate, { dateStyle: 'medium' })}</span>

      {/* ✅ Currency formatting (locale + currency aware) */}
      <span>{format.number(campaign.totalValue.toNumber(), {
        style: 'currency',
        currency: campaign.currency  // BRL, USD, MXN
      })}</span>

      {/* ✅ Enum translation */}
      <Badge>{t(`status.${campaign.status}`)}</Badge>
    </div>
  );
}
```

**Message Files Structure:**

```json
// apps/web/messages/en-US.json
{
  "dashboard": {
    "welcome": "Welcome to Dashboard",
    "actions": {
      "createCampaign": "Create Campaign"
    }
  },
  "campaigns": {
    "status": {
      "DRAFT": "Draft",
      "ACTIVE": "Active",
      "COMPLETED": "Completed"
    }
  }
}

// apps/web/messages/pt-BR.json
{
  "dashboard": {
    "welcome": "Bem-vindo ao Painel",
    "actions": {
      "createCampaign": "Criar Campanha"
    }
  },
  "campaigns": {
    "status": {
      "DRAFT": "Rascunho",
      "ACTIVE": "Ativa",
      "COMPLETED": "Concluída"
    }
  }
}
```

**Detecting Hardcoded Strings:**

```bash
# Find hardcoded strings (run before commits)
rg '"[A-Z][a-z]{3,}"' apps/web/src --type tsx | grep -v '{t('
# Look for capitalized strings not inside t() function
```

**Related Skills:**
- `nextjs-app-router-patterns` - Next.js 16 i18n setup
- `react-19` - React 19 patterns with i18n
- `wcag-audit-patterns` - Accessibility + i18n

---

### 5. Dual API Architecture (CRITICAL - System Design)

**The Rule:** Choose the right API pattern for each use case. Don't force everything into one system.

**Why:** Different clients need different interfaces. Type safety for internal, REST for external.

#### Architecture Decision:

| System | Location | Use Case | When to Use |
|--------|----------|----------|-------------|
| **oRPC** | `/api/v1/*/[...orpc]` → `lib/orpc/routers/` | Type-safe RPC, internal API | Server ↔ client communication, type safety needed |
| **REST** | `/api/{domain}/route.ts` | Standard REST endpoints | Public API, webhooks, external integrations |
| **Server Actions** | `'use server'` in components | Form submissions | Same-domain mutations, progressive enhancement |

#### ✅ oRPC Pattern (Internal API):

```typescript
// apps/web/src/lib/orpc/routers/campaigns.router.ts
import { z } from 'zod'
import { orpc } from '../orpc'

export const campaignsRouter = {
  list: orpc
    .input(z.object({ limit: z.number().optional() }))
    .handler(async ({ input, context }) => {
      // ✅ Type-safe handler with auto-generated client types
      return repository.findMany(context.tenantId, { limit: input.limit })
    }),
}

// Mounted in: apps/web/src/app/api/v1/campaigns/[...orpc]/route.ts

// Client usage (fully typed):
import { orpcClient } from '@/lib/orpc/client'

const campaigns = await orpcClient.campaigns.list({ limit: 20 })
//    ^? Campaign[] - fully typed!
```

#### ✅ REST Pattern (External API):

```typescript
// apps/web/src/app/api/campaigns/route.ts
import { getTenantContext } from '@core-suite/core-auth/server'
import { successResponse, errorResponse } from '@/lib/api/response-builder'
import { CoreErrorCode } from '@core-suite/shared-constants'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const context = await getTenantContext()
    if (!context) {
      return errorResponse(
        CoreErrorCode.UNAUTHORIZED,
        'Não autorizado',
        { request, startTime }
      )
    }

    // ✅ Use repository for tenant isolation
    const campaigns = await campaignRepository.findMany(context.tenantId, {})

    return successResponse(campaigns, { request, startTime })
  } catch (error) {
    return handleErrorResponse(error, { request, startTime })
  }
}
```

#### ✅ Server Actions Pattern:

```typescript
// apps/web/src/app/[locale]/campaigns/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { campaignRepository } from '@core-suite/core-domain'
import { getTenantContextFromAuth } from '@/lib/auth-helpers'

export async function createCampaign(formData: FormData) {
  const context = await getTenantContextFromAuth()
  if (!context) throw new Error('Unauthorized')

  const campaign = await campaignRepository.create(context.tenantId, {
    name: formData.get('name') as string,
    // ... other fields
  })

  revalidatePath('/campaigns')
  return { success: true, campaign }
}
```

**Decision Matrix:**

| Use Case | Pattern | Why |
|----------|---------|-----|
| Form submission (same domain) | Server Action | Direct server mutation, type-safe |
| External API call | REST Route | Public endpoint, REST interface |
| Client-side mutation | oRPC + React Query | Type safety, cache invalidation, optimistic UI |
| Real-time status update | Optimistic UI + oRPC | Instant feedback, server reconciliation |
| Webhook (Stripe, etc.) | REST Route | External service calls it |
| Third-party integration | REST Route | Standard REST interface |

**Related Skills:**
- `api-design-principles` - REST/GraphQL standards
- `nextjs-app-router-patterns` - Server Actions patterns

---

### 6. Centralized Error Codes (WARNING - Consistency)

**The Rule:** Use centralized `CoreErrorCode` enum, not ad-hoc error strings.

**Why:** Consistency across API boundaries, easier to track/analyze errors.

#### ❌ AVOID (Ad-hoc error strings):

```typescript
// ❌ Inconsistent error messages
throw new Error('Resource not found')
throw new Error('not found')
throw new Error('Campaign not found')
```

#### ✅ PREFER (Centralized error codes):

```typescript
// packages/shared-constants/src/error-codes.ts
export enum CoreErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'CORE_UNAUTHORIZED',
  FORBIDDEN = 'CORE_FORBIDDEN',
  INVALID_TOKEN = 'CORE_INVALID_TOKEN',

  // Resource Management
  NOT_FOUND = 'CORE_NOT_FOUND',
  ALREADY_EXISTS = 'CORE_ALREADY_EXISTS',
  CONFLICT = 'CORE_CONFLICT',

  // Validation
  VALIDATION_ERROR = 'CORE_VALIDATION_ERROR',
  INVALID_INPUT = 'CORE_INVALID_INPUT',

  // Business Logic
  INSUFFICIENT_PERMISSIONS = 'CORE_INSUFFICIENT_PERMISSIONS',
  OPERATION_FAILED = 'CORE_OPERATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'CORE_RATE_LIMIT_EXCEEDED',
}

// Usage in oRPC:
import { CoreErrorCode } from '@core-suite/shared-constants'

throw new ORPCError({
  code: 'NOT_FOUND',
  message: 'Campaign not found',
  data: { errorCode: CoreErrorCode.NOT_FOUND }
})

// Usage in REST:
return errorResponse(
  CoreErrorCode.UNAUTHORIZED,
  'Session expired',
  { request, startTime }
)
```

**Related Skills:**
- `error-handling-patterns` - Error handling strategies

---

### 7. Response Builders (WARNING - Standardization)

**The Rule:** Use standardized response builders for consistent API responses.

**Why:** Consistent response format, automatic timing, correlation IDs.

#### ❌ AVOID (Manual response construction):

```typescript
// ❌ Inconsistent response format
return NextResponse.json({ data: campaigns })

// ❌ Missing timing, correlation ID
return NextResponse.json({
  success: true,
  data: campaigns
})
```

#### ✅ PREFER (Response builders):

```typescript
// lib/api/response-builder.ts
export function successResponse<T>(
  data: T,
  options: {
    request: NextRequest
    startTime: number
    statusCode?: number
  }
) {
  const duration = Date.now() - options.startTime

  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        duration,
        correlationId: request.headers.get('x-correlation-id')
      }
    },
    { status: options.statusCode ?? 200 }
  )
}

export function errorResponse(
  errorCode: CoreErrorCode,
  message: string,
  options: {
    request: NextRequest
    startTime: number
    statusCode?: number
    details?: Record<string, any>
  }
) {
  const duration = Date.now() - options.startTime

  logger.error({
    errorCode,
    message,
    duration,
    correlationId: options.request.headers.get('x-correlation-id')
  })

  return NextResponse.json(
    {
      success: false,
      error: {
        code: errorCode,
        message,
        details: options.details
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration,
        correlationId: options.request.headers.get('x-correlation-id')
      }
    },
    { status: options.statusCode ?? 500 }
  )
}
```

**Related Skills:**
- `api-design-principles` - API response patterns

---

### 8. Domain Layer for Complex Logic (WARNING - Testability)

**The Rule:** Extract complex business logic to `packages/domain/`. Keep oRPC procedures thin.

**Why:** Pure functions are 10x easier to test than oRPC procedures with DB/auth/etc.

#### ❌ AVOID (Fat controller):

```typescript
// packages/api/src/routers/campaigns.ts - ❌ 80+ lines of logic
export const campaignsRouter = router({
  calculatePayout: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input, ctx }) => {
      // ❌ All logic directly in oRPC procedure
      const campaign = await prisma.campaign.findUnique({ ... });

      // 50 lines of financial calculation logic here...
      const tax = campaign.totalValue * campaign.taxRate;
      const net = campaign.totalValue - tax;
      const agencyCut = net * campaign.agencyCutPercent;

      // Regional tax rules...
      if (campaign.region === 'BR') {
        // Brazil-specific logic
      } else if (campaign.region === 'US') {
        // US-specific logic
      }

      // Payment gateway fees...
      let gatewayFee = 0;
      if (campaign.paymentMethod === 'PIX') {
        gatewayFee = campaign.totalValue * 0.0099;
      } else if (campaign.paymentMethod === 'STRIPE') {
        gatewayFee = campaign.totalValue * 0.029 + 0.30;
      }

      return { tax, net, agencyCut, gatewayFee };
    })
});

// ❌ How do you test this? Need to mock Prisma, session, etc.
```

#### ✅ PREFER (Thin controller + domain):

```typescript
// packages/domain/financial/calculate-splits.ts
import { Money } from '@core-suite/core-domain'

export type SplitParams = {
  totalValue: Money;
  agencyCutPercent: number;
  taxRate: number;
  region: 'BR' | 'US' | 'LATAM';
  paymentMethod: 'PIX' | 'STRIPE' | 'BANK';
};

export type PaymentSplit = {
  gross: Money;
  tax: Money;
  net: Money;
  agency: Money;
  influencer: Money;
  gatewayFee: Money;
};

/**
 * Calculate multi-party payment splits with regional tax and gateway fees.
 * PURE FUNCTION - no DB, no API, 100% testable.
 */
export function calculateSplits(params: SplitParams): PaymentSplit {
  const { totalValue, agencyCutPercent, taxRate, region, paymentMethod } = params;

  // Regional tax calculation
  const tax = totalValue.multiply(taxRate);
  const net = totalValue.subtract(tax);

  // Split calculation
  const agencyCut = net.multiply(agencyCutPercent);
  const influencerCut = net.subtract(agencyCut);

  // Gateway fees (region-specific)
  let gatewayFee = Money.fromCents(0);
  if (paymentMethod === 'PIX') {
    gatewayFee = totalValue.multiply(0.0099);  // Brazil: 0.99%
  } else if (paymentMethod === 'STRIPE') {
    gatewayFee = totalValue.multiply(0.029).add(Money.fromCents(30));  // 2.9% + $0.30
  }

  return {
    gross: totalValue,
    tax,
    net,
    agency: agencyCut,
    influencer: influencerCut,
    gatewayFee
  };
}

// packages/domain/financial/calculate-splits.test.ts
import { describe, it, expect } from 'vitest';
import { Money } from '@core-suite/core-domain'
import { calculateSplits } from './calculate-splits';

describe('calculateSplits', () => {
  it('should split R$ 1000 campaign with 20% agency, 11% tax (Brazil PIX)', () => {
    const result = calculateSplits({
      totalValue: Money.fromCents(100000),  // R$ 1000.00
      agencyCutPercent: 0.20,
      taxRate: 0.11,
      region: 'BR',
      paymentMethod: 'PIX'
    });

    // ✅ Pure function = easy to test
    expect(result.tax.toCents()).toBe(11000);  // R$ 110.00
    expect(result.net.toCents()).toBe(89000);  // R$ 890.00
    expect(result.agency.toCents()).toBe(17800);  // R$ 178.00
    expect(result.influencer.toCents()).toBe(71200);  // R$ 712.00
    expect(result.gatewayFee.toCents()).toBe(990);  // R$ 9.90 (0.99% of 1000)
  });

  it('should handle US Stripe with higher fees', () => {
    const result = calculateSplits({
      totalValue: Money.fromCents(100000),  // $1000.00
      agencyCutPercent: 0.20,
      taxRate: 0,
      region: 'US',
      paymentMethod: 'STRIPE'
    });

    // Stripe: 2.9% + $0.30 = $29.30
    expect(result.gatewayFee.toCents()).toBe(2930);
  });
});

// packages/api/src/routers/campaigns.ts - ✅ Thin controller
import { calculateSplits } from '@agency-tbd/domain/financial/calculate-splits';

export const campaignsRouter = router({
  calculatePayout: protectedProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // 1. Fetch data (repository)
      const campaign = await campaignRepository.findById(
        ctx.tenantId,
        input.campaignId
      );

      if (!campaign) {
        throw new ORPCError({ code: 'NOT_FOUND' });
      }

      // 2. Call domain logic (pure function)
      const splits = calculateSplits({
        totalValue: Money.fromCents(campaign.totalValueCents),
        agencyCutPercent: campaign.agencyCutPercent.toNumber(),
        taxRate: campaign.taxRate.toNumber(),
        region: campaign.region,
        paymentMethod: campaign.paymentMethod
      });

      // 3. Return result
      return { campaignId: campaign.id, splits };
    })
});
```

**When to Extract to Domain:**

**Extract when:**
- ✅ Complex calculations (financial, pricing, scoring)
- ✅ State machines (workflow transitions with business rules)
- ✅ Multi-step algorithms
- ✅ Logic you'll reuse (CLI tools, background jobs)
- ✅ Critical business rules needing comprehensive tests

**Keep in oRPC when:**
- ❌ Simple CRUD (find, list, create with no logic)
- ❌ Data transformations for UI
- ❌ Straightforward validations (handled by Zod)

**Related Skills:**
- `architecture-patterns` - Clean Architecture, DDD
- `test-driven-development` - TDD for domain logic
- `senior-backend` - Domain-driven design

---

### 9. Environment Variable Validation (CRITICAL - Startup Safety)

**The Rule:** NEVER access `process.env` directly. ALWAYS use Zod-validated env config.

**Why:** Invalid config = production crashes. Catch errors at startup, not at runtime.

#### ❌ NEVER (Runtime failures):

```typescript
// BLOCKER: No validation, unsafe access
const dbUrl = process.env.DATABASE_URL!;  // Could be undefined
const apiKey = process.env.STRIPE_SECRET_KEY;  // Could be wrong format

// BLOCKER: No type safety
if (process.env.NODE_ENV === 'production') {  // Typo risk
  // ...
}
```

#### ✅ ALWAYS (Validated at startup):

```typescript
// packages/env/src/index.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables (NEVER exposed to client)
   */
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),

    // Optional vars with defaults
    NODE_ENV: z.enum(["development", "test", "production"])
      .default("development"),

    // Conditional validation (production only)
    STRIPE_SECRET_KEY: z.string().startsWith("sk_")
      .optional()
      .refine((val) => {
        if (process.env.NODE_ENV === "production") {
          return !!val;
        }
        return true;
      }, "STRIPE_SECRET_KEY required in production"),
  },

  /**
   * Client-side environment variables (exposed to browser)
   * Must be prefixed with NEXT_PUBLIC_
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_REGION: z.enum(["BR", "US", "LATAM"]).default("US"),
  },

  /**
   * Map process.env to the schema
   * ⚠️ Only place where process.env access is allowed
   */
  runtimeEnv: {
    // Server
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,

    // Client
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_REGION: process.env.NEXT_PUBLIC_REGION,
  },

  /**
   * Skip validation during build (env vars not available)
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

// Usage in any file:
import { env } from "@agency-tbd/env";

const dbUrl = env.DATABASE_URL;  // ✅ Type-safe, validated
const apiKey = env.STRIPE_SECRET_KEY;  // ✅ Validated format
```

**Benefits:**
- ✅ App **fails fast** at startup (not in production after deploy)
- ✅ Type-safe access (`env.DATABASE_URL` autocompletes)
- ✅ Documents required vs optional vars
- ✅ Validates formats (URLs, API key prefixes, etc.)
- ✅ Environment-specific validation (prod requires certain vars)

**Setup Checklist:**
- [ ] Install: `pnpm add @t3-oss/env-nextjs zod`
- [ ] Create `packages/env/src/index.ts` with schema
- [ ] Add `.env.example` with all variables documented
- [ ] Import `env` in all files (never `process.env`)
- [ ] Add to `.env`: `SKIP_ENV_VALIDATION=true` for Docker builds

**Related Skills:**
- `senior-backend` - Environment config patterns
- `deployment-pipeline-design` - Production config management

---

### 10. Centralized Test Fixtures (WARNING - Test Quality)

**The Rule:** Use centralized `createMock*()` functions, not `as any` or inline mocks.

**Why:** Consistent test data, type safety, easier maintenance.

#### ❌ AVOID (Ad-hoc mocking):

```typescript
// ❌ Type safety bypassed
const client = { id: '123', name: 'Test' } as any

// ❌ Incomplete mocks
const campaign = { id: '456' } as Campaign  // Missing required fields!
```

#### ✅ PREFER (Centralized fixtures):

```typescript
// @/__tests__/fixtures/client.fixture.ts
import { Client } from '@prisma/client'

export function createMockClient(overrides?: Partial<Client>): Client {
  return {
    id: 'test-client-123',
    tenantId: 'test-tenant-123',
    name: 'Test Client',
    email: 'test@example.com',
    phone: '+5511999999999',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides  // ✅ Override specific fields
  }
}

// Usage in tests:
import { createMockClient } from '@/__tests__/fixtures'

const client = createMockClient({ name: 'Custom Name' })
const inactiveClient = createMockClient({ status: 'INACTIVE' })
```

**Benefits:**
- ✅ Type-safe (catches schema changes)
- ✅ Consistent test data
- ✅ Easy to update when schema changes
- ✅ Self-documenting (shows all required fields)

**Related Skills:**
- `javascript-testing-patterns` - Testing best practices

---

### 11. Optimistic Locking (WARNING - Concurrency)

**The Rule:** Use `version` fields for concurrent update detection on critical resources.

**Why:** Prevents lost updates when multiple users edit the same record.

#### Pattern:

```prisma
model Appointment {
  id        String   @id @default(uuid())
  tenantId  String
  version   Int      @default(0)  // ✅ Optimistic locking
  status    String
  // ... other fields

  @@index([tenantId, id, version])
}
```

```typescript
// Update with version check
export async function updateAppointment(params: {
  tenantId: string
  id: string
  version: number
  data: Partial<Appointment>
}) {
  const updated = await prisma.appointment.updateMany({
    where: {
      id: params.id,
      tenantId: params.tenantId,
      version: params.version  // ✅ Only update if version matches
    },
    data: {
      ...params.data,
      version: { increment: 1 }  // ✅ Increment version
    }
  })

  if (updated.count === 0) {
    throw new ORPCError({
      code: 'CONFLICT',
      message: 'Record was modified by another user',
      data: { errorCode: CoreErrorCode.CONFLICT }
    })
  }

  return updated
}
```

**When to use:**
- ✅ Appointments (concurrent booking)
- ✅ Orders (concurrent payment processing)
- ✅ Inventory (stock updates)
- ❌ Logs, analytics (append-only)

**Related Skills:**
- `architecture-patterns` - Concurrency patterns

---

## 🟡 WARNING-Level Rules (Strong Recommendations)

### 12. Input Validation (oRPC + Zod)

**Always validate with Zod schemas, never trust client input.**

```typescript
// ✅ Comprehensive input validation
export const campaignsRouter = router({
  create: protectedProcedure
    .input(z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1).max(200),
      totalValue: z.string().regex(/^\d+(\.\d{1,2})?$/),  // Decimal string
      currency: z.enum(['BRL', 'USD', 'MXN']),
      region: z.enum(['BR', 'US', 'LATAM']),
      startDate: z.date(),
      endDate: z.date()
    }))
    .mutation(async ({ input, ctx }) => {
      // Input is fully validated before this runs
      const campaign = await prisma.campaign.create({
        data: {
          ...input,
          totalValue: new Decimal(input.totalValue),
          tenantId: ctx.tenantId
        }
      });

      return campaign;
    })
});
```

**Related Skills:**
- `api-design-principles` - API validation patterns
- `sharp-edges` - Detect unsafe input handling

---

### 13. Tracing & Observability (Middleware)

**🚨 CRITICAL: OpenTelemetry tracing on 100% of routes - NO EXCEPTIONS.**

**Add OpenTelemetry tracing to ALL oRPC procedures for debugging, performance monitoring, and Grafana dashboards.**

```typescript
// packages/api/src/middleware/tracing.ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '@agency-tbd/observability';

export const tracingMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const tracer = trace.getTracer('agency-platform');

  return tracer.startActiveSpan(`${type}.${path}`, async (span) => {
    const start = Date.now();

    // Add span attributes for Grafana
    span.setAttributes({
      'rpc.service': 'agency-platform',
      'rpc.method': `${type}.${path}`,
      'tenant.id': ctx.session?.user?.tenantId || 'anonymous',
      'user.id': ctx.session?.user?.id || 'anonymous',
      'http.route': path
    });

    logger.info(`→ ${type}.${path}`, {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      tenantId: ctx.session?.user?.tenantId,
      userId: ctx.session?.user?.id
    });

    try {
      const result = await next({
        ctx: {
          ...ctx,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId
        }
      });

      const duration = Date.now() - start;
      span.setAttributes({ 'rpc.duration_ms': duration });
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info(`✅ ${type}.${path} (${duration}ms)`, {
        traceId: span.spanContext().traceId,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message
      });

      logger.error(`❌ ${type}.${path} (${duration}ms)`, {
        error: error as Error,
        traceId: span.spanContext().traceId,
        duration
      });

      throw error;
    } finally {
      span.end();
    }
  });
});

// 🚨 MANDATORY: Use on ALL procedures - NO EXCEPTIONS
export const publicProcedure = t.procedure.use(tracingMiddleware);
export const protectedProcedure = t.procedure
  .use(tracingMiddleware)     // MANDATORY - DO NOT REMOVE
  .use(authMiddleware)
  .use(tenantMiddleware);
```

**Grafana Dashboard Queries:**
```promql
# P95 latency by route
histogram_quantile(0.95, rate(rpc_duration_ms_bucket[5m])) by (http_route)

# Error rate by tenant
rate(rpc_errors_total[5m]) by (tenant_id)

# Throughput by service
rate(rpc_requests_total[1m]) by (rpc_service)
```

**Related Skills:**
- `senior-backend` - Observability patterns
- `deployment-pipeline-design` - Production monitoring

---

### 14. Error Handling (User-Friendly + i18n)

**Throw ORPCError with proper codes and i18n-ready messages.**

```typescript
// ✅ Good error handling
export const campaignsRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const campaign = await prisma.campaign.findUnique({
        where: {
          id_tenantId: {
            id: input.id,
            tenantId: ctx.tenantId
          }
        }
      });

      if (!campaign) {
        throw new ORPCError({
          code: 'NOT_FOUND',
          message: 'errors.campaignNotFound',  // i18n key
          cause: { campaignId: input.id }
        });
      }

      if (campaign.deletedAt) {
        throw new ORPCError({
          code: 'GONE',
          message: 'errors.campaignDeleted'
        });
      }

      return campaign;
    })
});
```

**Related Skills:**
- `error-handling-patterns` - Resilience patterns
- `api-design-principles` - REST error codes

---

### 15. Queue/Background Jobs (Don't Block HTTP Requests)

**Use queues for slow operations - keep HTTP responses fast.**

#### ❌ AVOID (Blocking requests):

```typescript
// ❌ Email sending blocks HTTP response (2-5 seconds)
export const campaignsRouter = router({
  create: protectedProcedure
    .mutation(async ({ input, ctx }) => {
      const campaign = await prisma.campaign.create({ ... });

      await sendEmail({  // ❌ Blocks response
        to: campaign.client.email,
        subject: 'Campaign Created',
        template: 'campaign-created'
      });

      await generateNotaFiscal(campaign.id);  // ❌ 5+ seconds

      return campaign;  // User waits 7+ seconds
    })
});
```

#### ✅ PREFER (Async with queues):

```typescript
// packages/queue/src/index.ts (BullMQ setup)
import { Queue } from 'bullmq';
import { redis } from '@agency-tbd/db';

export const emailQueue = new Queue('email', { connection: redis });
export const notaFiscalQueue = new Queue('nota-fiscal', { connection: redis });

// Add jobs to queue (fast)
export async function queueEmail(params: EmailParams) {
  await emailQueue.add('send', params, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
}

// oRPC procedure (fast response)
export const campaignsRouter = router({
  create: protectedProcedure
    .mutation(async ({ input, ctx }) => {
      const campaign = await prisma.campaign.create({ ... });

      // Queue async work (< 10ms)
      await queueEmail({
        to: campaign.client.email,
        subject: 'Campaign Created',
        template: 'campaign-created',
        data: { campaignId: campaign.id }
      });

      await notaFiscalQueue.add('generate', {
        campaignId: campaign.id
      });

      return campaign;  // ✅ Fast response (< 200ms)
    })
});

// packages/worker/src/processors/emailProcessor.ts
import { Worker } from 'bullmq';
import { sendEmail } from '@agency-tbd/email';

export const emailWorker = new Worker('email', async (job) => {
  const { to, subject, template, data } = job.data;
  await sendEmail({ to, subject, template, data });
}, { connection: redis });
```

**When to use queues:**
- ✅ Email sending
- ✅ Payment processing (webhooks, retries)
- ✅ Report generation (PDFs, Excel)
- ✅ Nota Fiscal generation (Brazil)
- ✅ Bulk operations (import 100 influencers)
- ✅ Third-party API calls (can fail/timeout)

**Setup (v0.2+):**
- Install: `pnpm add bullmq ioredis`
- Create `packages/queue/` workspace
- Create `packages/worker/` for processors
- Configure Redis connection

**Related Skills:**
- `senior-backend` - Queue architecture patterns
- `error-handling-patterns` - Retry logic

---

### 16. Public API Versioning (Future-Proof External Integrations)

**Version all public APIs to avoid breaking client integrations.**

**When needed:** v1.5+ when external agencies/influencers integrate with your API.

#### ❌ AVOID (Breaking changes break clients):

```typescript
// apps/web/src/app/api/campaigns/route.ts
export async function GET(req: Request) {
  // v1: Returns { status: 'ACTIVE' | 'COMPLETED' }
  // v2: You add 'PAUSED' status → breaks all clients expecting only 2 values
}
```

#### ✅ PREFER (Versioned endpoints):

```typescript
// apps/web/src/app/api/public/v1/campaigns/route.ts
import { z } from 'zod';

// v1 schema (frozen - never break)
export const CampaignV1Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']),
  totalValue: z.string(),  // Decimal as string
  currency: z.enum(['BRL', 'USD', 'MXN'])
});

export async function GET(req: Request) {
  // v1 endpoint - never change schema
  const campaigns = await getCampaigns();
  return Response.json(campaigns.map(toV1Schema));
}

// apps/web/src/app/api/public/v2/campaigns/route.ts
// v2 schema (breaking changes OK - new path)
export const CampaignV2Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),  // ✅ New statuses
  totalValue: z.number(),  // ✅ Breaking: Changed to number
  currency: z.enum(['BRL', 'USD', 'MXN', 'EUR']),  // ✅ New currency
  metadata: z.record(z.unknown()).optional()  // ✅ New field (non-breaking)
});
```

**Versioning rules:**
- ✅ Version in URL path (`/api/public/v1/`, `/api/public/v2/`)
- ✅ Never change v1 response schema (even to add fields)
- ✅ Deprecate old versions (but keep running for 6-12 months)
- ✅ Document breaking changes in changelog

**Non-breaking changes (OK in same version):**
- ✅ Add optional fields
- ✅ Add new endpoints
- ✅ Improve error messages

**Breaking changes (require new version):**
- ❌ Remove fields
- ❌ Rename fields
- ❌ Change field types
- ❌ Change enum values
- ❌ Change error codes

**Related Skills:**
- `api-design-principles` - REST API standards
- `senior-backend` - API versioning strategies

---

### 17. Import Path Organization (Frontend/Backend Separation)

**Configure package.json exports to prevent shipping server code to client.**

#### ❌ RISK (Shipping Prisma client to browser):

```typescript
// packages/db/package.json (bad - exposes everything)
{
  "exports": "./dist/index.js"  // ❌ Client can import anything
}

// apps/web/src/components/CampaignCard.tsx
import { prisma } from '@agency-tbd/db';  // ❌ Prisma in browser = 500KB + security leak
const campaigns = await prisma.campaign.findMany();  // ❌ Runs in browser!
```

#### ✅ SAFE (Controlled exports):

```typescript
// packages/db/package.json (good - separate exports)
{
  "exports": {
    ".": "./dist/index.js",           // ✅ Types only (Prisma types, not client)
    "./client": "./dist/client.js"    // ✅ Server-only (Prisma client)
  }
}

// packages/db/src/index.ts (types only)
export type { Campaign, Client, Deliverable } from '@prisma/client';
export type { Prisma } from '@prisma/client';

// packages/db/src/client.ts (server only)
export { prisma } from './prisma';

// Usage:
// ✅ Frontend (types only)
import type { Campaign } from '@agency-tbd/db';

// ✅ Backend (client access)
import { prisma } from '@agency-tbd/db/client';
```

**Benefits:**
- ✅ Prevents accidental Prisma client in browser bundle
- ✅ Faster builds (Vercel won't bundle server code)
- ✅ Smaller bundle size
- ✅ Clear frontend/backend boundaries

**Package export structure:**

```typescript
// packages/domain/package.json
{
  "exports": {
    "./financial/*": "./dist/financial/*.js",  // ✅ Expose pure functions
    "./campaign/*": "./dist/campaign/*.js"
  }
}

// packages/api/package.json
{
  "exports": {
    ".": "./dist/index.js"  // ✅ Server-only (oRPC procedures)
  }
}
```

**Setup checklist:**
- [ ] Configure package.json exports for each workspace
- [ ] Separate types (client-safe) from implementation (server-only)
- [ ] Test build to ensure no Prisma client in browser bundle
- [ ] Document import paths in AGENTS.md

**Related Skills:**
- `monorepo-management` - Workspace configuration
- `nextjs-app-router-patterns` - Client/Server Components

---

### 18. Production Observability (OpenTelemetry)

**Upgrade from basic tracing to production-grade observability.**

**Current (v0.1):** Basic tracing middleware in oRPC
**Target (v1.0):** Full OpenTelemetry with structured logging

#### ✅ Production observability pattern (Pino + OpenTelemetry):

```typescript
// packages/observability/src/index.ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import pino from 'pino';

// 🚨 Use Pino for production-grade structured logging (faster than Winston)
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Auto-inject trace context into every log
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};

    const spanContext = span.spanContext();
    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      trace_flags: spanContext.traceFlags
    };
  }
});

// Convenience wrapper that auto-adds trace context
export function log(level: 'info' | 'error' | 'warn' | 'debug', message: string, meta?: object) {
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  const spanId = span?.spanContext().spanId;

  logger[level]({
    ...meta,
    trace_id: traceId,
    span_id: spanId
  }, message);
}

// Record exceptions to span
export function traceException(error: Error, meta?: object) {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  log('error', error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...meta
  });
}

// Instrument critical operations
export async function instrumentAsync<T>(
  options: { name: string; attributes?: Record<string, string> },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('agency-platform');
  return tracer.startActiveSpan(options.name, async (span) => {
    try {
      if (options.attributes) {
        span.setAttributes(options.attributes);
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// Usage in oRPC procedures:
import { log, traceException, instrumentAsync } from '@agency-tbd/observability';

export const campaignsRouter = router({
  calculatePayout: protectedProcedure
    .query(async ({ input, ctx }) => {
      log('info', 'Calculating campaign payout', {
        campaignId: input.campaignId,
        tenantId: ctx.tenantId
      });

      try {
        const splits = await instrumentAsync(
          {
            name: 'financial.calculateSplits',
            attributes: { campaignId: input.campaignId }
          },
          async (span) => {
            const campaign = await getCampaign(input.campaignId);
            span.setAttribute('totalValue', campaign.totalValue.toString());
            return calculateSplits(campaign);
          }
        );

        return splits;
      } catch (error) {
        traceException(error as Error, {
          campaignId: input.campaignId
        });
        throw error;
      }
    })
});
```

**Setup (Production):**
```bash
# Install OpenTelemetry + Pino
pnpm add @opentelemetry/api @opentelemetry/sdk-node pino pino-pretty

# Vercel has built-in OpenTelemetry support - auto-configured
```

**Grafana Integration:**
- OpenTelemetry traces → Grafana Tempo
- Pino logs → Grafana Loki (via JSON format)
- Metrics → Grafana Prometheus (via OpenTelemetry SDK)

**Critical Paths to Instrument:**
- ✅ All oRPC procedures (via `tracingMiddleware`)
- ✅ Financial calculations (tax, splits, payouts)
- ✅ Payment flows (Stripe webhooks, transfers)
- ✅ Database queries (slow query detection)
- ✅ External API calls (rate limit tracking)

**Related Skills:**
- `senior-backend` - Production observability patterns
- `deployment-pipeline-design` - Monitoring setup

---

### 19. API Standards (Rate Limiting, Error Handling, Tracing)

**MANDATORY production standards for all API routes (internal and public).**

**See:** [ADR-0011: API Standards](../../../docs/adr/0011-api-standards-and-best-practices.md) for complete reference.

#### ✅ Rate Limiting (MANDATORY):

```typescript
// packages/api/src/middleware/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.tokenBucket(100, '1m', 10)  // 100 req/min, burst 10
});

export const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.tenantId || ctx.ip;
  const { success } = await ratelimit.limit(identifier);

  if (!success) {
    throw new ORPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'errors.rateLimitExceeded'
    });
  }

  return next({ ctx });
});

// ✅ Apply to ALL procedures
export const protectedProcedure = t.procedure
  .use(tracingMiddleware)    // MANDATORY
  .use(rateLimitMiddleware)  // MANDATORY
  .use(authMiddleware);
```

#### ✅ Error Handling (MANDATORY):

```typescript
// packages/api/src/lib/errors.ts
export const Errors = {
  NotFound: (resource: string) => new ORPCError({
    code: 'NOT_FOUND',
    message: `errors.${resource}NotFound`  // i18n key
  }),

  Forbidden: (resource?: string) => new ORPCError({
    code: 'FORBIDDEN',
    message: resource ? `errors.forbidden.${resource}` : 'errors.forbidden'
  }),

  Conflict: (resource: string, field?: string) => new ORPCError({
    code: 'CONFLICT',
    message: field
      ? `errors.${resource}AlreadyExists.${field}`
      : `errors.${resource}AlreadyExists`
  })
} as const;

// ✅ Usage
if (!campaign) throw Errors.NotFound('campaign');
if (existingEmail) throw Errors.Conflict('user', 'email');
```

#### ✅ 100% Route Tracing (MANDATORY):

```typescript
// ✅ ALL procedures MUST have tracing
export const publicProcedure = t.procedure
  .use(tracingMiddleware);  // MANDATORY - NO EXCEPTIONS

export const protectedProcedure = t.procedure
  .use(tracingMiddleware)   // MANDATORY - NO EXCEPTIONS
  .use(rateLimitMiddleware)
  .use(authMiddleware);

// ❌ BLOCKER - Procedure without tracing
const unsafeProcedure = t.procedure;  // NEVER DO THIS
```

#### ✅ Response Envelopes (Public API):

```typescript
// Public REST API: Use envelope
// apps/web/src/app/api/public/v1/campaigns/route.ts
export async function GET(req: Request) {
  const result = await caller.list({ ... });

  return Response.json({
    success: true,
    data: result.data,
    meta: {
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
      version: 'v1'
    }
  });
}
```

#### ✅ Pagination (Cursor-Based):

```typescript
// ✅ Cursor pagination for performance
export const ListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20)
});

export const campaignsRouter = router({
  list: protectedProcedure
    .input(ListSchema)
    .query(async ({ input, ctx }) => {
      const items = await ctx.db.campaign.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.cursor && { id: { gt: input.cursor } })
        },
        take: input.limit + 1,
        orderBy: { id: 'asc' }
      });

      const hasMore = items.length > input.limit;
      const data = hasMore ? items.slice(0, -1) : items;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      return { data, pagination: { nextCursor, hasMore, limit: input.limit } };
    })
});
```

**OWASP API Security Top 10 Coverage:**
- ✅ API1: Broken Object Level Authorization → Composite unique keys
- ✅ API2: Broken Authentication → Better-Auth + JWT
- ✅ API3: Broken Property Authorization → Zod whitelists
- ✅ API4: Unrestricted Resource Consumption → Rate limiting
- ✅ API5: Broken Function Authorization → Role-based procedures
- ✅ API6: Sensitive Business Flows → Multi-factor workflows
- ✅ API7: SSRF → No user-controlled URLs
- ✅ API8: Security Misconfiguration → Zod env validation
- ✅ API9: Improper Inventory → OpenAPI docs
- ✅ API10: Unsafe API Consumption → Validate external APIs with Zod

**Related Skills:**
- `api-design-principles` - REST/GraphQL best practices
- `error-handling-patterns` - Error handling strategies

---

### 20. oRPC Middleware Stack Order (CRITICAL)

**⚠️ Middleware order is MANDATORY - do not reorder or skip layers.**

**The Stack (outermost to innermost):**

```typescript
const myProcedure = orpc
  .use(withErrorHandling())           // 1. Catch all errors (MUST be outermost)
  .use(withLogging('api.resource'))   // 2. Request/response logs
  .use(withTracing())                 // 3. OpenTelemetry spans
  .use(requireAuth())                 // 4. Authentication
  // Per-route additions:
  .use(rateLimitPreset('standard'))   // 5. Rate limiting
  .use(requirePermission(PERM))       // 6. Authorization
  .input(Schema)                      // 7. Input validation
  .output(Schema)                     // 8. Output validation
  .handler(async ({ input, context }) => { ... })
```

**Why This Order:**

| Layer | Reason |
|-------|--------|
| Error handling first | Must be outermost to catch errors from ALL other middleware |
| Logging second | Captures timing for entire request lifecycle |
| Tracing third | Creates parent span for all child operations |
| Auth fourth | Identity must be known before rate limiting per-user |
| Rate limit fifth | Reject BEFORE expensive permission checks |
| Permission sixth | Requires identity from auth layer |

**Base Procedures (Pre-Configured):**

```typescript
// Public procedure (no auth)
export const publicProcedure = orpc
  .use(withErrorHandling())
  .use(withLogging("api.public"))
  .use(withTracing());

// Authenticated procedure (includes auth)
export const authenticatedProcedure = orpc
  .use(withErrorHandling())
  .use(withLogging("api.authenticated"))
  .use(withTracing())
  .use(requireAuth());  // ✅ Auth included

// Routes then add rate limiting + permissions
const listCampaigns = authenticatedProcedure
  .use(rateLimitPreset("standard"))
  .use(requirePermission(Permission.VIEW_CAMPAIGNS))
  .handler(async ({ context }) => { ... });
```

**Common Mistakes:**

```typescript
// ❌ WRONG: Rate limit before auth (can't identify user)
const wrong = orpc
  .use(rateLimitPreset("standard"))  // ❌ Who to rate limit?
  .use(requireAuth());

// ❌ WRONG: Permission before auth (no identity)
const wrong = orpc
  .use(requirePermission(Permission.VIEW))  // ❌ Who has permission?
  .use(requireAuth());

// ❌ WRONG: Error handling NOT first (can't catch auth errors)
const wrong = orpc
  .use(requireAuth())
  .use(withErrorHandling());  // ❌ Too late!
```

**Related Skills:**
- `api-design-principles` - API middleware patterns
- `error-handling-patterns` - Error middleware

---

### 21. File Upload Security (CRITICAL)

**⚠️ File uploads are a major attack vector - validate EVERYTHING.**

**Pattern (UploadThing):**

```typescript
// ✅ Secure file upload configuration
import { createUploadthing } from "uploadthing/next";

const f = createUploadthing();

export const uploadRouter = {
  imageUpload: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 10
    }
  })
    .middleware(async ({ req }) => {
      // 1. Verify authentication
      const session = await getSession(req);
      if (!session?.user) throw new Error("Unauthorized");

      // 2. Verify tenant permissions
      const tenantId = session.user.tenantId;
      if (!tenantId) throw new Error("No tenant context");

      // 3. Check storage quota
      const usage = await checkStorageUsage(tenantId);
      if (usage.bytesUsed > usage.bytesLimit) {
        throw new Error("Storage quota exceeded");
      }

      // Pass tenant context to onUploadComplete
      return { tenantId, userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // 4. Save file metadata with tenant isolation
      await prisma.file.create({
        data: {
          tenantId: metadata.tenantId,
          userId: metadata.userId,
          url: file.url,
          name: file.name,
          size: file.size,
          mimeType: file.type
        }
      });
    })
};
```

**Security Checklist:**

- [ ] **Max file size** (prevent DoS via large uploads)
- [ ] **Max file count** (prevent storage exhaustion)
- [ ] **MIME type validation** (only allow expected types)
- [ ] **Authentication required** (no anonymous uploads)
- [ ] **Tenant isolation** (files scoped to tenantId)
- [ ] **Storage quota checks** (prevent abuse)
- [ ] **File metadata saved** (for tracking/cleanup)
- [ ] **Virus scanning** (for sensitive apps)
- [ ] **Signed URLs** (for access control)

**Common Vulnerabilities:**

```typescript
// ❌ BLOCKER: No size limit (DoS via 10GB file)
f({ image: {} })  // Missing maxFileSize

// ❌ BLOCKER: No tenant isolation (data leak)
.onUploadComplete(async ({ file }) => {
  await prisma.file.create({
    data: { url: file.url }  // Missing tenantId!
  });
})

// ❌ BLOCKER: No authentication (anonymous uploads)
.middleware(async () => {
  return {};  // No session check!
})
```

**Multi-Tenant File Deletion:**

```typescript
// ✅ Soft delete files (compliance)
await prisma.file.update({
  where: {
    id_tenantId: {
      id: fileId,
      tenantId: ctx.tenantId  // ✅ Scoped
    }
  },
  data: { deletedAt: new Date() }
});

// Schedule background cleanup (after 90 days)
await fileCleanupQueue.add("cleanup", {
  fileId,
  scheduledFor: addDays(new Date(), 90)
});
```

**Related Skills:**
- `sharp-edges` - Detect upload vulnerabilities
- `api-design-principles` - API upload patterns

---

### 22. Function Length Limits (Enforced by ESLint)

**Rule:** Max 50 lines per function. Enforced by `eslint-plugin-max-lines-per-function`.

**Why:** Long functions are:
- Harder to test (too many paths)
- Harder to review (cognitive overload)
- Harder to refactor (tight coupling)
- More likely to have bugs

**Refactoring Patterns:**

#### Pattern 1: Extract Custom Hooks (React)

```typescript
// ❌ BAD: 100+ lines in component
export default function NewClientPage() {
  const form = useForm({ /* 40 lines */ });
  const onSubmit = async (values) => { /* 30 lines */ };
  return <form>{/* 50 lines */}</form>;
}

// ✅ GOOD: Extract to custom hook
export default function NewClientPage() {
  const { form, isSubmitting, onSubmit } = useCreateClient();
  return <PageContainer><Form {...form} /></PageContainer>;
}

// hooks/useCreateClient.ts
export function useCreateClient() {
  const form = useForm({ /* validation */ });
  const mutation = useMutation({ /* API call */ });

  const onSubmit = useCallback(async (values) => {
    await mutation.mutateAsync(values);
  }, [mutation]);

  return { form, onSubmit, isSubmitting: mutation.isPending };
}
```

#### Pattern 2: Extract Helper Components

```typescript
// ❌ BAD: Repetitive form fields (15 lines × 5 = 75 lines)
<FormField control={form.control} name="email" render={({ field }) => (
  <FormItem>
    <FormLabel>{t("email")}</FormLabel>
    <FormControl>
      <Input type="email" {...field} />
    </FormControl>
    <FormMessage />
  </FormItem>
)} />

// ✅ GOOD: Helper component (3 lines per field)
<FormInputField
  control={form.control}
  name="email"
  label={t("email")}
  type="email"
/>
```

#### Pattern 3: Extract Sub-Components

```typescript
// ❌ BAD: All logic inline (80 lines)
function DashboardContent() {
  return (<>
    <div className="stats">{/* 40 lines */}</div>
    <div className="campaigns">{/* 40 lines */}</div>
  </>);
}

// ✅ GOOD: Extract logical sections
function DashboardContent() {
  return (<>
    <StatsSection stats={stats} t={t} />
    <CampaignsSection campaigns={campaigns} t={t} />
  </>);
}
```

#### Pattern 4: Extract Domain Functions

```typescript
// ❌ BAD: Complex calculation in oRPC handler (60 lines)
const calculateCampaignFinancials = authenticatedProcedure
  .handler(async ({ input }) => {
    const tax = input.value * 0.11;  // 40 more lines...
    const net = input.value - tax;
    // ... complex business logic
  });

// ✅ GOOD: Extract to domain layer
const calculateCampaignFinancials = authenticatedProcedure
  .handler(async ({ input }) => {
    const result = calculateFinancialSplits({
      totalValue: Money.fromCents(input.valueCents),
      taxRate: 0.11
    });
    return result;
  });
```

**When to Extract:**

| Lines | Action |
|-------|--------|
| 0-30  | ✅ OK (simple, focused function) |
| 31-45 | ⚠️ Consider extracting if it has clear sections |
| 46-50 | 🟡 Extract before adding more code |
| 51+   | 🔴 BLOCKER - Must extract immediately |

**Pre-commit Hook:**

```bash
# .lefthook.yml
pre-commit:
  commands:
    eslint:
      glob: "*.{ts,tsx}"
      run: eslint --max-warnings 0 {staged_files}
      # Fails on max-lines-per-function violations
```

**Related Skills:**
- `code-simplifier` - Refactoring techniques
- `react-best-practices` - React composition patterns

---

### 23. Type Safety Workarounds (Library-Specific)

**Sometimes TypeScript's type system requires workarounds for library limitations.**

#### next-intl v4 Type Safety

**Issue:** next-intl v4 only accepts string params, but you need to pass numbers/dates.

```typescript
// ❌ TypeScript error: Type 'number' is not assignable to 'string'
t("dashboard.stats.total", { count: 42 })

// ✅ Double cast workaround
t("dashboard.stats.total", { count: 42 as unknown as string })

// ✅ Exception: ICU plural/format syntax works without cast
t("items", { count: 42 })  // Uses {count, plural, one {...} other {...}}
```

**Why:** next-intl v4 changed its type signature but still supports non-string params at runtime. Double cast is TypeScript-approved for non-overlapping types.

**Reference:** TypeScript handbook on "Type Assertions"

#### Prisma JsonValue Type Coercion

**Issue:** Prisma JSON columns return `JsonValue` type, but you need typed objects.

```typescript
// ❌ TypeScript error: JsonValue not assignable to MoneyJSON
const dealValue: MoneyJSON = deal.dealValue;

// ✅ Double cast for JSON columns
const dealValue: MoneyJSON = deal.dealValue as unknown as MoneyJSON;

// Then use with proper types
const result = calculateFinancials({
  totalValue: Money.fromCents(dealValue.amountCents),
  currency: dealValue.currency
});
```

**Why:** Prisma's JSON type is conservative (doesn't know your schema). Double cast tells TypeScript "I know this JSON structure."

**Pattern:**

```typescript
// Define your JSON type
export interface MoneyJSON {
  amountCents: number;
  currency: "BRL" | "USD" | "MXN";
}

// Use in oRPC output
const DealOutput = z.object({
  id: z.string(),
  dealValue: z.custom<MoneyJSON>()
});

// Transform in handler
.handler(async ({ input, context }) => {
  const deal = await prisma.deal.findUnique({ ... });

  return {
    ...deal,
    dealValue: deal.dealValue as unknown as MoneyJSON
  };
})
```

**Related Skills:**
- `typescript-advanced-types` - Advanced type patterns
- `prisma-expert` - Prisma type utilities

---


### 24. Better-Auth Security & Implementation

**⚠️ CRITICAL: Follow these patterns to prevent authentication vulnerabilities.**

**Environment & Secret Management:**
```typescript
// ❌ NEVER hardcode secrets
const auth = betterAuth({
  secret: "my-secret-key",  // BLOCKER!
  baseURL: "http://localhost:3001"  // BLOCKER!
});

// ✅ ALWAYS use environment variables
const auth = betterAuth({
  // Automatically uses BETTER_AUTH_SECRET and BETTER_AUTH_URL from env
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  })
});

// Generate secret with: openssl rand -base64 32 (minimum 32 characters)
```

**CSRF & Origin Protection:**
```typescript
// ❌ NEVER disable security in production
const auth = betterAuth({
  advanced: {
    disableCSRFCheck: true,  // BLOCKER!
    useSecureCookies: false  // BLOCKER in production!
  }
});

// ✅ Whitelist trusted origins
const auth = betterAuth({
  trustedOrigins: [
    "https://app.agency-platform.com",
    "https://staging.agency-platform.com"
  ],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production"
  }
});
```

**Session Management Strategy:**
```typescript
// Multi-layered session storage (recommended for production)
const auth = betterAuth({
  secondaryStorage: {
    // Primary storage (Redis/KV) - fastest, takes precedence
    get: async (key) => await redis.get(key),
    set: async (key, value, ttl) => await redis.set(key, value, "EX", ttl),
    delete: async (key) => await redis.del(key)
  },
  // Optional: Persist to database for long-term storage
  session: {
    modelName: "Session",  // Prisma model name, NOT table name!
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60  // 5 minutes cookie cache
    }
  }
});
```

**Database Integration (CRITICAL):**
```typescript
// ❌ WRONG - Using table name instead of model name
const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  user: {
    modelName: "users"  // BLOCKER - this is the table name!
  }
});

// ✅ CORRECT - Use Prisma model name
const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  user: {
    modelName: "User"  // ✅ Prisma model name
  },
  session: {
    modelName: "Session"  // ✅ Prisma model name
  }
});
```

**Plugin Architecture:**
```typescript
// ✅ Import from dedicated paths (enables tree-shaking)
import { twoFactor } from "better-auth/plugins/two-factor";
import { admin } from "better-auth/plugins/admin";

const auth = betterAuth({
  plugins: [
    twoFactor(),
    admin()
  ]
});

// ⚠️ IMPORTANT: Re-run schema generation after adding plugins
// npx @better-auth/cli@latest generate
```

**Email Flows (Required Handlers):**
```typescript
// ❌ Email verification won't work without sendVerificationEmail
const auth = betterAuth({
  emailVerification: {
    enabled: true
    // Missing sendVerificationEmail handler!
  }
});

// ✅ Define all email handlers explicitly
const auth = betterAuth({
  emailVerification: {
    enabled: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailQueue.add("verification", {
        to: user.email,
        verificationUrl: url
      });
    }
  },
  passwordReset: {
    sendResetPassword: async ({ user, url }) => {
      await emailQueue.add("password-reset", {
        to: user.email,
        resetUrl: url
      });
    }
  }
});
```

**Rate Limiting:**
```typescript
// ✅ Configure rate limiting for auth endpoints
const auth = betterAuth({
  rateLimit: {
    // Memory storage (development)
    storage: "memory",
    // Database/Redis storage (production)
    // storage: "database"  or  storage: "secondary"
    window: 60,  // 60 seconds
    max: 10      // 10 requests per window
  }
});
```

**Custom IP Detection (Behind Proxies):**
```typescript
// ✅ Specify proxy headers when behind load balancers
const auth = betterAuth({
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["CF-Connecting-IP", "X-Forwarded-For"]
    }
  }
});
```

**Type Safety (TypeScript):**
```typescript
// ✅ Type-safe session/user access
import { auth } from "@/lib/auth";

type Session = typeof auth.$Infer.Session;
type User = typeof auth.$Infer.Session.user;

// Use in oRPC context
export const createContext = async ({ req, res }) => {
  const session = await auth.api.getSession({ headers: req.headers });
  return {
    session: session as Session | null,
    user: session?.user as User | null
  };
};
```

**Common Pitfalls:**
1. ❌ Confusing Prisma model names with database table names
2. ❌ Forgetting to run `npx @better-auth/cli@latest generate` after plugin changes
3. ❌ Assuming sessions persist to database when using secondary storage (they don't by default)
4. ❌ Custom session fields bypass cookie caching (require database access)
5. ❌ Stateless cookie-only deployments lose sessions on cache expiration

**Pre-commit checklist (Better-Auth):**
- [ ] `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in environment variables
- [ ] No hardcoded secrets or baseURL in config
- [ ] CSRF protection enabled (never disabled in production)
- [ ] `useSecureCookies: true` in production
- [ ] Prisma model names (not table names) in config
- [ ] Email handlers defined for verification/password reset
- [ ] Schema regenerated after plugin changes (`npx @better-auth/cli@latest generate`)
- [ ] Rate limiting configured for auth endpoints
- [ ] Trusted origins whitelisted

**Related Skills:**
- `auth-implementation-patterns` - OAuth, JWT, session patterns
- `sharp-edges` - Detect authentication vulnerabilities

**References:**
- [Better-Auth Documentation](https://www.better-auth.com/docs)
- [TECHNICAL-SPEC.md Section 5](../../../docs/TECHNICAL-SPEC.md#5-authentication--authorization)

---

## 💡 PATTERN-Level Rules (Best Practices)

### 25. Prisma Query Optimization

**Use `select` and `include` strategically to avoid N+1 queries.**

```typescript
// ❌ N+1 query problem
const campaigns = await prisma.campaign.findMany({
  where: { tenantId: ctx.tenantId }
});

// Later: N queries for each campaign
for (const campaign of campaigns) {
  const deliverables = await prisma.deliverable.findMany({
    where: { campaignId: campaign.id }  // ❌ N queries
  });
}

// ✅ Include (single query)
const campaigns = await prisma.campaign.findMany({
  where: { tenantId: ctx.tenantId },
  include: {
    deliverables: true,  // ✅ Joined in SQL
    client: {
      select: { id: true, name: true }  // ✅ Only needed fields
    }
  }
});

// ✅ Select specific fields (reduce payload)
const campaigns = await prisma.campaign.findMany({
  where: { tenantId: ctx.tenantId },
  select: {
    id: true,
    name: true,
    status: true,
    totalValue: true
    // Don't fetch description, notes, etc. unless needed
  }
});
```

**Related Skills:**
- `prisma-expert` - Advanced Prisma patterns
- `sql-optimization-patterns` - Query performance

---

### 26. Testing Strategy

**Test Pyramid:**
- 70% Unit tests (domain layer, pure functions)
- 20% Integration tests (oRPC procedures + DB)
- 10% E2E tests (critical user flows)

```typescript
// packages/domain/financial/calculate-splits.test.ts
describe('calculateSplits (UNIT)', () => {
  // ✅ Fast, isolated, no DB
  it('should calculate exact splits', () => {
    const result = calculateSplits({ ... });
    expect(result.tax.toCents()).toBe(11000);
  });
});

// packages/api/src/routers/campaigns.test.ts
describe('Campaigns Router (INTEGRATION)', () => {
  // ✅ Real DB, real oRPC context
  it('should create campaign and return ID', async () => {
    const result = await caller.campaigns.create({ ... });
    expect(result.id).toBeDefined();

    // Verify in DB
    const campaign = await prisma.campaign.findUnique({ ... });
    expect(campaign?.name).toBe('Test Campaign');
  });
});
```

**Related Skills:**
- `test-driven-development` - TDD workflow
- `javascript-testing-patterns` - Vitest patterns
- `e2e-testing-patterns` - Playwright E2E

---

## 🔍 Pre-Commit Checklist

Before committing any code, verify:

**Core Safety (BLOCKER-level):**
- [ ] **Multi-Tenant:** All database queries use tenant-safe repositories
- [ ] **Financial:** All money uses `Money` value object (not `Float`, `number`, or raw `Decimal`)
- [ ] **Soft Delete:** No `.delete()` calls on user/financial data
- [ ] **i18n:** No hardcoded UI strings (all use `t()`)
- [ ] **Domain Layer:** Complex logic extracted to `packages/domain/`
- [ ] **Environment Vars:** All env vars validated with Zod (`packages/env`)

**API Architecture (WARNING-level):**
- [ ] **Dual API:** Used correct pattern (oRPC for internal, REST for external, Server Actions for forms)
- [ ] **Response Builders:** Used standardized `successResponse`/`errorResponse`
- [ ] **Error Codes:** Used centralized `CoreErrorCode` enum

**Production Readiness (WARNING-level):**
- [ ] **Validation:** All oRPC inputs have Zod schemas
- [ ] **🚨 Tracing:** 100% route coverage - ALL procedures use `tracingMiddleware` with OpenTelemetry (NO EXCEPTIONS - FLAWLESS COVERAGE REQUIRED)
- [ ] **Logging:** All critical paths use Pino logger with trace context (not console.log)
- [ ] **Grafana:** Dashboards configured for latency, errors, throughput
- [ ] **Rate Limiting:** All procedures have rate limiting via `rateLimitMiddleware`
- [ ] **Error Handling:** Use `Errors.*` helpers with i18n keys
- [ ] **Response Envelopes:** Public API routes use standard `{success, data, meta}` format
- [ ] **OWASP Coverage:** API routes follow OWASP API Security Top 10
- [ ] **Better-Auth Security:** No hardcoded secrets, CSRF enabled, Prisma model names (not table names)
- [ ] **Better-Auth Env:** `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in environment variables
- [ ] **Queues:** Long-running tasks use BullMQ (don't block HTTP)
- [ ] **API Versioning:** External APIs use `/api/public/v1/` paths
- [ ] **Import Paths:** Backend code in `package.json` exports (not frontend-accessible)
- [ ] **Observability:** Critical paths instrumented with OpenTelemetry
- [ ] **Optimistic Locking:** Concurrent updates use `version` field

**Code Quality (PATTERN-level):**
- [ ] **Tests:** Financial logic has unit tests
- [ ] **Test Fixtures:** Used `createMock*()` from centralized fixtures
- [ ] **Types:** No `any` types, strict TypeScript
- [ ] **Prisma Optimization:** No N+1 queries, includes only needed fields
- [ ] **HTTP Status:** Errors use consistent oRPC codes
- [ ] **Function Length:** No functions > 50 lines

---

## 🎯 Related Skills by Category

**Security (Trail of Bits):**
- `semgrep` - Static analysis security patterns
- `sharp-edges` - Dangerous API detection
- `frontend-code-review` - Manual security review
- `auth-implementation-patterns` - Authentication/authorization

**Architecture:**
- `architecture-patterns` - Clean Architecture, DDD
- `senior-backend` - Backend best practices
- `api-design-principles` - REST/GraphQL standards

**Testing:**
- `test-driven-development` - TDD workflow
- `javascript-testing-patterns` - Vitest patterns
- `property-based-testing` - Edge case testing

**Next.js/React:**
- `nextjs-app-router-patterns` - Next.js 16 App Router
- `react-19` - React 19 patterns
- `wcag-audit-patterns` - Accessibility

**Database:**
- `prisma-expert` - Advanced Prisma patterns
- `sql-optimization-patterns` - Query performance

---

## 📚 Documentation References

- [Technical Specification](../../../docs/TECHNICAL-SPEC.md) - Master implementation plan
- [AGENTS.md](../../../AGENTS.md) - Quick reference guide
- [Prisma Schema](../../../packages/db/prisma/schema.prisma) - Data model
- [oRPC Route Standards](../../../docs/standards/ORPC_ROUTE_STANDARDS.md) - API standards

---

**Last Updated:** 2026-02-07
**Maintained By:** Victor Penter
**Version:** 4.0.0
