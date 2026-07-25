---
name: etrnl-dev-autoplan
description: ETRNL planning companion for Claude Code. Use when the user asks to create an execution-ready implementation plan with task groups, dependencies, subagent candidates, verification gates, and explicit question policy.
---
# ETRNL Autoplan

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-autoplan`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Create execution-ready plans for `/etrnl-dev-execute`. Do not implement the plan.

For `Risk tier` 2–3, default to completeness 10/10 for non-trivial work. Tier 0–1 finalize in a single pass without the full gauntlet, parity scorecard, or deep-stack bundle. Do not offer fast, reduced, MVP, or partial paths unless the user explicitly asks for a spike, prototype, or quick pass.

Every final plan must make execution scope machine-readable. Use `Execution scope: all_phases` by default. Use `Execution scope: first_patch_only` or an explicit subset only when the user asked for partial execution in that turn.

## Autoplan Depth Contract

Non-trivial autoplan work is a deep planning run, not a fast outline. Tier 0–1 use the reduced plan shape from `etrnl-dev-plan`. Tier 2–3 gather current context, run the review lanes for that tier, produce artifact evidence when tier ≥ 2, and pass deterministic gates before any `Status: Final` output.

Mandatory stages by tier:

Tier 0–1:
1. Context recovery — read current repo state, relevant docs, existing plans, and prior artifacts; record paths and reused helpers in `Evidence:`.
2. Reuse inventory — search existing components, hooks, scripts, skills, tests, docs, and helpers before naming new surfaces.
3. Test-first and verification design — name red/green proof or compensating checks and exact commands in `## Verification gates`.
4. One merged quality review lane — no task packets, no multi-reviewer fan-out, no deep-stack bundle, no parity scorecard.

Tier 2 (add to tier 0–1 stages):
4. Engineering review lane — validate architecture, data flow, failure modes, rollback, tests, parallelization, reuse, and type boundaries.
5. Adversarial review lane — challenge the most likely false assumption, hidden coupling, and verification gaps.

Tier 3 (full gauntlet):
6. CEO/founder, design applicability, DX applicability, specialist, reuse, and simplifier lanes.
7. Subagent and outside-voice routing for large plans.
8. External evidence for tool, workflow, skill, hook, or planning capability changes.
9. Artifact creation — create and validate the deep-stack bundle before finalization.
10. Convergence — close or owner-accept every high/blocker finding; reconcile requested outcomes.
11. Parity scorecard — tier 3 only; every score must be 9 or 10 or the plan is `Blocked until <specific blocker>`.

Stage details:

1. Context recovery:
   - Read current repo state, relevant docs, existing plans, installed helper availability, and prior durable artifacts before drafting.
   - Record exact source paths, command outputs, and reused helpers in `Evidence:`.
2. Problem framing:
   - State the user goal, user-visible outcome, non-goals, constraints, and the highest-risk false premise.
   - Challenge the premise only through a recorded `Autoplan decision log` row.
3. Reuse inventory:
   - Search existing components, hooks, scripts, skills, tests, docs, agents, and helpers before naming new surfaces.
   - Record reuse decisions in the deep-stack artifact `reuseInventory` and plan `## What already exists` when tier ≥ 2.
4. External evidence (tier ≥ 2):
   - For tool, workflow, skill, hook, agent, or planning capability changes, ground public claims in current source, upstream docs, or user-provided evidence.
   - Keep raw notes outside tracked repo files.
5. Review gauntlet (tier 2: engineering + adversarial; tier 3: all eight lanes):
   - Complete the lanes required for the plan's `Risk tier`.
   - Record role, inputs, findings, high/blocker status, disposition, and completion time in the deep-stack artifact when tier ≥ 2.
6. Subagent and outside-voice routing (tier 3):
   - For large plans, create read-only task packets for `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer`, or record a blocker/unavailable/not-applicable disposition.
   - Mark Codex, Gemini, Octopus, gstack design, GPT image/mock tooling, CodeGraph, Beads, and browser tooling as applicable, unavailable, or not-applicable with evidence.
7. Test-first and verification design:
   - Include red/green proof for source tasks, fixture coverage for workflow tasks, browser evidence for UI tasks, and install/canary gates for etrnl runtime changes.
   - Name exact commands and expected pass conditions in `## Verification gates`.
   - Use vertical slices for implementation tasks. Split any task that touches more than 8 files, crosses unrelated subsystems, or lacks one clear verification command.
8. Artifact creation (tier ≥ 2):
   - Create the deep-stack artifact bundle with `node scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>`.
   - Fill blocked skeleton sections with real evidence before finalization.
   - Validate the plan with `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` and `node scripts/plan-readiness-check.mjs <plan-path>`.
9. Convergence (tier ≥ 2):
   - Close, disprove, downgrade with evidence, or record explicit owner-accepted risk for every high/blocker finding.
   - Reconcile requested outcomes against `DONE`, `PARTIAL`, `NOT_DONE`, `CHANGED`, or `BLOCKED`.
10. Parity scorecard (tier 3 only):
   - Add an `## Autoplan parity scorecard` subsection under `## Plan Readiness Report`.
   - Score context recovery, reuse, review coverage, external evidence, test-first plan, artifact validity, execution handoff, and open-risk closure from 0 to 10.
   - Final verdict requires every score at 9 or 10. Lower scores force `Blocked until <specific blocker>`.

## Scope freeze (anti-drift)

Freeze scope before drafting task groups, and hold it through execution:

1. Restate the goal in one sentence. Every task group must trace to that sentence; drop any task group that does not.
2. Treat a review or audit backlog as a catalog, not a mandate to build infrastructure. "Add all findings, even nits" means record each finding as a checklist line or a single deterministic guard, not a new subsystem, receipt store, or ledger. When a finding class needs more than a guard or a checklist line, mark it a review lens and stop there.
3. Reject integrity, tamper-proofing, cryptographic-receipt, and provenance-hardening scope unless the one-sentence goal names it. These are the recurring drift vectors; a plan that grows one without an explicit ask is over-engineered — cut it. `node scripts/deep-stack-check.mjs validate-plan` enforces this mechanically for new create rows and drifting task groups.
4. Commit each task group independently so value lands incrementally and a drifting task group reverts alone.

## Tier assessment and Codex model routing

Tier ≥ 2 plans state what the declared tier costs before the task groups, and route every planned packet to an explicit model. Tier 0–1 plans skip both.

Emit `## Tier assessment` before `## What already exists` with five lines: declared `Risk tier` and its trigger, tier cost, execution cost shape, model cost shape, and `Scope triage: <value>`. It informs the owner and never blocks `Status: Final`. Resolve the triage with `node scripts/diff-triviality.mjs classify-plan --plan <plan-path> --json` and copy the returned `scope` verbatim. Tier 3 is Large at every file count.

Load `references/tier-assessment-and-model-routing.md` before writing that section, the `Scope triage:` line, or any packet model. It carries the five-line field contract, the scope triage table, the Codex model map resolved through `scripts/lib/codex-model-routing.mjs`, the rule that an omitted or inherited `model` is a packet defect rather than a fallback, and the `## Parallelization strategy` row format.

## Full Deep Stack Review

Run the review gauntlet required by the plan's `Risk tier` before finalizing. Tier 0–1 use one merged quality review lane only — no task packets, no multi-reviewer fan-out, no deep-stack bundle. Tier 2 requires engineering plus adversarial lanes. Tier 3 requires all eight lanes and a validated `Deep stack artifacts:` bundle before execution.

Load `references/deep-stack-review.md` for the lane definitions: CEO/founder, engineering (with `references/review-contract.md` and `references/coderabbit-preemption.md`), design, DX, adversarial, outside voices (with `references/reviewer-routing.md` and `references/reversible-compression.md`), and specialist convergence. Close, disprove, or explicitly user-accept every high/blocker finding before finalization.

## Hybrid Deep Stack Artifacts

Every non-trivial `Status: Final` plan at tier ≥ 2 must include `Deep stack artifacts: <relative-path>` and the referenced bundle must pass validation. Tier 0–1 final plans do not require the bundle. Do not finalize a tier ≥ 2 plan on transitional readiness.

```bash
node scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>
node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>
# or, after install:
node ~/.claude/scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>
node ~/.claude/scripts/deep-stack-check.mjs validate-plan --plan <plan-path>
```

The artifact bundle records:

- sanitized source manifest with source ids, versions/commits, hashes, required files, capture time, and refresh commands
- skill activation matrix with required, conditional, not-applicable, missing, or blocker dispositions
- reuse inventory with searched paths, existing analogs, candidate helpers/tests, reuse decisions, and new-surface rationale
- review phase records with role, checked inputs, findings count, open high count, disposition, and completed time
- TDD evidence for source tasks, or explicit not-test-first rationale with compensating verification
- completion reconciliation for every requested outcome, including accepted risk owner for high-impact incomplete rows
- reuse binding rows for new surfaces, including searched paths, analogs, decision, and new-surface justification
- TypeScript trigger evidence when public/exported contracts, schemas, state machines, DTO boundaries, or reusable type utilities are touched
- Tier 3 install proof covering source gate, staged install, staged doctor/canary, rollback verification, live-install decision, and post-upgrade canary
- findings ledger with severity, confidence, owner, status, fingerprint, and fix evidence
- completion audit with `DONE`, `PARTIAL`, `NOT_DONE`, `CHANGED`, or `BLOCKED`
- Hybrid execution risk tier, required artifacts, verification gate, and accepted risks

Do not put private home paths, `/tmp` snapshots, transcripts, account material, or secrets in tracked artifacts.

## Decision Policy

- Mechanical decision: auto-pick the most complete option.
- Blast-radius expansion: auto-include when it touches files already modified by the plan or direct importers and remains bounded.
- Taste decision: choose the default, log it, and surface it in the final gate.
- User challenge: never auto-decide changes that contradict the user's explicit direction.
- Human-gate-only: premises, subjective taste, destructive actions, missing credentials, scope outside blast radius, or repeated stalls.

## External Evidence Flow

Before finalizing any plan for a capability or feature that competes with or parallels existing tools:

1. Cite live upstream docs, source code, or user-provided evidence.
2. Keep raw notes local, private, or attached outside tracked repo files.
3. Do not create tracked evidence artifacts in this repository.
4. If evidence is missing, mark the plan blocked or explicitly record the user-approved risk in the local plan file.

## Plan Requirements

1. Ground the plan in current repo evidence before proposing changes.
2. Identify existing files, helpers, hooks, scripts, tests, and docs to reuse.
3. Group work by subsystem and dependency.
4. Name disjoint write scopes and safe subagent candidates, and route each candidate to an explicit model and reasoning effort per the Codex model map in `references/tier-assessment-and-model-routing.md`.
5. Include verification commands for each phase and the final gate.
6. For multi-session, multi-route, or multi-workstream plans, include conditional `Phase:`, `Workstream:`, and `UAT Gate:` metadata so `/etrnl-dev-execute` can record phase/UAT state in the ledger.
7. Do not include `## Immediate First Patch`, `## First Slice`, or similar partial-completion headings in a final all-phases plan. Express sequencing under `## Phases` instead.
8. Include failure modes, rollback notes, and non-scope.
9. When acceptance involves comparing UI against reference designs or screenshots, the plan must state a tolerance-based parity standard (structural parity: elements, layout order, copy, truthful data, no overflow at the reference viewport) per the `etrnl-audit-browser` Reference Parity Policy. Words like "exact", "pixel", or "identical" in acceptance criteria are a plan defect unless the stakeholder explicitly demanded pixel equality in writing and the reference comes from the same capture harness.
10. Include the question policy:
   - auto-continue mechanical phases
   - ask only for destructive actions, scope expansion, missing credentials, conflicting user edits, repeated stalls, or subjective product/taste decisions
11. Include an autoplan decision log:
   - phase: CEO, Eng, Design, DX, Adversarial, Specialist, Convergence
   - decision
   - rationale
   - consensus or disagreement
   - artifact needed, if any
   - final gate category: none, taste, premise, destructive, user challenge
1. Include artifact requirements for execution when tier ≥ 2:
   - `Deep stack artifacts: <path>` for every non-trivial final plan at tier ≥ 2
   - `review-log.jsonl` when review findings are created
   - `browser-qa-report.json` when UI/browser behavior changes
   - context-save when work is long-running or likely to be resumed
1. The final plan must pass `node ~/.claude/scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` and `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>` before `/etrnl-dev-execute` starts. A result that says deep-stack metadata is absent is not a pass for a newly generated final plan; add the bundle and rerun the gate.
    Use the exact readiness-compatible headings in the Output section. Do not leave `TODO`, `TBD`, "handle edge cases", "wire it up", or "similar to above" in the plan.

## Task Packet Drafting

Skip task packet drafting for tier 0–1 — the quick-dev lane has no packets. For tier ≥ 2 subagent candidates, include:

- goal
- context summary
- exact scope
- cwd/project context
- read set
- write scope or read-only
- forbidden files
- expected output
- verification command
- model tier (`fast`, `standard`, or `top`)
- `codexModel` and `codexReasoningEffort` resolved from that tier by `scripts/lib/codex-model-routing.mjs`, plus `modelTierJustification` when the packet escalates to `gpt-5.6-sol`
- timeout
- retry policy
- do-not-revert instruction
- WebSearch policy
- for multi-file write scopes: reviewers, spec review requirement, quality review requirement, integration owner, and expected diff shape

## Output

Return or save a single implementation plan with this readiness-compatible shape:

- `Status: Final`
- `Execution scope: all_phases`
- `Goal:`
- `Evidence:`
- `Non-goals:`
- `Deep stack artifacts:` metadata for every non-trivial final plan at tier ≥ 2.
- Conditional `Phase:`, `Workstream:`, and `UAT Gate:` metadata when the plan spans multiple phases, routes, or workstreams.
- `## Tier assessment` for every tier ≥ 2 plan — informational, never a Final gate.
- `## What already exists`
- `## NOT in scope`
- `## File map`
- `## Task groups`
- `## Phases`
- `## Skill/tool routing`
- `## Test plan`
- `## Test-first execution plan`
- `## Failure modes`
- `## Parallelization strategy` — with the required `Agent/model/effort` column on every packet row
- `## Verification gates`
- `## Rollback`
- `## Execution handoff`
- `## Autoplan decision log`
- `## Artifact requirements`
- `## Assumptions`
- `## Plan Readiness Report`
- `## Verdict`

The Plan Readiness Report must explicitly cover:

- Scope Challenge
- Architecture Review
- Code Quality Review
- Test Review
- Performance Review
- Failure modes
- Parallelization
- Final decision inputs that justify the verdict section
- Autoplan parity scorecard with context recovery, reuse, review coverage, external evidence, test-first plan, artifact validity, execution handoff, and open-risk closure scores (tier 3 only; every score 9 or 10)

Tier 3 runs the bounded convergence loop in `references/plan-review-convergence.md` before `## Verdict`: `etrnl-spec-reviewer` → `etrnl-quality-reviewer` → `etrnl-adversary`, at most 3 cycles, stalling when the open-high count stops decreasing, every spawn explicit at `gpt-5.6-luna`/low per `scripts/lib/codex-model-routing.mjs`. A capped or stalled loop emits `Blocked until <specific blocker>`, and handoff then requires an owner override logged with `scripts/execution-ledger.mjs record-decision`. Tier 0–2 skip the loop.

The final plan must include a separate `## Verdict` section with one explicit outcome:
- Ready for execution
- Blocked until <specific blocker>

Do not ask whether to execute. The user can invoke `/etrnl-dev-execute` after approving the plan.
