---
name: etrnl-dev-plan
description: Create or improve a file-backed implementation plan for Claude Code or Codex when the user asks to plan multi-step work, turn a spec into tasks, or review a plan.
paths:
  - ".claude/plans/**"
  - ".planning/**"
---
# Write an implementation plan

Create or improve a plan from current repository evidence. Save it in the project's established ignored planning location; prefer `.claude/plans/`, then `.planning/`, then another existing ignored project planning directory. Do not put generated task plans or private evidence bundles in tracked documentation unless requested.

## Workflow

1. If the request is only an idea, clarify the intended outcome using repository context where available; use the optional brainstorm capability only when exploration would help. For a spec, issue, audit, or prior plan, read it first. Do not require a separate approved spec before planning or implementing work the user already authorized.
2. Inspect relevant source, docs, tests, runtime surfaces, and current changes. Record evidence and distinguish facts from assumptions.
3. Resolve the explicit workflow axes with `scripts/workflow-contract.mjs` through the portable companion helper. Scope means impact footprint, not number of files. Do not create extra plan phases or review lanes beyond the resolved contract. Ask only when ambiguity materially changes scope or authorization.
4. Reuse existing code, scripts, checks, and capabilities before proposing new surfaces. For user-facing work, include the intended journey from a user's starting point through the main outcome and relevant error or recovery states. Keep task groups coherent and verification concrete. Include dependencies, ownership, failure handling, rollback, and non-goals when relevant.
5. Save a draft, review it against the request and repository evidence, fix material gaps, and mark it ready only when the appropriate readiness checks pass. Do not claim a validator ran unless it did.

## Plan shape

Use this compact structure for work that benefits from a written handoff:

```markdown
# <Change> Plan

Status: Draft
Execution scope: all_phases
Goal: <user-visible result>
Non-goals: <explicit exclusions>
Evidence: <source paths and checks inspected>
Assumptions: <unresolved assumptions, or none>
Workflow contract: <path to resolved contract JSON>

## What already exists
## File map
## Task groups
## Verification gates
## Failure modes and rollback
## Open questions
## Readiness report
## Verdict
```

Add `## Phases` only when the resolved contract requires program phases or sequencing materially benefits from them. Include a test-first plan when the contract's `tddEvidence` requirement is true. Add browser acceptance, rollout, migration, or install evidence only when those surfaces are in scope. Every task group should name its outcome, dependencies, affected paths, and a check that demonstrates completion.

Use `Execution scope: all_phases` unless the user explicitly narrowed the request. Do not silently replace the requested outcome with a demo, MVP, or first slice. If a concrete dependency blocks part of the scope, state it and plan the remaining authorized work.

The readiness report should state what was checked, significant risks or gaps, unresolved assumptions, and a clear `Ready` or `Blocked` verdict. A plan is guidance for execution; it does not authorize external effects or override the user's current instructions.

For helpers, use `node {{ETRNL_COMPANION}} run scripts/<helper>.mjs -- <arguments>`. In a source checkout use `node scripts/companion.mjs run --host <claude|codex> scripts/<helper>.mjs -- <arguments>`; this supplies a host context and does not install the stack.
