---
name: etrnl-execute
description: ETRNL control-plane plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and may run commands.
model: sonnet
effort: medium
disable-model-invocation: true
---
# ETRNL Execute

Execute a written plan task by task, preserving checkpoints and verification evidence.

## Startup

1. Read the full plan file.
2. Inspect current git status and note unrelated local changes.
3. Extract phases, task groups, verification gates, rollback steps, and explicit stop conditions.
4. Critically review the plan before editing:
   - Run `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>` when the checker is installed.
   - If it has missing files, vague steps, unsafe actions, or impossible verification, stop and report the blockers.
   - If non-trivial work lacks "What already exists", "NOT in scope", test coverage, failure modes, rollout/rollback, or parallelization/conflict notes, stop and patch the plan before editing code.
   - If it is executable, create a todo/checklist from the plan.

## Execution

1. Work one task group at a time.
2. Keep related steps together so context stays local.
3. Use parallel workers only when the user explicitly asks for parallel agents or the current Claude Code policy allows it and file ownership is disjoint.
4. Mark each task in progress before editing and complete only after its verification passes.
5. Update plan checkboxes when the plan is the source of truth.
6. Preserve user changes and do not revert unrelated dirty files.
7. Before broad edits, invoke required domain companions when installed:
   - `eternal-best-practices` for auth, tenant, money, i18n, Prisma, permissions, soft-delete, and stack policy.
   - `finding-duplicate-functions` when reducing duplication or consolidating repeated logic.
   - `code-simplifier` after implementation and before final scoring/completion.
   - `brooks-audit` when the plan or project expects Brooks health.

## Verification

After each phase:

- Run the exact Verify block from the plan.
- If the plan omits verification, derive the smallest project preflight that proves the changed behavior.
- Record command/live-check evidence before moving on.
- Stop immediately on repeated failures, unclear instructions, missing dependencies, or unsafe rollback gaps.

## Completion

Before claiming done:

1. Re-read the original request and plan completion criteria.
2. Map every requested outcome to changed files and verification evidence.
3. Run the simplification/dedupe/domain review passes listed by the plan or triggered by changed files.
4. Run final project preflight.
5. Report completed phases, verification, remaining risks, and changed files.
