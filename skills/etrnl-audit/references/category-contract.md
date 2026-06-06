# Deep-Audit Category Contract

This contract governs `etrnl-audit`, category skills, and `scripts/deep-audit-artifact-check.mjs`.

## Registry Source

`scripts/lib/deep-audit-categories.mjs` is the category source of truth. It exports:

- `CATEGORY_REGISTRY_VERSION`
- `KNOWN_UNIMPLEMENTED_CATEGORIES`
- `REGISTERED_DEEP_AUDIT_CATEGORIES`
- `registeredCategoryIds()`
- `findCategory(categoryId)`

Each registry entry defines:

- `categoryId`
- `skillName`
- `referencePath`
- `executionMode`
- `requiredWorklists`
- `checks[]`
- `lanes[]`

Do not maintain category truth in prose. Read the registry before category selection, worklist construction, dispatch, and synthesis.

## Selection Semantics

`all_registered` means every id returned by `registeredCategoryIds()`. It does not include `KNOWN_UNIMPLEMENTED_CATEGORIES`.

Unknown category ids block execution. Print the valid category ids from `registeredCategoryIds()`.

## Artifact Envelope

Every orchestrated or standalone category run emits the same envelope:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Set the artifact schema version. |
| `auditId` | Set a stable run id without private identity. |
| `categoryRegistryVersion` | Copy `CATEGORY_REGISTRY_VERSION`. |
| `registeredCategories` | Copy every registered category id. |
| `knownUnimplementedCategories` | Copy `KNOWN_UNIMPLEMENTED_CATEGORIES`. |
| `coverageStatement` | Include requested category ids and every known unimplemented domain. |
| `targetLabel` | Use a redacted target name. |
| `targetFingerprint` | Use a repo, commit, content, or config fingerprint without local paths. |
| `requestedCategories` | Use `all_registered` or an array of registered ids. |
| `runArtifactLabel` | Use a run label, not an absolute path. |
| `worklists` | Include shared worklists for requested categories. |
| `categoryReports` | Include one report for each requested category. |
| `laneReceipts` | Include one receipt for each registered fanout lane. |
| `confirmedClean` | List clean categories or checks with evidence. |
| `checksSkipped` | List skipped checks with reasons. |
| `findings` | List findings with evidence. |
| `sourceLimitedBlockers` | List blockers that prevented clean proof. |
| `synthesis` | Summarize final status without hiding blockers. |
| `verification` | Record artifact validation command and result. |

## Worklists

Create every `requiredWorklists` entry for selected categories before category execution. Each worklist row includes:

- `count`
- `sha256` or `hash`
- `artifactLabel`

Use an empty hashed worklist when a surface is absent. Absence alone never proves a clean check; connect the check row to `not_applicable`, `skipped`, or `source_limited` evidence.

Artifact labels replace absolute filesystem paths. Keep target roots, temporary directories, emails, tokens, API keys, passwords, and private-key material out of tracked artifacts.

Category reports and lane receipts copy the shared hashes into `consumedWorklistHashes`. A category report that sets the canonical `localInventoryCreated` field when shared worklists exist fails validation. Deprecated aliases `localInventory` and `createdLocalInventory` are also rejected.

## Category Reports

Every selected category report includes:

- `categoryId`
- `status`
- `consumedWorklistHashes`
- `checks`

Create exactly one row for every registered check id in that category. Do not invent, duplicate, or omit check ids.

Valid check statuses:

| Status | Required evidence |
| --- | --- |
| `finding` | Non-empty `findings`. |
| `confirmed_clean` | Non-empty `confirmedClean` string containing `CONFIRMED_CLEAN`. |
| `skipped` | Non-empty `skippedReason`. |
| `not_applicable` | Non-empty `notApplicableReason`. |
| `source_limited` | Non-empty `sourceLimitedBlocker`. |

Use `CHECKS_SKIPPED` in final synthesis for skipped checks. Use `not_applicable` only after the registry applicability gate is proven false for the target.

Security category finding rows must include `source`, `sink`, `missingControl`, `exploit`, `reachability`, `confidence`, `impact`, and `remediation`. Security clean rows must include `nonFindings.checkedSources`, `nonFindings.checkedSinks`, `nonFindings.controlsObserved`, `nonFindings.unreachableReason`, and `nonFindings.validationEvidence`.

## Fanout Receipts

Fanout categories require one lane receipt for every registered lane. Each receipt includes:

- `categoryId`
- `laneId`
- `status`
- `consumedWorklistHashes`
- `summary`

Lane receipts consume the shared category worklist hashes. Fanout lanes do not rescan broad target inventory independently.

## Coverage Statement

For `all_registered`, emit:

```text
Coverage: all_registered categories completed: code-excellence, ui-ux-product, production-readiness, security, performance, shared-reuse, repo-hygiene, tooling-ecosystem.
Known not-yet-registered audit domains: api-data, payments, privacy-compliance.
This is not a claim that every possible audit domain has run.
```

For a category subset, replace the first sentence with the explicitly requested registered category ids. Keep the known-domain sentence and final caveat.

## Source-Limited Handling

Source-limited blockers stay visible in `sourceLimitedBlockers` and check rows. When `sourceLimitedBlockers` is non-empty, set `synthesis.status` to `source_limited` or `findings_present`, never `clean`.

Authenticated routes, missing runtime fixtures, missing credentials, unavailable build artifacts, and absent target evidence become source-limited blockers or skipped checks. They do not become clean claims.

## Category Extension

Add a new category by updating the registry, the category skill, its reference path, docs, trigger fixtures, install surfaces, and validation fixtures in one integration change. The orchestrator keeps category control flow registry-driven.

Run these gates after contract changes:

```bash
node scripts/deep-audit-artifact-check.mjs validate-fixtures
node scripts/deep-audit-artifact-check.mjs validate-registry --root .
node scripts/prompt-budget-check.mjs .
node scripts/skill-contract-check.mjs
bash tests/test-hooks.sh
bash scripts/doctor.sh
```
