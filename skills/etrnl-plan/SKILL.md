---
name: etrnl-plan
description: ETRNL control-plane file-backed planning workflow for Claude Code. Use when the user asks to "write a plan", "make an implementation plan", "turn this spec into tasks", "review/improve/finalize a plan", or plan multi-step work before implementation.
model: sonnet
effort: medium
paths:
  - "docs/plans/**"
  - "plans/**"
  - ".claude/plans/**"
---
# ETRNL Writing Plans

Create a plan file, review it, improve it, then finalize it. Do not put the full plan in chat unless the user explicitly asks for chat-only output.

## Flow

1. Confirm input maturity:
   - If there is only a vague idea, use `etrnl-brainstorm` first.
   - If a spec, issue, audit, or prior plan exists, read it and plan from that evidence.
2. Search for plan conventions:
   - Prefer an existing `docs/plans/`, `plans/`, `.claude/plans/`, or project-specific planning directory.
   - If none exists, create `docs/plans/<yyyy-mm-dd>-<slug>.md`.
3. Ground the plan:
   - Inspect relevant files, docs, configs, tests, scripts, runtime notes, and current git status.
   - Read prior session or memory evidence only when the user asks to recover earlier intent.
   - Separate verified repo facts from assumptions and open questions.
4. Draft the plan with `Status: Draft`.
5. Run the review pass against the same file.
6. Add a `Plan Readiness Report` section to the plan.
7. Run the deterministic readiness gate when available:
   - Source checkout: `node scripts/plan-readiness-check.mjs <plan-path> --allow-draft`
   - Installed Claude home: `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path> --allow-draft`
8. Fix every blocking review finding and readiness failure in the file.
9. Change status to `Final`.
10. Run the readiness gate again without `--allow-draft`.
11. Reply with only the plan path, blocking findings addressed, unresolved questions, and execution options.

## Required Plan Shape

Start every plan with:

```markdown
# <Feature or Change> Implementation Plan

Status: Draft

Goal: <one sentence>
Non-goals: <explicit exclusions>
Evidence: <files, commands, docs, runtime surfaces checked>
Assumptions: <only if still unresolved>
```

Then include:

- What already exists: existing code, scripts, flows, helpers, docs, or runtime surfaces that solve part of the problem.
- NOT in scope: considered work that is explicitly deferred, with one-line rationale.
- File map: exact files to create/modify/read, with each file's responsibility.
- Task groups by subsystem: group related tasks so one worker can keep context; mark independent groups that could run in parallel.
- Phases: setup, implementation, tests, docs, rollout, rollback, verification, completion criteria.
- Bite-sized steps: each step should be concrete enough to execute without guessing.
- Skill/tool routing: list required workflow skills and companion review passes.
- Test plan: code paths, user flows, error states, regressions, E2E/eval needs, and exact test files/commands.
- Failure modes: one realistic production failure per new codepath, with test/error-handling/user-message coverage.
- Parallelization strategy: sequential lanes versus independent workstreams, module ownership, dependencies, and conflict risks.
- Verification gates: exact commands or live checks, expected result, and stop condition.
- Rollback: how to undo risky or irreversible changes.
- Execution handoff: whether to use `etrnl-execute` inline or `etrnl-parallel` when the user explicitly asks for parallel agents.
- Plan Readiness Report: scope challenge, architecture review, code quality review, test review, performance review, failure modes, parallelization, unresolved questions, and final verdict.

## Review Pass

Before finalizing, review the draft for:

- Missing coverage against the spec, issue, audit, or user request.
- Missing reuse inventory or unnecessary rebuilt flows when existing code already solves part of the problem.
- Missing explicit non-goals, especially distribution, rollout, data migration, or live-install work that could silently disappear.
- Vague steps, placeholders, TODOs, or "handle edge cases" without details.
- Missing file paths, missing commands, or undefined functions/types.
- Tasks that cross too many subsystems and should be split.
- Risky actions without rollback or verification.
- Missing architecture, code quality, test, performance, failure-mode, or parallelization review.
- Missing ASCII diagram for non-trivial data flow, state machine, processing pipeline, or test coverage map.
- Missing repo/shareable/versioning boundaries when portability matters.
- Missing companion-skill passes from the original control-plane vision:
  - `eternal-best-practices` for tenant, money, auth, i18n, Prisma, soft-delete, and domain policy.
  - `code-simplifier` before final scoring or completion.
  - `finding-duplicate-functions` for dedupe/refactor-heavy work.
  - `brooks-audit`/Brooks health when installed and relevant.

If a companion skill is unavailable, do not silently continue. Record the missing skill, impact, and next step under `Unresolved questions` in the Plan Readiness Report. A missing domain-sensitive `eternal-best-practices` pass blocks finalization unless the user accepts the risk; `code-simplifier`, `finding-duplicate-functions`, and `brooks-audit` may be skipped only when unavailable or irrelevant, and the report must say why.

Use `references/plan-review-checklist.md` for the detailed review rubric when the plan is non-trivial.

## Plan Readiness Report

Every non-trivial plan must include this section before `Status: Final`:

```markdown
## Plan Readiness Report

- Scope Challenge: <reuse, smallest change set, complexity, distribution, deferred-work cross-check>
- Architecture Review: <boundaries, data flow, security, rollout, rollback>
- Code Quality Review: <DRY, error handling, over/under-engineering, diagrams>
- Test Review: <code paths, user flows, regressions, E2E/eval needs>
- Performance Review: <N+1, memory, caching, hot paths>
- Failure modes: <critical gaps or none>
- Parallelization: <lanes/conflicts or sequential>
- Unresolved questions: <none or exact blockers>
- Verdict: Ready for execution / Blocked until <specific issue>
```

If the readiness gate fails, patch the plan and rerun it. Do not hand off to `etrnl-execute` until the report exists, the gate passes, and the verdict is ready.

## Hard Rules

- Save the finalized plan to disk.
- Keep the chat response short.
- Do not invent files or APIs without repo evidence.
- Do not leave placeholders.
- Do not mark `Final` until review findings are fixed and `plan-readiness-check.mjs` passes when available.
