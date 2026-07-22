# DESIGN.md Workflow

Adapted from [google-labs-code/design.md](https://github.com/google-labs-code/design.md) @ bde692f2 (Apache-2.0).

## What DESIGN.md Is

A repo-root artifact that gives agents a **persistent, structured understanding** of a product's visual identity. It combines:

1. **Normative token YAML** (front matter) — exact values agents must use.
2. **Prose visual intent** (markdown body) — why those values exist and how to apply them.

Tokens are authoritative for values; prose explains application, personality, and tradeoffs.

```yaml
---
name: ProductName
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
---

## Overview

One paragraph: brand personality, density, and the intended UI feel.

## Colors

How the palette is used — not just hex values.

## Typography

Display vs body roles, when to tighten tracking, tabular figures for data.

## Components

Named component tokens (button-primary, card-surface) with variant entries for hover/active.
```

Canonical section order when present: Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts.

## Where It Lives

- **Path:** repository root as `DESIGN.md`.
- **Scope:** one file per repo (monorepo: repo root unless the team documents a package-level exception in AGENTS.md or README).

## When Agents Read and Refresh

| Trigger | Action |
| --- | --- |
| Every UI build, restyle, or design review task | Read `DESIGN.md` first; calibrate typography, color, spacing, and component decisions against it |
| New visual direction, rebrand, or token change | Update `DESIGN.md` in the same change set as the UI work |
| No `DESIGN.md` and design-heavy scope | Propose creating one; use `references/design-presets/` as starting points |
| Token-only tweak | Update YAML; adjust prose only when intent shifts |

## Bootstrapping From Presets

MIT-licensed brand presets live under `references/design-presets/`:

- `linear.md` — dark product-marketing, lavender accent, dense technical craft
- `stripe.md` — navy + indigo fintech marketing, Sohne-style editorial density
- `vercel.md` — stark developer platform, mesh gradient hero accent
- `notion.md` — neutral workspace, pastel feature cards, illustration-rich

Copy a preset to repo root as `DESIGN.md`, rename `name`, replace brand-specific values, and delete prose that does not match the product.

## Token Export Targets

When the team uses tooling, export tokens from `DESIGN.md` rather than duplicating values. Pin the CLI version in every invocation (the upstream format is alpha; unpinned runs can change lint/export behavior without a repository diff) and bump the pin deliberately:

```bash
# Tailwind v3 theme.extend JSON
npx @google/design.md@0.3.0 export --format json-tailwind DESIGN.md > tailwind.theme.json

# Tailwind v4 @theme CSS block
npx @google/design.md@0.3.0 export --format css-tailwind DESIGN.md > theme.css

# W3C Design Tokens Format Module (DTCG JSON)
npx @google/design.md@0.3.0 export --format dtcg DESIGN.md > tokens.json
```

On Windows/PowerShell, use `npx -p @google/design.md@0.3.0 designmd lint DESIGN.md` when the `.md` suffix collides with file associations.

## Validation and Contrast

Run the linter before treating tokens as ship-ready:

```bash
npx @google/design.md@0.3.0 lint DESIGN.md
```

The linter flags broken token references, orphaned colors, section order drift, and **WCAG contrast warnings** on component `backgroundColor`/`textColor` pairs (AA minimum 4.5:1 for normal text). Fix contrast at the token level — do not rely on implementers to guess accessible pairs.

Compare versions when refreshing brand direction:

```bash
npx @google/design.md@0.3.0 diff DESIGN.md DESIGN-v2.md
```

## Agent Rules

- Never invent a parallel color/type system when `DESIGN.md` exists.
- Reference tokens with `{colors.primary}` syntax in component blocks; resolve broken refs before shipping.
- Unknown markdown sections are preserved; unknown YAML keys must match the schema — do not typo `colors` as `colours` unless the team standardizes British spelling project-wide.
- Keep `DESIGN.md` free of private identity, credentials, and local paths.
