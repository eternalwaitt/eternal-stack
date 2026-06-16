---
id: eternal-saas-deploy-onveloz
paths:
  - "veloz.json"
  - "next.config*"
  - "apps/web/next.config*"
globs:
  - "veloz.json"
  - "next.config*"
description: "Onveloz deployment rules: manual deploy, no standalone output, env var safety."
hosts: [claude, cursor]
verify: "pnpm ci:check"
---

# Deploy: Onveloz Rules

## Manual deploy only

```bash
veloz deploy
```

No auto-deploy. No CI/CD pipeline trigger on push.

## Never set output: "standalone"

Onveloz serves SSR + static from one container. The `standalone` output mode breaks this.

```typescript
// next.config.ts — DO NOT ADD
export default nextConfig({
  output: 'standalone',  // WRONG — breaks Onveloz
})
```

## Env vars: strip trailing newlines

`veloz env set` can inject a trailing `\n`. This breaks `z.string().url()` in `createEnv`, crashing `proxy.ts` on cold start.

```bash
# CORRECT — strip trailing newline
veloz env set KEY="$(echo -n 'value')"
```

## Config file

`veloz.json` controls deployment config. Check before changing build settings.

## verify

```bash
pnpm ci:check
```
