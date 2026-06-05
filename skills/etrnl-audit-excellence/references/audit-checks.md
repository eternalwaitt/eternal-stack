# Code Excellence Audit Checks

- Category id: `code-excellence`
- Skill name: `etrnl-audit-excellence`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-audit`

## Checks

1. `code-01-correctness-invariants`: trace domain invariants, edge cases, and regression evidence.
2. `code-02-type-contracts`: verify type, schema, and external-boundary contracts.
3. `code-03-error-handling`: inspect failure clarity, retries, fallbacks, and boundary behavior.
4. `code-04-architecture-boundaries`: verify module, package, layer, and service ownership.
5. `code-05-test-signal`: map tests to changed or risky source paths.
6. `code-06-complexity-debt`: identify dead code, stale abstractions, nested logic, and avoidable complexity.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
