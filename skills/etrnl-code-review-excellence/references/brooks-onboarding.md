# Brooks Codebase Onboarding

Vendored from `brooks-audit/onboarding-guide.md`. Produce a newcomer-friendly tour. This is not a diagnostic report - no Health Score, no Iron Law findings.

## Step 1: Map the Territory

- Read top-level structure (same discovery as architecture Step 0).
- One sentence per top-level module.
- Group into layers: user-facing, business logic, infrastructure.

## Step 2: Dependency Map (Reading Order)

Draw Mermaid with reading-order colors - distinct from severity palette:

- Blue `#339af0`: start here - entry points, core domain
- Purple `#9775fa`: read next - supporting modules
- Gray `#ced4da`: read last - infrastructure, generated code, utilities

Number nodes: `CoreModule["1. CoreModule"]`

```mermaid
classDef start fill:#339af0,color:#fff
classDef next fill:#9775fa,color:#fff
classDef last fill:#ced4da
```

## Step 3: Key Conventions

Document:

- Naming conventions (files, classes, variables)
- Directory organization (feature-based, layer-based, hybrid)
- Error handling pattern
- Testing convention (co-located vs separate, naming)
- Dependency injection pattern (if any)

## Step 4: Danger Zones

Plain-language warnings only - not Iron Law format:

- "OrderService: high complexity; run full test suite before edits."
- "legacy/: no tests; add characterization tests before changes."

## Step 5: Domain Glossary

Extract 10–15 domain terms from code (classes, methods, constants) with plain-language definitions (Evans ubiquitous language).

## Step 6: First Tasks for New Developers

List 2–3 low-risk first contributions: good test coverage, clear boundaries, low coupling.

## Output Template

```text
# Codebase Tour: [Project Name]

## Overview
[2–3 sentences: purpose and tech stack]

## Module Map
[Mermaid with reading-order colors]

## Module Guide
[One paragraph per top-level module]

## Conventions
[Bullet list]

## Danger Zones
[Bullets or "None identified"]

## Domain Glossary
| Term | Meaning |

## First Tasks for New Developers
[2–3 concrete first PR ideas]
```
