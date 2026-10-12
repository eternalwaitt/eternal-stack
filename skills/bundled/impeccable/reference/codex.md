# Codex: Visual Direction & Asset Production

This file is loaded by `$impeccable craft` when the harness has native image generation (currently Codex via `image_gen`). Other harnesses skip it. It covers the two craft steps that depend on real image generation: landing the visual direction, and producing the raster assets the implementation will compose.

Use this optional sequence when visual exploration will resolve a real design choice. Existing briefs, approved palettes and delegated direction remain valid. Do not infer mandatory image generation, questions or repeated approval from tool availability. The user's requested selection points control when to pause.

## Step A: Resolve the direction

Reuse settled audience, purpose, palette, atmosphere and references. If a consequential choice remains unresolved and was not delegated, ask a concise question and wait for that answer. Otherwise state the direction briefly and continue.

## Step B: Palette study when useful

A small palette artifact can help compare typography, background, accent and motif before larger mocks. Generate it only when that comparison adds value. Ask for approval only if the user reserved palette selection; supplied or delegated palettes can proceed directly.

## Step C: Visual alternatives

Generate the number of alternatives the task needs within the active workflow contract. Keep shared palette and content stable when comparing structural direction: hierarchy, topology, density and composition. Brand work can explore identity and mood; product work should represent real flows and state. Show enough of a long page to explain its system beyond the hero.

Use the available native image-generation tool when imagery is appropriate. Do not install tools to satisfy this optional step.

## Step D: Select and carry forward

When the user requested a choice, show the alternatives and wait for that selection. When they delegated direction, choose from the brief and explain the material tradeoff. Iterate only while new feedback changes the next attempt and the current contract permits it; preserve unresolved choices and remaining scope if the bound is reached.

Before implementation, identify what carries into semantic code and what should not be literalized from a raster mock. Continue from the existing authority rather than asking for a second grant.

## Step E: Mock Fidelity Inventory

Inventory the approved mock's major visible ingredients. For each, decide implementation: semantic HTML/CSS/SVG, generated raster, sourced raster, icon library, canvas/WebGL, or accepted omission.

Common ingredients to inventory:

- Hero silhouette and dominant composition
- Signature motifs (planets, devices, portraits, charts, route lines, insets, badges, etc.)
- Nav and primary CTA treatment
- Section sequence, especially the second fold
- Image-native content the concept depends on
- Typography, density, color/material treatment, motion cues

Treat the mock as a north star, not a screenshot to trace. Don't rasterize core UI text. But if the live result lacks the mock's major ingredients, the implementation is wrong.

If a photographic, architectural, product, or place-led mock becomes generic CSS scenery, decorative diagrams, bullets, or copy, stop and fix it. That's a broken implementation, not a harmless interpretation.

Don't substitute a different hero composition or visual driver post-approval without user sign-off.

## Step F: Produce the needed assets

Produce the raster ingredients identified in Step E with available native image tools. Delegate only when an asset worker is available, authorized and useful within the active workflow contract. Tool availability creates no obligation to spawn or ask for new permission; inline production is valid.

For delegated work, pass only the approved reference/crop paths, output directory, dimensions, format, transparency, avoid list and semantic-code boundaries. Load image guidance in whichever context actually performs that work, and share the resulting paths rather than duplicating generation.

Prefer HTML/CSS/SVG/canvas where appropriate; use actual imagery when the mock or subject calls for it. Missing asset-worker definitions are not an implementation blocker when native tools cover the task.

## After This File

Continue the authorized build in `craft.md` using the supplied or selected direction and actual assets. Report material unavailable assets without claiming they were produced.
