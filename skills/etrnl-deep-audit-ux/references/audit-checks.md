# UI UX Product Audit Checks

- Category id: `ui-ux-product`
- Skill: `etrnl-deep-audit-ux`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`
- Execution mode: fanout across five registered lanes, each spawned with the explicit model and reasoning effort from its registry `modelTier`
- Orchestrator scope: standalone - not included in `etrnl-deep-audit` `all_registered`

Findings describe what a user experiences on a named route and viewport. Generic design advice with no surface attached is not a finding.

## Worklists

Generate worklists once with the enumerator, then consume its hashes everywhere:

```bash
node "${ETRNL_HOME:-$HOME/.claude}/scripts/ux-inventory.mjs" --root <target> --json > <artifact-dir>/ux-inventory.json
```

| Worklist id | Contents | Enumerator rule | Fallback command |
| --- | --- | --- | --- |
| `ux_routes` | routed screens | App Router `page.*`, `pages/**` minus api and `_`-prefixed files, `routes/**`, `+page.svelte`, `views/`, `screens/`, and router-definition modules | `fd -g 'page.tsx' --exclude node_modules --exclude .next` |
| `ux_components` | non-route component files | `.tsx/.jsx/.vue/.svelte/.astro` minus routes, tests, and stories | `fd -e tsx -e jsx --exclude node_modules` |
| `ux_states` | interactive or async surfaces | files matching state, fetch, form, or interaction markers | `rg -l "useState\|useQuery\|useMutation\|onSubmit\|isLoading" -g '*.tsx'` |
| `ux_styles` | style sources and styled markup | style files plus components carrying `className`/`class`/`styled` | `fd -e css -e scss --exclude node_modules` |
| `ux_copy` | user-facing text | i18n message files plus components carrying visible strings or label attributes | `rg -l "placeholder=\|aria-label=\|title=" -g '*.tsx'` |
| `ux_accessibility` | semantic and interactive surfaces | files carrying interactive elements, roles, ARIA, or focus handling | `rg -l "<button\|<input\|role=\|aria-" -g '*.tsx'` |

Empty worklists still become report rows. Absence alone never proves a clean check.

The enumerator also returns `axes` (viewports, themes, locales, text directions, auth states, data volumes, zoom levels), `totals` (routes, surfaces, state cells, route x viewport cells), and `mechanicalScan` buckets. Every non-zero scan bucket is triaged into a check row.

## Coverage Matrices

Three matrices carry the run. Each cell reaches a disposition before completion.

| Matrix | Cells | Owning checks |
| --- | --- | --- |
| Route x viewport | `ux_routes` x `axes.viewports` | ux-01, ux-02, ux-05 |
| Surface x state | `ux_states` x {loading, empty, error, disabled, optimistic, success} | ux-03 |
| Axis sweep | `axes.themes` x `axes.locales` x `axes.textDirections` x `axes.authStates` x `axes.dataVolumes` x `axes.zoomLevels` | ux-07, with ux-04 owning zoom and contrast criteria |

Record shortfalls as `coverageExceptions` rows:

```json
{ "kind": "state-cells", "count": 2, "reason": "optimistic and partial states unreachable without a write fixture" }
```

`kind` accepts `routes`, `surfaces`, `state-cells`, and `axis:<axisName>`.

## Required Finding Shape

Every UI/UX finding includes:

- `route`: the route, screen, or view where the user hits the problem.
- `viewport`: the viewport(s) where it reproduces (e.g. 375x812, 768x1024, 1440x900), or `all`.
- `symptom`: what the user sees or fails to accomplish — not the implementation detail.
- `evidence`: screenshot path, console/network capture, browser-qa `designEvidence` row, inventory scan row, or file plus rendered-surface citation. Match counts alone are not evidence.
- `baseline`: the violated reference — repo `DESIGN.md` token or rule, WCAG success criterion, Nielsen heuristic, rubric hard-rejection pattern, or product copy standard. Name it. For `opportunity` rows the baseline is the quality target being missed, named the same way.
- `severity`: `critical` (task blocked or data misrepresented), `high` (task degraded or trust damaged), `medium` (polish or consistency defect), `opportunity` (no violation, quality gain available).
- `status`: `open`, `fixed`, `accepted_risk`, `blocked`, or `false_positive`.
- `remediation`: smallest concrete fix — token, component, spec line, or copy change, not "improve design".

## Required Non-Finding Shape

Every confirmed-clean check states, under `nonFindings`:

- `routesCovered`;
- `viewportsCovered`;
- `statesExercised`;
- `baselineCompared` (`DESIGN.md`, WCAG level, heuristic set);
- `evidenceType` (screenshots, keyboard walkthrough, console capture).

## Required Score Shape

Every `finding` and `confirmed_clean` row carries:

```json
{ "score": 6, "whatMakesTen": "Give the invoice list an empty state and a create action" }
```

`score` runs 0-10 against shipped quality: 0-3 unusable or AI-slop defaults, 4-6 works with real gaps, 7-8 solid with polish left, 9-10 nothing a knowledgeable reviewer would block. The category overall score is the floor of the average across scored checks.

## Capability Bindings

Bind each check to the strongest available capability. When a bound capability is unavailable (skill not installed, no browser, no credentials), mark affected coverage `source_limited` — never fall back to weaker evidence and call it clean.

| Capability | Used by | How |
| --- | --- | --- |
| `ux-inventory.mjs` | all | Worklists, hashes, axes, totals, and the mechanical scan that seeds ux-04, ux-05, and ux-06 rows. |
| `etrnl-browser-qa` agent (read-only) | ux-01, ux-03, ux-05, ux-07 | Route x viewport screenshots, console/network errors, and `designEvidence` rows (spacing, hierarchy, slop, latency, contrast, overflow, state, copy). |
| Repo `DESIGN.md` | ux-02, ux-05 | Authoritative visual baseline when present (see `skills/etrnl-frontend-patterns/SKILL.md`). Deviations from its tokens/intent are findings with the token named. Absent: judge against the rubric anti-slop patterns and note the missing baseline once. |
| `wcag-accessibility` (bundled) | ux-04, ux-07 | Criterion-level depth: map each finding to a WCAG 2.1/2.2 success criterion and level. Its "top 3 issues" summary shape and page sampling are overridden by the skill's borrowed-lens table. |
| `impeccable` (bundled, critique lens only) | ux-05 | Craft judgment (spacing scale, type ramp, accent budget). Its 3-5 priority-issue cap and scope questions are overridden. Never its generation flow. |
| `ux-researcher-designer` (bundled) | ux-01 | Journey and persona walkthroughs for multi-step tasks; each persona red flag names the element that failed. |
| Design-review rubric hard rejections | ux-02, ux-05 | `skills/etrnl-frontend-patterns/references/design-review-rubric.md` — the four hard-rejection patterns are automatic findings when observed on a live surface. |
| Motion module | ux-03, ux-05 | `skills/etrnl-frontend-patterns/references/motion-interaction.md` for transitions, loading feedback, and reduced-motion behavior. |
| `react-doctor`, `axe`, `pa11y`, `unlighthouse`, `eslint-plugin-jsx-a11y` | ux-03, ux-04, ux-05 | Deterministic pre-scans when installed; each unavailable tool becomes a recorded unavailable check and the run continues. |

Load at most one bundled generation skill (`impeccable`) per audit run, and only as a critique lens.

## Check `ux-01-primary-flows`

Lane: `flows-and-states`. Worklists: `ux_routes`, `ux_components`.

Walk core task paths end to end: entry, primary action, recovery from error, and exit. Every route in `ux_routes` is entered at least once. Require browser evidence (screenshots per step) via `etrnl-browser-qa` when runtime access exists; otherwise trace route wiring in source and mark runtime claims `source_limited`. For multi-step tasks, run a persona walkthrough per `ux-researcher-designer` and name the element that failed each persona.

## Check `ux-02-information-hierarchy`

Lane: `hierarchy-and-visual`. Worklists: `ux_routes`, `ux_copy`.

Inspect scannability, density, labels, grouping, and priority per screen. Judge against `DESIGN.md` hierarchy intent when present, and Nielsen #1 (visibility) and #8 (minimalism): one job per section, visual weight matching importance, no competing hero elements. Hard-rejection patterns (generic 3-column icon grid as first impression, strong headline with no clear action) are automatic findings. Screens that pass still receive a `whatMakesTen` line.

## Check `ux-03-states-feedback`

Lane: `flows-and-states`. Worklists: `ux_states`, `ux_components`.

Fill the surface x state matrix: loading, empty, error, disabled, optimistic, and success for every surface in `ux_states`. Report `stateCellsCovered` against `stateCellsTotal`. Use browser evidence for state transitions and interaction latency (missing loading feedback, slow transitions — Doherty ~400ms). React/Next targets: run the react-doctor pre-scan and triage state-related findings here.

## Check `ux-04-accessibility`

Lane: `accessibility`. Worklists: `ux_accessibility`, `ux_components`.

Inspect semantics, keyboard paths, focus order, labels, contrast, hit targets, zoom to 200%, and reduced-motion behavior. Load bundled `wcag-accessibility` and cite the success criterion and level per finding (e.g. `1.4.3 Contrast (Minimum), AA`). A keyboard walkthrough of at least the primary flow is required evidence; without runtime access, mark keyboard/contrast claims `source_limited`. Triage the inventory `missingAltText`, `nonInteractiveClickHandler`, `placeholderAsLabel`, and `smallBodyText` buckets here.

## Check `ux-05-responsive-visual-polish`

Lane: `hierarchy-and-visual`. Worklists: `ux_styles`, `ux_routes`.

Verify layout, overflow, overlap, and visual consistency across every viewport in `axes.viewports`. Judge visual craft against `DESIGN.md` tokens when present (spacing scale, type ramp, radius steps, accent budget) using the `impeccable` critique lens; flag anti-slop patterns (purple-gradient defaults, uniform radii, emoji icons, stacked decorative cards as app layout). Triage the inventory `arbitrarySpacing`, `arbitraryTypography`, `gradientDefaults`, `hardcodedColors`, and `emojiIcons` buckets here — repeated hits become one `systemicFindings` row with an instance count. Motion quality judged per the motion module: durations, easing, enter/exit asymmetry, reduced-motion fallback.

## Check `ux-06-product-copy`

Lane: `copy-and-trust`. Worklists: `ux_copy`, `ux_routes`.

Inspect clarity, trust cues, action labels, localization, and domain language. Placeholder-as-label forms are automatic findings. Action labels name the action ("Save changes", not "Submit"); error copy says what happened and what to do next. Empty-state copy names the next action.

## Check `ux-07-cross-cutting-axes`

Lane: `cross-cutting-axes`. Worklists: `ux_styles`, `ux_copy`.

Sweep the axes the route x viewport matrix cannot show: theme modes (light/dark token parity, contrast under both), locales (longest-string layout, date/number/currency format), text direction when RTL locales exist, auth states (anonymous, authenticated, privileged), data volumes (empty, single, many, overflowing long strings), and zoom levels (100%, 200% per WCAG 1.4.4). Each axis value from the inventory reaches `coverage.axesCovered` or a `coverageExceptions` row of kind `axis:<name>`.

## Report Rows

Every check row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.

```text
CONFIRMED_CLEAN: <check id> - <label> - 0 findings - covered: <routes>/<viewports> - baseline: <named> - evidence: <type>
CHECKS_SKIPPED: <check id> - worklist <worklist id> - reason: <blocker>
NOT_APPLICABLE: <check id> - gate: <applicability gate> - evidence: <source evidence>
SOURCE_LIMITED: <check id> - blocker: <missing capability, credential, or fixture>
```

## Synthesis

The category report carries:

- coverage counters against inventory totals plus every `coverageExceptions` row;
- `uxHealthScore` per check and the overall floor;
- findings sorted `critical`, `high`, `medium`, `opportunity`;
- `quickWins` rows (one-token or one-line effort) or an empty array stating none survived triage;
- `systemicFindings` rows with pattern, instance count, and instance list;
- lane receipts for all five lanes;
- `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, `NOT_APPLICABLE`, and source-limited rows;
- artifact validation commands and results;
- baseline path and trend delta when a prior baseline exists.
