# Brooks Foundation

Vendored from the `brooks-audit` companion skill. Apply these rules to every Brooks architecture finding in this repo.

## Iron Law

Every architectural finding uses this chain:

**Symptom → Source → Consequence → Remedy**

- **Symptom**: observable behavior or structure (for example, circular import between `orders` and `payments`).
- **Source**: the design decision or missing boundary that caused it.
- **Consequence**: what breaks next — release risk, test cost, team coordination, blast radius.
- **Remedy**: one concrete structural fix, not a vague refactor.

## Severity

- **Critical**: halts delivery, causes cross-team coupling on every change, or hides untestable core logic.
- **Warning**: measurable drag — fan-out hotspots, missing seams, domain vocabulary drift.
- **Minor**: improvement with no current delivery blocker.

## Health Score (Architecture Audit Only)

After findings, assign a 0–10 architecture health score:

- Start at 10.
- Subtract 2 per Critical, 1 per Warning, 0.5 per Minor (floor 0).
- State the score in the report header with one sentence justification.

Onboarding mode (`brooks-onboarding.md`) does not use Health Score or Iron Law findings.

## Decay Risks (Scan Order)

1. **Dependency disorder** — circular deps, upward imports, unstable→stable inversion, fan-out > 5, no layering rule.
2. **Domain model distortion** — anemic domain, crossed bounded contexts, vocabulary mismatch, missing anti-corruption layers.
3. **Knowledge duplication** — same concept under different names or parallel implementations.
4. **Accidental complexity** — layers or modules with no one-sentence responsibility.
5. **Change propagation** — blast-radius hotspots visible in the dependency graph.
6. **Cognitive overload** — a new developer cannot pick the correct module for a feature from names alone.

## Report Envelope (Architecture Audit)

```text
Mode: Architecture Audit
Health Score: N/10 — [one sentence]

## Module Dependency Graph
[Mermaid graph FIRST — structure only, then color after scan]

## Findings
[Each finding: Severity, Symptom → Source → Consequence → Remedy, modules cited]

## Clean Modules
[Modules with no findings]

## Scope Notes
[Sampled vs inferred areas when repo is large]
```

Place the Mermaid dependency graph before findings. Add `classDef` colors only after the risk scan completes.
