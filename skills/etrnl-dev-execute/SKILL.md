---
name: etrnl-dev-execute
description: ETRNL plan execution workflow for Claude Code. Use only when the user explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and runs commands.
disable-model-invocation: true
---
# ETRNL Execute

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-execute`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Execute an approved plan end to end. Create a run ledger, fan out bounded implementation subagents for parallel-safe work, review output, run verification, and continue through mechanical phases.

Helper paths: `node scripts/<name>` in a source checkout, `node ~/.claude/scripts/<name>` after install. Both spellings run the same helper; commands below show one.

Completion means every item inside the plan's `Execution scope` is verified or explicitly blocked. Do not silently choose the first phase, first patch, safest subset, MVP, or a shorter path. Partial execution is allowed only when the plan says `Execution scope: first_patch_only` or the user explicitly narrows the current turn.

## Startup

1. Read the full plan file.
2. Inspect current git status and note unrelated local changes.
3. Before any edit, run the readiness checker directly:
   - `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>`
   - Do not probe helper availability with `--help`, pipes, `head`, or other legacy shell commands.
   - If the readiness check fails or a hook blocks the command, stop and report the blocker. Do not continue into implementation.
   - If the plan contains `Deep stack artifacts:`, also run `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` before editing.
4. Start a ledger when the helper is installed:
   - `node ~/.claude/scripts/execution-ledger.mjs init --plan <plan-path> --session "$CLAUDE_SESSION_ID"`
   - Progress: `set-task`, `set-phase`, `record-uat`, `require-artifact`, `record-check`, `record-decision`, `history --progress` (`--json`, `--renegotiation-check`).
   - Phase metadata is mandatory for plan execution; open UAT findings block completion.
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
2. Ask the user only for destructive actions, missing credentials, scope expansion beyond the plan, or a review loop whose merged `capDecision.ownerDecisionRequired` is `true`.
   - An exhausted reopen cap is not by itself a question for the user; run the `capDecision` branch from `references/bounded-review.md`.
   - Taste and product defaults follow the `etrnl-dev-autoplan` Decision Policy: choose the default, log it to the ledger, and surface it at the final gate — do not use AskUserQuestion mid-run for taste.
   - Still ask for conflicting user edits, repeated stalls, or blockers that cannot be derived from the repo.
3. Group tasks by dependency and write scope. Execute dependent work sequentially; dispatch independent read-only review or disjoint write work to fresh subagents. For explicit parallel fan-out requests, load `references/parallel-fanout.md` before widening lanes.
   - When the plan enumerates many similar per-item findings (checklist rows, board cards, per-screen fixes) **or** `Scope triage: Large` with three or more task groups in the active phase, load `references/batch-execution.md` before the first spawn; expensive harnesses, review chains, and commits run once per surface-grouped wave, not per item.
    - Use wave-based execution: earlier waves must finish before later waves.
    - Before parallel work, run an overlap check against the plan's task file lists when practical (`node ~/.claude/scripts/execution-wave-check.mjs < tasks.json`); if two tasks in a wave touch the same file, run that wave sequentially and log the planning defect.
    - MUST dispatch write-capable implementation subagents for every parallel-safe wave with two or more independent source-file tasks.
    - The parent orchestrator must not edit files directly for tasks assigned to implementation subagents; it only coordinates, integrates, verifies, and repairs blocked work.
    - Use direct parent edits only for a single local task, a dependency-ordered sequential wave, an overlap conflict, missing subagent runtime, or a user-requested no-subagent run; state the exact sequential-degraded blocker before editing.
    - A malformed or rejected subagent packet is not a sequential-degraded blocker. Fix the packet and retry the subagent call before any source edit for that task.
    - Use worktree isolation only when the task is write-capable, disjoint, not touching submodule paths, and the runtime supports it.
    - Emit heartbeat text at wave and task boundaries: `[checkpoint] wave <n> task <id> starting`.
    - If a subagent completion signal is missing, spot-check expected output, git state, and ledger artifacts before deciding whether to retry or continue.
    - Default `maxConcurrentLanes` to 3 unless the plan's `## Parallelization strategy` justifies more in one explicit line. The Codex execute profile drops that default to 2.
    - Progress reported to the user is ledger position plus named gates only, per the execute profile (`references/claude-execute-profile.md` or `references/codex-execute-profile.md`). Rolling hour ETAs are prohibited on every host; report a field the ledger cannot supply as unavailable rather than guessing.
    - When `history --progress --renegotiation-check` shows `renegotiationRequired=true`, pause once: present a consolidation proposal (bundle remaining waves per screen/domain for all tiers; one merged review per wave; tier-3 surfaces keep tier-3 lenses and gates per wave — no batching exemption), take ONE user decision, log it via `record-decision`, and never re-ask.
    - Model tier defaults: read-only scout/review/consumer-trace lanes → `fast`; write implementation → `standard`; tier-3 money/migration/security review → `top`; packet override needs one `modelTierJustification` line. Resolve each tier to a slug and reasoning effort through `scripts/lib/codex-model-routing.mjs`; never hand-write a model string.
4. Subagent packets scale to tier, scope triage, and wave shape. The plan's `Scope triage:` line selects the shape; see `## Plan scope triage`.
   - **Tier 0–1 quick-dev lane:** no task packets, no reviewer fan-out, no deep-stack artifacts. Parent executes TDD probe → surgical fix → targeted tests → `review-rules.mjs` → ONE merged quality lens. State success criteria up front as the stop condition.
   - **Sequential single-task work (tier ≥ 2):** 5-field mini-packet — `taskId`, `goal`, `exact scope`, `verification command`, `write scope` (or read-only). No hash, lineageId, reviewers, waveId, or completionReceipt.
   - **Parallel multi-file write waves at tier ≥ 2:** full packet schema, canonical in `agent-task-packet-check.mjs --template write` (lineageId, reviewers, waveId, TDD/deep-stack flags, completionReceipt when required).
   - Generate skeletons with `agent-task-packet-check.mjs --template read-only|write|mini`; pass as `tool_input.packet` or JSON-only prompt (no Markdown wrapper).
   - Run `node ~/.claude/scripts/agent-task-packet-check.mjs --hash` on the final packet JSON and keep the packet hash with task notes.
   - Oversized handoffs: create `## Execution Digest` or `## Plan Index` and dispatch bounded chunks by task id.
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
10. Before broad edits, invoke required domain companions when installed (`eternal-best-practices`, `finding-duplicate-functions`, `code-simplifier`, `etrnl-code-review-excellence`). Record missing skills and compensating checks before continuing.

## Dual-host execute profiles

`ETRNL_EXECUTE_HOST` selects the profile at startup: `codex` runs the Codex profile, `claude` runs the Claude profile, and an unset value runs the Codex profile only under a detected Codex CLI session. Any other value is a configuration defect. State the resolved profile and its selecting signal in the first status line.

Load the matching execute profile before the first spawn:

- **Codex:** `references/codex-execute-profile.md` — lane cap 2, explicit model on every spawn, batch adoption triggers, `close_agent` + `record-subagent`.
- **Claude:** `references/claude-execute-profile.md` — lane cap 3, `cc-spawn-guard.sh` on Task/Agent/TaskCreate, batch adoption triggers, subagent close + `record-subagent`.

## Spawn guard (both hosts)

Before **every** subagent dispatch (`Task`, `Agent`, `TaskCreate`, `spawn_agent`, or native child agent):

1. When the host spawn hook is registered and active (`cc-spawn-guard.sh` on Claude; `spawn-guard-pre-tool-use.sh` in Codex `config.toml`), the hook is the **sole spawn recorder** — use `check-spawn --dry-run` from the skill layer only while debugging packet shape.
2. When the hook is absent or spawn guard mode is `off`, run `node scripts/execution-ledger.mjs check-spawn` without `--dry-run` before dispatch so economics stay enforced.
3. Exit 1 is a hard stop — read recovery with `check-spawn --explain --task-name "<name>" --wave "<wave>"`; do not rename the task to bypass the guard.

The guard enforces wave 2+ merged review, batch adoption on Large/multi-group plans, lane caps, review-scope gating, and spawn-name allowlists derived from the plan.

## Plan scope triage

The plan's `## Tier assessment` section carries a `Scope triage:` line reading `Trivial`, `Small`, or `Large`. Read it at startup and run the matching shape on every host, under either profile. When the line is absent, resolve the scope with `node scripts/diff-triviality.mjs classify-plan --plan <plan-path> --json` and quote the returned `scope` and `reason` in the first status line. When that command fails, run the `Large` shape.

| Scope | Packets | Review | Scaffolding |
| --- | --- | --- | --- |
| Trivial | `--template mini` only | `review-rules.mjs check --changed-only` plus the plan's verification gates | None |
| Small | Mini-packet per sequential task; full packet for a parallel multi-file write wave | One merged quality review per wave | Waves only where two tasks run in parallel |
| Large | Full packet schema | Reviewer roles named by the plan and the declared tier | Full phase and wave scaffolding |

Trivial shape rules:

1. Dispatch every task with the mini packet from `node scripts/agent-task-packet-check.mjs --template mini`. Fill `taskId`, `goal`, `scope`, `verificationCommand`, and `writeScope`, and carry the `codexModel` and `codexReasoningEffort` the template resolves. Generate no full packet, no `lineageId`, no `waveId`, and no `completionReceipt`.
2. Spawn no `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, simplifier lens, or adversarial pass. This replaces the per-wave merged quality review that `references/codex-execute-profile.md` runs at tier 0–2; that review holds at `Small` and `Large`.
3. Skip wave tables, `execution-wave-check.mjs` overlap checks, and phase scaffolding. Ledger `set-task`, `record-check`, and the completion gates still run on every task.
4. Tier 3 is never Trivial. A `Scope triage: Trivial` line on a tier 3 plan is a plan defect: run the Large shape and report the defect in the first status line.
5. A scope expansion past the plan's `## File map` ends the Trivial shape mid-run. Re-run `classify-plan`, state the new scope, and run the returned shape for the remaining tasks.

## Bounded CodeRabbit-lens review (risk-tiered)

After the final edit of a task or wave, resolve `REPO_ROOT` once (`git rev-parse --show-toplevel`), then run the review helper from `node ~/.claude/scripts/review-rules.mjs check --changed-only --root "$REPO_ROOT"` in application repos or from `"$ETRNL_STACK/scripts/review-rules.mjs"` only when `ETRNL_STACK` points at the trusted Eternal Stack checkout that owns the active install, then run reviewers per the tier and scope shape from `references/bounded-review.md` (Trivial: review-rules only — no LLM reviewer fan-out; tier ≤2: one merged pass per wave; tier 3: full chain per write task or merged wave per execute profile), merge with the matching `review-merge.mjs` path, apply only validated deterministic `safe_auto` fixes, and require confirmation for other changes before reopening on P0/P1 blockers. Load `references/bounded-review.md` for helper-path resolution, synthesis, reopen caps (ledger-enforced), and per-tier depth.

### Wave and task exit check

Close a task or wave only when acceptance criteria are met AND the merged review artifact has no `blocking` entries. At tier 3 on auth/money/migration/tenancy/security streams, also require `etrnl-investigator` review and `record-decision` owner confirmation for any P2/P3 residuals before closure. A review loop whose merged finding count did not decrease between rounds is stalled: park it, record a blocker, and continue. When the loop ends on a spent cap or a park counter, act on the merged `capDecision`. Anti-rationalization excuses and tier-scoped residual closure live in `references/bounded-review.md`.

## Verification

After each phase:

- Run the exact Verify block from the plan; confirm red probes before accepting green.
- Browser/manual QA and UAT gates block completion while open.
- Reference comparisons follow `etrnl-audit-browser` Reference Parity Policy: structural parity within tolerance; pixel diffs are diagnostics only.
- Record checks with `record-check`; bundle task evidence with `record-task-bundle --file <bundle.json>` (`{ taskId, task?, agent?, reviews?, tdd?, simplifier?, completionAudit? }`).
- Tier 3 install proof: `record-install-proof`; specialists: `record-specialist`; artifacts: `record-artifact` (`deep-stack-artifacts`, `completion-audit`, `review-log`, `browser-qa-report`, `context-save`).
- On repeated failures, dispatch `etrnl-investigator`. Fix env failures once, log with `record-decision`, reuse on later runs.

### Browser-QA and react-doctor gates

Load `references/verification-gates.md` when either gate applies.

## Verification Gates (hardened)

Each wave gate is a hard stop:

1. **Gate failure is a blocker.** If the gate command exits non-zero, do not start the next wave. Record the failure, diagnose the root cause, fix it, and re-run the gate before proceeding.
2. **Evidence required before wave advance.** Record `execution-ledger.mjs record-check` with status `passed` before marking any task `completed`. A task without a recorded check is incomplete regardless of local observation.
3. **No self-certification.** Do not mark a gate `passed` based on reading output without running the command. Run the exact command from the plan's Verification gates table.
4. **Cached gates at unchanged tree hash; partial suites are not gates.** A green full-suite `record-check` at the current worktree hash is valid — do not re-run unchanged trees. Subset runs are not gate evidence when the plan names a full suite.

## Completion

Before claiming done: re-read completion criteria; map outcomes to evidence; run simplifier/dedupe/domain passes; run final preflight; validate review-log/browser-qa/context artifacts when used; run `check-stop --require-ledger --require-tasks --require-plan-phases`; confirm write/review evidence or document sequential-degraded blocker; report phases, verification, artifacts, risks, and changed files.
