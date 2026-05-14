---
name: etrnl-autoplan
description: ETRNL control-plane planning companion for Claude Code. Use when the user asks to create an execution-ready implementation plan with task groups, dependencies, subagent candidates, verification gates, and explicit question policy.
model: sonnet
effort: medium
---
# ETRNL Autoplan

Create execution-ready plans for `/etrnl-execute`. Do not implement the plan.

Default to completeness 10/10 for non-trivial work. Do not offer fast, reduced, MVP, or partial paths unless the user explicitly asks for a spike, prototype, or quick pass.

## Gauntlet-Lite Review

Run the review gauntlet before finalizing the plan:

1. CEO/founder review:
   - Validate the premise, user value, scope, 6-month regret, and better alternatives.
   - Gate only premise changes or user-direction challenges.
2. Engineering review:
   - Validate architecture, data flow, failure modes, rollback, tests, parallelization, and reuse.
   - Reuse `/etrnl-review` criteria instead of duplicating a long prompt.
3. Design review, when UI scope exists:
   - Check information hierarchy, interaction states, responsive behavior, accessibility, and existing design-system reuse.
   - Add a design/mock artifact slot when visuals would materially reduce ambiguity.
4. DX review, when developer-facing scope exists:
   - Check install, commands, docs, errors, upgrade path, rollback, and time-to-first-success.
5. Adversarial review:
   - Reuse `/etrnl-stress-test` posture.
   - Challenge the most likely false assumption, hidden coupling, verification gaps, and shareable-repo leakage.
6. Outside voices:
   - Prefer `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer` as read-only subagent candidates when scope is large enough.
   - If Codex, Gemini, Octopus, gstack design, or GPT image/mock tooling is installed, mark it as an optional escalation path; missing tools are reported, not silently skipped.

## Decision Policy

- Mechanical decision: auto-pick the most complete option.
- Blast-radius expansion: auto-include when it touches files already modified by the plan or direct importers and remains bounded.
- Taste decision: choose a recommended default, log it, and surface it in the final gate.
- User challenge: never auto-decide changes that contradict the user's explicit direction.
- Human-gate only premises, subjective taste, destructive actions, missing credentials, scope outside blast radius, or repeated stalls.

## Research Flow (required_process)

Before finalizing any plan for a capability or feature that competes with or parallels existing tools:

1. Confirm whether a research artifact already exists (`docs/research/top10-lock.json`, `docs/research/capability-evidence.json`, or equivalent). If present and within the `nextScan` window, cite it as evidence.
2. Verify the research pipeline entrypoint exists and is runnable before finalization (`node scripts/research-competitor-intel.mjs` with the relevant validate/generate command).
3. If no research artifact exists or it is expired, require generating fresh research artifacts via the repository research pipeline before finalizing the plan. Do not substitute web summaries for code-level evidence.
4. If the script is missing, execution fails, or dependencies are unavailable: mark the plan metadata as `research-pending` and record `research_failure` details (`error`, `timestamp`, and attempted evidence file paths under `docs/research/*`).
5. Default outcome is block finalization until fresh artifacts are produced. Finalization is only allowed with `risk_acknowledged: true` plus compensating rationale and references to `docs/research/etrnl-parity-backlog.md` or existing evidence rows.
6. For each plan recommendation that maps to a competitor capability, record the source row from the capability evidence file or name the explicit gap from the parity backlog.
7. Plans that propose new ETRNL skill or hook behaviors must cite at least one non-README code-level source from the evidence file, or name a gap from `docs/research/etrnl-parity-backlog.md`.

## Plan Requirements

1. Ground the plan in current repo evidence before proposing changes.
2. Identify existing files, helpers, hooks, scripts, tests, and docs to reuse.
3. Group work by subsystem and dependency.
4. Name disjoint write scopes and safe subagent candidates.
5. Include verification commands for each phase and the final gate.
6. For multi-session, multi-route, or multi-workstream plans, include optional `Phase:`, `Workstream:`, and `UAT Gate:` metadata so `/etrnl-execute` can record phase/UAT state in the ledger.
7. Include failure modes, rollback notes, and non-scope.
8. Include the question policy:
   - auto-continue mechanical phases
   - ask only for destructive actions, scope expansion, missing credentials, conflicting user edits, repeated stalls, or subjective product/taste decisions
9. Include an autoplan decision log:
   - phase: CEO, Eng, Design, DX, Adversarial
   - decision
   - rationale
   - consensus or disagreement
   - artifact needed, if any
   - final gate category: none, taste, premise, destructive, user challenge
10. Include artifact requirements for execution:
   - `review-log.jsonl` when review findings are created
   - `browser-qa-report.json` when UI/browser behavior changes
   - context-save when work is long-running or likely to be resumed
11. The final plan must pass `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path>` before `/etrnl-execute` starts.
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
- WebSearch guidance
- for multi-file write scopes: reviewers, spec review requirement, quality review requirement, integration owner, and expected diff shape

## Output

Return or save a single implementation plan with this readiness-compatible shape:

- `Status: Final`
- `Goal:`
- `Evidence:`
- `Non-goals:`
- Optional `Phase:`, `Workstream:`, and `UAT Gate:` metadata when the plan spans multiple phases, routes, or workstreams.
- `## What already exists`
- `## NOT in scope`
- `## File map`
- `## Task groups`
- `## Phases`
- `## Skill/tool routing`
- `## Test plan`
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
- Final recommendation inputs that justify the verdict section

The final plan must include a separate `## Verdict` section with one explicit outcome:
- Ready for execution
- Blocked until <specific blocker>

Do not ask whether to execute. The user can invoke `/etrnl-execute` after approving the plan.
