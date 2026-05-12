---
name: etrnl-execute
description: ETRNL control-plane plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and may run commands.
model: sonnet
effort: medium
disable-model-invocation: true
---
# ETRNL Execute

Execute an approved plan end to end. Create a local run ledger, fan out bounded work when safe, review worker output, run verification, and continue through mechanical phases without asking the user to continue.

## Startup

1. Read the full plan file.
2. Inspect current git status and note unrelated local changes.
3. Before any edit, run the readiness checker directly:
   - `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>`
   - Do not probe helper availability with `--help`, pipes, `head`, or other legacy shell commands.
   - If the readiness check fails or a hook blocks the command, stop and report the blocker. Do not continue into implementation.
4. Start a ledger when the helper is installed:
   - `node ~/.claude/scripts/execution-ledger.mjs init --plan <plan-path> --session "$CLAUDE_SESSION_ID"`
   - Record task progress with `node ~/.claude/scripts/execution-ledger.mjs set-task --task <id> --status <status> --session "$CLAUDE_SESSION_ID"`.
   - Require planned artifacts with `node ~/.claude/scripts/execution-ledger.mjs require-artifact --type <artifact-type> --session "$CLAUDE_SESSION_ID"`.
   - Keep the printed path in working notes and update it as tasks/checks complete when practical.
5. Extract phases, task groups, verification gates, rollback steps, explicit stop conditions, dependencies, and write ownership.
6. Critically review the plan before editing:
   - If it has missing files, vague steps, unsafe actions, or impossible verification, stop and report the blockers.
   - If non-trivial work lacks "What already exists", "NOT in scope", test coverage, failure modes, rollout/rollback, or parallelization/conflict notes, stop and patch the plan before editing code.
   - If it is executable, create a todo/checklist from the plan.

## Execution

1. Continue through the approved plan without asking between mechanical phases.
2. Ask the user only for destructive actions, scope expansion, missing credentials, conflicting user edits, repeated stalls, or subjective product/taste decisions.
3. Group tasks by dependency and write scope. Execute dependent work sequentially; dispatch independent read-only review or disjoint write work to fresh subagents when allowed by the current Claude Code policy.
   - Use wave-based execution: earlier waves must finish before later waves.
   - Before parallel work, run an overlap check with the plan's task file lists when practical:
     `node ~/.claude/scripts/execution-wave-check.mjs < tasks.json`
   - If any two tasks in a wave touch the same file, run that wave sequentially and log the planning defect.
   - Use worktree isolation only when the task is write-capable, disjoint, not touching submodule paths, and the runtime supports it.
   - Emit heartbeat text at wave and task boundaries: `[checkpoint] wave <n> task <id> starting`.
   - If a subagent completion signal is missing, spot-check expected output, git state, and ledger artifacts before deciding whether to retry or continue.
   - While a subagent owns a task, do not duplicate its implementation locally.
4. Every subagent call must include a structured task packet:
   - goal
   - context summary
   - exact scope
   - cwd/project context
   - read set
   - write scope or read-only
   - forbidden files
   - expected output
   - verification command
   - model tier
   - timeout
   - retry policy
   - do-not-revert instruction
   - WebSearch guidance
5. Prefer repo-owned agents by role:
   - `etrnl-scout` for read-only discovery before planning or risky edits
   - `etrnl-executor` for bounded implementation
   - `etrnl-spec-reviewer` for read-only spec/task-packet review
   - `etrnl-quality-reviewer` for read-only post-implementation review
   - `etrnl-investigator` for repeated failures and root-cause work
   - `etrnl-adversary` for read-only challenge passes
   - `etrnl-design-reviewer` for UI/design plan review
   - `etrnl-dx-reviewer` for developer-facing workflow review
   - `etrnl-browser-qa` for browser evidence and report artifacts
6. Mark each task in progress before editing and complete only after its verification passes.
7. Update plan checkboxes when the plan is the source of truth.
8. Preserve user changes and do not revert unrelated dirty files.
9. Before broad edits, invoke required domain companions when installed:
   - `eternal-best-practices` for auth, tenant, money, i18n, Prisma, permissions, soft-delete, and stack policy.
   - `finding-duplicate-functions` when reducing duplication or consolidating repeated logic.
   - `code-simplifier` after implementation and before final scoring/completion.
   - `brooks-audit` when the plan or project expects Brooks health.

## Verification

After each phase:

- Run the exact Verify block from the plan.
- If the plan omits verification, derive the smallest project preflight that proves the changed behavior.
- If the plan calls for browser/manual QA and browser tooling is available, run it before final completion; a pending browser pass is a blocker, not a residual risk.
- Record command/live-check evidence before moving on with `node ~/.claude/scripts/execution-ledger.mjs record-check --name <phase> --command "<command>" --status passed --session "$CLAUDE_SESSION_ID"` when the helper is installed.
- Record artifact evidence when created:
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type review-log --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type context-save --path <path> --session "$CLAUDE_SESSION_ID"`
- On repeated failures, dispatch `etrnl-investigator` or diagnose locally before editing again.
- Stop only for a real blocker: missing dependency, unsafe rollback gap, destructive action, conflict with user edits, or an unclear decision that cannot be derived from the repo.

## Verification Gates (hardened)

Each wave gate is a hard stop — not a soft warning:

1. **Gate failure is a blocker.** If the gate command exits non-zero, do not start the next wave. Record the failure, diagnose the root cause, fix it, and re-run the gate before proceeding.
2. **Evidence required before wave advance.** Record `execution-ledger.mjs record-check` with status `passed` before marking any task `completed`. A task without a recorded check is incomplete regardless of local observation.
3. **No self-certification.** Do not mark a gate `passed` based on reading output without running the command. Run the exact command from the plan's Verification gates table.
4. **Partial gates are not gates.** If the plan specifies a full suite command (`pnpm test`, `bash tests/test-hooks.sh`), running a subset and passing is not gate evidence. Run the full command.

## Completion

Before claiming done:

1. Re-read the original request and plan completion criteria.
2. Map every requested outcome to changed files and verification evidence.
3. Run the simplification/dedupe/domain review passes listed by the plan or triggered by changed files.
4. Run final project preflight.
5. Validate required artifacts:
   - `node ~/.claude/scripts/review-log.mjs validate` when review findings were logged.
   - `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>` when browser QA ran.
   - `node ~/.claude/scripts/context-state.mjs validate <context-path>` when context was saved.
6. Run `node ~/.claude/scripts/execution-ledger.mjs check-stop --session "$CLAUDE_SESSION_ID"` when a ledger exists.
7. Report completed phases, verification, artifacts, remaining risks, and changed files.
