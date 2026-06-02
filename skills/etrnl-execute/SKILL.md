---
name: etrnl-execute
description: ETRNL control-plane plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and runs commands.
model: sonnet
effort: medium
disable-model-invocation: true
---
# ETRNL Execute

Execute an approved plan end to end. Create a local run ledger, fan out bounded implementation subagents for parallel-safe work, review worker output, run verification, and continue through mechanical phases without asking the user to continue.

When the user asks to execute or implement a plan, completion means every item inside the plan's `Execution scope` is verified or explicitly blocked. Do not silently choose the first phase, first patch, safest subset, MVP, or a shorter path. Partial execution is allowed only when the plan says `Execution scope: first_patch_only` or the user explicitly narrows the request in the current turn.

## Startup

1. Read the full plan file.
2. Inspect current git status and note unrelated local changes.
3. Before any edit, run the readiness checker directly:
   - `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>`
   - Do not probe helper availability with `--help`, pipes, `head`, or other legacy shell commands.
   - If the readiness check fails or a hook blocks the command, stop and report the blocker. Do not continue into implementation.
   - If the plan contains `Deep stack artifacts:`, also run `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` from a source checkout or `node ~/.claude/scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` after install before editing.
4. Start a ledger when the helper is installed:
   - `node ~/.claude/scripts/execution-ledger.mjs init --plan <plan-path> --session "$CLAUDE_SESSION_ID"`
   - Record task progress with `node ~/.claude/scripts/execution-ledger.mjs set-task --task <id> --status <status> --session "$CLAUDE_SESSION_ID"`.
   - Record every in-scope plan phase with `node ~/.claude/scripts/execution-ledger.mjs set-phase --phase <id> --workstream <id> --status in_progress --session "$CLAUDE_SESSION_ID"` before starting it and `--status verified` after its gate passes. Phase metadata is mandatory for plan execution.
   - Record UAT closure with `node ~/.claude/scripts/execution-ledger.mjs record-uat --artifact <path> --open-findings <count> --session "$CLAUDE_SESSION_ID"`; open findings block completion.
   - Require planned artifacts with `node ~/.claude/scripts/execution-ledger.mjs require-artifact --type <artifact-type> --session "$CLAUDE_SESSION_ID"`.
   - Keep the printed path in working notes and update it as tasks/checks complete when practical.
5. Extract phases, task groups, verification gates, rollback steps, explicit stop conditions, dependencies, and write ownership.
6. Extract Hybrid execution risk tier if the plan contains deep-stack artifacts:
   - Tier 0: docs/no-source/tiny change, local verification only.
   - Tier 1: one small source surface, normal tests plus completion check.
   - Tier 2: multi-file/source workflow, spec reviewer, quality reviewer, simplifier, completion audit.
   - Tier 3: hooks, installed-home changes, auth, money, security, migrations, data loss risk, or broad control-plane behavior; full deep stack plus staged install and rollback proof.
   - Execution tiers are valid only after deep plan/autoplan/review passes.
7. Critically review the plan before editing:
   - If it has missing files, vague steps, unsafe actions, or impossible verification, stop and report the blockers.
   - If non-trivial work lacks "What already exists", "NOT in scope", test coverage, a test-first execution plan, failure modes, rollout/rollback, or parallelization/conflict notes, stop and patch the plan before editing code.
   - If it is executable, create a todo/checklist from the plan.

## Execution

1. Continue through the approved plan without asking between mechanical phases.
   - Treat `Execution scope: all_phases` as a hard contract to execute the full plan. If the plan has no `Execution scope`, stop and patch the plan before editing.
2. Ask the user only for destructive actions, scope expansion, missing credentials, conflicting user edits, repeated stalls, or subjective product/taste decisions.
3. Group tasks by dependency and write scope. Execute dependent work sequentially; dispatch independent read-only review or disjoint write work to fresh subagents.
    - Use wave-based execution: earlier waves must finish before later waves.
    - Before parallel work, run an overlap check with the plan's task file lists when practical:
      `node ~/.claude/scripts/execution-wave-check.mjs < tasks.json`
    - If any two tasks in a wave touch the same file, run that wave sequentially and log the planning defect.
    - MUST dispatch write-capable implementation subagents for every parallel-safe wave with two or more independent source-file tasks.
    - The parent orchestrator must not edit files directly for tasks assigned to implementation subagents; it only coordinates, integrates, verifies, and repairs blocked work.
    - Use direct parent edits only for a single local task, a dependency-ordered sequential wave, an overlap conflict, missing subagent runtime, or a user-requested no-subagent run; state the exact sequential-degraded blocker before editing.
    - A malformed or rejected subagent packet is not a sequential-degraded blocker. Fix the packet and retry the subagent call before any source edit for that task.
    - Use worktree isolation only when the task is write-capable, disjoint, not touching submodule paths, and the runtime supports it.
    - Emit heartbeat text at wave and task boundaries: `[checkpoint] wave <n> task <id> starting`.
    - If a subagent completion signal is missing, spot-check expected output, git state, and ledger artifacts before deciding whether to retry or continue.
    - While a subagent owns a task, do not duplicate its implementation locally.
4. Every subagent call must include a structured task packet:
   - Generate the packet skeleton with `node ~/.claude/scripts/agent-task-packet-check.mjs --template read-only` or `node ~/.claude/scripts/agent-task-packet-check.mjs --template write`, then fill it before dispatch.
   - Pass the final packet as structured `tool_input.packet` when the tool supports it. If Claude Code only exposes a prompt field, the entire prompt must be one valid JSON object with either top-level packet fields or `{ "packet": { ... }, "instructions": "..." }`; do not add Markdown or prose outside the JSON.
   - If the Agent/Task call is rejected with `Subagent task packet is missing` or another packet error, retry with a JSON-only prompt. Do not switch to parent edits.
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
   - WebSearch policy
   - for multi-file write scopes: `reviewers`, `specReviewRequired`, `qualityReviewRequired`, `integrationOwner`, and `expectedDiffShape`
   - for new surfaces: `createsNewSurface`, `reuseArtifact`, and `newSurfaceJustification`
   - for TDD-required source work: `tddRequired` and `tddEvidence`
   - for deep-stack execution: `deepStackExecution`, `deepStackArtifacts`, `riskTier`, `completionEvidence`, `simplifierEvidence`, and `simplifierReviewRequired` (plus the TDD and new-surface fields above when those conditions apply)
   - Run `node ~/.claude/scripts/agent-task-packet-check.mjs --hash` on the final packet JSON and keep the packet hash with task notes.
   - If a plan or task handoff is too large to read cleanly in one tool call, create a short `## Execution Digest` or `## Plan Index` and dispatch bounded chunks by task id instead of pasting the full artifact into one worker prompt.
5. Use repo-owned agents by role: `etrnl-scout`, `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, `etrnl-investigator`, `etrnl-adversary`, `etrnl-design-reviewer`, `etrnl-dx-reviewer`, and `etrnl-browser-qa`.
6. Mark each task in progress before editing and complete only after its verification passes.
7. Use TDD for source changes:
   - Before changing production source for a task, run the existing targeted test or add the smallest failing test/bug probe that proves the planned behavior gap.
   - Record the red result in the ledger with `record-check --status failed` or in working notes when the ledger is unavailable.
   - Record task TDD evidence with `node ~/.claude/scripts/execution-ledger.mjs record-tdd --task <id> --lineage <lineage-id> --packet-hash <hash> --status red_green_verified --red-command "<cmd>" --red-status failed --red-failure "<expected failure>" --green-command "<cmd>" --green-status passed`.
   - Implement only enough to turn that test/probe green, then run the phase gate.
   - If a task genuinely cannot be tested first, record the exact reason and compensating verification command before editing. "Too much work" is not a valid reason.
8. Update plan checkboxes when the plan is the source of truth.
9. Preserve user changes and do not revert unrelated dirty files.
10. Before broad edits, invoke required domain companions when installed:
   - `eternal-best-practices` for auth, tenant, money, i18n, Prisma, permissions, soft-delete, and stack policy.
   - `finding-duplicate-functions` when reducing duplication or consolidating repeated logic.
   - `code-simplifier` after implementation and before final scoring/completion.
   - `brooks-audit` when the plan or project expects Brooks health.

## Verification

After each phase:

- Run the exact Verify block from the plan.
- Confirm the red test/probe for each source task exists before accepting green verification.
- If the plan omits verification, derive the smallest project preflight that proves the changed behavior.
- If the plan calls for browser/manual QA and browser tooling is available, run it before final completion; a pending browser pass is a blocker, not a residual risk.
- If the plan has a UAT gate, record `record-uat`; do not mark a phase complete while `uatOpenFindings` is greater than zero.
- Record command/live-check evidence before moving on with `node ~/.claude/scripts/execution-ledger.mjs record-check --name <phase> --command "<command>" --status passed`.
- Record bound write evidence for implementation and reviews when write packets are used:
  - `node ~/.claude/scripts/execution-ledger.mjs set-task --task <id> --status verified --mode write --lineage <lineage-id> --packet-hash <hash> --requires-implementation-evidence --spec-review-required --quality-review-required --tdd-required --simplifier-review-required`
  - `node ~/.claude/scripts/execution-ledger.mjs record-agent --role etrnl-executor --mode write --task <id> --lineage <lineage-id> --packet-hash <hash> --status completed`
  - `node ~/.claude/scripts/execution-ledger.mjs record-review --reviewer etrnl-spec-reviewer|etrnl-quality-reviewer --task <id> --lineage <lineage-id> --packet-hash <hash> --status verified`
  - `node ~/.claude/scripts/execution-ledger.mjs record-simplifier --task <id> --lineage <lineage-id> --packet-hash <hash> --status verified --evidence "<code-simplifier evidence>"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-specialist --task <id> --lineage <lineage-id> --packet-hash <hash> --skill <skill-name> --status verified --evidence "<specialist evidence>"` when triggered.
  - `node ~/.claude/scripts/execution-ledger.mjs record-completion-audit --item <plan-item> --task <id> --lineage <lineage-id> --packet-hash <hash> --classification DONE --evidence "<diff/test evidence>"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-install-proof --task <id> --lineage <lineage-id> --packet-hash <hash> --stage <sourceGate|stagedInstall|stagedDoctor|rollbackVerification|liveInstallDecision|postUpgradeCanary> --status passed --evidence "<command evidence>"` for Tier 3 behavior.
- Record artifact evidence when created:
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type deep-stack-artifacts --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type completion-audit --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type review-log --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <path> --session "$CLAUDE_SESSION_ID"`; use browser-QA v2 matrix reports for UI work.
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
- Conditional metadata belongs in row fields such as `browser`, `browserVersion`, `device`, `platform`, `testCaseId`, `sessionId`, and `environment`; keep names stable if a CSV export is used.

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
4. For deep-stack plans, ensure the completion audit has no high-impact `PARTIAL` or `NOT_DONE` item without explicit Victor acceptance.
5. Run final project preflight.
6. Validate required artifacts:
   - `node ~/.claude/scripts/review-log.mjs validate` when review findings were logged.
   - `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>` when browser QA ran.
   - `node ~/.claude/scripts/context-state.mjs validate <context-path>` when context was saved.
7. Run `node ~/.claude/scripts/execution-ledger.mjs check-stop --session "$CLAUDE_SESSION_ID" --require-ledger --require-tasks --require-plan-phases`.
8. If more than one source file was modified during this execution, confirm packet-bound write-mode implementation subagent evidence plus `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `code-simplifier` evidence, or document the explicit sequential-degraded blocker that justified direct parent edits.
9. Report completed phases, verification, artifacts, remaining risks, and changed files.
