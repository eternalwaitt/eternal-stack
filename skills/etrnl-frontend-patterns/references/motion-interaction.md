# Motion and Interaction

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) @ f6f79ca1 (MIT) — synthesis of animation-vocabulary, improve-animations, and motion audit rules.

## Purpose First

Every animation must answer **why it animates**: spatial consistency, state feedback, hierarchy, or preventing a jarring change. Decorative motion on high-frequency surfaces is a defect, not polish.

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette, typing) | **No animation** — speed is the feature |
| Tens of times/day (hover, list nav) | Minimal — under 150ms or remove |
| Occasional (modals, drawers, toasts) | Standard — 200–300ms with clear purpose |
| Rare / first-time (onboarding, celebration) | Can be expressive |

## Easing Curve Selection

Decision order:

| Motion type | Curve | Rationale |
| --- | --- | --- |
| Entering or exiting UI | `ease-out` | Starts fast; feels responsive at the moment users watch |
| Moving on screen (layout morph, reposition) | `ease-in-out` | Symmetric ramp for elements already visible |
| Hover / color / opacity | `ease` or soft ease-out | Subtle state change |
| Continuous motion (marquee, progress) | `linear` | Constant speed is expected |
| Default when unsure | `ease-out` | Safe product default |

**Never `ease-in` on UI** — acceleration into rest reads as sluggish collision, not arrival.

Strong custom curves beat weak browser defaults when motion is intentional:

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```

## Duration by Element Size and Distance

Product UI stays **under 300ms** except large surfaces:

| Element | Duration |
| --- | --- |
| Press feedback, toggle snap | 100–160ms |
| Tooltips, small popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers | 200–400ms |
| Page transitions, full sheets | 300–400ms |
| Marketing / storytelling | Can exceed 400ms — use sparingly |

**Exit at ~75% of entrance duration** — exits feel snappier than entrances.

Distance heuristic: small transforms (opacity, 4–8px translate) use the low end; full-viewport slides use `--motion-slow` territory.

## Spring Physics vs CSS Easing

| Use springs when | Use CSS easing when |
| --- | --- |
| Gesture-driven motion (drag, swipe dismiss) | Predetermined enter/exit with fixed endpoints |
| Interruptibility matters — user retargets mid-flight | Simple hover/focus/color transitions |
| Velocity carries into the next state | GPU-only `transform` + `opacity` on static UI |

Spring starting point (subtle bounce): `{ stiffness: 300, damping: 30 }` or Motion `{ type: "spring", duration: 0.5, bounce: 0.2 }`. Reserve visible bounce for playful moments — dashboards stay crisp.

CSS **transitions** retarget from current state; **keyframes** restart from zero — use transitions for toggles, hovers, and open/close; keyframes for one-shot loaders and marquees.

## Physicality and Origin

- Never `scale(0)` — start from `scale(0.9–0.97)` with `opacity: 0`.
- Popovers, dropdowns, and tooltips scale from **trigger origin**, not center:

```css
.popover {
  transform-origin: var(--radix-popover-content-transform-origin);
}
```

- Modals centered on screen correctly use `transform-origin: center`.
- Press feedback: `transform: scale(0.97)` on `:active`, ~160ms ease-out.

## Interruptibility

- Rapidly re-triggered UI (toasts, toggles, expand/collapse) must not use keyframes that restart from 0%.
- Drags dismiss on velocity, not distance alone (~0.11 px/ms threshold as a starting point).
- **Asymmetric timing:** deliberate user phases (hold-to-confirm) can be slow; system response snaps fast.
- Never block interaction while a stagger plays — decorative stagger must not gate input.

## When Not to Animate

Cut motion when:

- The action is keyboard-initiated or high-frequency.
- Motion does not communicate hierarchy, state, or space.
- OS reduced-motion setting is active — degrade to opacity/color only; do not zero all feedback.
- The surface is settings/admin/dashboard dense — micro-interactions only, no entrance choreography.
- Performance budget is exceeded — shrink duration/distance before deleting purposeful feedback.

## Perceived Performance

- Interaction acknowledgment ≤ 100ms registers as instant.
- Skeleton/shimmer beats blank waits; optimistic UI beats spinners when safe.
- GPU-only: animate `transform` and `opacity` — not `width`, `height`, `top`, `left`, or `transition: all`.
- Framer Motion: use explicit `transform` strings over `x`/`y` shorthands on busy views when frames drop.

## Reduced-Motion Accessibility

Honor reduced motion via the standard CSS media query (MDN: `@media` reduced-motion). Example policy:

```css
.reduced-motion * {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}
```

Apply that media query wrapper in production; the class name above is illustrative.

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover { transform: translateY(-2px); }
}
```

In JS motion libraries, branch on `useReducedMotion()` and skip positional animation.

## Motion Budget per Surface

| Surface | Budget |
| --- | --- |
| Landing hero | Up to 3 staggered entrances; one scroll-linked element max |
| Feature section | One reveal per card, 40ms stagger |
| Dashboard | Micro-interactions only — no card entrance animations |
| Modals | Backdrop fade + panel transform; interior static on open |
| Settings / admin | Zero entrance animations |

If over budget, cut the lowest-priority motion first — never accumulate "just one more" entrance.
