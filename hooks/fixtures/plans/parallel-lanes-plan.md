# Parallel lanes plan fixture

Status: Final

Execution scope: all_phases
Goal: Exercise plan-authored lane caps in spawn guard.
Non-goals: No source implementation.
Evidence: hooks/fixtures/plans/good-plan.md checked.
Assumptions: None.
Risk tier: 2 — spawn guard lane-cap fixture.

## What already exists

- Spawn guard and execution ledger.

## NOT in scope

- Runtime feature work.

## File map

- scripts/lib/spawn-guard.mjs: lane resolution.

## Task groups

- Task id: p01a
- Task id: p108c2
- Task id: p01a_executor

## Parallelization strategy

Wave-1 may run p01a_writer and p108c2_writer in parallel on disjoint scopes.
maxConcurrentLanes=4

## Verification gates

- `tests/test-workflow-tools.sh` passes.

## Rollback

- Revert fixture.

## Execution handoff

- Use `etrnl-dev-execute` after readiness passes.

## Plan Readiness Report

- Parallelization: four lanes on disjoint wave-1 writers.

## Verdict

Approved for execution.
