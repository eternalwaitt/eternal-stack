# Design Review Rubric

Adapted from gstack `plan-design-review` (MIT) and [educlopez/ui-craft](https://github.com/educlopez/ui-craft) @ d2ba913a (MIT). Scoring methodology for per-dimension plan review also informed by [OpenAI — Designing Delightful Frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) (Mar 2026), as cited in gstack's design hard rules.

**Audience:** `etrnl-design-reviewer` during plan and implementation review. **Not** a substitute for audit-time checks — for whole-product UI audits use `skills/etrnl-deep-audit-ux/references/audit-checks.md`.

## How to Score

Rate each dimension **0–10**. After the score, state **what makes it a 10** for this specific plan or diff. Re-rate after fixes when iterating.

| Score | Meaning |
| --- | --- |
| 0–3 | Missing or generic — implementers will invent or ship AI-slop defaults |
| 4–6 | Partial — happy path covered, gaps in states, responsive, or specificity |
| 7–8 | Solid — minor polish or edge cases remain |
| 9–10 | Implementation-ready — specific tokens, states, and behaviors documented |

## Dimensions

### 1. Information hierarchy (0–10)

**What makes a 10:** Every screen names primary, secondary, and tertiary content; navigation answers "where am I?"; scannability via headings, grouping, and density; ASCII or structured layout notes for new pages.

**Signals from Nielsen #1 (visibility) and #8 (minimalism):** one job per section; visual weight matches importance; no competing hero elements.

### 2. Interaction states (0–10)

**What makes a 10:** Table or spec for loading, empty, error, disabled, success, partial, and optimistic states per UI feature — each describes what the **user sees**, not backend behavior.

**Distinction from audit:** audit checks `ux-03-states-feedback` on a live product; this dimension scores whether the **plan** specifies those states before code exists.

### 3. Responsive behavior (0–10)

**What makes a 10:** Breakpoint-specific layout intent — not "stacks on mobile" but named changes (nav pattern, column collapse, touch targets ≥ 44px, table → card strategy).

**Design laws:** Fitts's Law (target size/placement), Miller's Law (chunking nav).

### 4. Accessibility (0–10)

**What makes a 10:** Keyboard path, focus order, landmarks, labels, contrast targets tied to tokens, hit targets, and reduced-motion policy documented in plan scope.

**Distinction from audit:** audit runs `ux-04-accessibility` on shipped UI; this scores plan completeness. Deep WCAG remediation belongs to bundled `wcag-accessibility`.

### 5. Design-system / DESIGN.md reuse (0–10)

**What makes a 10:** Plan references repo `DESIGN.md` tokens and components; new UI extends the vocabulary; no parallel ad-hoc palette. If no `DESIGN.md`, plan includes a concrete proposal or cites `references/design-md-workflow.md`.

### 6. Visual craft — spacing, typography, color (0–10)

**What makes a 10:** Specific type scale, spacing rhythm, accent budget (one accent, 3–5 placements per viewport), border-radius steps, shadow layers — not "clean modern UI."

**Anti-slop (OpenAI + gstack lineage):** flag generic 3-column icon grids, purple-gradient defaults, uniform radii, emoji icons, default Inter/system stacks without rationale.

### 7. Motion quality (0–10)

**What makes a 10:** Motion budget per surface; durations and easing named; enter/exit asymmetry; reduced-motion fallbacks; high-frequency surfaces explicitly non-animated. Cross-ref `references/motion-interaction.md`.

### 8. UX heuristics — Nielsen × design laws (0–10)

**What makes a 10:** Plan passes a structured pass over Nielsen's 10 heuristics (visibility, real-world match, user control, consistency, error prevention, recognition, efficiency, minimalism, error recovery, help) plus design laws where load-bearing:

| Law | Plan check |
| --- | --- |
| Fitts | Target sizes and primary action placement |
| Hick | Choice count in nav, forms, pricing |
| Doherty | Feedback within ~400ms for interactive steps |
| Miller | Chunk sizes in nav and forms (≈7±2) |
| Tesler | Complexity owned by system, not user |
| Cleveland-McGill | Chart type matches data (area/line vs pie) |

Score holistically: a 10 means no heuristic would block a knowledgeable reviewer.

## Classifier — Marketing vs App UI

Before scoring visual craft and motion, classify scope:

- **Marketing / landing** — composition-first hero, brand-forward hierarchy, intentional motion atmosphere.
- **App UI** — calm surfaces, dense readability, utility copy, cards only when the card is the interaction.
- **Hybrid** — apply rules per section.

Hard rejection patterns (instant findings, any dimension capped ≤ 4 if present):

1. Generic SaaS 3-column icon grid as first impression
2. Strong headline with no clear action
3. App UI built from stacked decorative cards instead of layout
4. Placeholder-as-label forms; body text under 16px or contrast below 4.5:1 without plan to fix

## Output Contract

Emit in this order:

### Score block (one line per dimension)

```text
information_hierarchy: 6/10
interaction_states: 4/10
responsive_behavior: 5/10
accessibility: 7/10
design_system_reuse: 3/10
visual_craft: 5/10
motion_quality: N/A
ux_heuristics: 6/10
overall: 5/10
```

Use `N/A` only when the plan has zero UI scope; explain in one line.

### Findings by severity

```text
CRITICAL
- [dimension] Finding — fix

HIGH
- [dimension] Finding — fix

MEDIUM
- [dimension] Finding — fix
```

Order findings: CRITICAL → HIGH → MEDIUM. Each finding names the dimension, states user impact, and gives a concrete plan fix (token, component, or spec line — not "improve design").

### What makes 10 (per dimension below 8)

For each dimension scored under 8, one bullet: the specific addition that would reach 10.

## Relationship to Audit Checks

| This rubric (plan/review) | `etrnl-deep-audit-ux` audit |
| --- | --- |
| Scores design completeness before/during implementation | Inspects shipped UI (`ux-01`–`ux-06`) |
| Per-dimension 0–10 with "what makes 10" | Per-check finding / clean / skipped |
| Used by `etrnl-design-reviewer` | Used by `etrnl-deep-audit-ux` orchestrator |

Do not duplicate audit checklist rows here — reference `audit-checks.md` when the task shifts from plan review to product audit.
