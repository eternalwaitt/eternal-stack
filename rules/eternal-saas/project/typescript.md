---
id: eternal-saas-typescript
paths:
  - "**/*.ts"
  - "**/*.tsx"
globs:
  - "**/*.ts"
  - "**/*.tsx"
description: "TypeScript rules: no any, Zod nullability, typed env config, no suppressions."
hosts: [claude, cursor]
verify: "pnpm check-types"
---

# TypeScript Rules

## No any types

Do not use `any`, `as any`, or `@ts-ignore`. Use `unknown` with type narrowing, proper generics, or a typed cast with a comment explaining why.

Enforced by `pnpm guard:essential` (any-types guard).

## Zod nullability must match Prisma

`String?` in Prisma → `z.string().nullable()` in Zod (not `.optional()`).

```typescript
// Prisma schema: email String?
// CORRECT
email: z.string().nullable()

// WRONG — different runtime behavior
email: z.string().optional()
```

## No type suppressions or strictness downgrades

Do not add `// @ts-ignore`, `// @ts-nocheck`, `// eslint-disable`, or `// oxlint-disable` lines. Fix the underlying type error.

## Typed environment configuration

Use `createEnv()` typed modules (t3-env or similar). Do not read `process.env.*` directly outside the env config module.

## verify

```bash
pnpm check-types
```
