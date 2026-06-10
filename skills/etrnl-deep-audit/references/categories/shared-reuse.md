# Shared Reuse Audit Checks

- Category id: `shared-reuse`
- Orchestrator: `etrnl-deep-audit`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`

## Checks

1. `reuse-01-existing-surfaces`: map existing components, helpers, modules, services, hooks, and utilities.
2. `reuse-02-duplication-hotspots`: identify repeated logic, repeated structure, and repeated naming patterns.
3. `reuse-03-abstraction-fit`: verify ownership, cohesion, call sites, and blast radius before shared extraction.
4. `reuse-04-test-and-contract-reuse`: inspect shared fixtures, contract tests, schemas, and reusable test helpers.
5. `reuse-05-new-surface-justification`: prove why new files or abstractions beat existing surfaces.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
