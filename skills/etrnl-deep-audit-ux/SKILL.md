---
name: etrnl-deep-audit-ux
description: ETRNL deep-audit category skill for UI, UX, and product quality. Use when the user asks for a UI/UX audit, product audit, design audit, accessibility audit, responsive visual QA, interaction quality, hierarchy review, empty states, or product copy review.
---
# ETRNL UI/UX Deep Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-deep-audit-ux`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Run the `ui-ux-product` deep-audit category against a target application. This skill is separate from `etrnl-deep-audit` so UI/UX depth can evolve without bloating the application orchestrator. The category is read-only unless the user explicitly asks for fixes.

## Contract

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `ui-ux-product` registry entry.
2. Confirm the target app, primary user flows, design system or token source (repo `DESIGN.md` when present — authoritative baseline), locales, and whether browser/runtime evidence is available.
3. Load `references/audit-checks.md` and bind each check to the strongest available capability per its Capability Bindings table (browser-qa runtime evidence, `wcag-accessibility` criterion depth, `impeccable` critique lens, rubric hard rejections, motion module, react-doctor pre-scan).
4. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists; for direct category invocation, create the same envelope with `requestedCategories: ["ui-ux-product"]`.
5. A finding must include route, viewport, symptom, evidence, named baseline, severity, and remediation. A clean check must include the non-finding shape (routes/viewports covered, states exercised, baseline compared, evidence type).
6. Refuse final completion until the artifact validator command for the report has run or a concrete blocker is recorded.

## Capability Routing

- Runtime evidence: dispatch `etrnl-browser-qa` (read-only) with the routes, viewports, and report path; consume its design-evidence taxonomy (spacing, hierarchy, AI-slop patterns, interaction latency).
- Accessibility depth: load bundled `wcag-accessibility`; cite WCAG 2.1/2.2 success criteria per ux-04 finding.
- Visual craft: load bundled `impeccable` as a critique lens only (never its generation flow); judge against `DESIGN.md` tokens and the hard-rejection patterns in the `design-review-rubric.md` module of `etrnl-frontend-patterns`.
- Motion/interaction: judge per the `motion-interaction.md` module of `etrnl-frontend-patterns`.
- Mechanical pre-scan: React/Next targets with `react-doctor` installed get `npx --no-install react-doctor` triaged into check rows; otherwise record the check unavailable and continue.
- Plan-stage design scoring is `etrnl-design-reviewer`'s job, not this skill's — do not emit rubric score blocks here.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `ux-01-primary-flows` through `ux-06-product-copy`.
- Require browser evidence for runtime UI claims. When browser access, credentials, or fixtures are missing, mark affected checks `source_limited` instead of clean.
- When a bound capability (bundled skill, browser, react-doctor) is unavailable, record it and degrade to `source_limited` for the coverage it owned — never silently substitute weaker evidence as clean.
- Inspect file contents and rendered surfaces before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Log `CHECKS_SKIPPED` with check id, worklist id, and reason when source evidence or context budget blocks completion.
- Mark `not_applicable` with the applicability gate and evidence when user-facing routes, components, or copy are absent from the target.
- Keep source-limited blockers separate from clean checks.
- Keep local target paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Common Rationalizations

- "The design looks fine to me." -> Looks-fine is not a baseline. Compare against `DESIGN.md` tokens, the rubric hard rejections, and WCAG criteria; a clean check names what it compared against.
- "No DESIGN.md, so visual consistency can't be judged." -> The anti-slop patterns and spacing/type-scale consistency are judgeable without one. Note the missing baseline once, then audit; name the `etrnl-frontend-patterns` design-md workflow in the report as the follow-up that creates the baseline.
- "The code renders the right components, so the flow works." -> Rendered-source reasoning is not runtime evidence. Walk the flow in a browser or mark it `source_limited`.
- "Accessibility is covered — the components come from a UI library." -> Library components inherit misuse: missing labels, broken focus order, contrast-breaking token overrides. Run the keyboard walkthrough and criterion checks anyway.
- "States are handled — there's a loading spinner." -> One state is not six. Empty, error, disabled, optimistic, and success each need evidence per interactive surface.

## Red Flags

- A route whose first impression is a generic 3-column icon grid or a headline with no clear action (rubric hard rejection, seeds ux-02).
- Async surfaces with no loading or empty state in the state worklist (seeds ux-03).
- Body text under 16px, contrast below 4.5:1, or placeholder-as-label forms (seeds ux-04/ux-06 automatic findings).
- Arbitrary spacing/type values (`p-[13px]`, `text-[17px]`) alongside a defined scale, or ad-hoc palettes next to `DESIGN.md` tokens (seeds ux-05).
- App UI built from stacked decorative cards instead of layout; uniform border radii and purple-gradient defaults (seeds ux-05 anti-slop).
- Transitions without reduced-motion fallback, or interactive feedback beyond ~400ms with no progress indication (seeds ux-03/ux-05).

## When NOT to use

- Scoring a plan or diff with UI scope before/while it is implemented: `etrnl-design-reviewer` with the design-review rubric.
- Building or restyling UI, choosing design direction, or creating a `DESIGN.md`: `etrnl-frontend-patterns`.
- Browser evidence collection alone without category checks: `etrnl-audit-browser` or the `etrnl-browser-qa` agent directly.
- Explicit WCAG remediation work (fixing, not auditing): bundled `wcag-accessibility` under `etrnl-frontend-patterns` routing.
- Whole-repo code health, performance, or security: the respective `etrnl-audit-*` category skills.

## Output

Return:

- coverage and worklist counts;
- findings by check id and severity (each with route, viewport, symptom, evidence, baseline, remediation);
- `CONFIRMED_CLEAN` rows with the non-finding shape;
- `CHECKS_SKIPPED` rows;
- `not_applicable` rows;
- source-limited blockers (including unavailable capabilities);
- artifact path or blocker;
- validation command and result.

## Verification

PASS/FAIL checklist. Any FAIL means the run is incomplete:

- The `ui-ux-product` registry entry in `scripts/lib/deep-audit-categories.mjs` resolves with all six `ux-0N` checks and their required worklists present.
- Every finding carries route, viewport, symptom, evidence, named baseline, severity, and remediation.
- Every clean check states routes/viewports covered, states exercised, baseline compared, and evidence type.
- Every runtime claim without browser evidence, and every check whose bound capability was unavailable, is filed as `source_limited`, not clean.
- No local target paths, account identifiers, or private material appear in the artifact.

Red-capable gate. This command exits non-zero when the ui-ux-product registry entry, its worklists, or the artifact envelope break:

```
node scripts/deep-audit-artifact-check.mjs validate-registry --root .   # expected exit 0; non-zero => ui-ux-product registry/worklist defect
```

Direct invocation final output includes:

```bash
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>
```
