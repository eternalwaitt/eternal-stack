---
id: eternal-saas-components
paths:
  - "apps/web/src/components/**"
  - "apps/show-web/src/components/**"
  - "apps/web/src/**/*.tsx"
  - "apps/show-web/src/**/*.tsx"
globs:
  - "apps/web/src/components/**"
  - "apps/show-web/src/components/**"
description: "Component patterns: design system imports, no barrel exports, design system usage."
hosts: [claude, codex, cursor]
verify: "pnpm check"
---

# Component Rules

## Design system imports: direct paths, no barrel imports

```typescript
// CORRECT
import { Button } from '@core-suite/design-system/primitives'
import { Input } from '@core-suite/design-system/primitives'

// WRONG — barrel import
import { Button, Input } from '@core-suite/design-system'
```

## React Compiler active — no manual memoization

Do not add `useMemo`, `useCallback`, or `React.memo`. See `react.md` for details.

## Button pattern

```tsx
// Navigation button — use asChild + Link
<Button asChild>
  <Link href="/agenda">Go to Agenda</Link>
</Button>

// NOT this
<button onClick={() => router.push('/agenda')}>Go to Agenda</button>
```

## i18n: no hardcoded strings

All user-facing text must go through `t()`. See `i18n.md`.

## verify

```bash
pnpm check
```
