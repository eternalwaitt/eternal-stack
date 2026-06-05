# Ledger And Report Format

Use this reference for documentation-health findings, scorecards, and closeout reports.

## Ledger Schema

Use JSONL when the repo already uses machine-readable artifacts. Markdown tables are acceptable for report-only work if every field is present.

Required fields:

- `id`
- `severity`: `P0`, `P1`, `P2`, `P3`
- `category`
- `path`
- `line` or `section` when available
- `evidence`
- `source_of_truth`
- `impact`
- `recommended_action`
- `disposition`: `open`, `fixed`, `false_positive_with_evidence`, `accepted_risk_with_owner`, `blocked`
- `verification`

Example JSONL row:

```json
{"id":"DOC-P1-001","severity":"P1","category":"runtime-docs","path":"docs/install.md","evidence":"Doc says run command X, installer exposes command Y.","source_of_truth":"scripts/install.sh","impact":"New users run the wrong install path.","recommended_action":"Update install command and mention current doctor gate.","disposition":"fixed","verification":"scripts/doctor.sh passed"}
```

## Coverage Counters

Include these counters in the closeout:

```text
DOCS_FILES_REVIEWED: [n]
SOURCE_FILES_SAMPLED_OR_REVIEWED: [n]
RECENT_COMMITS_REVIEWED: [n]
RECENT_PRS_REVIEWED: [n]
RECENT_CHANGE_DOC_IMPACT_CHECKS: [n]
DOC_CLAIMS_CHECKED: [n]
SOURCE_TRUTH_MAPPINGS_REVIEWED: [n]
STALE_REFERENCE_SEARCHES_RUN: [n]
OUTDATED_DOC_CLAIMS_FOUND: [n]
OUTDATED_DOC_CLAIMS_REMAINING: [n]
STALE_DOCS_FOUND: [n]
STALE_DOCS_REMAINING: [n]
MISLEADING_DOCS_FOUND: [n]
MISLEADING_DOCS_REMAINING: [n]
ACTIVE_PLAN_QUEUE_DOCS_REVIEWED: [n]
ACTIVE_PLAN_QUEUE_DOCS_STALE: [n]
TSDOC_JSDOC_FILES_SCANNED: [n]
COMMENT_TARGETS_REVIEWED: [n]
COMMENT_TARGETS_DOCUMENTED: [n]
COMMENT_TARGETS_MISSING_DOCS: [n]
COMMENT_TARGETS_WRONG_FORMAT: [n]
APPS_AUDITED: [n] [list]
PACKAGES_AUDITED: [n] [list]
SERVICES_AUDITED: [n] [list]
MODULES_AUDITED: [n] [list]
ADRS_REVIEWED: [n]
STALE_ADRS_FOUND: [n]
OUTDATED_API_DOCS_FOUND: [n]
MISSING_LOCAL_READMES: [n]
MISSING_RUNTIME_DOCS: [n]
MISSING_TSDOC_JSDOC_TARGETS: [n from COMMENT_TARGETS_MISSING_DOCS, or COMMENT_HEALTH_NOT_APPLICABLE with evidence]
DELETE_CANDIDATES: [n]
CONFIRMED_OK: [list]
CHECKS_SKIPPED: [list with reasons]
FINAL_DOC_HEALTH_SCORE: [x]/100
```

## Scorecard

Score 1-10 with evidence for:

- root documentation clarity;
- documentation discoverability;
- documentation freshness;
- architecture clarity;
- structure clarity;
- API/contract documentation;
- runtime/operations documentation;
- ADR health;
- AI context health;
- TSDoc/JSDoc/comment health;
- contributor onboarding readiness;
- enforcement/automation;
- overall documentation health.

A 10 means accurate, current, discoverable, non-duplicative, verified against source, enough for a new contributor or agent to act safely, and guarded by repeatable checks whenever a repeatable check exists.

Do not collapse deterministic enforcement into overall health. A passing docs gate can support the enforcement score, but overall 100/100 also requires all docs in scope reviewed, recent local commit and GitHub PR/change impact evidence checked when available, checked source-truth mappings, stale-reference searches, zero remaining stale/misleading/outdated documentation, and zero stale active plan or work-queue docs.

## Final Report

Use this structure for audit or gate mode:

```markdown
# Documentation Health Audit

## 1. Executive Summary
- maturity
- biggest risks
- biggest strengths
- overall verdict

## 2. Coverage Map
- repository type
- files/folders inspected
- docs inspected
- apps/packages/services/modules inspected
- exclusions
- skipped checks

## 3. Documentation Inventory
- canonical docs
- secondary docs
- stale docs
- misleading docs
- generated docs
- archive docs
- delete candidates
- missing docs

## 3A. Freshness And Drift Proof
- recent commits reviewed
- recent GitHub PRs reviewed or exact unavailable reason
- recent-change documentation-impact conclusions
- source-truth mappings checked
- stale-reference terms searched
- active plans, work queues, handovers, migrations, and status docs reviewed
- outdated, stale, misleading, false-positive, fixed, and remaining hits

## 4. Root Documentation
- assessment
- gaps
- fixes

## 5. Local Documentation
- per app/package/service/module assessment
- missing local READMEs
- misplaced docs

## 6. Architecture And Structure
- explicit architecture
- implied architecture
- boundary gaps
- scaling risks

## 7. API, Data, And Runtime Docs
- API/contract drift
- env/runtime drift
- schema/model docs
- deployment/runbook docs

## 8. ADR Health
- ADR index
- stale/superseded ADRs
- missing ADRs

## 9. AI Context Health
- root AI context
- local AI context
- stale or risky instructions

## 10. TSDoc/JSDoc And Comments
- required comment surfaces
- useful comments
- missing comments
- stale/misleading/noise comments
- tooling prescription

## 11. Findings Ledger Summary
- by severity
- by category
- fixed
- open
- accepted risks
- blocked

## 12. Required Documentation System
- root README role
- docs/ role
- ADR role
- local README role
- comments role
- AI context role
- generated docs role

## 13. Immediate Fixes
- Critical now
- Next wave
- Later if complexity grows

## 14. Scorecard
- 1-10 scores with short evidence

## 15. Coverage Report
- coverage counters
```

In `fix` mode, lead with what changed and what passed, then include remaining accepted or blocked findings.
