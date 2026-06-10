---
name: etrnl-dev-autoplan
description: ETRNL planning companion for Claude Code. Use when the user asks to create an execution-ready implementation plan with task groups, dependencies, subagent candidates, verification gates, and explicit question policy.
---
# ETRNL Autoplan

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-autoplan`; on update, ask update/snooze/continue.

Create execution-ready plans for `/etrnl-dev-execute`. Do not implement the plan.

Default to completeness 10/10 for non-trivial work. Do not offer fast, reduced, MVP, or partial paths unless the user explicitly asks for a spike, prototype, or quick pass.

Every final plan must make execution scope machine-readable. Use `Execution scope: all_phases` by default. Use `Execution scope: first_patch_only` or an explicit subset only when the user asked for partial execution in that turn.

## Autoplan Depth Contract

Non-trivial autoplan work is a deep planning run, not a fast outline. The run must gather current context, run the review lanes, produce artifact evidence, and pass deterministic gates before any `Status: Final` output.

Mandatory stages:

1. Context recovery:
   - Read current repo state, relevant docs, existing plans, installed helper availability, and prior durable artifacts before drafting.
   - Record exact source paths, command outputs, and reused helpers in `Evidence:`.
2. Problem framing:
   - State the user goal, user-visible outcome, non-goals, constraints, and the highest-risk false premise.
   - Challenge the premise only through a recorded `Autoplan decision log` row.
3. Reuse inventory:
   - Search existing components, hooks, scripts, skills, tests, docs, agents, and helpers before naming new surfaces.
   - Record reuse decisions in the deep-stack artifact `reuseInventory` and plan `## What already exists`.
4. External evidence:
   - For tool, workflow, skill, hook, agent, or planning capability changes, ground public claims in current source, upstream docs, or user-provided evidence.
   - Keep raw notes outside tracked repo files.
5. Full review gauntlet:
   - Complete CEO/founder, engineering, design applicability, DX applicability, adversarial, specialist, reuse, and simplifier lanes.
   - Record role, inputs, findings, high/blocker status, disposition, and completion time in the deep-stack artifact.
6. Subagent and outside-voice routing:
   - For large plans, create read-only task packets for `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer`, or record a blocker/unavailable/not-applicable disposition.
   - Mark Codex, Gemini, Octopus, gstack design, GPT image/mock tooling, CodeGraph, Beads, and browser tooling as applicable, unavailable, or not-applicable with evidence.
7. Test-first and verification design:
   - Include red/green proof for source tasks, fixture coverage for workflow tasks, browser evidence for UI tasks, and install/canary gates for etrnl runtime changes.
   - Name exact commands and expected pass conditions in `## Verification gates`.
   - Use vertical slices for implementation tasks. Split any task that touches more than 8 files, crosses unrelated subsystems, or lacks one clear verification command.
8. Artifact creation:
   - Create the deep-stack artifact bundle with `node scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>`.
   - Fill blocked skeleton sections with real evidence before finalization.
   - Validate the plan with `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` and `node scripts/plan-readiness-check.mjs <plan-path>`.
9. Convergence:
   - Close, disprove, downgrade with evidence, or record explicit owner-accepted risk for every high/blocker finding.
   - Reconcile requested outcomes against `DONE`, `PARTIAL`, `NOT_DONE`, `CHANGED`, or `BLOCKED`.
10. Parity scorecard:
   - Add an `## Autoplan parity scorecard` subsection under `## Plan Readiness Report`.
   - Score context recovery, reuse, review coverage, external evidence, test-first plan, artifact validity, execution handoff, and open-risk closure from 0 to 10.
   - Final verdict requires every score at 9 or 10. Lower scores force `Blocked until <specific blocker>`.

## Full Deep Stack Review

Run the full review gauntlet before finalizing any non-trivial plan. Planning, autoplan, and review stay deep by default. Execution tiering is allowed only after deep review passes and the plan records a valid `Deep stack artifacts:` bundle.

1. CEO/founder review:
   - Validate the premise, user value, scope, 6-month regret, and better alternatives.
   - Record quick wins, rejected expansions, premise challenges, and user-direction conflicts.
2. Engineering review:
   - Validate architecture, data flow, failure modes, rollback, tests, parallelization, reuse, latency, install risk, and type boundaries.
   - Reuse `references/review-contract.md` instead of duplicating a long prompt.
3. Design review, when UI scope exists:
   - Check information hierarchy, interaction states, responsive behavior, accessibility, and existing design-system reuse.
   - Add a design/mock artifact slot when visuals would materially reduce ambiguity.
4. DX review, when developer-facing scope exists:
   - Check install, commands, docs, structured errors, staged install, upgrade path, rollback, cache/latency budgets, and time-to-first-success.
5. Adversarial review:
   - Reuse `/etrnl-dev-stress-test` posture.
   - Challenge the most likely false assumption, hidden coupling, verification gaps, and shareable-repo leakage.
6. Outside voices:
   - Use `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer` as read-only subagent candidates when scope is large enough.
   - If Codex, Gemini, Octopus, gstack design, or GPT image/mock tooling is installed, mark it as an applicable escalation path; report missing tools instead of silently skipping them.
7. Specialist convergence:
   - Run or explicitly disposition reuse, code-simplifier, code-review-excellence, advanced TypeScript, and domain-specific companion lanes.
   - Close, disprove, or explicitly user-accept every high/blocker finding before finalization.

## Hybrid Deep Stack Artifacts

Every non-trivial `Status: Final` plan must include `Deep stack artifacts: <relative-path>` and the referenced bundle must pass validation. Do not finalize a plan on transitional readiness.

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
4. Name disjoint write scopes and safe subagent candidates.
5. Include verification commands for each phase and the final gate.
6. For multi-session, multi-route, or multi-workstream plans, include conditional `Phase:`, `Workstream:`, and `UAT Gate:` metadata so `/etrnl-dev-execute` can record phase/UAT state in the ledger.
7. Do not include `## Immediate First Patch`, `## First Slice`, or similar partial-completion headings in a final all-phases plan. Express sequencing under `## Phases` instead.
8. Include failure modes, rollback notes, and non-scope.
9. Include the question policy:
   - auto-continue mechanical phases
   - ask only for destructive actions, scope expansion, missing credentials, conflicting user edits, repeated stalls, or subjective product/taste decisions
10. Include an autoplan decision log:
   - phase: CEO, Eng, Design, DX, Adversarial, Specialist, Convergence
   - decision
   - rationale
   - consensus or disagreement
   - artifact needed, if any
   - final gate category: none, taste, premise, destructive, user challenge
1. Include artifact requirements for execution:
   - `Deep stack artifacts: <path>` for every non-trivial final plan
   - `review-log.jsonl` when review findings are created
   - `browser-qa-report.json` when UI/browser behavior changes
   - context-save when work is long-running or likely to be resumed
1. The final plan must pass `node ~/.claude/scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` and `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>` before `/etrnl-dev-execute` starts. A result that says deep-stack metadata is absent is not a pass for a newly generated final plan; add the bundle and rerun the gate.
    Use the exact readiness-compatible headings in the Output section. Do not leave `TODO`, `TBD`, "handle edge cases", "wire it up", or "similar to above" in the plan.

## Task Packet Drafting

For each subagent candidate, include:

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
- for multi-file write scopes: reviewers, spec review requirement, quality review requirement, integration owner, and expected diff shape

## Output

Return or save a single implementation plan with this readiness-compatible shape:

- `Status: Final`
- `Execution scope: all_phases`
- `Goal:`
- `Evidence:`
- `Non-goals:`
- `Deep stack artifacts:` metadata for every non-trivial final plan.
- Conditional `Phase:`, `Workstream:`, and `UAT Gate:` metadata when the plan spans multiple phases, routes, or workstreams.
- `## What already exists`
- `## NOT in scope`
- `## File map`
- `## Task groups`
- `## Phases`
- `## Skill/tool routing`
- `## Test plan`
- `## Test-first execution plan`
- `## Failure modes`
- `## Parallelization strategy`
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
- Autoplan parity scorecard with context recovery, reuse, review coverage, external evidence, test-first plan, artifact validity, execution handoff, and open-risk closure scores

The final plan must include a separate `## Verdict` section with one explicit outcome:
- Ready for execution
- Blocked until <specific blocker>

Do not ask whether to execute. The user can invoke `/etrnl-dev-execute` after approving the plan.
