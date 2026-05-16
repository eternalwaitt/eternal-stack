# Plan Review Checklist

Use this checklist after the draft exists on disk.

## Scope Challenge

Answer these before reviewing tasks:

- What existing code, scripts, flows, helpers, docs, or runtime surfaces already solve each sub-problem?
- What is the smallest change set that achieves the user's stated goal?
- Does the plan touch more than 8 files or introduce more than 2 new services/classes? If yes, challenge the scope.
- Does the plan add a custom architecture pattern where the framework/runtime already has a boring built-in?
- Does `TODOS.md` or equivalent deferred-work tracking exist, and does it contain work that blocks or overlaps this plan?
- Is the plan doing the complete version, or a shortcut that only saves minutes with AI-assisted implementation?
- If the plan creates a distributable artifact, does it include build, publish, install/update, and target-platform work?

## Blocking Findings

Flag and fix before finalizing:

- Requirement from the source spec/request has no task.
- Existing code or workflow solves part of the problem, but the plan rebuilds it.
- The plan lacks a "What already exists" section.
- The plan lacks a "NOT in scope" section with explicit deferrals and rationale.
- Task cannot be executed without guessing.
- Step says "add tests", "handle errors", "wire it up", "similar to above", "TBD", "TODO", or equivalent vague language.
- File path is missing, wrong, or not grounded in the repo.
- Function, type, command, env var, or script name appears in later tasks before it is introduced or verified.
- Irreversible action has no rollback.
- Verification does not prove the user-visible outcome.
- A new artifact type lacks distribution/build/publish/install coverage.
- Task group mixes unrelated subsystems that require separate ownership.
- Non-trivial data flow, state machine, processing pipeline, or test map lacks an ASCII diagram.
- New codepaths lack realistic production failure modes.
- Test coverage omits code paths, user flows, error states, regressions, or E2E/eval needs.
- Required workflow skills or companion review passes are missing.
- Substantial implementation work lacks a `code-simplifier` pass before completion.
- Refactor/consolidation work lacks a duplicate-function/dedupe review.
- Domain-sensitive work lacks `eternal-best-practices` or a relevant domain skill route.

## Review Sections

Evaluate every non-trivial plan through these sections:

- Architecture: boundaries, dependency graph, data flow, scaling, auth/data access, rollout, rollback, distribution, and one failure scenario per new integration.
- Code quality: organization, DRY, error handling, over/under-engineering, stale diagrams, and complexity against the user's preferences.
- Tests: trace every changed code path and user flow; mark each as tested, gap, E2E-worthy, eval-worthy, or regression-critical.
- Performance: N+1 queries, memory, caching, slow paths, high-complexity operations, and unnecessary work in hot paths.

Use confidence scores for findings when reviewing existing code or a concrete diff:
`[P1] (confidence: 9/10) file:line - finding`.

## Test Coverage Diagram

For substantial plans, require an ASCII coverage map:

```text
CODE PATH COVERAGE
==================
[+] src/example.ts
    |
    +-- parseInput()
        +-- [TESTED] valid input - example.test.ts:12
        +-- [GAP] invalid input - add regression test

USER FLOW COVERAGE
==================
[+] Checkout flow
    |
    +-- [E2E] complete purchase
    +-- [GAP] double-submit while request is pending
```

Every gap must become a concrete plan task with test file, assertion, and command.

## Failure Modes

For each new codepath, list:

- Realistic production failure: timeout, null data, stale state, race, permission miss, partial deploy, bad config, or provider error.
- Test coverage: exact test or gap.
- Error handling: explicit behavior, not a silent fallback.
- User impact: clear recovery message or silent failure.

Critical gap: no test, no error handling, and silent user impact.

## Parallelization Strategy

If the plan has at least 2 independent workstreams, include:

- Dependency table with modules touched and dependencies.
- Parallel lanes grouped by module ownership.
- Execution order for parallel worktrees.
- Conflict flags when lanes touch the same module/directory.

If no useful split exists, write: `Sequential implementation, no parallelization opportunity.`

## Engineering Heuristics

Apply these as review instincts:

- Reuse before create.
- Boring by default; spend innovation only where it clearly buys user value.
- Incremental and reversible beats big-bang rewrite.
- Systems over heroes; the plan must survive a tired maintainer at 3am.
- Essential complexity only; challenge accidental complexity before adding abstractions.
- DX is product quality; painful local setup, slow CI, or unclear commands create bad software.
- Make the change easy, then make the easy change; avoid structural and behavioral churn in one step.

## Non-Blocking Findings

Record when evidence shows the issue exists:

- Step is larger than necessary.
- A task is safe for parallel execution.
- A better existing helper or convention is available.
- The plan reduces churn by reusing an existing test or fixture.
- Brooks health or audit modes add useful evidence where installed.

## Approval Rule

Approve when a competent worker can execute the plan from the file without chat history, and `plan-readiness-check.mjs` passes when available.
