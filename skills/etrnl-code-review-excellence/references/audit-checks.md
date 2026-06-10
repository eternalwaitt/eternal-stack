# Code Excellence Audit Checks

- Category id: `code-excellence`
- Skill name: `etrnl-code-review-excellence`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`

This reference is intentionally compact because code excellence reuses the shared code-health inventory, deep-audit envelope, and lane receipt rules instead of defining category-local inventory formats.

For `code-04-architecture-boundaries` and structural decay, load `brooks-architecture.md` and apply Brooks finding format from `brooks-foundation.md`.

## Evidence Rules

- Generate shared worklists before analysis and record each worklist with `path`, `count`, `sha256`, and generation command.
- Read every file in the selected worklists. Sampling blocks completion.
- Store check rows with exact `checkId`, status, evidence summary, and source-limited blocker when runtime or auth evidence is unavailable.
- Use `confirmed_clean` only when the relevant worklist has been inspected and no finding remains.
- Keep local absolute paths, account names, secrets, transcript excerpts, and private memory content out of tracked artifacts.

## Worklists

Use shared artifact paths produced by the orchestrator. Baseline commands:

- `code_source`: app and library source files.
Command: `fd --type f -e ts -e tsx -e js -e jsx -e py -e rs -e go -e rb -e php -e java -e kt --exclude node_modules --exclude .next --exclude dist`
- `code_tests`: test and fixture files.
  Command: `fd 'test|spec|fixture' --type f --exclude node_modules --exclude .next --exclude dist`
- `code_configs`: build, lint, type, and runtime config.
Command: `fd --type f 'package\.json|tsconfig\..*|eslint\..*|oxlint\..*|biome\..*|vite\..*|next\.config\..*|pytest\.ini|Cargo\.toml|go\.mod'`

## Applicability Discovery

Record language/runtime, framework, test runner, type/schema tools, package boundaries, public API surfaces, and generated/vendor exclusions before running checks.

## Checks

1. `code-01-correctness-invariants`: trace domain invariants, edge cases, and regression evidence.
2. `code-02-type-contracts`: verify type, schema, and external-boundary contracts.
3. `code-03-error-handling`: inspect failure clarity, retries, fallbacks, and boundary behavior.
4. `code-04-architecture-boundaries`: verify module, package, layer, and service ownership; run Brooks Steps 0–6 from `brooks-architecture.md` when boundaries are in scope.
5. `code-05-test-signal`: map tests to changed or risky source paths; include testability seam assessment from `brooks-architecture.md` Step 5.
6. `code-06-complexity-debt`: identify dead code, stale abstractions, nested logic, and avoidable complexity.

Every row ends as `finding`, `confirmed_clean`, `checks_skipped`, `not_applicable`, or `source_limited`.
