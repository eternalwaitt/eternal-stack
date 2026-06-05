<!-- Historical autoplan restore point omitted from tracked docs because it was a local, machine-specific artifact. -->
# ETRNL Deep Stack Top-Level Implementation Plan

Superseded: This original full-depth draft is retained as the rejected baseline. The implemented contract is the Hybrid Deep Stack model: plan/autoplan/review remain deep; execution uses risk tiers only after deep review passes.
Status: Superseded baseline
Readiness: Not executable; retained only as the rejected baseline for the Hybrid Deep Stack implementation.
Replaced by: The Hybrid Deep Stack implementation contract in `scripts/deep-stack-check.mjs`, `scripts/lib/deep-stack-artifacts.mjs`, `scripts/plan-readiness-check.mjs`, `scripts/agent-task-packet-check.mjs`, and the updated `etrnl-*` skills.
Goal: Historical baseline for upgrading ETRNL planning, autoplan, review, execution, and validation into a fail-closed deep-stack workflow that combines Superpowers brainstorm/spec discipline, Gstack full-depth reviews, GSD artifact orchestration, and installed local expert skills.
Non-goals: No private transcript import, credential migration, remote telemetry upload, blind plugin/MCP installation, broad live-home mutation during planning, or replacing deterministic gates with advisory documentation.
Evidence: `AGENTS.md`; `docs/plans/2026-05-12-etrnl-superiority-implementation-plan.md`; `docs/plans/2026-05-13-best-of-all-worlds-control-plane-gap-closure.md`; `docs/research/etrnl-parity-backlog.md`; `docs/research/parity-scorecard.json`; `docs/skills.md`; `docs/health-stack.md`; `skills/etrnl-{brainstorm,plan,autoplan,review,execute,test,stress-test}/SKILL.md`; `scripts/plan-readiness-check.mjs`; `scripts/agent-task-packet-check.mjs`; `scripts/execution-ledger.mjs`; `scripts/prompt-budget-check.mjs`; sanitized local Gstack skill snapshot; sanitized Superpowers source snapshot; sanitized GSD source snapshot; installed companion skills `code-simplifier`, `code-review-excellence`, `eternal-best-practices`, `typescript-advanced-types`, `nextjs-app-router-patterns`, `react-best-practices`, and `prisma-expert`.

## What already exists

- `skills/etrnl-dev-execute/SKILL.md` already treats `Execution scope: all_phases` as a hard contract, requires a run ledger, supports wave-based execution, requires structured subagent task packets, records spec and quality review evidence, and blocks completion when required phase/task/artifact evidence is missing.
- `scripts/agent-task-packet-check.mjs` already validates structured read-only/write packets, task identity, lineage identity, read sets, write scopes, forbidden paths, reviewer fields, and packet hashes.
- `scripts/execution-ledger.mjs` already provides the local evidence backbone for tasks, phases, checks, artifacts, reviews, and stop validation.
- `skills/etrnl-dev-plan/SKILL.md` already requires saved plan files, current repo evidence, `Execution scope`, reuse inventory, non-goals, file map, skill routing, test plan, failure modes, verification gates, rollback, readiness report, and final verdict.
- `skills/etrnl-dev-autoplan/SKILL.md` already names CEO, engineering, design, DX, adversarial, and outside-voice passes, but currently frames them as Gauntlet-Lite and does not force full-depth artifacts.
- `skills/etrnl-dev-review/SKILL.md` already leads with findings, separates request/plan/diff/runtime truth sources, and names companion passes for `eternal-best-practices`, `code-simplifier`, `finding-duplicate-functions`, and `brooks-audit`.
- `docs/research/etrnl-parity-backlog.md` already marks `etrnl-dev-autoplan`, `etrnl-dev-plan`, `etrnl-dev-review`, and `etrnl-dev-test` as P0/M1 gap surfaces.
- `docs/skills.md` already documents companion skills, but it does not include a stack-aware activation matrix or advanced TypeScript/type-system lane.
- `docs/health-stack.md` already lists required control-plane gates and optional repo-health tools.
- Local companion skills exist for the required deep lanes: `typescript-advanced-types`, `nextjs-app-router-patterns`, `react-best-practices`, `prisma-expert`, `better-auth`, `tenant-isolation-patterns`, `money-vo-discipline`, `orpc-patterns`, `i18n-localization`, `frontend-code-review`, `senior-backend`, `senior-qa`, `code-review-excellence`, `code-simplifier`, and `finding-duplicate-functions`.

## NOT in scope

- No attempt to vendor Superpowers, Gstack, or GSD wholesale into this public repo.
- No live install into `~/.claude` or `~/.codex` until source tests pass.
- No new external network dependency at runtime for ordinary plan/review execution.
- No permanent broad prompt bloat in startup files; deep rubrics live in referenced repo files and deterministic scripts.
- No claim that failure is impossible. The target is fail-closed operation: missing artifacts, skipped reviews, weak type plans, or open findings block finalization or completion.

## File map

- `skills/etrnl-dev-brainstorm/SKILL.md` - upgrade into a Superpowers-style brainstorm/spec workflow with alternatives, approved design, written spec, spec self-review, and transition to plan.
- `skills/etrnl-dev-plan/SKILL.md` - upgrade plan creation to require research, reuse inventory, pattern mapping, skill activation matrix, advanced type architecture, source coverage, and zero-open-finding readiness.
- `skills/etrnl-dev-autoplan/SKILL.md` - replace Gauntlet-Lite with full-depth sequential CEO, design, engineering, DX, adversarial, specialist, and convergence phases.
- `skills/etrnl-dev-review/SKILL.md` - add Gstack-style completion audit, review army, red-team pass, simplifier pass, advanced type pass, and zero-open-findings output contract.
- `skills/etrnl-dev-execute/SKILL.md` - tighten execution to require plan-declared deep-stack artifacts before editing and completion-declared review/simplification/type evidence before done.
- `skills/etrnl-dev-test/SKILL.md` - add red-green-refactor evidence requirements and typed test evidence when TypeScript type behavior is part of the change.
- `skills/etrnl-dev-stress-test/SKILL.md` - add deterministic rollback mapping for each failure mode and output fields that feed the findings ledger.
- `agents/etrnl-scout.md` - ensure scout can produce pattern-map and reuse-inventory findings without editing.
- `agents/etrnl-spec-reviewer.md` - ensure spec review checks plan/source coverage, skill activation, and type architecture before implementation.
- `agents/etrnl-quality-reviewer.md` - ensure quality review checks code quality, simplification, duplicate logic, and local best-practice lanes.
- `agents/etrnl-adversary.md` - ensure adversary outputs structured blockers and challenge findings that can enter a ledger.
- `agents/etrnl-design-reviewer.md` and `agents/etrnl-dx-reviewer.md` - align with full-depth autoplan phases.
- `scripts/deep-stack-source-map.mjs` - create: records source ecosystem inputs, commits, paths, and required evidence files for Superpowers, Gstack, GSD, and local skills.
- `scripts/skill-activation-matrix.mjs` - create: detects repo stack and plan scope, maps applicable local skills, and emits required/not-applicable/missing/blocker rows.
- `scripts/reuse-inventory-check.mjs` - create: validates searched paths, existing analogs, reuse decisions, and no-reinvent rationale.
- `scripts/plan-source-coverage-check.mjs` - create: validates every user requirement, spec decision, research gap, and review finding has a plan task or explicit deferral.
- `scripts/advanced-type-plan-check.mjs` - create: validates TypeScript plans include type architecture, forbidden escape checks, type-test strategy, and boundary schema alignment.
- `scripts/review-army-check.mjs` - create: validates specialist review outputs, JSON findings, dedupe, confidence, and red-team status.
- `scripts/zero-open-findings-check.mjs` - create: fails when blocker/high findings remain open without explicit user risk acceptance.
- `scripts/plan-completion-audit.mjs` - create: compares plan items against diff/evidence and classifies DONE, PARTIAL, NOT DONE, and CHANGED.
- `scripts/plan-readiness-check.mjs` - modify: call the new validators when matching artifact paths are declared.
- `scripts/agent-task-packet-check.mjs` - modify: require deep-stack artifact ownership fields for write-mode packets when plan metadata declares deep-stack execution.
- `scripts/execution-ledger.mjs` - modify only if needed: add artifact types for skill matrix, reuse inventory, type plan, review army, simplifier report, completion audit, and zero-open-findings report.
- `scripts/lib/skill-lists.sh` - modify: include any new repo-owned skill, helper, or companion-routing awareness needed by contract checks.
- `docs/skills.md` - document new helpers, required deep-stack artifacts, and companion skill routing.
- `docs/health-stack.md` - add the new validators to required gates.
- `docs/control-plane-coverage.md` - update owned-surface coverage with the deep-stack layers.
- `CHANGELOG.md` - record the upgrade under the current release section.
- `tests/test-workflow-tools.sh` - add validator fixture tests.
- `tests/test-hooks.sh` - add routing and stop-gate fixture tests if hook behavior changes.
- `tests/fixtures/deep-stack/` - create: valid and invalid plans, skill matrices, reuse inventories, type plans, review-army outputs, findings ledgers, and completion-audit reports.

## Task groups

### Group A - Source Map And Rubric Foundation

- Create the source map helper and checked artifact format for Superpowers, Gstack, GSD, and local companion skills.
- Add deep rubrics under `docs/rubrics/deep-stack/` so skill files can stay concise while loading full instructions when needed.
- Add tests proving source-map validation fails when required ecosystem evidence is missing or stale.

### Group B - Plan-Time Hard Gates

- Add `skill-activation-matrix.mjs`, `reuse-inventory-check.mjs`, `plan-source-coverage-check.mjs`, and `advanced-type-plan-check.mjs`.
- Upgrade `etrnl-dev-plan` and `etrnl-dev-autoplan` to require those artifacts before `Status: Final`.
- Upgrade `plan-readiness-check.mjs` to fail final plans that declare deep-stack work but omit those artifacts.

### Group C - Full Review Stack

- Add review-army and zero-open-findings validators.
- Upgrade `etrnl-dev-review` with plan completion audit, specialist lanes, red-team review, simplifier review, advanced type review, and structured findings output.
- Upgrade reviewer agents so implementation cannot self-certify quality.

### Group D - Execution Contract Integration

- Upgrade `etrnl-dev-execute`, task packets, ledger artifact types, and stop validation so implementation cannot skip spec review, quality review, simplifier review, type review, reuse evidence, or completion audit.
- Preserve existing direct-parent edit allowances for small sequential work, but require explicit degraded-mode evidence.

### Group E - TDD, Type Safety, And Domain Skill Lanes

- Upgrade `etrnl-dev-test` and the plan/test rubrics to require red-green-refactor evidence for testable behavior.
- Add TypeScript advanced type requirements when TypeScript is detected.
- Add domain skill gates for Next.js, React, Prisma, Better Auth, tenant isolation, Money VO, oRPC, i18n, payments, frontend review, backend review, and QA when the stack/scope triggers them.

### Group F - Docs, Health, Install, And Release

- Update docs, health stack, contract checks, changelog, and install/doctor coverage.
- Run source gates first, then installed-home gates only after source is clean.

## Phases

### Phase 0 - Baseline And Source Evidence Lock

Read first:

- `docs/research/top10-lock.json`
- `docs/research/capability-evidence.json`
- `docs/research/parity-scorecard.json`
- `docs/research/etrnl-parity-backlog.md`
- `skills/etrnl-{brainstorm,plan,autoplan,review,execute,test,stress-test}/SKILL.md`
- sanitized Gstack skill snapshot: `gstack/{autoplan,plan-ceo-review,plan-eng-review,plan-design-review,plan-devex-review,review,ship}/SKILL.md`
- sanitized Superpowers source snapshot: `superpowers/skills/{brainstorming,writing-plans,subagent-driven-development,executing-plans,test-driven-development,verification-before-completion}/SKILL.md`
- sanitized GSD source snapshot: `get-shit-done/workflows/{plan-phase,execute-phase,verify-work,code-review,add-tests}.md`
- sanitized GSD reference snapshot: `get-shit-done/references/{project-skills-discovery,agent-contracts,gates,tdd,verification-patterns,planner-reviews,planner-gap-closure,planner-source-audit}.md`
- installed companion skill names: `code-simplifier`, `code-review-excellence`, and `eternal-best-practices`
- installed stack skill names: `typescript-advanced-types`, `nextjs-app-router-patterns`, `react-best-practices`, and `prisma-expert`

Implementation:

1. Create `docs/rubrics/deep-stack/source-map.md` defining the required source ecosystem inventory.
2. Create `scripts/deep-stack-source-map.mjs` with commands:
   - `validate --artifact <path>`
   - `create --out <path> --gstack <path> --superpowers <path> --gsd <path> --skills-root <path>`
3. Create `tests/fixtures/deep-stack/source-map.valid.json` and invalid fixtures for missing commit, missing path, missing required skill, and stale timestamp.
4. Add tests in `tests/test-workflow-tools.sh`.

Acceptance:

```bash
node scripts/deep-stack-source-map.mjs validate --artifact tests/fixtures/deep-stack/source-map.valid.json
tests/test-workflow-tools.sh
```

Stop condition:

- Stop if any source path cannot be verified and record the exact missing path. Do not replace missing source evidence with summary prose.

### Phase 1 - Skill Activation Matrix

Read first:

- `docs/skills.md`
- `scripts/lib/skill-lists.sh`
- `skills/etrnl-dev-plan/SKILL.md`
- sanitized local skill root inventory, without private home paths

Implementation:

1. Create `docs/rubrics/deep-stack/skill-activation-matrix.md` with trigger rules:
   - TypeScript present: `typescript-advanced-types` required.
   - Next.js App Router present: `nextjs-app-router-patterns` required.
   - React present: `react-best-practices` and frontend review required for UI scope.
   - Prisma schema or Prisma imports present: `prisma-expert` required.
   - Better Auth/auth routes present: `better-auth` and `auth-implementation-patterns` required.
   - Multi-tenant code present: `tenant-isolation-patterns` required.
   - Money, billing, Stripe, AbacatePay, invoices, or currency present: `money-vo-discipline` and relevant payment skill required.
   - oRPC/API routes present: `orpc-patterns` and `api-design-principles` required.
   - i18n/user-facing locale strings present: `i18n-localization` required.
   - Diff over one source file: `code-review-excellence` and `code-simplifier` required.
   - Duplicate/consolidation scope: `finding-duplicate-functions` required.
2. Create `scripts/skill-activation-matrix.mjs` with:
   - `detect --root <repo> --plan <plan-path> --out <artifact>`
   - `validate --artifact <artifact>`
3. Artifact schema rows:
   - `skill`
   - `status`: `required`, `optional`, `not_applicable`, `missing`, or `blocker`
   - `trigger`
   - `evidence`
   - `planSection`
   - `loadedBy`
   - `finalDisposition`
4. Update `skills/etrnl-dev-plan/SKILL.md` and `skills/etrnl-dev-autoplan/SKILL.md` so every final non-trivial plan contains a `Skill Activation Matrix` artifact path and a summary table.
5. Update `scripts/plan-readiness-check.mjs` to fail when the plan references TypeScript, Next, React, Prisma, auth, tenancy, money, API, i18n, or UI scope but lacks the relevant matrix row.

Acceptance:

```bash
node scripts/skill-activation-matrix.mjs validate --artifact tests/fixtures/deep-stack/skill-matrix.valid.json
node scripts/plan-readiness-check.mjs tests/fixtures/deep-stack/plan.missing-type-skill.md
tests/test-workflow-tools.sh
```

Expected result:

- Valid matrix passes.
- Missing type-skill fixture fails with a clear `typescript-advanced-types required` message.

### Phase 2 - Reuse Inventory And Pattern Map

Read first:

- `skills/etrnl-dev-plan/SKILL.md`
- `skills/etrnl-dev-autoplan/SKILL.md`
- `agents/etrnl-scout.md`
- GSD pattern-mapper workflow reference

Implementation:

1. Create `docs/rubrics/deep-stack/reuse-before-create.md`.
2. Create `scripts/reuse-inventory-check.mjs` with:
   - `validate --artifact <artifact>`
3. Artifact schema:
   - `searchedPaths`
   - `existingAnalogs`
   - `candidateHelpers`
   - `candidateComponents`
   - `candidateTests`
   - `reuseDecision`
   - `newSurfaceJustification`
   - `duplicateRisk`
   - `executorReadFirst`
4. Upgrade `etrnl-dev-plan` to require `## What already exists` to cite the reuse artifact.
5. Upgrade `etrnl-dev-autoplan` engineering phase to require a scout/pattern-map pass before final plan verdict.
6. Upgrade `agent-task-packet-check.mjs` so write packets for new files include `reuseArtifact` or `newSurfaceJustification`.

Acceptance:

```bash
node scripts/reuse-inventory-check.mjs validate --artifact tests/fixtures/deep-stack/reuse-inventory.valid.json
node scripts/agent-task-packet-check.mjs tests/fixtures/deep-stack/packet.new-file-missing-reuse.json
tests/test-workflow-tools.sh
```

Expected result:

- New-file packet without reuse evidence fails.
- Existing-file packet with read-first evidence passes.

### Phase 3 - Advanced Type Architecture Gate

Read first:

- installed `typescript-advanced-types/SKILL.md`
- `skills/etrnl-dev-plan/SKILL.md`
- `skills/etrnl-dev-review/SKILL.md`
- `skills/etrnl-dev-test/SKILL.md`

Implementation:

1. Create `docs/rubrics/deep-stack/advanced-types.md`.
2. Create `scripts/advanced-type-plan-check.mjs` with:
   - `validate --plan <plan-path> --artifact <artifact>`
3. Required artifact fields when TypeScript is present:
   - `domainTypes`
   - `brandedIds`
   - `discriminatedUnions`
   - `schemaSourceOfTruth`
   - `runtimeValidationBoundary`
   - `prismaTypeBoundary`
   - `apiContractTypes`
   - `componentPropsStrategy`
   - `typeTests`
   - `forbiddenEscapes`: `as any`, broad `unknown` casts without boundary validation, untyped `Record<string, unknown>` where domain shape is known, non-exhaustive unions, and unchecked JSON parses.
4. Upgrade `etrnl-dev-plan` to require a `Type Architecture` subsection for TypeScript projects.
5. Upgrade `etrnl-dev-review` to run an advanced type review lane on TypeScript diffs.
6. Upgrade `etrnl-dev-test` to require type-level test strategy when type utilities, API contracts, discriminated unions, or branded IDs are changed.

Acceptance:

```bash
node scripts/advanced-type-plan-check.mjs validate --plan tests/fixtures/deep-stack/plan.types.valid.md --artifact tests/fixtures/deep-stack/type-plan.valid.json
node scripts/advanced-type-plan-check.mjs validate --plan tests/fixtures/deep-stack/plan.types.missing-boundary.md --artifact tests/fixtures/deep-stack/type-plan.missing-boundary.json
tests/test-workflow-tools.sh
```

Expected result:

- Missing runtime validation boundary fails.
- Missing type-test strategy fails when reusable type utilities are planned.

### Phase 4 - Full Autoplan Review Stack

Read first:

- `skills/etrnl-dev-autoplan/SKILL.md`
- Gstack `autoplan/SKILL.md`
- Gstack `plan-ceo-review/SKILL.md`
- Gstack `plan-eng-review/SKILL.md`
- Gstack `plan-design-review/SKILL.md`
- Gstack `plan-devex-review/SKILL.md`
- GSD planner-review and gap-closure references

Implementation:

1. Replace `Gauntlet-Lite Review` in `etrnl-dev-autoplan` with `Full Deep Stack Review`.
2. Required sequential phases:
   - Phase 0: source evidence and source-map validation.
   - Phase 1: CEO review with premise challenge, scope mode, quick wins, expansion decisions, and user-challenge gate.
   - Phase 2: design review for UI/product surfaces.
   - Phase 3: engineering review with architecture, failure modes, data flow, rollback, reuse, type architecture, tests, and observability.
   - Phase 4: DX review for commands, install, docs, errors, recovery, and time-to-first-success.
   - Phase 5: adversarial review for false assumptions, missing scope, and hidden coupling.
   - Phase 6: specialist review army selection.
   - Phase 7: convergence loop with no blocker findings.
3. Require each phase to write a structured section to the plan or sidecar artifact.
4. Add a hard rule: full-depth mode is default; fast/light mode is allowed only when the user explicitly asks for a spike, prototype, or first patch.
5. Add `Autoplan Decision Ledger` rows:
   - `phase`
   - `finding`
   - `severity`
   - `confidence`
   - `decision`
   - `artifact`
   - `status`
6. Update `docs/skills.md` to describe `/etrnl-dev-autoplan` as full-depth and intentionally slower.

Acceptance:

```bash
node scripts/plan-readiness-check.mjs tests/fixtures/deep-stack/plan.full-autoplan.valid.md
node scripts/plan-readiness-check.mjs tests/fixtures/deep-stack/plan.autoplan-lite-invalid.md
tests/test-workflow-tools.sh
```

Expected result:

- Full autoplan fixture passes.
- Gauntlet-Lite/fallback fixture fails when not explicitly marked as user-requested spike/prototype.

### Phase 5 - Review Army, Red Team, And Zero Open Findings

Read first:

- `skills/etrnl-dev-review/SKILL.md`
- Gstack `review/SKILL.md`
- Gstack `review/specialists/*.md`
- installed `code-review-excellence/SKILL.md`
- installed `code-simplifier/SKILL.md`

Implementation:

1. Create `docs/rubrics/deep-stack/review-army.md`.
2. Create `scripts/review-army-check.mjs` with:
   - `validate --artifact <artifact>`
3. Specialist lanes:
   - testing
   - maintainability
   - security
   - performance
   - data migration
   - API contract
   - design
   - advanced types
   - domain best practices
   - code simplifier
   - duplicate detection
   - red team
4. Review finding schema:
   - `severity`
   - `confidence`
   - `path`
   - `line`
   - `category`
   - `summary`
   - `fix`
   - `specialist`
   - `fingerprint`
   - `testStub`
   - `status`
5. Create `scripts/zero-open-findings-check.mjs` with:
   - `validate --artifact <artifact> --block-severity high`
6. Upgrade `etrnl-dev-review` output to require:
   - findings first
   - plan completion audit if plan exists
   - review-army artifact path
   - simplifier report
   - advanced type review if TypeScript present
   - zero-open-findings report
7. Upgrade `review-log.mjs` only if existing schema cannot store specialist, confidence, and status fields.

Acceptance:

```bash
node scripts/review-army-check.mjs validate --artifact tests/fixtures/deep-stack/review-army.valid.json
node scripts/zero-open-findings-check.mjs validate --artifact tests/fixtures/deep-stack/findings.open-high.json --block-severity high
node scripts/zero-open-findings-check.mjs validate --artifact tests/fixtures/deep-stack/findings.closed.json --block-severity high
tests/test-workflow-tools.sh
```

Expected result:

- Open high finding fixture fails.
- Closed finding fixture passes.

### Phase 6 - Plan Completion Audit

Read first:

- Gstack `review/SKILL.md` plan completion audit section
- `scripts/execution-ledger.mjs`
- `skills/etrnl-dev-execute/SKILL.md`
- `skills/etrnl-dev-review/SKILL.md`

Implementation:

1. Create `docs/rubrics/deep-stack/plan-completion-audit.md`.
2. Create `scripts/plan-completion-audit.mjs` with:
   - `audit --plan <plan-path> --base <base-ref> --out <artifact>`
   - `validate --artifact <artifact>`
3. Audit classifications:
   - `DONE`
   - `PARTIAL`
   - `NOT_DONE`
   - `CHANGED`
4. Required fields:
   - `planItem`
   - `classification`
   - `evidence`
   - `diffPaths`
   - `reason`
   - `impact`
   - `followup`
5. Upgrade `etrnl-dev-execute` completion to require a plan completion audit for non-trivial plans.
6. Upgrade `execution-ledger.mjs check-stop` to accept a required completion-audit artifact when the plan declares deep-stack execution.

Acceptance:

```bash
node scripts/plan-completion-audit.mjs validate --artifact tests/fixtures/deep-stack/completion-audit.valid.json
node scripts/plan-completion-audit.mjs validate --artifact tests/fixtures/deep-stack/completion-audit.not-done-high.json
tests/test-workflow-tools.sh
```

Expected result:

- High-impact `NOT_DONE` fixture fails unless it has explicit user risk acceptance.

### Phase 7 - Subagent-Driven Development Contract

Read first:

- Superpowers `subagent-driven-development/SKILL.md`
- `skills/etrnl-dev-execute/SKILL.md`
- `scripts/agent-task-packet-check.mjs`
- `agents/etrnl-{executor,spec-reviewer,quality-reviewer,adversary}.md`

Implementation:

1. Upgrade plan task packets to include:
   - `specReviewRequired`
   - `qualityReviewRequired`
   - `simplifierReviewRequired`
   - `typeReviewRequired`
   - `reuseArtifact`
   - `skillMatrixArtifact`
   - `expectedDiffShape`
   - `completionEvidence`
2. Update `agent-task-packet-check.mjs` validation for deep-stack write packets.
3. Upgrade `etrnl-dev-execute`:
   - Fresh implementation worker for each bounded multi-file task when parallel-safe.
   - Spec reviewer must approve before quality review.
   - Quality reviewer must approve before task completion.
   - Simplifier reviewer must run after implementation for changed source.
   - Type reviewer must run when TypeScript changes touch type boundaries or reusable type utilities.
   - Parent agent cannot self-certify a worker-owned task.
4. Add execution-ledger records for simplifier and type review evidence.

Acceptance:

```bash
node scripts/agent-task-packet-check.mjs tests/fixtures/deep-stack/packet.deep-stack.valid.json
node scripts/agent-task-packet-check.mjs tests/fixtures/deep-stack/packet.deep-stack.missing-type-review.json
tests/test-workflow-tools.sh
```

Expected result:

- Deep-stack packet missing type review fails when TypeScript scope is declared.

### Phase 8 - TDD And Verification Hardening

Read first:

- Superpowers `test-driven-development/SKILL.md`
- Superpowers `verification-before-completion/SKILL.md`
- GSD `references/tdd.md`
- `skills/etrnl-dev-test/SKILL.md`
- `hooks/cc-stop-verifier.sh`

Implementation:

1. Upgrade `etrnl-dev-test` to require red-green-refactor evidence for eligible behavior:
   - RED: failing test command and failure reason.
   - GREEN: passing test command after implementation.
   - REFACTOR: cleanup with tests still passing when cleanup occurs.
2. Add type-test evidence for advanced type behavior:
   - `tsc --noEmit`
   - `tsd`, `expect-type`, or project-standard type assertion tests when configured.
   - compile-time exhaustiveness checks for discriminated unions.
3. Update `plan-readiness-check.mjs` to flag TypeScript plans that include type utilities without a type-test strategy.
4. Update `cc-stop-verifier.sh` only if completion evidence can be checked without introducing false positives.

Acceptance:

```bash
node scripts/plan-readiness-check.mjs tests/fixtures/deep-stack/plan.tdd-types.valid.md
node scripts/plan-readiness-check.mjs tests/fixtures/deep-stack/plan.type-utils-no-type-tests.md
tests/test-hooks.sh
tests/test-workflow-tools.sh
```

Expected result:

- Type utility plan without type-test strategy fails.

### Phase 9 - Documentation, Health Stack, And Install Parity

Read first:

- `docs/skills.md`
- `docs/health-stack.md`
- `docs/control-plane-coverage.md`
- `CHANGELOG.md`
- `scripts/doctor.sh`
- `scripts/install.sh`
- `tests/test-install.sh`

Implementation:

1. Document every new helper in `docs/skills.md`.
2. Add all new validators to `docs/health-stack.md`.
3. Update `docs/control-plane-coverage.md` with deep-stack layers and enforcement level.
4. Update `CHANGELOG.md`.
5. Update `scripts/doctor.sh` to include source checks for:
   - deep stack source map
   - skill activation matrix fixtures
   - reuse inventory fixtures
   - advanced type fixtures
   - review army fixtures
   - zero-open-findings fixtures
   - completion audit fixtures
6. Update installer file lists if new scripts need installation into `~/.claude/scripts`.
7. Update `tests/test-install.sh` to verify installed copies.

Acceptance:

```bash
tests/test-install.sh
scripts/doctor.sh
```

### Phase 10 - Source And Installed Verification

Run source verification:

```bash
node scripts/deep-stack-source-map.mjs validate --artifact tests/fixtures/deep-stack/source-map.valid.json
node scripts/skill-activation-matrix.mjs validate --artifact tests/fixtures/deep-stack/skill-matrix.valid.json
node scripts/reuse-inventory-check.mjs validate --artifact tests/fixtures/deep-stack/reuse-inventory.valid.json
node scripts/advanced-type-plan-check.mjs validate --plan tests/fixtures/deep-stack/plan.types.valid.md --artifact tests/fixtures/deep-stack/type-plan.valid.json
node scripts/review-army-check.mjs validate --artifact tests/fixtures/deep-stack/review-army.valid.json
node scripts/zero-open-findings-check.mjs validate --artifact tests/fixtures/deep-stack/findings.closed.json --block-severity high
node scripts/plan-completion-audit.mjs validate --artifact tests/fixtures/deep-stack/completion-audit.valid.json
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
scripts/doctor.sh
git diff --check
```

Run installed verification only after source verification passes:

```bash
scripts/install.sh
~/.claude/scripts/doctor-control-plane.sh
~/.claude/scripts/post-upgrade-canary.sh
```

Stop condition:

- If source verification fails, fix source before install.
- If install verification fails, use the latest installer backup and run `~/.claude/scripts/rollback-local.sh <backup-dir>`.

## Skill/tool routing

- `etrnl-dev-brainstorm` handles vague ideas and produces approved design/spec artifacts before implementation planning.
- `etrnl-dev-plan` writes the file-backed implementation plan and requires source map, skill matrix, reuse inventory, type architecture, source coverage, verification, rollback, and readiness artifacts.
- `etrnl-dev-autoplan` runs the full deep-stack review over the plan and writes an autoplan decision ledger.
- `etrnl-dev-execute` implements only after readiness passes, then coordinates worker, spec reviewer, quality reviewer, simplifier reviewer, type reviewer, and completion audit evidence.
- `etrnl-dev-review` runs final review, review army, red team, simplifier, advanced type review, and zero-open-findings gate.
- `etrnl-dev-test` owns red-green-refactor and type-test evidence for eligible behavior.
- `etrnl-dev-stress-test` owns adversarial failure-mode and rollback validation.
- `code-simplifier` is mandatory after implementation for changed source unless the skill is unavailable or no source code changed.
- `code-review-excellence` is mandatory for line-by-line review on source diffs.
- `typescript-advanced-types` is mandatory for TypeScript projects and plans that touch type boundaries, API contracts, state machines, validation schemas, reusable type utilities, or generated types.
- `eternal-best-practices` is mandatory for Next.js, React, Prisma, auth, tenancy, money, i18n, soft-delete, observability, or domain architecture surfaces.
- Stack-specific skills are triggered by the skill activation matrix and recorded as required, not applicable, missing, or blocker.

## Test plan

- Unit-style helper fixtures:
  - `scripts/deep-stack-source-map.mjs`
  - `scripts/skill-activation-matrix.mjs`
  - `scripts/reuse-inventory-check.mjs`
  - `scripts/advanced-type-plan-check.mjs`
  - `scripts/review-army-check.mjs`
  - `scripts/zero-open-findings-check.mjs`
  - `scripts/plan-completion-audit.mjs`
- Existing workflow gates:
  - `tests/test-workflow-tools.sh`
  - `tests/test-hooks.sh`
  - `tests/test-install.sh`
  - `scripts/doctor.sh`
- Plan readiness fixtures:
  - valid full deep-stack plan
  - missing skill matrix
  - missing reuse inventory
  - missing advanced type architecture
  - open high finding
  - incomplete plan completion audit
- Type-specific fixtures:
  - TypeScript plan with branded ID and runtime validation boundary
  - TypeScript plan with reusable type utility and type-test strategy
  - TypeScript plan with forbidden `as any` escape
- Execution fixtures:
  - deep-stack packet valid
  - missing spec reviewer
  - missing quality reviewer
  - missing simplifier reviewer
  - missing type reviewer
  - missing reuse artifact for new file

## Failure modes

- A plan appears complete because headings exist, but it did not run deep review. Coverage: `plan-readiness-check.mjs` calls artifact validators and fails missing review ledger.
- A planner invents new files instead of reusing existing helpers. Coverage: `reuse-inventory-check.mjs` and packet-level `reuseArtifact` requirement.
- TypeScript work compiles but still leaks weak domain modeling or unchecked type escapes. Coverage: `advanced-type-plan-check.mjs`, advanced type review lane, and type-test strategy.
- A specialist review finds a blocker that is later buried in a summary. Coverage: `zero-open-findings-check.mjs` over structured findings.
- Worker implementation self-certifies quality. Coverage: execution ledger requires separate spec and quality review records; deep-stack packets require reviewer fields.
- The system becomes too slow for trivial changes. Coverage: trivial changes can stay non-deep-stack when plan scope is single-file/no-source or the user explicitly requests a spike/prototype; all non-trivial work defaults to full depth.
- Prompt files exceed budget after adding depth. Coverage: keep full rubrics in referenced docs and scripts; run `node scripts/prompt-budget-check.mjs .`.
- Temporary local source snapshots disappear. Coverage: `deep-stack-source-map.mjs validate` fails and instructs the operator to recreate source evidence before finalizing dependent plans.
- Installed-home drift causes source tests to pass but live use to fail. Coverage: install phase runs `doctor-control-plane.sh` and `post-upgrade-canary.sh`.

## Parallelization strategy

- Phase 0 is sequential because every later phase depends on source evidence and artifact schema decisions.
- Phase 1, Phase 2, and Phase 3 can run in parallel after Phase 0 if each owns disjoint files:
  - Phase 1 owns skill matrix helper, fixtures, and plan/autoplan skill references.
  - Phase 2 owns reuse helper, fixtures, scout agent references, and packet reuse fields.
  - Phase 3 owns advanced type helper, fixtures, test skill references, and review lane references.
- Phase 4 and Phase 5 must run after Phases 1-3 because autoplan/review depend on the matrix, reuse, and type artifacts.
- Phase 6 must run after Phase 5 because completion audit consumes plan and findings outputs.
- Phase 7 must run after Phase 6 because execution packets need all artifact fields.
- Phase 8 can run after Phase 3 and before Phase 10, but hook changes must be serialized with any stop-verifier edits.
- Phase 9 is the final docs/install integration phase.
- Shared files that require serialized ownership:
  - `skills/etrnl-dev-plan/SKILL.md`
  - `skills/etrnl-dev-autoplan/SKILL.md`
  - `skills/etrnl-dev-review/SKILL.md`
  - `skills/etrnl-dev-execute/SKILL.md`
  - `scripts/plan-readiness-check.mjs`
  - `scripts/agent-task-packet-check.mjs`
  - `scripts/execution-ledger.mjs`
  - `tests/test-workflow-tools.sh`
  - `docs/skills.md`
  - `docs/health-stack.md`
  - `CHANGELOG.md`

## Verification gates

Minimum source gate:

```bash
node scripts/prompt-budget-check.mjs .
node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json
node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json
node scripts/research-competitor-intel.mjs validate-scorecard --scorecard docs/research/parity-scorecard.json --skills-file scripts/lib/skill-lists.sh --evidence docs/research/capability-evidence.json
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
scripts/doctor.sh
git diff --check
```

Deep-stack specific gate:

```bash
node scripts/deep-stack-source-map.mjs validate --artifact tests/fixtures/deep-stack/source-map.valid.json
node scripts/skill-activation-matrix.mjs validate --artifact tests/fixtures/deep-stack/skill-matrix.valid.json
node scripts/reuse-inventory-check.mjs validate --artifact tests/fixtures/deep-stack/reuse-inventory.valid.json
node scripts/advanced-type-plan-check.mjs validate --plan tests/fixtures/deep-stack/plan.types.valid.md --artifact tests/fixtures/deep-stack/type-plan.valid.json
node scripts/review-army-check.mjs validate --artifact tests/fixtures/deep-stack/review-army.valid.json
node scripts/zero-open-findings-check.mjs validate --artifact tests/fixtures/deep-stack/findings.closed.json --block-severity high
node scripts/plan-completion-audit.mjs validate --artifact tests/fixtures/deep-stack/completion-audit.valid.json
```

Installed gate:

```bash
scripts/install.sh
~/.claude/scripts/doctor-control-plane.sh
~/.claude/scripts/post-upgrade-canary.sh
```

Plan validation gate for this plan:

```bash
node scripts/plan-readiness-check.mjs docs/plans/2026-06-01-etrnl-deep-stack-top-level-plan.md
```

## Rollback

- Source rollback: revert the commit or patch for the failed phase.
- Script rollback: remove the new helper from `scripts/`, remove its fixture references from `tests/test-workflow-tools.sh`, and remove its docs entries from `docs/skills.md` and `docs/health-stack.md`.
- Skill rollback: revert the touched `skills/etrnl-*` file and rerun `node scripts/prompt-budget-check.mjs .`.
- Hook rollback: revert hook edits and rerun `tests/test-hooks.sh`.
- Install rollback: use the latest installer backup and run `~/.claude/scripts/rollback-local.sh <backup-dir>`, then `~/.claude/scripts/doctor-control-plane.sh`.
- Research/source rollback: restore prior `docs/research/*` artifacts only if a refresh changed them; this plan does not require modifying existing research artifacts unless source-map validation exposes stale evidence.

## Execution handoff

Use `etrnl-dev-execute` after this plan is approved. Execution must complete every phase in `Execution scope: all_phases`.

Before editing source, the executor must:

1. Run `node scripts/plan-readiness-check.mjs docs/plans/2026-06-01-etrnl-deep-stack-top-level-plan.md`.
2. Inspect git status and preserve unrelated dirty changes.
3. Start an execution ledger.
4. Create task packets for each phase with disjoint write scopes where parallelism is safe.
5. Stop if a phase lacks a concrete verification command.

Completion requires:

1. All source gates pass.
2. All deep-stack specific gates pass.
3. Plan completion audit reports no high-impact `PARTIAL` or `NOT_DONE` item.
4. Zero-open-findings report passes.
5. Simplifier and advanced type review evidence is recorded when source/type code changed.
6. Installed-home verification passes if install surfaces changed.

## Plan Readiness Report

- Scope Challenge: The plan replaces a light planning/review surface with artifact-backed deep orchestration. Scope is intentionally broad because the user's requirement is top-level thoroughness, not speed. The work is still bounded to repo-owned skills, agents, scripts, docs, tests, and installed verification surfaces.
- Architecture Review: The design keeps prompts concise and moves depth into rubrics plus validators. Planning produces artifacts; review consumes artifacts; execution records artifacts; completion audits artifacts. This avoids relying on model memory or good intentions.
- Code Quality Review: New helpers are single-purpose validators with fixture-driven tests. Existing shared files are serialized ownership surfaces. The plan avoids vendoring external ecosystems and instead records source evidence.
- Test Review: The plan adds positive and negative fixtures for every new contract, keeps existing hook/workflow/install/doctor gates, and adds type-specific readiness fixtures for advanced TypeScript work.
- Performance Review: Deep-stack gates add overhead only for non-trivial planning/review/execution workflows. Runtime hooks should only call lightweight validators or recorded artifacts; expensive review work remains explicit workflow execution.
- Failure modes: Major failure modes are missing source evidence, fake reuse, skipped reviews, weak TypeScript type modeling, prompt bloat, and installed drift. Each has a deterministic validator or stop condition above.
- Parallelization: Phase 0 is sequential. Phases 1-3 are parallel-safe with disjoint file ownership. Phases 4-7 are dependency-ordered. Shared skill/script/test/docs files are serialized.
- Unresolved questions: none.
- Verdict: Not executable. This superseded baseline was replaced by the Hybrid Deep Stack implementation.

## Verdict

Not executable; superseded by the Hybrid Deep Stack implementation.
