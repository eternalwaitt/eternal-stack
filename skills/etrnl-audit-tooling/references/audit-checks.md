# Tooling Ecosystem Audit Checks

- Category id: `tooling-ecosystem`
- Skill name: `etrnl-audit-tooling`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`

## Checks

1. `tool-01-local-setup`: verify package managers, bootstrap scripts, required tools, and first-run setup.
2. `tool-02-command-parity`: compare local commands, CI jobs, required checks, and documented workflows.
3. `tool-03-lint-format-type-gates`: inspect lint, format, typecheck, static analysis, and warning policy.
4. `tool-04-test-developer-loop`: inspect fast tests, focused tests, full gates, and failure ergonomics.
5. `tool-05-upgrade-rollback`: inspect update, install, deploy, rollback, and recovery paths.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
