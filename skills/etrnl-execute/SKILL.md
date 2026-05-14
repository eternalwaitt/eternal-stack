---
name: etrnl-execute
description: ETRNL control-plane plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and may run commands.
model: sonnet
effort: medium
disable-model-invocation: true
---
# ETRNL Execute

Execute an approved plan end to end. Create a local run ledger, fan out bounded implementation subagents for parallel-safe work, review worker output, run verification, and continue through mechanical phases without asking the user to continue.

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
   - Record optional phase metadata with `node ~/.claude/scripts/execution-ledger.mjs set-phase --phase <id> --workstream <id> --status in_progress --session "$CLAUDE_SESSION_ID"`.
   - Record UAT closure with `node ~/.claude/scripts/execution-ledger.mjs record-uat --artifact <path> --open-findings <count> --session "$CLAUDE_SESSION_ID"`; open findings block completion.
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
3. Group tasks by dependency and write scope. Execute dependent work sequentially; dispatch independent read-only review or disjoint write work to fresh subagents.
    - Use wave-based execution: earlier waves must finish before later waves.
    - Before parallel work, run an overlap check with the plan's task file lists when practical:
      `node ~/.claude/scripts/execution-wave-check.mjs < tasks.json`
    - If any two tasks in a wave touch the same file, run that wave sequentially and log the planning defect.
    - MUST dispatch write-capable implementation subagents for every parallel-safe wave with two or more independent source-file tasks.
    - The parent orchestrator must not edit files directly for tasks assigned to implementation subagents; it only coordinates, integrates, verifies, and repairs blocked work.
    - Use direct parent edits only for a single local task, a dependency-ordered sequential wave, an overlap conflict, missing subagent runtime, or a user-requested no-subagent run; state the exact sequential-degraded blocker before editing.
    - Use worktree isolation only when the task is write-capable, disjoint, not touching submodule paths, and the runtime supports it.
    - Emit heartbeat text at wave and task boundaries: `[checkpoint] wave <n> task <id> starting`.
    - If a subagent completion signal is missing, spot-check expected output, git state, and ledger artifacts before deciding whether to retry or continue.
    - While a subagent owns a task, do not duplicate its implementation locally.
4. Every subagent call must include a structured task packet:
   - Generate the packet skeleton with `node ~/.claude/scripts/agent-task-packet-check.mjs --template read-only` or `node ~/.claude/scripts/agent-task-packet-check.mjs --template write`, then fill it before dispatch.
   - taskId
   - lineageId
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
   - for multi-file write scopes: `reviewers`, `specReviewRequired`, `qualityReviewRequired`, `integrationOwner`, and `expectedDiffShape`
   - Run `node ~/.claude/scripts/agent-task-packet-check.mjs --hash` on the final packet JSON and keep the packet hash with task notes.
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
- If the plan has a UAT gate, record `record-uat`; do not mark a phase complete while `uatOpenFindings` is greater than zero.
- Record command/live-check evidence before moving on with `node ~/.claude/scripts/execution-ledger.mjs record-check --name <phase> --command "<command>" --status passed --session "$CLAUDE_SESSION_ID"` when the helper is installed.
- Record bound write evidence for implementation and reviews when write packets are used:
  - `node ~/.claude/scripts/execution-ledger.mjs set-task --task <id> --status verified --mode write --lineage <lineage-id> --packet-hash <hash> --requires-implementation-evidence --spec-review-required --quality-review-required --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-agent --id <agent-id> --role etrnl-executor --mode write --task <id> --lineage <lineage-id> --packet-hash <hash> --status completed --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-review --reviewer etrnl-spec-reviewer --task <id> --lineage <lineage-id> --packet-hash <hash> --status verified --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-review --reviewer etrnl-quality-reviewer --task <id> --lineage <lineage-id> --packet-hash <hash> --status verified --session "$CLAUDE_SESSION_ID"`
- Record artifact evidence when created:
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type review-log --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <path> --session "$CLAUDE_SESSION_ID"`; prefer browser-QA v2 matrix reports for UI work.
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type context-save --path <path> --session "$CLAUDE_SESSION_ID"`
- On repeated failures, dispatch `etrnl-investigator` or diagnose locally before editing again.
- Stop only for a real blocker: missing dependency, unsafe rollback gap, destructive action, conflict with user edits, or an unclear decision that cannot be derived from the repo.

### Browser-QA v2 Matrix Artifact

Use `browser-qa-report.mjs create --schema-version 2` for UI/browser evidence. JSON is the machine-validated source of truth; CSV notes are acceptable only if converted into the same fields before recording the artifact.

Required report fields:

- `schemaVersion: 2`, `reportId`, `routes`, `viewports`, `status`, `consoleSummary`, `networkSummary`, `matrix`, and `provenance`.
- `provenance.tool`, `provenance.targetUrl`, `provenance.command`, and fresh ISO `provenance.capturedAt`.
- One `matrix` row for every `route` and `viewport` combination when `status` is `complete`.

Required complete-row fields:

- `route`, `viewport`, `status` (`passed`, `failed`, `blocked`, or `skipped`), `consoleErrors`, `failedRequests`, and fresh ISO `capturedAt`.
- For non-skipped rows: `screenshot` under the artifact root and matching `screenshotSha256`.
- Optional metadata belongs in row fields such as `browser`, `browserVersion`, `device`, `platform`, `testCaseId`, `sessionId`, and `environment`; keep names stable if a CSV export is used.

Passing JSON shape:

```json
{
  "schemaVersion": 2,
  "reportId": "browser-qa-home",
  "routes": ["/"],
  "viewports": ["desktop"],
  "status": "complete",
  "consoleSummary": "checked console logs",
  "networkSummary": "checked network panel",
  "provenance": {
    "tool": "playwright-cli",
    "targetUrl": "http://127.0.0.1:4173",
    "command": "playwright-cli screenshot",
    "capturedAt": "2026-05-13T20:00:00Z"
  },
  "matrix": [{
    "route": "/",
    "viewport": "desktop",
    "status": "passed",
    "screenshot": "home-desktop.png",
    "screenshotSha256": "<sha256>",
    "capturedAt": "2026-05-13T20:00:00Z",
    "consoleErrors": 0,
    "failedRequests": 0,
    "browser": "chromium",
    "browserVersion": "stable",
    "device": "desktop",
    "platform": "darwin",
    "testCaseId": "home-desktop"
  }]
}
```

Failing examples: missing `screenshotSha256`, a screenshot outside the artifact root, stale `capturedAt`, duplicate `route`/`viewport` rows, or a `complete` report without every route/viewport combination. Store paths under `control-plane/artifacts/browser-qa/` or pass `--artifact-root` explicitly, then validate with `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path> --artifact-root <root>`.

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
7. If more than one source file was modified during this execution, confirm packet-bound write-mode implementation subagent evidence plus `etrnl-spec-reviewer` and `etrnl-quality-reviewer` evidence, or document the explicit sequential-degraded blocker that justified direct parent edits.
8. Report completed phases, verification, artifacts, remaining risks, and changed files.
