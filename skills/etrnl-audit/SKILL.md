---
name: etrnl-audit
description: ETRNL application deep-audit orchestrator. Use when a user asks for a deep, full, or all_registered application audit; production-readiness plus performance category orchestration; shared worklists; category reports; lane receipts; coverage statements; source-limited blockers; or deep-audit artifact validation.
---
# ETRNL Deep Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit`; on update, ask update/snooze/continue.

Run application deep audits through the registered category contract. Use `etrnl-audit-code` for repo health; use this skill for target-application audit categories and final synthesis.

## Modes

- `all_registered`: run every category exported by `scripts/lib/deep-audit-categories.mjs`.
- `--category code-excellence`: run the code-excellence category through the shared envelope.
- `--category ui-ux-product`: run the UI/UX/product category through the shared envelope.
- `--category production-readiness`: run the production-readiness category through the shared envelope.
- `--category security`: run the security category through the shared envelope.
- `--category performance`: run the performance category through the shared envelope.
- `--category shared-reuse`: run the shared-reuse category through the shared envelope.
- `--category repo-hygiene`: run the repo-hygiene category through the shared envelope.
- `--category tooling-ecosystem`: run the tooling-ecosystem category through the shared envelope.
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
   - `code-excellence`: invoke `etrnl-audit-excellence` after code-excellence worklists exist.
   - `ui-ux-product`: invoke `etrnl-audit-ux` after UI/UX/product worklists exist; require browser evidence for runtime UI claims or mark source-limited.
   - `production-readiness`: invoke `etrnl-audit-production` after production worklists exist.
   - `security`: invoke `etrnl-audit-security` after security worklists exist; require exploitable-bug evidence for findings and explicit non-findings for clean rows.
   - `performance`: invoke `etrnl-audit-performance` after performance worklists exist; use the `etrnl-dev-parallel` six-lane cap and require every registered lane receipt.
   - `shared-reuse`: invoke `etrnl-audit-reuse` after reuse worklists exist.
   - `repo-hygiene`: invoke `etrnl-audit-repo` after repo-hygiene worklists exist.
   - `tooling-ecosystem`: invoke `etrnl-audit-tooling` after tooling worklists exist.
7. Reject category output that creates category-local inventory after shared worklists exist. Category reports and lane receipts consume shared worklist hashes.
8. Require every selected category report before synthesis. Require exactly one report row for every registered check id.
9. Keep `findings`, `confirmed_clean`, `skipped`, `not_applicable`, and `source_limited` separate. Do not count a source-limited blocker as clean.
10. Validate the final artifact with `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>`.

## Coverage Statement

For `all_registered`, print this statement in the final synthesis:

```text
Coverage: all_registered categories completed: code-excellence, ui-ux-product, production-readiness, security, performance, shared-reuse, repo-hygiene, tooling-ecosystem.
Known not-yet-registered audit domains: api-data, payments, privacy-compliance.
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
