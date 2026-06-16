---
id: eternal-saas-stack
paths:
  - "**"
globs:
  - "**"
description: "Project stack overview for Eternal SaaS repos: tech, architecture, commands reference."
hosts: [claude, cursor]
alwaysApply: false
verify: "pnpm ci:check"
---

# Project Stack

Multi-tenant SaaS: Next.js App Router, Prisma, oRPC, Better-Auth, Onveloz deployment.

## Architecture

| Layer | Location |
| --- | --- |
| API routes | `apps/web/src/lib/orpc/routers/` |
| Domain logic | `packages/domain/` |
| DB / repositories | `packages/db/`, `packages/core-domain/` |
| UI | `apps/web/src/`, `apps/show-web/src/` |
| Design system | `packages/design-system/` (direct primitive imports) |
| Config / constants | `packages/config/`, `packages/shared-constants/` |

## Quick command reference

See `rules/eternal-saas/global/00-stack.md` for full command list.

```bash
pnpm ci:check         # pre-deploy gate
pnpm guard:essential  # domain guards
pnpm guard:all        # + tenant safety
```

## Key constraints

- `packages/api/` is deprecated — use oRPC routers
- `pnpm guard:essential` must pass before merging
- Onveloz deploy is manual only (`veloz deploy`)

## verify

```bash
pnpm ci:check
```
