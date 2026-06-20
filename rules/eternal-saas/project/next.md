---
id: eternal-saas-next
paths:
  - "apps/web/src/app/**"
  - "apps/web/next.config*"
  - "apps/show-web/src/app/**"
globs:
  - "apps/web/src/app/**"
  - "apps/web/next.config*"
description: "Next.js rules: output mode, env vars, proxy config, server vs client logger."
hosts: [claude, cursor]
verify: "pnpm check-types"
---

# Next.js Rules

## Never set output: "standalone"

Onveloz serves SSR + static from one container. `standalone` breaks this.

```typescript
// next.config.ts — WRONG
export default { output: 'standalone' }

// Do not add output mode
```

## Env var trailing newline crash

`veloz env set` can inject a trailing `\n`. This breaks `z.string().url()` in `createEnv`, crashing `proxy.ts` on cold start. Strip trailing newlines before setting env vars.

## logger.ts is server-only

`@/lib/logger` imports `@workspace/env/server` — crashes in `"use client"` files. Always use `@/lib/client-logger` in client components.

## oRPC routes are public in proxy.ts

Auth is handled inside each handler, not at the middleware matcher. Do not add auth to `proxy.ts`.

## App Router conventions

- Server Components fetch data directly
- Client Components use React Query / SWR hooks
- Route handlers live in `app/api/` and import from `@/modules/` only

## verify

```bash
pnpm check-types
```
