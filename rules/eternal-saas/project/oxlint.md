---
id: eternal-saas-oxlint
paths:
  - "**/*.ts"
  - "**/*.tsx"
globs:
  - "**/*.ts"
  - "**/*.tsx"
description: "Linting and formatting rules: oxlint, oxfmt, no suppressions, Semgrep double-comment."
hosts: [claude, cursor]
verify: "pnpm check"
---

# Linting and Formatting Rules

## No lint or format suppressions

Do not add `// oxlint-disable`, `// eslint-disable`, `// oxfmt-ignore`, or `/* prettier-ignore */` comments to work around lint failures. Fix the underlying issue.

Exception: Semgrep false positives require BOTH `// nosemgrep` AND `// oxfmt-ignore` (documented workaround for the formatter stripping nosemgrep comments).

## pnpm check is the gate

```bash
pnpm check        # lint + format
pnpm check-types  # TypeScript
```

Run both before claiming source edits are clean.

## Guard baselines

Running a guard after a rebase may show false positives from stale baselines. Regenerate with `ALLOW_BASELINE_REFRESH=1 pnpm guard:essential`.

## verify

```bash
pnpm check
```
