---
name: etrnl-audit-repo
description: ETRNL deep-audit category skill for repository hygiene. Use when the user asks for repo hygiene, repository health, file organization, generated artifacts, stale files, gitignore, public/private boundary, README health, or config consistency.
---
# ETRNL Repo Hygiene Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-repo`; on update, ask update/snooze/continue.

Run the `repo-hygiene` deep-audit category against repository structure, tracked files, docs entrypoints, generated artifacts, ignored files, metadata, and public/private boundaries. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["repo-hygiene"]`, or route the run through `etrnl-audit --category repo-hygiene`.
4. Refuse final completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` has passed or a concrete blocker is recorded.

## Hard Rules

- Process full tracked-file, docs-entrypoint, generated-artifact, ignored-file, and metadata worklists.
- Execute registered checks in order from `repo-01-entrypoints` through `repo-05-public-private-boundary`.
- Distinguish source, docs, tests, fixtures, generated output, local-only artifacts, and vendor files.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Keep source-limited blockers separate from clean checks.
- Keep local paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return coverage counts, findings by check id and severity, clean rows, skipped rows, not-applicable rows, source-limited blockers, artifact path or blocker, and validation result.
