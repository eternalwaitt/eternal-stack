---
name: etrnl-dev-execute
description: ETRNL plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and runs commands.
disable-model-invocation: true
---
# ETRNL Execute

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-execute`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Execute an approved plan end to end. Create a run ledger, fan out bounded implementation subagents for parallel-safe work, review output, run verification, and continue through mechanical phases.

Completion means every item inside the plan's `Execution scope` is verified or explicitly blocked. Do not silently choose the first phase, first patch, safest subset, MVP, or a shorter path. Partial execution is allowed only when the plan says `Execution scope: first_patch_only` or the user explicitly narrows the current turn.

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
   - Grounded progress: `node ~/.claude/scripts/execution-ledger.mjs history --progress --session "$CLAUDE_SESSION_ID"` (`--json`, `--renegotiation-check`).
   - Log owner decisions with `node ~/.claude/scripts/execution-ledger.mjs record-decision --topic <topic> --decision <choice> --rationale "<why>" --session "$CLAUDE_SESSION_ID"`.
   - Record every in-scope plan phase with `node ~/.claude/scripts/execution-ledger.mjs set-phase --phase <id> --workstream <id> --status in_progress --session "$CLAUDE_SESSION_ID"` before starting it and `--status verified` after its gate passes. Phase metadata is mandatory for plan execution.
   - Record UAT closure with `node ~/.claude/scripts/execution-ledger.mjs record-uat --artifact <path> --open-findings <count> --session "$CLAUDE_SESSION_ID"`; open findings block completion.
   - Require planned artifacts with `node ~/.claude/scripts/execution-ledger.mjs require-artifact --type <artifact-type> --session "$CLAUDE_SESSION_ID"`.
   - Keep the printed path in working notes and update it as tasks/checks complete when practical.
5. Extract phases, task groups, verification gates, rollback steps, explicit stop conditions, dependencies, and write ownership.
6. Extract Hybrid execution risk tier if the plan contains deep-stack artifacts:
   - Tier 0: docs/no-source/tiny change, local verification only.
   - Tier 1: one small source surface, normal tests plus completion check.
   - Tier 2: multi-file/source workflow, spec reviewer, quality reviewer, simplifier, completion audit.
   - Tier 3: hooks, installed-home changes, auth, money, security, migrations, data loss risk, or broad Eternal Stack behavior; full deep stack plus staged install and rollback proof.
   - Execution tiers are valid only after deep plan/autoplan/review passes.
7. Critically review the plan before editing:
   - If it has missing files, vague steps, unsafe actions, or impossible verification, stop and report the blockers.
   - If non-trivial work lacks "What already exists", "NOT in scope", test coverage, a test-first execution plan, failure modes, rollout/rollback, or parallelization/conflict notes, stop and patch the plan before editing code.
   - If it is executable, create a todo/checklist from the plan.

## Execution

1. Continue through the approved plan without asking between mechanical phases.
   - Treat `Execution scope: all_phases` as a hard contract to execute the full plan. If the plan has no `Execution scope`, stop and patch the plan before editing.
2. Ask the user only for destructive actions, missing credentials, or scope expansion beyond the plan.
   - Taste and product defaults follow the `etrnl-dev-autoplan` Decision Policy: choose the default, log it to the ledger, and surface it at the final gate — do not use AskUserQuestion mid-run for taste.
   - Still ask for conflicting user edits, repeated stalls, or blockers that cannot be derived from the repo.
3. Group tasks by dependency and write scope. Execute dependent work sequentially; dispatch independent read-only review or disjoint write work to fresh subagents. For explicit parallel fan-out requests, load `references/parallel-fanout.md` before widening lanes.
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
    - Default `maxConcurrentLanes` to 3 unless the plan's `## Parallelization strategy` justifies more in one explicit line.
    - Any duration estimate given to the user during execution MUST quote `node ~/.claude/scripts/execution-ledger.mjs history --progress --session "$CLAUDE_SESSION_ID"`; if the ledger cannot provide it, say so instead of guessing.
    - When `history --progress --renegotiation-check` shows `renegotiationRequired=true`, pause once: present a consolidation proposal (bundle remaining waves per screen/domain; one consolidated review per wave for tier ≤ 2 surfaces; keep individual gates for tier-3 surfaces) with the ledger numbers, take ONE user decision, log it via `record-decision`, and never re-ask.
    - Model tier defaults: read-only scout/review/consumer-trace lanes → `fast`; write implementation → `standard`; tier-3 money/migration/security review → `top`; packet override needs one `modelTierJustification` line.
4. Subagent packets scale to tier and wave shape:
   - **Sequential single-task work:** 5-field mini-packet — `taskId`, `goal`, `exact scope`, `verification command`, `write scope` (or read-only). No hash, lineageId, reviewers, waveId, or completionReceipt.
   - **Parallel multi-file write waves at tier ≥ 2:** full packet schema below (hash, reviewers, waveId, completionReceipt when required).
   - Generate skeletons with `agent-task-packet-check.mjs --template read-only|write`; pass as `tool_input.packet` or JSON-only prompt (no Markdown wrapper). Retry JSON on packet rejection — do not switch to parent edits.
   - Full-packet fields (tier ≥ 2 parallel writes):
   - `taskId`
   - `lineageId`
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
   - for parallel or multi-file write scopes: `reviewers`, `specReviewRequired`, `qualityReviewRequired`, `integrationOwner`, `expectedDiffShape`, `criticalPath`, `stopCondition`, `waveId`, `waveSize`, `maxConcurrentLanes`, `nativeChildAgents`, `completionReceiptRequired`, and `completionReceipt`
   - set `nativeChildAgents` to `forbidden`, `modeled`, or `not_applicable`; if set to `modeled`, add `parentChildDrain` with the child-agent drain and merge protocol
   - for new surfaces: `createsNewSurface`, `reuseArtifact`, and `newSurfaceJustification`
   - for TDD-required source work: `tddRequired` and `tddEvidence`
   - for deep-stack execution: `deepStackExecution`, `deepStackArtifacts`, `riskTier`, `completionEvidence`, `simplifierEvidence`, and `simplifierReviewRequired` (plus the TDD and new-surface fields above when those conditions apply)
   - Run `node ~/.claude/scripts/agent-task-packet-check.mjs --hash` on the final packet JSON and keep the packet hash with task notes.
   - If a plan or task handoff is too large to read cleanly in one tool call, create a short `## Execution Digest` or `## Plan Index` and dispatch bounded chunks by task id instead of pasting the full artifact into one worker prompt.
5. Use repo-owned agents by role: `etrnl-scout`, `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, `etrnl-consumer-tracer`, `etrnl-investigator`, `etrnl-adversary`, `etrnl-design-reviewer`, `etrnl-dx-reviewer`, and `etrnl-browser-qa`.
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
   - `etrnl-code-review-excellence` when the plan or project expects Brooks health or code-excellence review.
   - If a triggered companion skill is unavailable, record the missing skill, impact, and compensating check in the ledger before continuing.

## Bounded CodeRabbit-lens review (risk-tiered)

After the final edit of a task or wave, run one targeted CodeRabbit-preemption pass, not an open-ended loop. Load `references/bounded-review.md` for procedure, reopen caps (ledger-enforced), and per-tier review depth.

## Verification

After each phase:

- Run the exact Verify block from the plan.
- Confirm the red test/probe for each source task exists before accepting green verification.
- If the plan omits verification, derive the smallest project preflight that proves the changed behavior.
- If the plan calls for browser/manual QA and browser tooling is available, run it before final completion; a pending browser pass is a blocker, not a residual risk.
- If the plan has a UAT gate, record `record-uat`; do not mark a phase complete while `uatOpenFindings` is greater than zero.
- Record command/live-check evidence before moving on with `node ~/.claude/scripts/execution-ledger.mjs record-check --name <phase> --command "<command>" --status passed`.
- Record task evidence with `record-task-bundle --session "$CLAUDE_SESSION_ID" --file <bundle.json>` (omit unrecorded sections; individual `record-*` still valid):
  - Shape: `{ taskId, task?, agent?, reviews?, tdd?, simplifier?, completionAudit? }`.
- Tier 3 install proof still uses `record-install-proof` when required:
  - `node ~/.claude/scripts/execution-ledger.mjs record-install-proof --task <id> --lineage <lineage-id> --packet-hash <hash> --stage <sourceGate|stagedInstall|stagedDoctor|rollbackVerification|liveInstallDecision|postUpgradeCanary> --status passed --evidence "<command evidence>"`
- Record specialist evidence when triggered:
  - `node ~/.claude/scripts/execution-ledger.mjs record-specialist --task <id> --lineage <lineage-id> --packet-hash <hash> --skill <skill-name> --status verified --evidence "<specialist evidence>"`
- Record artifact evidence when created:
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type deep-stack-artifacts --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type completion-audit --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type review-log --path <path> --session "$CLAUDE_SESSION_ID"`
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <path> --session "$CLAUDE_SESSION_ID"`; use browser-QA v2 matrix reports for UI work.
  - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type context-save --path <path> --session "$CLAUDE_SESSION_ID"`
- On repeated failures, dispatch `etrnl-investigator` or diagnose locally before editing again.
- Stop only for a real blocker: missing dependency, unsafe rollback gap, destructive action, conflict with user edits, or an unclear decision that cannot be derived from the repo.

### Browser-QA v2 Matrix Artifact

Use `browser-qa-report.mjs create --schema-version 2`; JSON is source of truth. When `status` is `complete`, require every route×viewport row with fresh `capturedAt`, `screenshot` + `screenshotSha256` under the artifact root, and full `provenance`. Validate with `browser-qa-report.mjs validate <report-path> --artifact-root <root>`. Reject duplicate rows, stale timestamps, or `complete` without full matrix coverage.

## Verification Gates (hardened)

Each wave gate is a hard stop:

1. **Gate failure is a blocker.** If the gate command exits non-zero, do not start the next wave. Record the failure, diagnose the root cause, fix it, and re-run the gate before proceeding.
2. **Evidence required before wave advance.** Record `execution-ledger.mjs record-check` with status `passed` before marking any task `completed`. A task without a recorded check is incomplete regardless of local observation.
3. **No self-certification.** Do not mark a gate `passed` based on reading output without running the command. Run the exact command from the plan's Verification gates table.
4. **Cached gates at unchanged tree hash; partial suites are not gates.** A green full-suite `record-check` at the current worktree hash is valid — do not re-run unchanged trees. `bash scripts/doctor.sh --changed` green covers execution health on touched paths; full doctor stays required for release/install. Subset runs are not gate evidence when the plan names a full suite.

## Completion

Before claiming done:

1. Re-read the original request and plan completion criteria.
2. Map every requested outcome to changed files and verification evidence.
3. Run the simplification/dedupe/domain review passes listed by the plan or triggered by changed files.
4. For deep-stack plans, ensure the completion audit has no high-impact `PARTIAL` or `NOT_DONE` item without explicit repository-owner acceptance.
5. Run final project preflight.
6. Validate required artifacts:
   - `node ~/.claude/scripts/review-log.mjs validate` when review findings were logged.
   - `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>` when browser QA ran.
   - `node ~/.claude/scripts/context-state.mjs validate <context-path>` when context was saved.
7. Run `node ~/.claude/scripts/execution-ledger.mjs check-stop --session "$CLAUDE_SESSION_ID" --require-ledger --require-tasks --require-plan-phases`.
8. If more than one source file was modified during this execution, confirm packet-bound write-mode implementation subagent evidence plus `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `code-simplifier` evidence, or document the explicit sequential-degraded blocker that justified direct parent edits.
9. Report completed phases, verification, artifacts, remaining risks, and changed files.
