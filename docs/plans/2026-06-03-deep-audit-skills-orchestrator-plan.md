<!-- /autoplan restore point: ~/.gstack/projects/eternalwaitt-claude-control-plane/codex-control-plane-runtime-hardening-autoplan-restore-20260603-164059.md -->
# Deep Audit Skills And Orchestrator Implementation Plan

Status: Final

Execution scope: all_phases
Deep stack artifacts: docs/plans/artifacts/2026-06-03-deep-audit-skills-orchestrator/deep-stack-artifacts.json
Goal: Create a thin ETRNL deep-audit orchestrator plus production-readiness and performance category skills that can later expand into a full stack audit suite.
Non-goals: No target-application audit execution, no remediation in downstream apps, no live install into Claude or Codex home directories, no extra audit categories beyond the two provided specs, and no verbatim copy of unreviewed source prompts into repo-owned skills.
Evidence: AGENTS.md; docs/skills.md; docs/health-stack.md; docs/research/etrnl-parity-backlog.md; docs/research/2026-06-03-starred-agent-stack-map.md; scripts/lib/skill-lists.sh; hooks/lib/skill-hints.sh; scripts/skill-contract-check.mjs; scripts/prompt-budget-check.mjs; scripts/skill-behavior-smoke.mjs; scripts/plan-readiness-check.mjs; scripts/deep-stack-check.mjs; scripts/lib/deep-stack-artifacts.mjs; skills/etrnl-audit-code/SKILL.md; skills/etrnl-dev-parallel/SKILL.md; skills/etrnl-dev-execute/SKILL.md; skill-creator guidance; production-readiness audit source sha256:48090c3e4e04d2b018b65349bcbfef963988db1621499163c4fe438fa58a6b93; performance audit source sha256:16b832a0f048897c1107e8215e4e0a17ba8b6141a8b0c48331270b0285f490b8.

## What already exists

- `etrnl-audit-code` is the current whole-codebase health router. It already owns inventory, deterministic gates, companion audits, ledgers, no-skips closure, and final repo health verification.
- `etrnl-dev-parallel` defines the bounded fanout contract: disjoint file scopes, maximum six lanes, task packets, completion receipts, and final integration verification.
- `etrnl-dev-execute` already owns implementation execution, run ledgers, packet validation, spec/quality review evidence, simplifier evidence, and verification gates.
- `scripts/skill-contract-check.mjs` already enforces repo-owned skill list sync, docs links, helper references, reference-file existence, and directive-language rules for skill bodies and skill references.
- `scripts/prompt-budget-check.mjs` caps owned `SKILL.md` files at 18 KB, so the provided audit specs belong in rewritten references plus compact skill entrypoints.
- `scripts/skill-behavior-smoke.mjs` already verifies trigger-case coverage for every owned skill through `tests/fixtures/skill-triggering/cases.json`.
- `docs/skills.md`, `scripts/lib/skill-lists.sh`, and `hooks/lib/skill-hints.sh` are the existing skill registry surfaces. New owned skills must flow through this registry instead of creating a parallel list.
- `docs/health-stack.md` is the authoritative verification stack for this repo and already includes skill-contract, prompt-budget, doctor, hook, install, research, and workflow gates.
- The two provided audit specs already define no-sampling worklists, `CONFIRMED_CLEAN` logging, skipped-check reporting, category ownership boundaries, and synthesis formats.

Processing model:

```text
Victor request
  |
  v
etrnl-audit
  |
  +-- detects requested categories and required target evidence
  +-- creates a run-scoped audit artifact directory
  +-- dispatches category skills only after shared inventory exists
  |
  +-- etrnl-audit-production
  |     +-- serial or tightly grouped checks against full worklists
  |
  +-- etrnl-audit-performance
        +-- six read-only lanes after Phase 1 worklists are written
  |
  v
final synthesis with findings, clean checks, skipped checks, and source-limited blockers
```

## NOT in scope

- No replacement of `etrnl-audit-code`; the new orchestrator targets application deep-audit categories, while `etrnl-audit-code` remains the repo health router.
- No broad audit execution in this implementation. The work creates skills, references, fixtures, and validators.
- No automatic install or update into live local Claude/Codex state. Source gates come first; install remains explicit.
- No future category implementation such as security, UX, accessibility, docs, API, data, payments, or privacy beyond the two supplied category specs. The design includes a registry so later categories fit the same contract.
- No unbounded `/tmp` artifact naming. Generated audit outputs must use a run-scoped artifact directory.
- No tracked private paths, secrets, transcripts, accounts, or local memory content.

## Coverage Semantics

This plan uses `all_registered` instead of plain `full` in user-facing output. `all_registered` means every category listed in the machine-readable deep-audit registry for this repo, currently `production-readiness` and `performance`.

The orchestrator must print a coverage statement in every synthesis:

```text
Coverage: all_registered categories completed: production-readiness, performance.
Known not-yet-registered audit domains: security, UX/accessibility, API/data, docs, payments, privacy/compliance.
This is not a claim that every possible audit domain has run.
```

The coverage statement is mandatory even when every registered category passes. This keeps the system honest six months from now when someone asks for a "full deep audit" and expects more than the first two categories.

Implementation alternatives reviewed:

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Extend `etrnl-audit-code` | Reuses existing health router name | Blurs repo-health gates with application deep-audit categories | Reject |
| One orchestrator with references only | Smallest trigger surface | Harder to invoke a single category directly and harder to attach category-specific behavior | Reject |
| Thin orchestrator plus category skills | Clear routing, single-category invocation, future expansion | More registry drift risk | Accept, with machine-readable registry and direct-invocation guard |

## Developer Experience Contract

Primary developer product type: Codex/Claude skill plus local CLI validator.

Primary maintainer persona: a control-plane maintainer adding or editing an audit category. They know this repo's skill conventions, but they do not want to reverse-engineer four registries to answer one question: "did I wire this category correctly?"

Target first-five-minute path:

```bash
node scripts/deep-audit-artifact-check.mjs validate-fixtures
node scripts/deep-audit-artifact-check.mjs validate-registry --root .
node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.valid.json
```

The magical moment is mechanical proof that the deep-audit suite cannot overclaim coverage: the valid fixture passes, every invalid fixture fails with a named diagnostic, and `validate-registry --root .` proves the skill docs, trigger fixtures, installed helper script lists, and registry point at the same category universe.

DX requirements:

- `docs/skills.md` includes a short "Deep audit skills" block with the three invocations, what `all_registered` means, and the exact validator commands above.
- `scripts/deep-audit-artifact-check.mjs` emits human-readable errors in this shape: `errorCode`, `artifactPath`, `problem`, `cause`, `fix`.
- `scripts/deep-audit-artifact-check.mjs --json` emits machine-readable diagnostics with the same stable `errorCode` values used by tests.
- Invalid category errors print the valid category ids from `REGISTERED_DEEP_AUDIT_CATEGORIES`.
- Registry drift errors print the exact missing surface, such as `docs/skills.md`, `tests/fixtures/skill-triggering/cases.json`, `scripts/install.sh`, or `scripts/lib/skill-lists.sh`.
- Direct category skill instructions include one copy-paste command to run the same envelope validation after standalone use.
- Synthetic fixture validation prints the missing report row type, such as `route_matrix`, `auth_blocker`, `not_applicable`, `CONFIRMED_CLEAN`, or `CHECKS_SKIPPED`.

## Error & Rescue Registry

| Failure | User-visible risk | Rescue |
| --- | --- | --- |
| `all_registered` hides known missing domains | Victor thinks security, UX, API/data, docs, payments, or privacy ran when they did not | Mandatory `coverageStatement` plus `knownUnimplementedCategories` in every report |
| Category skill runs directly and bypasses shared worklists | Production and performance reports disagree on coverage or artifact shape | Standalone category skills must initialize the same envelope or route through `etrnl-audit --category <id>` |
| Tracked report leaks local target paths | Public repo exposes operator identity or local filesystem layout | Tracked fixtures use `targetLabel` and `targetFingerprint`; absolute paths stay only in ignored local run artifacts |
| Golden JSON passes while real authoring fails | Validator proves shape only, not that skills can produce the shape | Add realistic synthetic target fixtures and artifact-authoring fixtures for missing evidence, auth blockers, route matrices, and `not_applicable` cases |
| Registry prose drifts from validator behavior | Full audit omits or invents categories | `scripts/lib/deep-audit-categories.mjs` is the single source loaded by validator, docs check, and orchestrator |
| Category reference omits a registered check | No-sampling becomes advisory instead of mechanical | Registry exports every `checkId`, lane owner, applicability gate, and required worklist; validator rejects omitted, duplicate, or unknown check ids |
| Maintainer cannot tell how to fix a failed validator run | New category work stalls or gets patched by guesswork | Every validator error includes problem, cause, fix, stable `errorCode`, and the exact registry/doc/install surface to update |

## File map

- `skills/etrnl-audit/SKILL.md`: new thin orchestrator skill that selects categories, requires a run artifact directory, enforces shared worklists before fanout, and synthesizes category reports.
- `skills/etrnl-audit/references/category-contract.md`: new reference that defines category registration fields, shared artifact schema, fanout rules, `all_registered` mode, and future-category extension rules.
- `scripts/lib/deep-audit-categories.mjs`: new machine-readable registry with category id, skill name, reference path, execution mode, required worklists, registered `checks[]`, registered `lanes[]`, known-not-implemented domain tags, and version.
- `skills/etrnl-audit-production/SKILL.md`: new category skill that loads its rewritten reference only when production readiness is requested.
- `skills/etrnl-audit-production/references/audit-checks.md`: new directive-language rewrite of the production-readiness audit spec with applicability gates and no private source paths.
- `skills/etrnl-audit-performance/SKILL.md`: new category skill that loads its rewritten reference only when performance audit is requested.
- `skills/etrnl-audit-performance/references/audit-checks.md`: new directive-language rewrite of the performance audit spec with the six-lane fanout contract and runtime-evidence requirements.
- `scripts/deep-audit-artifact-check.mjs`: new validator for audit manifests, registry/docs/install alignment, registered categories, registered checks, category reports, lane receipts, `CONFIRMED_CLEAN`, `CHECKS_SKIPPED`, consumed worklist hashes, private string redaction, coverage statements, all-registered synthesis completeness, stable diagnostic codes, and `--json` output.
- `tests/fixtures/deep-audit/report.valid.json`: new valid artifact fixture covering orchestrator synthesis plus both category reports.
- `tests/fixtures/deep-audit/report.missing-confirmed-clean.json`: new invalid fixture proving clean checks cannot disappear.
- `tests/fixtures/deep-audit/report.missing-lane-receipt.json`: new invalid fixture proving fanout lanes need completion receipts.
- `tests/fixtures/deep-audit/report.source-limited.json`: new valid fixture proving runtime blockers can be reported without false clean claims.
- `tests/fixtures/deep-audit/report.private-path.json`: new invalid fixture proving tracked artifacts cannot contain absolute local target paths.
- `tests/fixtures/deep-audit/report.missing-coverage-statement.json`: new invalid fixture proving all-registered reports must display omitted known domains.
- `tests/fixtures/deep-audit/report.omitted-check.json`: new invalid fixture proving registered checks cannot disappear from a category report.
- `tests/fixtures/deep-audit/report.unknown-check-id.json`: new invalid fixture proving category reports cannot invent check ids outside the registry.
- `tests/fixtures/deep-audit/report.duplicate-check-id.json`: new invalid fixture proving a report cannot count the same check twice.
- `tests/fixtures/deep-audit/report.unexpected-local-inventory-flag.json`: invalid fixture proving category reports cannot consume unshared local inventory after shared worklists exist.
- `tests/fixtures/deep-audit/report.invalid-category.json`: new invalid fixture proving category ids must come from the registry.
- `tests/fixtures/deep-audit/synthetic-target/`: new minimal synthetic target fixture used by `validate-synthetic-fixtures` to prove category skills can author realistic reports, including missing target evidence, auth blockers, route matrices, and `not_applicable` rows.
- `tests/fixtures/deep-audit/templates/`: new deterministic report authoring templates for direct category invocation, source-limited blockers, route matrices, clean checks, skipped checks, and not-applicable checks.
- `tests/fixtures/skill-triggering/cases.json`: add trigger coverage for `etrnl-audit`, `etrnl-audit-production`, and `etrnl-audit-performance`.
- `scripts/lib/skill-lists.sh`: add the three owned skill names in registry order and ensure install helper arrays include the new validator script where this repo's install/update contracts require copied scripts.
- `scripts/install.sh`: copy or preserve the new validator and registry helper exactly as existing repo-owned workflow scripts are installed.
- `docs/skills.md`: document the orchestrator, the two category skills, how they relate to `etrnl-audit-code`, and the three-command deep-audit validator quick start.
- `docs/health-stack.md`: add the deep-audit artifact validator and skill behavior smoke expectations to relevant gate descriptions.
- `CHANGELOG.md`: record the source-level skill addition under `Unreleased`.
- `tests/test-workflow-tools.sh`: add validator fixture assertions for the new deep-audit artifact checker.
- `tests/test-install.sh`: assert install/update surfaces include the deep-audit validator and registry helper so source gates and installed Claude state cannot drift.
- `tests/test-hooks.sh`: update only if skill hints or hook-visible skill routing changes require fixture coverage.

## Task groups

### Group A - Shared Deep-Audit Contract

Owner: parent implementation agent or one sequential executor.
Dependencies: existing `skill-contract-check.mjs`, `prompt-budget-check.mjs`, `skill-behavior-smoke.mjs`, and the two provided audit spec hashes.
Acceptance criteria: a compact shared category contract exists; `scripts/lib/deep-audit-categories.mjs` is the single machine-readable registry; it names category ids, applicability fields, worklist inputs, registered check ids, lane receipts, blocked/source-limited outputs, known unimplemented domains, and synthesis fields; future categories can register without changing the orchestrator control flow.
Verification: `node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.valid.json`.

### Group B - Thin Orchestrator Skill

Owner: skill workflow writer.
Dependencies: Group A contract and existing `etrnl-audit-code`, `etrnl-dev-parallel`, and `etrnl-dev-execute` behavior.
Acceptance criteria: `etrnl-audit` stays below the prompt budget, delegates category details to references, refuses all-registered completion without every registered category report, prints `coverageStatement`, prints known unimplemented domains, rejects invalid category ids, and records source-limited blockers instead of clean claims.
Verification: `node scripts/prompt-budget-check.mjs .` and `node scripts/skill-contract-check.mjs`.

### Group C - Production Readiness Category Skill

Owner: production-readiness skill writer.
Dependencies: Group A contract and the production-readiness source hash.
Acceptance criteria: the skill owns the 17 production-readiness checks, rewrites stack-specific assumptions into applicability gates, preserves no-sampling and `CONFIRMED_CLEAN` rules, blocks false positives when tenancy, soft delete, money value objects, i18n, or serverless deployment are not applicable, and cannot complete standalone unless it creates the same report envelope or routes through `etrnl-audit --category production-readiness`.
Verification: `node scripts/skill-contract-check.mjs` and `node scripts/prompt-budget-check.mjs .`.

### Group D - Performance Category Skill

Owner: performance skill writer.
Dependencies: Group A contract and the performance source hash.
Acceptance criteria: the skill owns the performance checks, requires Phase 1 worklists before six-lane fanout, separates dev compile time from runtime latency, requires route matrix evidence for user-facing routes, records authenticated/dynamic fixture blockers explicitly, and cannot complete standalone unless it creates the same report envelope or routes through `etrnl-audit --category performance`.
Verification: `node scripts/skill-contract-check.mjs` and `node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.missing-lane-receipt.json` with expected failure.

### Group E - Registry, Docs, And Trigger Coverage

Owner: registry/docs integration owner.
Dependencies: Groups B, C, and D.
Acceptance criteria: owned skill registry, skill docs, health-stack docs, trigger fixtures, changelog, install helper arrays, installer copy behavior, and install tests all name the same three new skills and required helper scripts with consistent responsibilities.
Verification: `node scripts/skill-behavior-smoke.mjs`, `node scripts/skill-contract-check.mjs`, and `tests/test-workflow-tools.sh`.

### Group F - Final Gate And Release Hygiene

Owner: final integration owner.
Dependencies: Groups A through E.
Acceptance criteria: all source gates pass; no prompt-budget drift; no directive-language violations; no missing trigger cases; no failed fixture tests; no unrelated files changed.
Verification: `tests/test-hooks.sh`, `tests/test-install.sh`, `node scripts/replay-hook-fixtures.mjs`, `scripts/doctor.sh`, and `git diff --check`.

## Phases

### Phase 0 - Baseline And Guardrail Inventory

Read the existing skill, script, docs, and test surfaces listed in the evidence header. Confirm the checkout is clean or record unrelated local edits. Re-check the provided source hashes before copying or rewriting any audit material.

Outputs:

- Implementation notes listing reused surfaces.
- Confirmation that the source specs are treated as external inputs until rewritten into repo-owned directive-language references.

### Phase 1 - Artifact Contract And Validator

Create `scripts/lib/deep-audit-categories.mjs`, `scripts/deep-audit-artifact-check.mjs`, and deep-audit fixtures before adding the skills. The validator owns only mechanical completeness, not audit judgment.

Registry contract:

- `scripts/lib/deep-audit-categories.mjs` exports `CATEGORY_REGISTRY_VERSION`, `KNOWN_UNIMPLEMENTED_CATEGORIES`, and `REGISTERED_DEEP_AUDIT_CATEGORIES`.
- Each category entry includes `categoryId`, `skillName`, `referencePath`, `executionMode`, `requiredWorklists`, `checks[]`, and `lanes[]`.
- Each check entry includes `checkId`, `label`, `requiredWorklists`, `applicabilityGate`, and `laneId` when the check is lane-owned.
- Each lane entry includes `laneId`, `label`, `allowedWorklists`, and required receipt fields.
- `validate-registry --root .` compares registry entries against `OWNED_SKILLS`, `docs/skills.md`, `tests/fixtures/skill-triggering/cases.json`, skill directories, reference paths, and install/update helper script lists.
- The registry helper has no runtime-heavy imports and can be loaded by shell-driven validation without starting target-app tooling.

Required artifact fields:

- `schemaVersion`
- `auditId`
- `categoryRegistryVersion`
- `registeredCategories`
- `knownUnimplementedCategories`
- `coverageStatement`
- `targetLabel`
- `targetFingerprint`
- `requestedCategories`
- `runArtifactLabel`
- `worklists`
- `categoryReports`
- `laneReceipts`
- `confirmedClean`
- `checksSkipped`
- `findings`
- `sourceLimitedBlockers`
- `synthesis`
- `verification`

The validator fails when:

- a selected category has no report;
- `requestedCategories: all_registered` omits any registry category;
- `coverageStatement` omits known unimplemented domains;
- a category report omits a registered check without recording `checksSkipped` or an applicability result;
- a category report contains an unknown `checkId`;
- a category report contains a duplicate `checkId`;
- a report marks a check complete without either findings or `CONFIRMED_CLEAN`;
- a skipped check lacks a reason;
- a fanout lane lacks a receipt;
- a worklist count exists without a worklist hash or path;
- a category report or lane receipt lacks `consumedWorklistHashes`;
- `consumedWorklistHashes` differ from the shared worklist hashes;
- a category report creates local inventory after shared worklists exist;
- a tracked artifact includes private strings such as `/Users/`, `/home/`, `/Volumes/`, `~/`, `/tmp/`, `/var/folders/`, Windows drive paths, UNC paths, emails, tokens, API keys, or private-key text;
- `targetFingerprint` is derived from an absolute path instead of a content or repo identity;
- source-limited blockers are hidden under clean status.

Every validator failure prints a stable `errorCode`, artifact or registry path, problem, cause, and fix. `--json` prints the same fields as structured diagnostics for tests and future automation.

### Phase 2 - Orchestrator Skill

Create `etrnl-audit` as a small router. It must:

- ask the executor to select `production-readiness`, `performance`, or `all_registered`;
- initialize a run-scoped artifact directory;
- run common stack/applicability discovery once;
- dispatch selected category skills;
- forbid category agents from doing independent inventory after shared worklists exist;
- require every category report and lane receipt to declare the shared `consumedWorklistHashes`;
- require category reports to satisfy `scripts/deep-audit-artifact-check.mjs`;
- synthesize findings, clean checks, skipped checks, blockers, `coverageStatement`, and known unimplemented domains.

All-registered behavior:

- `all_registered` means every category exported by `scripts/lib/deep-audit-categories.mjs`, not only the first available category.
- Known future categories are printed as `known_unimplemented`, not treated as clean.
- Invalid category ids fail before any audit work starts.
- Invalid category output prints the valid category ids and the next command to validate the registry.

### Phase 3 - Production Readiness Skill

Create `etrnl-audit-production` with a compact `SKILL.md` and a rewritten reference. The reference preserves the provided spec's category ownership while adding applicability gates:

- stack runtime and framework;
- API layer and validation library;
- ORM and schema files;
- auth provider;
- queue and cron model;
- deployment/serverless model;
- locale/compliance market;
- tenancy and location model;
- logger and env schema.

The skill blocks completion when a worklist is sampled instead of fully processed. If context is exhausted, it records `CHECKS_SKIPPED` with check id, worklist id, and reason.

Standalone invocation behavior:

- If the user invokes `etrnl-audit-production` directly, the skill creates the same report envelope with `requestedCategories: ["production-readiness"]` or routes to `etrnl-audit --category production-readiness`.
- Direct invocation cannot emit a final answer that bypasses `scripts/deep-audit-artifact-check.mjs`.
- Direct invocation final output includes `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` as the validation command.

### Phase 4 - Performance Skill

Create `etrnl-audit-performance` with a compact `SKILL.md` and a rewritten reference. The skill preserves the six-lane model:

- database query performance;
- server response time and caching;
- bundle size and code splitting;
- React rendering performance;
- perceived performance and UX speed;
- infrastructure and network performance.

The skill requires the route matrix, cold and warm measurements, response bytes, route status, authenticated/dynamic fixture status, and source-limited blockers. It rejects service-only timing as final evidence for user-facing routes.

Standalone invocation behavior:

- If the user invokes `etrnl-audit-performance` directly, the skill creates the same report envelope with `requestedCategories: ["performance"]` or routes to `etrnl-audit --category performance`.
- Direct invocation cannot emit a final answer that bypasses `scripts/deep-audit-artifact-check.mjs`.
- Direct invocation final output includes `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` as the validation command.

### Phase 5 - Registry, Docs, And Trigger Integration

Update the owned skill registry, skill docs, health-stack docs, trigger fixtures, install/update script lists, installer copy behavior, install tests, and changelog. Keep `hooks/lib/skill-hints.sh` sourced from `scripts/lib/skill-lists.sh`; edit hook code only if the registry contract itself changes.

Docs acceptance criteria:

- `docs/skills.md` names `all_registered` as registered categories only.
- `docs/skills.md` includes the three-command quick start from the Developer Experience Contract.
- `docs/skills.md` gives one direct category example for production readiness and one for performance.
- `docs/health-stack.md` lists the deep-audit validator under required gates after implementation.

### Phase 6 - Verification And Cleanup

Run all verification gates listed below. Fix every failure in source before any install or rollout step. Confirm no tracked private paths, secrets, or local-only source files entered the repo.

## Skill/tool routing

- Use `etrnl-dev-plan` for this plan and any plan edits.
- Use `skill-creator` guidance for the three new skills: compact `SKILL.md`, reference-backed detail, no auxiliary README files, and prompt-budget protection.
- Use `etrnl-dev-execute` only after Victor asks to implement this plan.
- Use `etrnl-dev-parallel` during implementation only for disjoint lanes after packet validation.
- Use `code-simplifier` after implementation because this adds new skill and script surfaces.
- Use `finding-duplicate-functions` if the artifact validator duplicates logic already present in deep-stack or ledger validators.
- Use `brooks-audit` or `etrnl-dev-review` for the workflow architecture review before final completion.
- `eternal-best-practices` is not domain-triggered by this source-only control-plane skill work; if implementation starts editing auth, tenancy, money, i18n, Prisma, permissions, or soft-delete policy, it becomes required.

## Test plan

- Skill registry path: add owned skill entries, docs rows, trigger fixtures, and confirm `node scripts/skill-behavior-smoke.mjs` passes.
- Prompt budget path: confirm all three new `SKILL.md` files stay below 18 KB with `node scripts/prompt-budget-check.mjs .`.
- Directive language path: confirm all new skill bodies and references pass `node scripts/skill-contract-check.mjs`.
- Artifact validator path: add valid and invalid fixtures, then confirm `tests/test-workflow-tools.sh` exercises them.
- Validator DX path: invalid fixture tests assert stable `errorCode`, problem, cause, fix, and `--json` diagnostic fields.
- Orchestrator behavior path: fixture proves selected categories require matching category reports and all-registered mode cannot silently omit registry categories.
- Registry behavior path: fixture proves `scripts/lib/deep-audit-categories.mjs` is the source for docs, validator, and orchestrator category ids.
- Check-universe behavior path: fixtures prove registered checks cannot be omitted, duplicated, or invented.
- Worklist-consumption behavior path: fixture proves category reports and lane receipts must use the shared worklist hashes and cannot create local inventory.
- Install/update behavior path: `tests/test-install.sh` proves the new validator and registry helper are included in source-to-install copy coverage.
- Coverage behavior path: fixture proves known unimplemented domains are printed in all-registered synthesis.
- Privacy behavior path: fixture proves tracked artifacts reject local absolute paths, home paths, Windows drive paths, UNC paths, emails, tokens, private-key text, and use `targetLabel` plus `targetFingerprint`.
- Production-readiness behavior path: fixture proves a complete check needs findings or `CONFIRMED_CLEAN`, and a skipped check needs a reason.
- Performance behavior path: fixture proves a fanout lane needs a receipt and route-matrix blockers remain visible.
- Direct invocation behavior path: fixtures prove direct `production-readiness` and `performance` category runs create or route through the same report envelope.
- Direct invocation DX path: category skill final-output fixtures include the exact artifact validation command.
- Synthetic authoring behavior path: a synthetic target fixture proves the skills can author realistic report rows for missing evidence, auth blockers, route matrices, and `not_applicable` checks.
- Maintainer quick-start path: docs fixture or contract assertion proves `docs/skills.md` contains the three-command validator quick start.
- Release hygiene path: run health-stack gates and confirm changelog, docs, and skill list remain aligned.

Coverage map:

```text
CODE PATH COVERAGE
==================
[+] skills/etrnl-audit/SKILL.md
    +-- [TESTED] prompt budget and directive-language contract
    +-- [TESTED] trigger fixture invokes orchestrator

[+] skills/etrnl-audit-production/SKILL.md
    +-- [TESTED] prompt budget and directive-language contract
    +-- [TESTED] trigger fixture invokes category skill

[+] skills/etrnl-audit-performance/SKILL.md
    +-- [TESTED] prompt budget and directive-language contract
    +-- [TESTED] trigger fixture invokes category skill

[+] scripts/deep-audit-artifact-check.mjs
    +-- [TESTED] valid report passes
    +-- [TESTED] missing clean evidence fails
    +-- [TESTED] missing lane receipt fails
    +-- [TESTED] source-limited blocker remains visible
    +-- [TESTED] private tracked path fails
    +-- [TESTED] missing coverage statement fails
    +-- [TESTED] invalid category id fails
    +-- [TESTED] omitted registered check fails
    +-- [TESTED] unknown check id fails
    +-- [TESTED] duplicate check id fails
    +-- [TESTED] category-local inventory fails
    +-- [TESTED] consumed worklist hash mismatch fails
    +-- [TESTED] invalid diagnostics include errorCode, problem, cause, and fix
    +-- [TESTED] --json diagnostics preserve stable errorCode values

USER FLOW COVERAGE
==================
[+] Victor asks for all registered deep-audit categories
    +-- [TESTED] orchestrator requires all registered categories
    +-- [TESTED] orchestrator prints known unimplemented domains
    +-- [TESTED] source-limited category is not counted as clean

[+] Victor asks only for performance
    +-- [TESTED] performance category can run without production category

[+] Victor asks only for production readiness
    +-- [TESTED] production category can run without performance category

[+] Victor invokes a category skill directly
    +-- [TESTED] category skill creates or routes through the shared report envelope

[+] Victor passes an invalid category id
    +-- [TESTED] orchestrator fails before audit work starts with the valid category list

[+] Target evidence is missing
    +-- [TESTED] report records source-limited blocker instead of clean status
```

## Test-first execution plan

- Red: add invalid deep-audit artifact fixtures and workflow-tool assertions first; run `tests/test-workflow-tools.sh` and confirm the new fixture cases fail before `scripts/deep-audit-artifact-check.mjs` implements the missing validation.
- Red: add `report.private-path.json`, `report.missing-coverage-statement.json`, `report.invalid-category.json`, `report.omitted-check.json`, `report.unknown-check-id.json`, `report.duplicate-check-id.json`, and `report.unexpected-local-inventory-flag.json`; confirm each fails with the expected message before implementing the validator rules.
- Red: add synthetic target authoring fixtures before category skill instructions are complete; confirm the authoring check fails because the report envelope, route matrix, auth blocker, or `not_applicable` rows are missing.
- Red: add the three new skills to `OWNED_SKILLS` before adding complete trigger fixtures; run `node scripts/skill-behavior-smoke.mjs` and confirm it reports missing trigger coverage.
- Red: add the validator script to the repo without install/update wiring; run `tests/test-install.sh` and confirm it reports the missing copied helper before updating install surfaces.
- Red: add expected diagnostic-code assertions before implementing error formatting; run `tests/test-workflow-tools.sh` and confirm it reports missing `errorCode`, problem, cause, or fix fields.
- Green: implement the validator and fixtures until `tests/test-workflow-tools.sh` passes.
- Green: add skill trigger cases and skill docs until `node scripts/skill-behavior-smoke.mjs` and `node scripts/skill-contract-check.mjs` pass.
- Green: update install helper arrays, installer copy behavior, and install assertions until `tests/test-install.sh` passes.
- Green: run the full verification gate list and fix every failure before completion.

## Failure modes

- Orchestrator false completion: all-registered mode reports success while one category did not run. The artifact validator fails selected or registered categories without reports.
- Coverage overclaim: all-registered synthesis reads like every audit domain ran. The validator requires `coverageStatement` plus known unimplemented domains.
- Category false positives: stack-specific checks flag irrelevant tenancy, soft-delete, money, i18n, or serverless findings. The category references require applicability rows and `not_applicable` rationale before audit checks run.
- Direct category bypass: a category skill emits a report without shared worklists or synthesis fields. Direct invocation must create or route through the shared envelope, then pass the artifact validator.
- Subagent drift: performance lanes run their own inventory and disagree on route coverage. The orchestrator requires shared worklists and lane receipts tied to worklist hashes.
- Check-universe omission: a category reference leaves out one of its registered checks. The registry exports the full check universe, and the validator rejects omitted, unknown, or duplicate check ids.
- Worklist-hash drift: a category reports evidence from an independent scan. Category reports and lane receipts must declare `consumedWorklistHashes` that match the shared worklists.
- Source-limited masking: authenticated routes or missing fixtures get counted as clean. The report schema keeps `sourceLimitedBlockers` separate from `confirmedClean`.
- Private path leakage: target root, run artifact directory, email, token, or local secret marker enters tracked fixtures. The validator rejects local and credential-like patterns and requires redacted labels plus content or repo fingerprints in tracked outputs.
- Install/update drift: source validators exist locally but are not copied into installed Claude state. Install helper arrays, installer copy tests, and `tests/test-install.sh` fail until the new helper surfaces are covered.
- Poor maintainer DX: a failed validator run says what broke but not what to update. Invalid fixture tests assert stable diagnostic codes and problem/cause/fix output.
- Prompt bloat: the source specs make skill bodies too large. The implementation keeps details in references and runs prompt-budget checks.
- Directive-language failure: source prompt prose includes advisory language. The implementation rewrites source material into mandatory control-plane language before placing it under `skills/**/references`.
- Future category drift: a later category is added to docs but not the orchestrator contract. The registry fixture and `all_registered` validation fail until the category contract and trigger coverage are updated.

## Parallelization strategy

Phase 0 and Phase 1 are sequential because the category contract and artifact schema define every downstream lane. After Phase 1 passes, Phase 2, Phase 3, and Phase 4 can run in parallel with disjoint skill directories. Phase 5 needs one integration owner because it edits shared registry, docs, changelog, and test files. Phase 6 is sequential.

Parallel lanes after Phase 1:

| Lane | Files | Conflict risk |
| --- | --- | --- |
| Orchestrator | `skills/etrnl-audit/**` | Low after contract settles |
| Production readiness | `skills/etrnl-audit-production/**` | Low after contract settles |
| Performance | `skills/etrnl-audit-performance/**` | Low after contract settles |
| Validator fixtures | `scripts/deep-audit-artifact-check.mjs`, `scripts/lib/deep-audit-categories.mjs`, `tests/fixtures/deep-audit/**` | Medium; one owner for script and fixtures |
| Docs/registry | `docs/skills.md`, `docs/health-stack.md`, `scripts/lib/skill-lists.sh`, `tests/fixtures/skill-triggering/cases.json`, `CHANGELOG.md` | High; one integration owner |

Use worktrees or disjoint packet scopes for parallel source writes. Do not let two lanes edit `tests/test-workflow-tools.sh` or `scripts/lib/skill-lists.sh` in the same wave.

## Verification gates

Must pass:

- `node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.valid.json`
- `node scripts/deep-audit-artifact-check.mjs validate --artifact tests/fixtures/deep-audit/report.source-limited.json`
- `node scripts/deep-audit-artifact-check.mjs validate-fixtures`
- `node scripts/deep-audit-artifact-check.mjs validate-registry --root .`
- `node scripts/deep-audit-artifact-check.mjs validate-synthetic-fixtures --fixture tests/fixtures/deep-audit/synthetic-target --templates tests/fixtures/deep-audit/templates`
- `node scripts/prompt-budget-check.mjs .`
- `node scripts/skill-contract-check.mjs`
- `node scripts/skill-behavior-smoke.mjs`
- `tests/test-workflow-tools.sh`
- `tests/test-hooks.sh`
- `tests/test-install.sh`
- `node scripts/replay-hook-fixtures.mjs`
- `node scripts/settings-audit.mjs templates/settings.json`
- `node scripts/settings-audit.mjs templates/settings.strict.json`
- `node scripts/update-check.mjs --fingerprint-source .`
- `scripts/doctor.sh`
- `fd -t f -e sh . hooks scripts tests -x bash -n`
- `fd -t f -e sh . hooks scripts tests -X shellcheck -x`
- `node --check scripts/deep-audit-artifact-check.mjs`
- `git diff --check`
- `node scripts/plan-readiness-check.mjs docs/plans/2026-06-03-deep-audit-skills-orchestrator-plan.md`

Expected-fail fixtures, asserted by `tests/test-workflow-tools.sh` and `node scripts/deep-audit-artifact-check.mjs validate-fixtures`:

- `tests/fixtures/deep-audit/report.missing-confirmed-clean.json`
- `tests/fixtures/deep-audit/report.missing-lane-receipt.json`
- `tests/fixtures/deep-audit/report.private-path.json`
- `tests/fixtures/deep-audit/report.missing-coverage-statement.json`
- `tests/fixtures/deep-audit/report.invalid-category.json`
- `tests/fixtures/deep-audit/report.omitted-check.json`
- `tests/fixtures/deep-audit/report.unknown-check-id.json`
- `tests/fixtures/deep-audit/report.duplicate-check-id.json`
- `tests/fixtures/deep-audit/report.unexpected-local-inventory-flag.json`

Each expected-fail fixture must exit nonzero with a stable error code or stable diagnostic token. A direct successful exit from any invalid fixture is a blocker.

## Rollback

For source rollback, revert only the files created or changed by this implementation run: the three new skill directories, the deep-audit validator, fixtures, registry entries, docs updates, and changelog entry. For installed control-plane rollback after a later explicit install, use `scripts/rollback-local.sh`, then verify with `scripts/doctor.sh`, `scripts/post-upgrade-canary.sh`, and `node scripts/update-check.mjs --explain`. Do not remove user-local external hooks, private overlays, or settings entries that are not repo-owned.

## Execution handoff

Use `etrnl-dev-execute` after Victor explicitly asks to implement this plan. Because `Execution scope: all_phases`, execution must complete every phase here or stop with a concrete blocker. Use implementation subagents for the orchestrator, production-readiness, and performance skill directories only after Phase 1 stabilizes the artifact contract and packet scopes prove no file overlap. Use direct parent edits for the shared registry and final integration wave unless the executor creates one authoritative integration packet.

## AUTOPLAN CEO REVIEW

Phase status: complete.

Premise gate: passed. Victor's answer is `10/10 completeness`, so completeness expansions inside the plan blast radius are accepted.

Codex voice: unavailable. `codex exec` failed before review because the local Codex config uses `service_tier = default`, while this CLI expects `fast` or `flex`. This run is tagged `subagent-only`.

Codex subagent findings:

- P1: Plain `full` audit language can mislead future operators into thinking security, UX/accessibility, API/data, docs, payments, or privacy/compliance ran. Fixed by adding `Coverage Semantics`, `all_registered`, `coverageStatement`, and known unimplemented domain output.
- P1: Category registry was prose-only. Fixed by adding `scripts/lib/deep-audit-categories.mjs` as the single machine-readable source for validator, docs, and orchestrator behavior.
- P1: Direct category invocation could bypass the orchestrator. Fixed by adding standalone category invocation rules that create or route through the shared report envelope.
- P2: Report fixtures could be toy JSON. Fixed by adding synthetic target authoring fixtures for missing target evidence, auth blockers, route matrices, and `not_applicable` rows.
- P2: Artifact schema could leak local paths. Fixed by replacing tracked `targetRoot` and `runArtifactDir` with `targetLabel`, `targetFingerprint`, and `runArtifactLabel`; local absolute paths stay in ignored run output only.
- P2: Alternative shape was underexplored. Fixed by adding the implementation alternatives table under `Coverage Semantics`.

CEO dual voices consensus:

| Dimension | Codex CLI | Codex subagent | Consensus |
| --- | --- | --- | --- |
| Premises valid | N/A | Mostly valid, but coverage premise needed tightening | Subagent-only concern fixed |
| Right problem to solve | N/A | Yes, thin orchestrator plus category skills is directionally right | Subagent-only confirmed |
| Scope calibration correct | N/A | Needs registry, coverage, direct invocation, synthetic authoring fixtures | Subagent-only concern fixed |
| Alternatives explored | N/A | Needed explicit comparison of three structures | Subagent-only concern fixed |
| Competitive/operator risks covered | N/A | Future false full-audit claims were not covered enough | Subagent-only concern fixed |
| Six-month trajectory sound | N/A | Sound after all-registered semantics and registry enforcement | Subagent-only confirmed |

CEO completion summary:

| Item | Result |
| --- | --- |
| Mode | Selective expansion |
| Decisions made | 6 auto-decisions |
| Taste decisions | 0 |
| User challenges | 0 |
| Blockers | 0 |
| Plan changes | Coverage semantics, registry, standalone invocation, synthetic authoring, privacy redaction, test/verification expansion |

## AUTOPLAN ENG REVIEW

Phase status: complete.

Codex voice: unavailable. `codex exec` failed before review because the local Codex config uses `service_tier = default`, while this CLI expects `fast` or `flex`. This run remains tagged `subagent-only`.

Engineering findings:

- P1: Validator wiring could pass source tests but miss installed Claude state. Fixed by adding `scripts/install.sh`, install helper arrays, and `tests/test-install.sh` acceptance coverage.
- P1: No-sampling was not mechanically provable without a registry check universe. Fixed by requiring registered `checks[]`, stable `checkId` values, lane ownership, applicability gates, and omitted/unknown/duplicate check fixtures.
- P1: Verification gates mixed pass commands with invalid fixtures. Fixed by splitting `Must pass` commands from expected-fail fixtures asserted by `tests/test-workflow-tools.sh` and `validate-fixtures`.
- P1: Registry validation needed to cover every public surface. Fixed by making `validate-registry --root .` compare registry entries to `OWNED_SKILLS`, `docs/skills.md`, trigger fixtures, skill directories, reference paths, and install/update helper lists.
- P2: Category agents could report evidence from independent scans. Fixed by requiring `consumedWorklistHashes` on category reports and lane receipts, plus a unexpected-local-inventory-flag failure fixture.
- P2: Private-path redaction was too narrow. Fixed by broadening redaction to home paths, volume paths, Windows paths, UNC paths, emails, tokens, API keys, and private-key text, and by replacing path-derived identity with `targetFingerprint`.
- P2: Synthetic authoring validation needed deterministic scope. Fixed by renaming it to `validate-synthetic-fixtures` and adding templates for the expected report row types.

Engineering completion summary:

| Item | Result |
| --- | --- |
| Mode | Completeness expansion |
| Decisions made | 7 auto-decisions |
| Taste decisions | 0 |
| User challenges | 0 |
| Blockers | 0 |
| Plan changes | Registry contract, install/update wiring, check-universe validation, worklist hash receipts, expected-fail fixture handling, privacy redaction, synthetic fixture templates |

## AUTOPLAN DX REVIEW

Phase status: complete.

Product type: Codex/Claude skill plus local CLI validator.

Primary developer persona: control-plane maintainer adding or changing a deep-audit category. Tolerance is low for registry archaeology; they need one quick path that proves docs, triggers, install coverage, and category checks are in sync.

DX findings:

- P1: The plan did not define the first-five-minute maintainer path. Fixed by adding the three-command validator quick start to the Developer Experience Contract and `docs/skills.md` acceptance criteria.
- P1: Validator errors could become raw schema failures. Fixed by requiring `errorCode`, `artifactPath`, problem, cause, fix, and matching `--json` diagnostics.
- P2: Direct category invocation could validate correctly but leave the maintainer guessing what command proved it. Fixed by requiring final output to include the exact `validate --artifact <artifact>` command.
- P2: Registry drift failures needed to name the exact surface to update. Fixed by requiring drift diagnostics to point at `docs/skills.md`, trigger fixtures, install scripts, skill directories, or reference paths.
- P2: Synthetic authoring failures needed to be teachable. Fixed by requiring diagnostics for missing `route_matrix`, `auth_blocker`, `not_applicable`, `CONFIRMED_CLEAN`, and `CHECKS_SKIPPED` rows.

DX completion summary:

| Item | Result |
| --- | --- |
| Mode | DX polish with 10/10 completeness decisions |
| Decisions made | 5 auto-decisions |
| Target TTHW | Under 2 minutes for a maintainer validating local fixture and registry wiring |
| Blockers | 0 |
| Plan changes | Developer Experience Contract, validator diagnostics, quick-start docs, direct category validation output, synthetic-fixture diagnostics |

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Use `all_registered` and require `coverageStatement` | Mechanical | Choose completeness | Prevents false full-audit claims while preserving future expansion | Plain `full` wording |
| 2 | CEO | Add `scripts/lib/deep-audit-categories.mjs` | Mechanical | DRY | One source must drive docs, validator, and orchestrator | Prose-only registry |
| 3 | CEO | Force standalone category skills through the shared envelope | Mechanical | Explicit over clever | Direct invocation must not bypass shared worklists and synthesis | Free-form category final answers |
| 4 | CEO | Add synthetic authoring fixtures | Mechanical | Boil lakes | Shape validation is not enough; skills must prove realistic artifact authoring | Toy-only JSON fixtures |
| 5 | CEO | Redact tracked target paths with labels and hashes | Mechanical | Pragmatic | Public repo artifacts cannot expose local filesystem paths | Absolute tracked target paths |
| 6 | CEO | Keep category skills and justify alternatives | Mechanical | Bias toward action | Direct category invocation is useful if registry drift is mechanically guarded | Orchestrator-only references |
| 7 | ENG | Add registered `checks[]` and fixture failures for omitted, unknown, and duplicate checks | Mechanical | Boil lakes | No-sampling must be machine-checkable, not advisory prose | Reference-only check lists |
| 8 | ENG | Wire new helpers through install/update tests | Mechanical | Evidence first | Source-level success cannot prove installed control-plane behavior | Source-only validator coverage |
| 9 | ENG | Split passing gates from expected-fail fixtures | Mechanical | Clarity | Implementers need to know which invalid cases must fail and where those failures are asserted | Listing invalid fixtures as pass commands |
| 10 | ENG | Require consumed worklist hashes on category reports and lane receipts | Mechanical | Explicit over clever | Shared inventory is the only way to prevent category-local rescan drift | Trusting category prose |
| 11 | DX | Add a three-command maintainer quick start | Mechanical | Speed is a feature | The next maintainer needs proof in under two minutes | Forcing docs archaeology |
| 12 | DX | Require problem/cause/fix diagnostics with stable error codes | Mechanical | Fight uncertainty | Failed validation should tell the maintainer exactly what to update | Raw schema errors |
| 13 | DX | Include exact validation commands in direct category output | Mechanical | Learn by doing | Category users need the same proof path as the orchestrator | Human memory of validator commands |

## Plan Readiness Report

- Scope Challenge: The plan avoids a single giant skill, reuses `etrnl-audit-code`, `etrnl-dev-parallel`, `etrnl-dev-execute`, skill contract checks, prompt budget checks, and skill trigger smoke instead of adding a parallel control plane. It creates three requested skill surfaces, one category registry, and one mechanical artifact validator.
- Architecture Review: The orchestrator is a router, category skills own details, the registry owns category truth, and the validator owns evidence completeness. This preserves category expansion without making all-registered audit mode ambiguous. No live install or target-app mutation is part of this plan.
- Code Quality Review: Skill entrypoints stay compact, detailed checks move into references, source specs are rewritten into directive language, and shared registry/docs/install updates have one integration owner to avoid drift.
- Test Review: The plan includes positive and negative validator fixtures, registry checks, check-universe checks, consumed worklist hashes, synthetic authoring fixtures, private-string rejection, coverage-statement rejection, stable diagnostic assertions, skill trigger coverage, prompt-budget checks, skill-contract checks, workflow-tool tests, hook tests, install tests, doctor, and diff hygiene.
- DX Review: The plan gives maintainers a three-command validator quick start, problem/cause/fix diagnostics, JSON error output, exact direct-category validation commands, and registry drift errors that name the surface to update.
- Performance Review: The implementation adds small static skill/reference files and one bounded JSON validator. No hook-time broad scans or target-repo runtime measurements are added to the control plane.
- Failure modes: False clean claims, coverage overclaim, stack-inapplicable findings, direct category bypass, subagent drift, check omission, worklist-hash drift, source-limited masking, private path leakage, poor validator diagnostics, install/update drift, prompt bloat, directive-language rejection, and future category drift each have a validation or process control.
- Parallelization: Contract and validator schema are sequential; the three skill directories can be parallel after that; docs/registry and final gates remain sequential.
- Unresolved questions: research_flow: auto-generated from committed research artifacts and the two user-provided audit specs; no external research refresh is required before implementing this internally derived control-plane capability.
- Verdict: Ready for execution after the draft and final readiness gates pass.

## Verdict

Ready for execution.
