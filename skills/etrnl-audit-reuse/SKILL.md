---
name: etrnl-audit-reuse
description: ETRNL deep-audit category skill for shared reuse. Use when the user asks for reuse audit, shared component audit, duplicate logic, helper reuse, module reuse, abstraction fit, or new-surface justification.
---
# ETRNL Shared Reuse Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-reuse`; on update, ask update/snooze/continue.

Run the `shared-reuse` deep-audit category against components, helpers, modules, services, tests, and repeated logic. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["shared-reuse"]`, or route the run through `etrnl-audit --category shared-reuse`.
4. Refuse final completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` has passed or a concrete blocker is recorded.

## Hard Rules

- Process full source, component, helper, module, test, and duplicate-candidate worklists.
- Execute registered checks in order from `reuse-01-existing-surfaces` through `reuse-05-new-surface-justification`.
- Search existing surfaces before recommending new abstractions.
- Separate true duplication from locally justified specialization.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Keep local paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return coverage counts, findings by check id and severity, clean rows, skipped rows, not-applicable rows, source-limited blockers, reusable-surface map, artifact path or blocker, and validation result.
