# ETRNL Top-Level Gap Closure Implementation Plan

Status: Final

Execution scope: all_phases
Goal: Make ETRNL's remaining planning, review, TDD, subagent, simplifier, TypeScript, install, and completion-audit promises deterministic enough for low/mid-intelligence agents to follow reliably.
Evidence: AGENTS.md; skills/etrnl-plan/SKILL.md; skills/etrnl-autoplan/SKILL.md; skills/etrnl-review/SKILL.md; skills/etrnl-execute/SKILL.md; scripts/plan-readiness-check.mjs; scripts/deep-stack-check.mjs; scripts/lib/deep-stack-artifacts.mjs; scripts/agent-task-packet-check.mjs; scripts/execution-ledger.mjs; scripts/execute-evidence-check.mjs; hooks/cc-stop-verifier.sh; hooks/cc-pretooluse-guard.sh; tests/test-workflow-tools.sh; docs/health-stack.md; docs/plans/2026-06-02-etrnl-stack-findings-report.md; sanitized Superpowers/GSD/GStack source snapshots.
Non-goals: Do not vendor GSD, Superpowers, or GStack; do not mutate live ~/.claude or ~/.codex during source implementation; do not add network dependencies for ordinary planning/review/execution; do not weaken existing hooks, tests, or quality gates.
Deep stack artifacts: docs/plans/artifacts/2026-06-02-etrnl-top-level-gap-closure/deep-stack-artifacts.json

## What already exists

ETRNL already has the strongest enforcement base in the comparison: `plan-readiness-check.mjs` rejects thin final plans, `deep-stack-check.mjs` validates Hybrid Deep Stack bundles, `agent-task-packet-check.mjs` validates structured subagent packets, `execution-ledger.mjs` validates tasks/phases/checks/artifacts/reviewer ordering, and `cc-stop-verifier.sh` blocks stale or missing verification. The current implementation already covers many negative controls through `tests/test-workflow-tools.sh` and `tests/fixtures/deep-stack/**`.

Reuse the existing Hybrid Deep Stack bundle instead of creating separate validator families. Extend `scripts/lib/deep-stack-artifacts.mjs`, `scripts/deep-stack-check.mjs`, `scripts/agent-task-packet-check.mjs`, `scripts/execution-ledger.mjs`, and `scripts/execute-evidence-check.mjs` rather than introducing parallel state.

## NOT in scope

- No implementation in this planning turn.
- No blind live install into Claude/Codex home directories.
- No wholesale import of private or external skill bodies.
- No change to `Execution scope: all_phases` semantics.
- No loosening of prompt-budget, skill-contract, research, hook, or doctor gates.

## File map

- `scripts/lib/deep-stack-artifacts.mjs`: extend schema and validation for review phase records, TDD evidence, completion reconciliation, reuse binding, TypeScript trigger evidence, and Tier 3 install proof.
- `scripts/deep-stack-check.mjs`: expose section validators for the new artifact fields and keep `validate-plan` as the single operator-facing gate.
- `scripts/execution-ledger.mjs`: add record/check commands for TDD evidence, simplifier evidence, domain/specialist evidence, completion audit rows, and Tier 3 install gates.
- `scripts/agent-task-packet-check.mjs`: require reuse/TDD/simplifier/deep-stack fields when write packets create new surfaces or execute non-trivial source tasks.
- `scripts/execute-evidence-check.mjs`: detect missing simplifier/domain/reuse/TDD evidence from guard state for `/etrnl-execute` source edits.
- `hooks/cc-stop-verifier.sh`: call the stronger execution evidence checker and block non-trivial completion when new ledger/artifact evidence is missing.
- `skills/etrnl-plan/SKILL.md`: update final-plan requirements to name review phase records, TDD evidence, reuse binding, advanced TypeScript trigger proof, and completion reconciliation.
- `skills/etrnl-autoplan/SKILL.md`: make deep review phase records mandatory, not just phase names.
- `skills/etrnl-review/SKILL.md`: make red/green, simplifier, specialist, TypeScript, and completion-audit checks findings-first review requirements.
- `skills/etrnl-execute/SKILL.md`: require ledger recording for TDD, simplifier, specialist, completion audit, and Tier 3 install proof before completion.
- `agents/etrnl-*.md`: align final outputs with structured completion markers and required summary fields.
- `docs/skills.md`: document the new deterministic helpers and companion-skill routing.
- `docs/health-stack.md`: add the new validators and fixtures to required gates.
- `docs/control-plane-coverage.md`: update coverage map for the new checks.
- `CHANGELOG.md`: record the stack-hardening work under Unreleased.
- `tests/test-workflow-tools.sh`: add validator, ledger, packet, and stop-hook fixtures for the new negative controls.
- `tests/test-hooks.sh`: add hook replay coverage only where hook behavior changes.
- `tests/fixtures/deep-stack/**`: add valid and invalid artifacts for every new required field.
- `hooks/fixtures/events/**`: add stop/pretool fixtures only when guard behavior needs replay coverage.

## Task groups

Group A, artifact schema foundation: update `deep-stack-artifacts` and fixtures for review phase records, TDD evidence, completion reconciliation, reuse binding, TypeScript trigger proof, and Tier 3 install proof.

Group B, ledger and packet binding: extend execution ledger and task packet validation so execution evidence is bound to task id, lineage id, packet hash, and artifact paths.

Group C, hook enforcement: wire the stronger evidence checker into stop verification without making broad/risky local scans.

Group D, skill and agent contracts: update ETRNL skill text and agent output contracts to match the deterministic evidence fields.

Group E, docs and health: update skills docs, health stack, coverage map, changelog, and install/staged/live proof language.

Group F, validation and staged rollout: run source gates first, then perform staged install/canary/rollback proof only after Victor explicitly approves implementation and install.

## Phases

### Phase 0 - Baseline And Fixture Inventory

Read the current validators, hooks, fixtures, and docs listed in the evidence header. Inventory existing negative controls so the implementation does not duplicate landed coverage from the Hybrid Deep Stack work.

Acceptance:

```bash
node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
node scripts/plan-readiness-check.mjs docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
```

### Phase 1 - Deep-Stack Artifact Schema

Extend the artifact bundle with compact sections:

- `reviewPhases[]`: role, status, checkedInputs, findingsCount, openHighCount, disposition, completedAt.
- `tddEvidence[]`: taskId, sourceFiles, redCommand, redStatus, redFailure, greenCommand, greenStatus, rationaleWhenNotTestFirst.
- `completionReconciliation[]`: planItemId, requestedOutcome, classification, evidence, changedReason, acceptedBy.
- `reuseBindings[]`: taskId, createsNewSurface, searchedPaths, analogs, decision, newSurfaceJustification.
- `typeTriggerEvidence[]`: file, triggerSurface, ordinaryVerification, advancedReviewStatus.
- `installProof`: sourceGate, stagedInstall, stagedDoctor, rollbackVerification, liveInstallDecision, postUpgradeCanary.

Keep artifacts compact and sanitized. Reject `/tmp`, home paths, transcripts, accounts, and secret-looking strings.

### Phase 2 - Ledger And Packet Enforcement

Add ledger commands and checks for TDD evidence, simplifier evidence, domain/specialist evidence, completion-audit evidence, and install proof. Extend packet validation so write tasks that create new surfaces or perform deep-stack source execution require reuse, TDD, simplifier, and completion-evidence fields.

### Phase 3 - Source/Diff Trigger Checks

Extend `execute-evidence-check.mjs` to detect:

- source edits after `/etrnl-execute` without TDD evidence;
- non-trivial source edits without simplifier evidence;
- new source files without reuse binding;
- TypeScript public/exported/schema/state-machine/DTO-boundary edits without advanced TypeScript disposition;
- Tier 3 control-plane changes without install proof.

Keep this checker state-based and bounded. Do not introduce broad home-directory scans.

### Phase 4 - Hook Integration

Update `cc-stop-verifier.sh` to consume the stronger checker statuses and return precise block messages. Preserve existing stale-verification, test-run, broad/risky-review, documentation-health, code-health, email-triage, and migration checks.

### Phase 5 - Skill And Agent Contract Alignment

Update `etrnl-plan`, `etrnl-autoplan`, `etrnl-review`, and `etrnl-execute` so their text matches the deterministic evidence model. Update ETRNL agents to output structured completion markers and compact evidence rows that the parent can record.

### Phase 6 - Docs, Health, Changelog, And Coverage

Update `docs/skills.md`, `docs/health-stack.md`, `docs/control-plane-coverage.md`, and `CHANGELOG.md`. The docs must describe source validation, staged install, live install, rollback proof, and the exact no-loose-ends completion audit.

### Phase 7 - Verification And Staged Install

After source implementation is approved and complete, run all source gates. Only then perform staged install and rollback proof for Tier 3 control-plane behavior. Live install remains a separate explicit step unless Victor asks for it in the implementation turn.

## Skill/tool routing

- Use `etrnl-plan` for any plan edits.
- Use `etrnl-review` for findings-first review of the plan and implementation.
- Use `etrnl-execute` only after Victor explicitly asks to implement.
- Use `code-simplifier` after source implementation and before final completion.
- Use `code-review-excellence` for non-trivial source review.
- Use `finding-duplicate-functions` when helper/validator duplication is touched.
- Use `eternal-best-practices` only if the implementation touches auth, money, tenancy, permissions, i18n, Prisma, soft-delete, or domain policy.
- Use `typescript-advanced-types` only if public/exported types, contracts, validation, generated types, state machines, branded IDs, reusable type utilities, or DTO/domain boundaries are touched.

## Test plan

Add or preserve fixtures for:

- plan without deep artifacts;
- plan with incomplete deep artifacts;
- skipped TDD evidence;
- missing subagent packet;
- source change without reviewer;
- source change without simplifier pass;
- new helper without reuse inventory;
- TypeScript public contract without advanced type review;
- completion audit with partial/not-done work;
- stale or missing source/staged/live install/canary proof.

Each negative fixture must fail with a specific message naming the missing field and exact repair path. Each valid fixture must pass through `tests/test-workflow-tools.sh`.

## Test-first execution plan

Before implementation, add failing fixtures first:

1. Add invalid artifact fixture missing `tddEvidence` for a source task and confirm `node scripts/deep-stack-check.mjs validate-artifact --artifact <fixture>` fails.
2. Add invalid packet fixture for a new helper without reuse binding and confirm `node scripts/agent-task-packet-check.mjs <fixture>` fails.
3. Add invalid ledger fixture with implementation and quality review but no simplifier evidence and confirm `node scripts/execution-ledger.mjs check-stop --session <fixture>` fails.
4. Add invalid state fixture for a TypeScript exported contract edit without advanced TypeScript evidence and confirm `node scripts/execute-evidence-check.mjs` emits a blocking status.
5. Add invalid Tier 3 install-proof fixture and confirm `node scripts/deep-stack-check.mjs validate-risk-tier --artifact <fixture>` fails.

After each implementation slice, rerun the corresponding failing fixture and confirm it fails for the expected reason before adding the valid case.

## Failure modes

- TDD evidence false positive: a row records a red command but the command failed for syntax/setup instead of missing behavior. Mitigation: require expected failure text and status classification.
- Simplifier evidence bypass: a broad source edit records generic review but not `code-simplifier`. Mitigation: stop-hook status for non-trivial source edits without simplifier evidence.
- Reuse evidence spoofing: a new helper includes searched paths but no analog/decision. Mitigation: require non-empty decision and justification when `createsNewSurface` is true.
- TypeScript trigger miss: scanner misses an exported contract. Mitigation: include explicit trigger patterns and regression fixtures for exports, Zod/runtime schemas, DTO boundaries, discriminated unions, branded IDs, and state machines.
- Tier 3 proof drift: source gate passes but installed hook differs. Mitigation: staged install proof, update-check, doctor, canary, rollback verification, then optional live proof.

## Parallelization strategy

Phase 0 is sequential. Phase 1 and Phase 2 are dependency-ordered because later checks rely on schema names. Phase 3 and Phase 4 can be split only after the schema and ledger contract are stable. Phase 5 docs/skills and Phase 6 docs/health can run in parallel with disjoint file scopes after script behavior is stable. Phase 7 is sequential.

Parallel-safe candidates:

- artifact schema fixtures and docs updates;
- packet fixture updates and agent contract text;
- health-stack docs and changelog after behavior names are settled.

Conflict risks:

- `tests/test-workflow-tools.sh` is shared and should have one integration owner.
- `scripts/lib/deep-stack-artifacts.mjs` and `scripts/execution-ledger.mjs` should not be edited by multiple agents in the same wave.

## Verification gates

Source gates:

```bash
node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
node scripts/plan-readiness-check.mjs docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
tests/test-workflow-tools.sh
tests/test-hooks.sh
tests/test-install.sh
node scripts/replay-hook-fixtures.mjs
node scripts/settings-audit.mjs templates/settings.json
node scripts/settings-audit.mjs templates/settings.strict.json
node scripts/update-check.mjs --fingerprint-source .
scripts/doctor.sh
fd -t f -e sh . hooks scripts tests -x bash -n
fd -t f -e sh . hooks scripts tests -X shellcheck -x
git diff --check
```

Tier 3 staged/live gates after implementation approval:

```bash
scripts/install.sh --dry-run
scripts/post-upgrade-canary.sh
scripts/rollback-local.sh --dry-run
node scripts/update-check.mjs --explain
scripts/doctor.sh
```

Stop condition: any failed gate blocks the next phase until diagnosed and rerun successfully.

## Rollback

For source changes, revert only the implementation branch changes made by the execution run. For installed control-plane changes, use the installer backup and `scripts/rollback-local.sh`; verify with `scripts/doctor.sh`, `scripts/post-upgrade-canary.sh`, and `node scripts/update-check.mjs --explain`. Never remove user-local external hooks or settings entries that are not repo-owned.

## Execution handoff

Use `etrnl-execute` only after Victor explicitly asks to implement. Because the execution scope is `all_phases`, the executor must complete every phase above or stop with a concrete blocker. Use subagents for parallel-safe disjoint work only after packet validation; use direct parent edits only for single sequential tasks, overlapping write scopes, missing subagent runtime, or explicit user instruction.

## Plan Readiness Report

- Scope Challenge: The plan focuses on gaps that remain after the Hybrid Deep Stack validators already landed; it avoids re-creating separate validator families.
- Architecture Review: The existing deep-stack artifact, task packet, ledger, and stop-hook architecture remains the backbone. New evidence fields attach to those surfaces instead of adding a new state store.
- Code Quality Review: Changes are bounded to existing validators, hooks, ETRNL skill text, agent contracts, fixtures, and docs. The integration owner must keep `tests/test-workflow-tools.sh` readable despite added cases.
- Test Review: Negative controls are explicit for TDD, simplifier, reuse, TypeScript, completion audit, subagent packets, reviewers, and install proof. Existing hook/workflow tests remain part of the final gate.
- Performance Review: Checks must stay bounded to plan files, guard state, ledger files, and declared changed paths. No broad home-directory scans are allowed.
- Failure modes: Main risks are spoofed evidence rows, scanner misses, and live install drift. The plan mitigates with fixture-based validators, source/diff triggers, staged install proof, and rollback proof.
- Parallelization: Early schema and ledger work is sequential. Later docs, agent text, and isolated fixture work can run in disjoint lanes with one integration owner for shared tests.
- Unresolved questions: none; research_flow: existing repo research artifacts and sanitized local source snapshots were used for planning evidence.
- Verdict: Ready for execution after Victor explicitly asks to implement.

## Verdict

Ready for execution.
