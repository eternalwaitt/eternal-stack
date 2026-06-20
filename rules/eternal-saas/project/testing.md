---
id: eternal-saas-testing
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*.test.tsx"
  - "**/*.property.test.ts"
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*.test.tsx"
description: "Testing rules: AAA pattern, determinism, mock factories, assertion quality."
hosts: [claude, cursor]
verify: "pnpm test"
---

# Testing Rules

## Co-locate test files

Place `*.test.ts` next to the source file it tests.

## AAA pattern: separate lines

```typescript
// CORRECT
const result = processPayment(input)
expect(result).toBe('success')

// WRONG — act and assert on one line
expect(processPayment(input)).toBe('success')
```

## Determinism

- Use fixed dates in test setup — not `new Date()` or `Date.now()`
- Use factory functions for fresh data per test — not shared mutable module-level state
- Instantiate services in `beforeEach` for test isolation

## Mock strategy

- Prefer `vi.spyOn()` over `vi.mock()` — test behavior, not implementation
- Use `createMock*()` factories from `@/__tests__/fixtures` with proper types
- Call `setupMockCleanup()` in test files to prevent cross-test state leakage

## Assertion quality

- Add `expect(arr.length).toBeGreaterThan(0)` before `for` loops to prevent vacuous passes
- Use `expect(new Set(result)).toEqual(new Set(expected))` for unordered comparisons
- Match test descriptions to their assertions exactly
- Mark known bugs as `.todo` — passing tests that enshrine bugs hide regressions

## Reference

`tests/BEST-PRACTICES.md` and `tests/templates/` for copy-paste starting points.

## verify

```bash
pnpm test
```
