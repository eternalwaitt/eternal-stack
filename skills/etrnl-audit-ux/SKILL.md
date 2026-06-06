---
name: etrnl-audit-ux
description: ETRNL deep-audit category skill for UI, UX, and product quality. Use when the user asks for UI/UX audit, product audit, accessibility, responsiveness, interaction quality, visual QA, hierarchy, states, empty paths, or product copy review.
---
# ETRNL UI UX Product Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-ux`; on update, ask update/snooze/continue.

Run the `ui-ux-product` deep-audit category against user-facing product surfaces. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["ui-ux-product"]`, or route the run through `etrnl-audit --category ui-ux-product`.
4. Use browser evidence for runnable UI paths and record source-limited blockers when the app cannot run.
5. Refuse final completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` has passed or a concrete blocker is recorded.

## Hard Rules

- Process full route, component, style, state, copy, and accessibility worklists.
- Execute registered checks in order from `ux-01-primary-flows` through `ux-06-product-copy`.
- Inspect real UI code and runtime/screenshots when available. Source-only review must be marked source-limited for runtime-only claims.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Keep source-limited blockers separate from clean checks.
- Keep local paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Output

Return coverage counts, findings by check id and severity, clean rows, skipped rows, not-applicable rows, source-limited blockers, browser evidence labels, artifact path or blocker, and validation result.
