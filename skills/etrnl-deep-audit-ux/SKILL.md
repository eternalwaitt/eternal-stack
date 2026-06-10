---
name: etrnl-deep-audit-ux
description: ETRNL deep-audit category skill for UI, UX, and product quality. Use when the user asks for a UI/UX audit, product audit, design audit, accessibility audit, responsive visual QA, interaction quality, hierarchy review, empty states, or product copy review.
---
# ETRNL UI/UX Deep Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-deep-audit-ux`; on update, ask update/snooze/continue.

Run the `ui-ux-product` deep-audit category against a target application. This skill is separate from `etrnl-deep-audit` so UI/UX depth can evolve without bloating the application orchestrator. The category is read-only unless the user explicitly asks for fixes.

## Startup

1. Confirm the target app, primary user flows, design system or token source, locales, and whether browser/runtime evidence is available.
2. Load `references/audit-checks.md`.
3. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists.
4. For direct category invocation, create the same report envelope with `requestedCategories: ["ui-ux-product"]`.
5. Refuse final completion until the artifact validator command for the report has run or a concrete blocker is recorded.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `ux-01-primary-flows` through `ux-06-product-copy`.
- Require browser evidence for runtime UI claims. When browser access, credentials, or fixtures are missing, mark affected checks `source_limited` instead of clean.
- Inspect file contents and rendered surfaces before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Log `CHECKS_SKIPPED` with check id, worklist id, and reason when source evidence or context budget blocks completion.
- Mark `not_applicable` with the applicability gate and evidence when user-facing routes, components, or copy are absent from the target.
- Keep source-limited blockers separate from clean checks.
- Keep local target paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return:

- coverage and worklist counts;
- findings by check id and severity;
- `CONFIRMED_CLEAN` rows;
- `CHECKS_SKIPPED` rows;
- `not_applicable` rows;
- source-limited blockers;
- artifact path or blocker;
- validation command and result.

Direct invocation final output includes:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>
```
