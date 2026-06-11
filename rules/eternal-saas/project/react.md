---
id: eternal-saas-react
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/show-web/src/**/*.tsx"
globs:
  - "apps/web/src/**/*.tsx"
  - "apps/show-web/src/**/*.tsx"
description: "React patterns: React Compiler rules, memoization ban, client vs server logger."
hosts: [claude, codex, cursor]
verify: "pnpm check-types"
---

# React Rules

## useCallback / useMemo / memo are banned

React Compiler (React 19+) handles memoization automatically. Manual memoization fights the compiler and may cause subtle bugs.

```typescript
// WRONG — do not add any of these
const memoValue = useMemo(() => compute(deps), [deps])
const memoFn = useCallback(() => handler(), [])
const MemoComponent = memo(Component)
```

## logger.ts is server-only

`@/lib/logger` imports server env — crashes in `"use client"` components.

```typescript
// In "use client" files
import { clientLogger } from '@/lib/client-logger'  // CORRECT

import { logger } from '@/lib/logger'               // WRONG — server-only
```

## Button asChild Link pattern (WCAG 4.1.2)

```tsx
// CORRECT — button is the outer interactive element
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>

// WRONG — violates WCAG 4.1.2
<Link href="/dashboard">
  <Button>Go to Dashboard</Button>
</Link>
```

## No raw `<button>`

Use `<Button variant="ghost|link|icon">` from the design system. Raw `<button>` is only permitted inside the design-system package itself, or with a justifying comment.

## verify

```bash
pnpm check-types
```
