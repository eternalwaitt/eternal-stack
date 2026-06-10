---
name: etrnl-deep-audit
description: ETRNL application deep-audit orchestrator. Use when a user asks for a deep, full, or all_registered application audit; production-readiness plus performance category orchestration; shared worklists; category reports; lane receipts; coverage statements; source-limited blockers; or deep-audit artifact validation. UI/UX/product audits use etrnl-deep-audit-ux instead.
---
# ETRNL Deep Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-deep-audit`; on update, ask update/snooze/continue.

Run application deep audits through the registered category contract. Use `etrnl-audit-code` for repo-wide code health; use `etrnl-deep-audit-ux` for UI/UX/product audits; use this skill for orchestrator-included application categories and final synthesis.

## Modes

- `all_registered`: run every orchestrator-included category from `orchestratorCategoryIds()` in `scripts/lib/deep-audit-categories.mjs`.
- `--category code-excellence`: run the code-excellence category through the shared envelope.
- `--category production-readiness`: run the production-readiness category through the shared envelope.
- `--category security`: run the security category through the shared envelope.
- `--category performance`: run the performance category through the shared envelope.
- `--category shared-reuse`: run the shared-reuse category through the shared envelope.
- `--category repo-hygiene`: run the repo-hygiene category through the shared envelope.
- `--category tooling-ecosystem`: run the tooling-ecosystem category through the shared envelope.
- category list: run only orchestrator-included category ids named by the user.

UI/UX/product (`ui-ux-product`) is not an orchestrator mode. Route those prompts to `etrnl-deep-audit-ux`.

## Required Flow

1. Load `references/category-contract.md` before dispatch, standalone category routing, or synthesis.
2. Read `scripts/lib/deep-audit-categories.mjs` for `CATEGORY_REGISTRY_VERSION`, `orchestratorCategoryIds()`, registered category ids, required worklists, registered checks, lanes, and known unimplemented categories.
3. Resolve category selection:
   - `all_registered` means every id from `orchestratorCategoryIds()`.
   - Reject `ui-ux-product` and unknown category ids; print valid orchestrator ids and note `etrnl-deep-audit-ux` for UI/UX.
4. Create a run-scoped artifact directory and a redacted `runArtifactLabel`. Keep absolute target paths, emails, tokens, and key material out of tracked artifacts.
5. Create shared worklists before category execution. Every selected category receives each required worklist with `count`, `sha256` or `hash`, and `artifactLabel`.
6. Dispatch category work:
   - `code-excellence`: invoke `etrnl-code-review-excellence` after code-excellence worklists exist.
   - `production-readiness`: invoke `etrnl-audit-production` after production worklists exist.
   - `security`: invoke `etrnl-audit-security` after security worklists exist; require exploitable-bug evidence for findings and explicit non-findings for clean rows.
   - `performance`: invoke `etrnl-audit-performance` after performance worklists exist; use the six-lane cap from the `etrnl-dev-execute` parallel-fanout contract and require every registered lane receipt.
   - `shared-reuse`: load `references/categories/shared-reuse.md` after reuse worklists exist.
   - `repo-hygiene`: load `references/categories/repo-hygiene.md` after repo-hygiene worklists exist.
   - `tooling-ecosystem`: invoke `etrnl-audit-tooling` after tooling worklists exist.
7. Reject category output that creates category-local inventory after shared worklists exist. Category reports and lane receipts consume shared worklist hashes.
8. Require every selected category report before synthesis. Require exactly one report row for every registered check id.
9. Keep `findings`, `confirmed_clean`, `skipped`, `not_applicable`, and `source_limited` separate. Do not count a source-limited blocker as clean.
10. Validate the final artifact with `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>`.

## Coverage Statement

For `all_registered`, print this statement in the final synthesis:

```text
Coverage: all_registered categories completed: code-excellence, production-readiness, security, performance, shared-reuse, repo-hygiene, tooling-ecosystem.
UI/UX/product audit is separate: run etrnl-deep-audit-ux when needed.
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
