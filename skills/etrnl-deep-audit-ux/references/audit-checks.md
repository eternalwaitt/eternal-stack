# UI UX Product Audit Checks

- Category id: `ui-ux-product`
- Skill: `etrnl-deep-audit-ux`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`
- Orchestrator scope: standalone - not included in `etrnl-deep-audit` `all_registered`

Findings must describe what a user experiences on a named route and viewport. Do not score generic design advice as a finding.

## Required Finding Shape

Every UI/UX finding must include:

- `route`: the route, screen, or view where the user hits the problem.
- `viewport`: the viewport(s) where it reproduces (e.g. 375px, 768px, 1440px), or `all`.
- `symptom`: what the user sees or fails to accomplish — not the implementation detail.
- `evidence`: screenshot path, console/network capture, or file + rendered-surface citation. Match counts alone are not evidence.
- `baseline`: the violated reference — repo `DESIGN.md` token or rule, WCAG success criterion, Nielsen heuristic, rubric hard-rejection pattern, or product copy standard. Name it.
- `severity`: `critical` (task blocked or data misrepresented), `high` (task degraded or trust damaged), `medium` (polish or consistency defect).
- `remediation`: smallest concrete fix — token, component, spec line, or copy change, not "improve design".

## Required Non-Finding Shape

Every confirmed-clean check must state:

- routes and viewports covered;
- states exercised (for state-bearing checks);
- baseline compared against (`DESIGN.md`, WCAG level, heuristic set);
- evidence type collected (screenshots, keyboard walkthrough, console capture);
- why no finding survived.

## Capability Bindings

Bind each check to the strongest available capability. When a bound capability is unavailable (skill not installed, no browser, no credentials), mark affected coverage `source_limited` — do not silently fall back to weaker evidence and call it clean.

| Capability | Used by | How |
| --- | --- | --- |
| `etrnl-browser-qa` agent (read-only) | ux-01, ux-03, ux-05 | Runtime evidence: route x viewport screenshots, console/network errors, and the design-evidence taxonomy (spacing/alignment inconsistencies, hierarchy problems, AI-slop patterns, interaction latency). |
| Repo `DESIGN.md` | ux-02, ux-05 | Authoritative visual baseline when present (see `skills/etrnl-frontend-patterns/SKILL.md`). Deviations from its tokens/intent are findings with the token named. Absent: judge against the rubric's anti-slop patterns and note the missing baseline once in the report. |
| `wcag-accessibility` (bundled) | ux-04 | Load for criterion-level depth: map each ux-04 finding to a WCAG 2.1/2.2 success criterion and level (A/AA). Without it, still audit but cite heuristics, and note reduced criterion mapping. |
| `impeccable` (bundled, critique lens only) | ux-05 | Load its critique/audit references for product-UI craft judgment (spacing scale, type ramp, accent budget). Never its generation flow during an audit. |
| Design-review rubric hard rejections | ux-02, ux-05 | `skills/etrnl-frontend-patterns/references/design-review-rubric.md` — the four hard-rejection patterns are automatic findings when observed on a live surface. |
| Motion module | ux-03, ux-05 | `skills/etrnl-frontend-patterns/references/motion-interaction.md` for judging transitions, loading feedback, and reduced-motion behavior. |
| `react-doctor` (when installed, React/Next targets) | ux-03, ux-05 | Run `npx --no-install react-doctor` as a mechanical pre-scan; triage its UI-relevant findings into check rows. Not installed: record an unavailable check and continue. |

Load at most one of the bundled generation skills (`impeccable`) per audit run, and only as a critique lens.

## Check `ux-01-primary-flows`

Worklists: `ux_routes`, `ux_components`.

Walk core task paths end to end: entry, primary action, recovery from error, and exit. Require browser evidence (screenshots per step) via `etrnl-browser-qa` when runtime access exists; otherwise trace route wiring in source and mark runtime claims `source_limited`.

## Check `ux-02-information-hierarchy`

Worklists: `ux_routes`, `ux_copy`.

Inspect scannability, density, labels, grouping, and priority per screen. Judge against `DESIGN.md` hierarchy intent when present, and Nielsen #1 (visibility) and #8 (minimalism): one job per section, visual weight matching importance, no competing hero elements. Hard-rejection patterns (generic 3-column icon grid as first impression, strong headline with no clear action) are automatic findings.

## Check `ux-03-states-feedback`

Worklists: `ux_states`, `ux_components`.

Cover loading, empty, error, disabled, optimistic, and success states for every interactive surface in the worklist. Use browser evidence for state transitions and interaction latency (missing loading feedback, slow transitions — Doherty ~400ms). React/Next targets: run the react-doctor pre-scan and triage state-related findings here.

## Check `ux-04-accessibility`

Worklists: `ux_accessibility`, `ux_components`.

Inspect semantics, keyboard paths, focus order, labels, contrast, hit targets, and reduced-motion behavior. Load bundled `wcag-accessibility` and cite the success criterion and level per finding (e.g. `1.4.3 Contrast (Minimum), AA`). A keyboard walkthrough of at least the primary flow is required evidence; without runtime access, mark keyboard/contrast claims `source_limited`.

## Check `ux-05-responsive-visual-polish`

Worklists: `ux_styles`, `ux_routes`.

Verify mobile and desktop layout, overflow, overlap, and visual consistency across at least three viewports. Judge visual craft against `DESIGN.md` tokens when present (spacing scale, type ramp, radius steps, accent budget) using the `impeccable` critique lens; flag anti-slop patterns (purple-gradient defaults, uniform radii, emoji icons, stacked decorative cards as app layout). Motion quality judged per the motion module: durations, easing, enter/exit asymmetry, reduced-motion fallback.

## Check `ux-06-product-copy`

Worklists: `ux_copy`, `ux_routes`.

Inspect clarity, trust cues, action labels, localization, and domain language. Placeholder-as-label forms are automatic findings. Action labels must name the action ("Save changes", not "Submit"); error copy must say what happened and what to do next.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
