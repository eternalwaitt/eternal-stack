# UI UX Product Audit Checks

- Category id: `ui-ux-product`
- Skill: `etrnl-deep-audit-ux`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-deep-audit`
- Orchestrator scope: standalone — not included in `etrnl-deep-audit` `all_registered`

## Checks

1. `ux-01-primary-flows`: verify core task paths, navigation, and recovery paths.
2. `ux-02-information-hierarchy`: inspect scannability, density, labels, grouping, and priority.
3. `ux-03-states-feedback`: cover loading, empty, error, disabled, optimistic, and success states.
4. `ux-04-accessibility`: inspect semantics, keyboard paths, labels, contrast, focus, and hit targets.
5. `ux-05-responsive-visual-polish`: verify mobile and desktop layout, overflow, overlap, and visual consistency.
6. `ux-06-product-copy`: inspect clarity, trust cues, action labels, localization, and domain language.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
