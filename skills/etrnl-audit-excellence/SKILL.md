---
name: etrnl-audit-excellence
description: ETRNL deep-audit category skill for code excellence. Use when the user asks for code excellence, code quality, maintainability, architecture quality, type safety, error handling, correctness, test signal, dead code, or complexity audit.
---
# ETRNL Code Excellence Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-excellence`; on update, ask update/snooze/continue.

Run the `code-excellence` deep-audit category against a target codebase. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["code-excellence"]`, or route the run through `etrnl-audit --category code-excellence`.
4. Refuse final completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` has passed or a concrete blocker is recorded.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `code-01-correctness-invariants` through `code-06-complexity-debt`.
- Inspect file contents before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Keep source-limited blockers separate from clean checks.
- Keep local paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return coverage counts, findings by check id and severity, clean rows, skipped rows, not-applicable rows, source-limited blockers, artifact path or blocker, and validation result.
