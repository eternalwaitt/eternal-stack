---
name: etrnl-deep-audit-ux
description: ETRNL deep-audit category skill for UI, UX, and product quality. Use when the user asks for a UI/UX audit, UI audit, UI review, UX review, product audit, design audit, accessibility audit, responsive visual QA, interaction quality, hierarchy review, empty states, product copy review, UI polish pass, or UI improvement opportunities.
---
# ETRNL UI/UX Deep Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-deep-audit-ux`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Run the `ui-ux-product` deep-audit category against a target application. This skill is separate from `etrnl-deep-audit` so UI/UX depth evolves without bloating the application orchestrator. The category is read-only unless the user explicitly asks for fixes.

This audit reports two things with equal weight: defects against a named baseline, and the gap between shipped quality and a 10. A run that returns only the biggest defects has failed both halves.

## Contract

1. Read `scripts/lib/deep-audit-categories.mjs` and verify the `ui-ux-product` registry entry: seven `ux-0N` checks, five lanes, six required worklists.
2. Enumerate the target before judging it: `node "${ETRNL_HOME:-$HOME/.claude}/scripts/ux-inventory.mjs" --root <target> --json`. The output gives every worklist with `count` and `sha256`, the coverage axes, and a mechanical scan. Without this file there is no denominator and the run stays `source_limited`.
3. Record stack facts: app type (marketing, app UI, hybrid), design baseline (repo `DESIGN.md` when present — authoritative), component library, i18n setup, theme modes, auth states, and whether browser/runtime access exists.
4. Load `references/audit-checks.md` and bind each check to the strongest available capability per its Capability Bindings table.
5. Dispatch the five registered lanes in parallel per the `etrnl-dev-execute` fanout contract. Every lane spawn sets an explicit model and reasoning effort from the lane's registry `modelTier` — resolve with `categoryLaneDispatch("ui-ux-product")` from `scripts/lib/deep-audit-categories.mjs`; a spawn with no `model` inherits the parent thread model and is a dispatch defect. Every lane returns a receipt consuming the shared worklist hashes.
6. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists; for direct invocation create the same envelope with `requestedCategories: ["ui-ux-product"]`.
7. Refuse final completion until all three verification commands have run or a concrete blocker is recorded.

## Coverage Contract

The inventory sets the denominators. The category report carries them back in `coverage`:

| Counter | Source | Meaning |
| --- | --- | --- |
| `routesTotal` / `routesCovered` | `ux_routes` | Every route reaches a finding, clean, skipped, not-applicable, or source-limited disposition. |
| `surfacesTotal` / `surfacesCovered` | `ux_states` | Every interactive or async surface is dispositioned. |
| `stateCellsTotal` / `stateCellsCovered` | `ux_states` x 6 states | Loading, empty, error, disabled, optimistic, and success per surface. |
| `viewportsCovered` | `axes.viewports` | Default set is 375x812, 768x1024, 1440x900. |
| `axesCovered` | `axes` | Themes, locales, text directions, auth states, data volumes, and zoom levels from the inventory. |

A shortfall in any counter is legal only as a `coverageExceptions` row naming `kind`, `count`, and `reason`. Untracked shortfalls fail `ux-audit-check.mjs coverage`.

## Capability Routing

- Runtime evidence: dispatch `etrnl-browser-qa` (read-only) with routes, viewports, and report path. Require `designEvidence` rows on matrix entries (spacing, hierarchy, slop, latency, contrast, overflow, state, copy) so runtime craft observations arrive as data instead of screenshot re-derivation.
- Mechanical pre-scan: triage every non-zero `mechanicalScan` bucket from `ux-inventory.mjs` into a check row. React/Next targets add `npx --no-install react-doctor`. Deterministic a11y scanners (`axe`, `pa11y`, `unlighthouse`, `eslint-plugin-jsx-a11y`) run when installed; each unavailable scanner becomes a recorded unavailable check, never a silent pass.
- Accessibility depth: load bundled `wcag-accessibility`; cite WCAG 2.1/2.2 success criteria per ux-04 finding.
- Visual craft: load bundled `impeccable` as a critique lens only (never its generation flow); judge against `DESIGN.md` tokens and the hard-rejection patterns in the `design-review-rubric.md` module of `etrnl-frontend-patterns`.
- Motion/interaction: judge per the `motion-interaction.md` module of `etrnl-frontend-patterns`.
- Product lens: load bundled `ux-researcher-designer` for journey and persona walkthroughs on ux-01 when the target has multi-step tasks.
- Plan-stage rubric scoring is `etrnl-design-reviewer`'s job. This skill emits `uxHealthScore` per check against shipped UI, which is a different artifact from the plan rubric score block.

### Borrowed-lens override

Bundled lenses carry their own report contracts that cap output. Those caps do not apply here:

| Borrowed instruction | Source | Replacement in this audit |
| --- | --- | --- |
| "The 3-5 most impactful design problems" | `impeccable` critique reference | Report every finding. Ranking is a synthesis section on top of full coverage. |
| "Top 3-5 critical issues" | `impeccable` audit reference | Same: rank inside a complete list. |
| Scope negotiation ("focus on the top 3?") | `impeccable` critique reference | Never ask the user to shrink audit scope. Scope is the inventory. |
| "Highlight the top 3 issues" | `wcag-accessibility` summarize prompt | Cite every criterion violation; highlight after listing. |
| "Sample pages ... top 10 by traffic" | `wcag-accessibility` audit scope | Sampling blocks completion. Use the `ux_routes` worklist. |

Take vocabulary, taxonomy, and criterion depth from these lenses. Discard their output shape, their finding caps, and their scope questions.

## Scoring and Improvement Output

Every `finding` and `confirmed_clean` check row carries `uxHealthScore`:

- `score`: 0-10 for shipped quality of that check's surface area.
- `whatMakesTen`: the specific change that reaches 10 — a token, component, state, or copy line.

Severities are `critical` (task blocked or data misrepresented), `high` (task degraded or trust damaged), `medium` (polish or consistency defect), and `opportunity` (no baseline violated, quality gain available). The `opportunity` tier exists so an improvement never gets dropped for failing to violate a rule.

Two required report arrays keep a complete audit readable:

- `quickWins`: changes with one-token or one-line effort, each with route and concrete change. An empty array states no quick win survived triage.
- `systemicFindings`: one row per repeated pattern with `instanceCount` and instance list, so 40 instances of one defect stay one finding with a count instead of collapsing into a vague sentence.

## Hard Rules

- Process full worklists. Sampling blocks completion.
- Execute registered checks in order from `ux-01-primary-flows` through `ux-07-cross-cutting-axes`.
- Require browser evidence for runtime UI claims. When browser access, credentials, or fixtures are missing, mark affected checks `source_limited` instead of clean.
- When a bound capability (bundled skill, browser, scanner) is unavailable, record it and degrade to `source_limited` for the coverage it owned — never silently substitute weaker evidence as clean.
- Inspect file contents and rendered surfaces before marking a check complete. Match counts alone are not evidence.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Log `CHECKS_SKIPPED` with check id, worklist id, and reason when source evidence or context budget blocks completion.
- Mark `not_applicable` with the applicability gate and evidence when user-facing routes, components, or copy are absent from the target.
- Keep source-limited blockers separate from clean checks.
- Keep local target paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Chat Summary Contract

The final chat message is the deliverable the user reads. It carries, in this order:

1. Coverage line: routes covered/total, surfaces covered/total, state cells covered/total, viewports, themes, locales, auth states, zoom levels.
2. `uxHealthScore` per check plus the overall floor.
3. Findings by severity, `critical` through `opportunity`, with route and one-line remediation.
4. Quick wins.
5. Systemic patterns with instance counts.
6. `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, `not_applicable`, and source-limited rows.
7. Artifact path, trend delta when a prior baseline exists, and verification results.

A summary that starts with a ranked shortlist and omits the coverage line is an incomplete run regardless of artifact state.

## Common Rationalizations

- "These are the top issues; the rest is minor." -> Ranking is a section, not a scope. Every inventoried route, surface, and state cell carries a disposition before ranking begins.
- "The critique lens says report the 3-5 biggest problems." -> That contract belongs to the generation skill. This audit overrides it in the borrowed-lens table; complete coverage first, rank second.
- "The design looks fine to me." -> Looks-fine is not a baseline. Compare against `DESIGN.md` tokens, the rubric hard rejections, and WCAG criteria; a clean check names what it compared against.
- "Nothing here violates a rule, so there is nothing to report." -> File it as `opportunity` with a `whatMakesTen` line. An audit that only reports violations never improves a working UI.
- "No DESIGN.md, so visual consistency cannot be judged." -> The anti-slop patterns and spacing/type-scale consistency are judgeable without one. Note the missing baseline once, then audit; name the `etrnl-frontend-patterns` design-md workflow as the follow-up that creates the baseline.
- "The code renders the right components, so the flow works." -> Rendered-source reasoning is not runtime evidence. Walk the flow in a browser or mark it `source_limited`.
- "Accessibility is covered — the components come from a UI library." -> Library components inherit misuse: missing labels, broken focus order, contrast-breaking token overrides. Run the keyboard walkthrough and criterion checks anyway.
- "States are handled — there is a loading spinner." -> One state is not six. Empty, error, disabled, optimistic, and success each need evidence per interactive surface.
- "Desktop and mobile look the same, and dark mode is just colors." -> Themes, locales, text direction, data volume, and 200% zoom are registered axes; each unexercised axis is an uncovered-axis defect.

## Red Flags

- A final summary with five findings and no coverage counters (the shortlist failure mode this skill exists to prevent).
- A category report whose `routesCovered` is below `routesTotal` with no `coverageExceptions` row.
- A check row with findings but no `uxHealthScore`, or a `uxHealthScore` under 8 with no `whatMakesTen`.
- An empty `quickWins` array on a target whose `mechanicalScan` returned non-zero arbitrary-value, contrast, or alt-text buckets.
- Forty instances of one defect filed as forty findings or as one vague sentence instead of a `systemicFindings` row with an instance count.
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

- coverage counters and worklist counts;
- `uxHealthScore` per check with `whatMakesTen`;
- findings by check id and severity (each with route, viewport, symptom, evidence, baseline, status, remediation);
- quick wins and systemic patterns with instance counts;
- `CONFIRMED_CLEAN` rows with the non-finding shape;
- `CHECKS_SKIPPED`, `not_applicable`, and `coverageExceptions` rows;
- source-limited blockers (including unavailable capabilities);
- lane receipts;
- artifact path, baseline path, and trend delta against a prior baseline when one exists;
- validation commands and results.

## Verification

PASS/FAIL checklist. Any FAIL means the run is incomplete:

- The `ui-ux-product` registry entry resolves with all seven `ux-0N` checks, five lanes, and their required worklists present.
- `ux-inventory.mjs` ran against the target and its worklist hashes appear in `consumedWorklistHashes`.
- Coverage counters equal the inventory totals, or every shortfall carries a `coverageExceptions` row.
- Every finding carries route, viewport, symptom, evidence, named baseline, severity from the four-tier ladder, a `status` from `open`, `fixed`, `accepted_risk`, `blocked`, `false_positive`, and remediation.
- Every clean check states routes/viewports covered, states exercised, baseline compared, and evidence type.
- Every finding and clean check carries `uxHealthScore` with `whatMakesTen`.
- Every runtime claim without browser evidence, and every check whose bound capability was unavailable, is filed as `source_limited`, not clean.
- No local target paths, account identifiers, or private material appear in the artifact.

Red-capable gates. All three commands must exit 0 before completion — the registry entry, the artifact envelope, and the coverage denominators:

```bash
node scripts/deep-audit-artifact-check.mjs validate-registry --root .   # non-zero => ui-ux-product registry/worklist defect
node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>   # non-zero => artifact envelope or UX evidence defect
node "${ETRNL_HOME:-$HOME/.claude}/scripts/ux-audit-check.mjs" coverage --inventory <inventory> --artifact <artifact>   # non-zero => sampled coverage
```

Persist the run for trend comparison and print the delta when a prior baseline exists:

```bash
node "${ETRNL_HOME:-$HOME/.claude}/scripts/ux-audit-check.mjs" baseline --artifact <artifact> --target <label>
node "${ETRNL_HOME:-$HOME/.claude}/scripts/ux-audit-check.mjs" trend --before <prior-baseline> --after <new-baseline>
```
