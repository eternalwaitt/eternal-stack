---
id: eternal-saas-global-stack
description: "Eternal SaaS stack overview: tech choices, commands, deployment surface."
hosts: [claude, codex, cursor]
alwaysApply: false
---

# Stack: Eternal SaaS

Multi-tenant SaaS on Next.js, Prisma, oRPC, Better-Auth, deployed to Onveloz.

## Key commands

```bash
pnpm dev                   # local dev server
pnpm check                 # lint + format
pnpm check-types           # full workspace typecheck
pnpm ci:check              # types + lint + build (pre-deploy gate)
pnpm db:migrate            # create + apply forward migration
pnpm db:start              # start local Postgres (Docker)
pnpm test && pnpm test:e2e
pnpm guard:essential       # domain + campaign access + any-types + complexity + ai-mistakes + i18n
pnpm guard:all             # essential + tenant-safety
```

## Deployment

`veloz deploy` — manual only, no auto-deploy. Never set `output: "standalone"` in `next.config.ts` — Onveloz serves SSR + static from one container.

## Architecture layers

| Layer | Location | Rule |
| --- | --- | --- |
| API routes | `apps/web/src/lib/orpc/routers/` | `packages/api/` is deprecated |
| Domain logic | `packages/domain/` | No direct Prisma; throw exceptions not neverthrow |
| DB access | `packages/db/`, `packages/core-domain/` | Always filter `tenantId` |
| UI | `apps/web/src/`, `apps/show-web/src/` | React Compiler active; Button/Link pattern |

## verify

```bash
pnpm ci:check
```
