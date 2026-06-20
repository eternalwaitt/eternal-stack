---
id: eternal-saas-global-verify
globs: ["**"]
description: "Verify commands reference for the Eternal SaaS stack."
hosts: [claude, cursor]
alwaysApply: false
---

# Verify Commands

Run these before claiming work complete.

## Preflight gates

| Gate | Command | When required |
| --- | --- | --- |
| Full pre-deploy | `pnpm ci:check` | Before any deploy |
| Types only | `pnpm check-types` | After type changes |
| Lint + format | `pnpm check` | After source edits |
| Domain guards | `pnpm guard:essential` | After domain, money, or access changes |
| Tenant safety | `pnpm guard:all` | After any DB query changes |
| DB migration | `pnpm db:migrate` | After schema changes |
| Schema regen | `pnpm db:generate:all` | After ANY Prisma schema change |

## Test suite

```bash
pnpm test           # unit tests
pnpm test:e2e       # end-to-end
pnpm sanity         # browser smoke (requires dev server running on PORT env var or project default)
```

## verify

```bash
pnpm ci:check
```
