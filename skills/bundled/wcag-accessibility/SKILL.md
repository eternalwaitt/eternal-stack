---
name: wcag-accessibility
description: "WCAG 2.1/2.2 accessibility audits and remediation. Use when the user explicitly asks for accessibility, WCAG, a11y audit, Section 508/VPAT compliance, ARIA remediation, screen-reader testing, or keyboard/contrast fixes — not for general frontend design or UI polish."
version: 1.0.0
source: mrKanoh/claude-wcag-accessibility-skill@1cd2f448
category: frontend
---

# Accessibility audit and remediation

Use for explicit accessibility work: WCAG, keyboard, screen readers, semantic HTML, ARIA, contrast, mobile assistive technology or conformance reporting. Follow the user's target standard and platform. Ask only when the required level or scope materially affects the outcome; never claim legal compliance from a checklist or automated scan.

1. Identify the requested journeys, components, platforms and acceptance standard.
2. Inspect semantic structure, keyboard behavior, focus, accessible names, errors and relevant contrast. Exercise the actual interaction with the available assistive technology; mark unavailable tests explicitly.
3. Load only the relevant section of the [preserved accessibility guide](references/accessibility-guide.md). Use the topic links below or the searchable data; do not read the entire manual by default.
4. Report findings with the affected user behavior, applicable criterion, evidence, fix and retest result. Keep source inspection, automated checks and manual assistive-technology evidence separate.

| Need | Guide section |
| --- | --- |
| Criteria and semantics | [WCAG principles](references/accessibility-guide.md#2-wcag-principles-pour), [semantic HTML](references/accessibility-guide.md#3-semantic-html-first) |
| Component interaction | [ARIA](references/accessibility-guide.md#4-wai-aria-quick-reference), [components](references/accessibility-guide.md#5-accessible-components), [keyboard](references/accessibility-guide.md#8-keyboard-interaction-patterns) |
| Visual access | [Typography](references/accessibility-guide.md#6-accessible-typography), [color](references/accessibility-guide.md#7-accessible-color-palettes) |
| Audit and validation | [Methodology](references/accessibility-guide.md#9-audit-methodology), [automation and manual](references/accessibility-guide.md#13-testing-automation--manual), [screen readers](references/accessibility-guide.md#14-screen-reader-testing) |
| Native/mobile | [Mobile testing](references/accessibility-guide.md#15-mobile-accessibility), [native examples](references/accessibility-guide.md#19-native-mobile--code-examples) |
| Research and handoff | [Inclusive research](references/accessibility-guide.md#10-inclusive-research--interviews), [handoff](references/accessibility-guide.md#11-designer--developer-handoff) |
| Formal reports | [Templates](references/accessibility-guide.md#24-templates--prompts), [legal framework](references/accessibility-guide.md#22-legal-framework) |

From this skill's root, `python scripts/search.py wcag --id 2.5.8` retrieves a criterion; `python scripts/search.py aria --component modal --detail` retrieves a component pattern. Search commands read bundled data, which may be older than current standards. Check current W3C/WAI specifications and jurisdiction-specific primary sources when asserting changing standards or legal requirements. The guide retains its research, mobile, cognitive-accessibility, reporting, code examples and source attribution.
