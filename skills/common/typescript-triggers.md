# TypeScript Advanced Review Triggers

Run a `typescript-advanced-types` review when changes touch any of the following. If the `typescript-advanced-types` skill is not installed on the host, state that and run an equivalent manual advanced types pass instead:

- Exported or public type declarations.
- API contracts and service boundaries.
- Runtime validation schemas.
- Schema or generated type definitions.
- State machines and discriminated unions.
- Branded types or domain IDs.
- Reusable type utilities.
- Cross-layer DTO or domain boundaries.

Otherwise record `typescript-advanced-types: not_applicable` with rationale.
