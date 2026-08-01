---
name: etrnl-frontend-patterns
description: ETRNL frontend and UI design orchestrator. Use when building or restyling UI, choosing design direction, reviewing visual/UX quality, applying design systems or DESIGN.md, motion/interaction patterns, accessibility depth, or UX research. Classifies the task, checks repo DESIGN.md, and loads only the matching reference modules and bundled generation skills.
---
# ETRNL Frontend Patterns

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-frontend-patterns`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Single entry point for frontend design work. Read only the reference files the task needs; do not preload the whole suite.

## Required Flow

1. Check for a repo-root `DESIGN.md` before inventing visual direction. If present, treat it as authoritative (tokens + prose intent). If absent and the task is design-heavy, propose creating one using `references/design-md-workflow.md`.
2. Classify the request against the routing table below. Load at most **one** bundled generation skill per task (hard rule — conflicting anti-slop rule sets).
3. Load the minimum reference set — one or two modules by default, at most three unless the user asks for a full design review.
4. State the loaded modules and any bundled skill in the first reply (`Loaded: design-md-workflow, motion-interaction; generation: frontend-design`).
5. For scored plan/implementation review, use `references/design-review-rubric.md` (consumed by `etrnl-design-reviewer`). For whole-product UI audits, use `etrnl-deep-audit-ux` instead of this skill.

## Generation Skill Routing

| Scope | Skill |
| --- | --- |
| Baseline visual direction and aesthetic choices when building new UI | `frontend-design` (bundled) |
| Product-UI craft: critique, audit, polish of application interfaces | `impeccable` (bundled) |
| Landing pages, portfolios, marketing redesigns | `design-taste-frontend` (bundled) |
| Accessibility/WCAG audit or remediation depth | `wcag-accessibility` (bundled) |
| UX research: personas, journey mapping, usability testing | `ux-researcher-designer` (bundled) |

**Hard rule:** load at most one generation skill from the table above per task. This skill (`etrnl-frontend-patterns`) is the routing authority — pick the narrowest matching row, then load that bundled skill by name.

## Module Files

| Module | File |
| --- | --- |
| DESIGN.md workflow and presets | `references/design-md-workflow.md` |
| Brand DESIGN.md starting points | `references/design-presets/linear.md` (also `stripe.md`, `vercel.md`, `notion.md`) |
| Motion and interaction | `references/motion-interaction.md` |
| Plan/implementation design review rubric | `references/design-review-rubric.md` |

## Full-Pass Mode

When the user asks for a full design review or end-to-end UI blueprint, load every module in the table above in dependency-friendly order: `design-md-workflow` → relevant preset (if bootstrapping) → `motion-interaction` → `design-review-rubric`. Load one generation skill only if the task still needs net-new visual generation.
