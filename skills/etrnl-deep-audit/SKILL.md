---
name: etrnl-deep-audit
description: ETRNL application deep-audit orchestrator. Use when a user asks for a deep, full, or all_registered application audit; production-readiness plus performance category orchestration; shared worklists; category reports; lane receipts; coverage statements; source-limited blockers; or deep-audit artifact validation.
---
# ETRNL Deep Audit

Run application deep audits through the registered category contract. Use `etrnl-code-health` for repo health; use this skill for target-application audit categories and final synthesis.

## Modes

- `all_registered`: run every category exported by `scripts/lib/deep-audit-categories.mjs`.
- `--category production-readiness`: run the production-readiness category through the shared envelope.
- `--category performance`: run the performance category through the shared envelope.
- category list: run only registered category ids named by the user.

## Required Flow

1. Load `references/category-contract.md` before dispatch, standalone category routing, or synthesis.
2. Read `scripts/lib/deep-audit-categories.mjs` for `CATEGORY_REGISTRY_VERSION`, registered category ids, required worklists, registered checks, lanes, and known unimplemented categories.
3. Resolve category selection:
   - `all_registered` means every registered category id.
   - Unknown category ids block execution; print the valid registered ids.
4. Create a run-scoped artifact directory and a redacted `runArtifactLabel`. Keep absolute target paths, emails, tokens, and key material out of tracked artifacts.
5. Create shared worklists before category execution. Every selected category receives each required worklist with `count`, `sha256` or `hash`, and `artifactLabel`.
6. Dispatch category work:
   - `production-readiness`: invoke `etrnl-production-readiness` after production worklists exist.
   - `performance`: invoke `etrnl-performance-audit` after performance worklists exist; use the `etrnl-parallel` six-lane cap and require every registered lane receipt.
7. Reject category output that creates category-local inventory after shared worklists exist. Category reports and lane receipts consume shared worklist hashes.
8. Require every selected category report before synthesis. Require exactly one report row for every registered check id.
9. Keep `findings`, `confirmed_clean`, `skipped`, `not_applicable`, and `source_limited` separate. Do not count a source-limited blocker as clean.
10. Validate the final artifact with `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>`.

## Coverage Statement

For `all_registered`, print this statement in the final synthesis:

```text
Coverage: all_registered categories completed: production-readiness, performance.
Known not-yet-registered audit domains: security, ux-accessibility, api-data, docs, payments, privacy-compliance.
This is not a claim that every possible audit domain has run.
```

For category subsets, name every selected category and keep the known not-yet-registered domain sentence.

## Final Output

Return:

- target label and fingerprint;
- requested categories and registered categories;
- worklist labels and hashes;
- category reports by status;
- fanout lane receipts;
- findings, `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, not-applicable rows, and source-limited blockers;
- coverage statement;
- validation command and result.
