---
name: etrnl-dev-plan
description: ETRNL file-backed planning workflow for Claude Code. Use when the user asks to "write a plan", "make an implementation plan", "turn this spec into tasks", "review/improve/finalize a plan", or plan multi-step work before implementation.
paths:
  - ".claude/plans/**"
  - ".planning/**"
---
# ETRNL Writing Plans

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-plan`; on update, ask update/snooze/continue.

Create a plan file, review it, improve it, then finalize it. Do not put the full plan in chat unless the user explicitly asks for chat-only output.

## Flow

1. Confirm input maturity:
   - If there is only a vague idea, use `etrnl-dev-brainstorm` first.
   - If a spec, issue, audit, or prior plan exists, read it and plan from that evidence.
2. Search for plan conventions:
   - Use an existing local planning directory in this order: `.claude/plans/`, `.planning/`, then project-specific ignored planning directories.
   - If none exists, create `.claude/plans/<yyyy-mm-dd>-<slug>.md`.
   - Do not put generated plans or artifact bundles in tracked repository docs.
3. Ground the plan:
   - Inspect relevant files, docs, configs, tests, scripts, runtime notes, and current git status.
   - Read prior session or memory evidence only when the user asks to recover earlier intent.
   - Separate verified repo facts from assumptions and open questions.
4. Draft the plan with `Status: Draft`.
5. Run the review pass against the same file.
6. Add a `Plan Readiness Report` section to the plan.
7. Create or update the deep-stack artifact bundle before finalization:
   - Source checkout: `node scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>`
   - Installed Claude home: `node ~/.claude/scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>`
   - Replace skeleton placeholders with real review phase records, source, skill, reuse, findings, TDD, completion reconciliation, risk-tier, TypeScript trigger, and install-proof evidence.
8. Run the deterministic readiness gate when available:
   - Source checkout: `node scripts/plan-readiness-check.mjs <plan-path> --allow-draft`
   - Installed Claude home: `node ~/.claude/scripts/plan-readiness-check.mjs <plan-path> --allow-draft`
9. Fix every blocking review finding and readiness failure in the file.
10. Change status to `Final`.
11. Run the readiness gate again without `--allow-draft`; if it reports missing deep-stack artifacts, the plan is not final.
12. Reply with only the plan path, blocking findings addressed, unresolved questions, and execution options.

## Required Plan Shape

Start every plan with:

```markdown
# <Feature or Change> Implementation Plan

Status: Draft

Execution scope: all_phases
Goal: <one sentence>
Non-goals: <explicit exclusions>
Evidence: <files, commands, docs, runtime surfaces checked>
Assumptions: <only if still unresolved>
Phase: <conditional phase id for multi-phase work>
Workstream: <conditional workstream id for split ownership>
UAT Gate: <conditional UAT completion condition for browser/user-acceptance work>
Deep stack artifacts: <relative path to deep-stack artifact bundle>
```

Include `Status`, `Execution scope`, `Goal`, `Non-goals`, and `Evidence` as plain top-level key/value lines under the title (not `##` headings). Then add the required `##` section headings below.
`Execution scope` must be one of `all_phases`, `first_patch_only`, or an explicit subset such as `phase_1_phase_2_only`. Use `all_phases` by default. Do not use `first_patch_only` unless the user explicitly asks for a spike, prototype, first slice, or partial execution.
`Phase`, `Workstream`, and `UAT Gate` are conditional metadata. Include them only when the work spans multiple sessions, routes, workstreams, or user-acceptance/browser gates.
`Deep stack artifacts` is mandatory for every non-trivial `Status: Final` plan. Existing historical plans can be checked only with the explicit legacy transition flag; newly generated final plans must never rely on transitional readiness. The referenced artifact bundle must pass validation before finalization or execution:

```bash
node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>
# or, after install:
node ~/.claude/scripts/deep-stack-check.mjs validate-plan --plan <plan-path>
```

- `## What already exists`: existing code, scripts, flows, helpers, docs, or runtime surfaces that solve part of the problem.
- `## NOT in scope`: considered work that is explicitly deferred, with one-line rationale.
- `## File map`: exact files to create/modify/read, with each file's responsibility.
- `## Task groups`: group related tasks so one worker can keep context; each group lists `Owner:`, `Dependencies:`, `Acceptance criteria:`, and `Verification:`; mark independent groups eligible for parallel execution.
- `## Task sizing and slices`: use vertical slices that produce testable behavior; split any task that touches more than 8 files, crosses unrelated subsystems, or lacks one clear verification command.
  Sizing note: `more than 8 files` is an Eternal Stack heuristic from prior repo-hardening runs, not a universal limit. Other skill docs must point to this line when they reuse the threshold, and repos with smaller ownership boundaries must tighten it.
- `## Phases`: setup, implementation, tests, docs, rollout, rollback, verification, completion criteria.
- `## Skill/tool routing`: list required workflow skills and companion review passes.
- `## Test plan`: code paths, user flows, error states, regressions, E2E/eval needs, and exact test files/commands.
- `## Test-first execution plan`: failing tests or executable bug probes to run before implementation, the green criteria after the fix, and explicit rationale for any item that cannot be tested first.
- `## Failure modes`: one realistic production failure per new codepath, with test/error-handling/user-message coverage.
- `## Parallelization strategy`: sequential lanes versus independent workstreams, module ownership, dependencies, and conflict risks.
- `## Verification gates`: exact commands or live checks, expected result, and stop condition.
- `## Rollback`: how to undo risky or irreversible changes.
- `## Execution handoff`: whether to use `etrnl-dev-execute` inline and its parallel-fanout contract when the user explicitly asks for parallel agents.
- `## Plan Readiness Report`: scope challenge, architecture review, code quality review, test review, performance review, failure modes, parallelization, unresolved questions, and final verdict.
- `## Verdict`: explicit final go/no-go outcome (`Ready for execution` or `Blocked until ...`).

`## Verdict` remains a separate top-level section and must appear immediately after `## Plan Readiness Report`.

## Review Pass

Before finalizing, review the draft for:

- Missing coverage against the spec, issue, audit, or user request.
- Missing reuse inventory or unnecessary rebuilt flows when existing code already solves part of the problem.
- Missing explicit non-goals, especially distribution, rollout, data migration, or live-install work at risk of silently disappearing.
- Missing or narrowed `Execution scope`. A plan the user is likely to ask someone to "implement" must default to `all_phases`.
- Ambiguous partial-execution headings such as `## Immediate First Patch`, `## First Slice`, or language that implies later phases are conditional without setting `Execution scope: first_patch_only`.
- Vague steps, placeholders, TODOs, or "handle edge cases" without details.
- Missing file paths, missing commands, or undefined functions/types.
- Tasks that cross too many subsystems and must be split.
- Oversized tasks: more than 8 files, more than 2 unrelated subsystems, or no single verification command.
- Risky actions without rollback or verification.
- Missing architecture, code quality, test, performance, failure-mode, or parallelization review.
- Missing test-first execution plan. A non-trivial implementation plan must name the red test/probe before code changes and the green gate after implementation.
- Missing ASCII diagram for non-trivial data flow, state machine, processing pipeline, or test coverage map.
- Missing repo/shareable/versioning boundaries when portability matters.
- Mandatory behavior without a named validator skill-contract-check.mjs, hook, script, ledger command, or mechanical gate.
- Missing external evidence when a plan introduces new public capabilities:
  - Use live docs, upstream source, or user-provided context as evidence.
  - Keep background notes local or attach them outside the tracked repository.
  - Do not require or create tracked evidence artifacts.
- Missing companion-skill passes from the original Eternal Stack vision:
  - `eternal-best-practices` for tenant, money, auth, i18n, Prisma, soft-delete, and domain policy.
  - `code-simplifier` before final scoring or completion.
  - `finding-duplicate-functions` for dedupe/refactor-heavy work.
  - `etrnl-code-review-excellence`/Brooks modules when structural or excellence review is in scope.
- Missing Hybrid Deep Stack artifacts:
  - sanitized source manifest, no `/tmp`, home paths, transcripts, account material, or secrets
  - skill activation matrix, including ordinary TypeScript verification and conditional advanced TypeScript review
  - reuse inventory before any new helper, script, skill, or docs surface
  - review phase records for CEO, engineering, DX, adversarial, specialist, reuse, and simplifier passes
  - TDD evidence rows for source tasks, or explicit not-test-first rationale
  - reuse binding rows for every new surface, with searched paths, analogs, decision, and justification
  - TypeScript trigger evidence when exported/public contracts, schemas, state machines, DTO boundaries, or reusable type utilities are touched
  - completion reconciliation rows mapping every requested outcome to `DONE`, `PARTIAL`, `NOT_DONE`, `CHANGED`, or `BLOCKED`
  - install proof rows for source gate, staged install, staged doctor/canary, rollback verification, live-install decision, and post-upgrade canary when Tier 3 behavior is touched
  - findings ledger with high/blocker findings closed, disproven, or explicitly owner-accepted
  - completion audit and Hybrid execution risk tier
  Deep-stack artifacts are required for every newly generated final plan; they are not opt-in metadata.

If a companion skill is unavailable, do not silently continue. Record the missing skill, impact, and next step under `## Plan Readiness Report` -> `Unresolved questions`.

Companion skill enforcement:

- `eternal-best-practices` for auth, money, tenant, i18n, Prisma, soft-delete, permissions, and domain policy: a missing pass blocks finalization unless the user explicitly accepts the risk because these are critical security and data boundaries.
- `code-simplifier` and `finding-duplicate-functions`: omit only when unavailable or irrelevant, and the report must document why. Brooks structural review is owned by `etrnl-code-review-excellence` when installed.

## Advanced TypeScript Policy

Every TypeScript plan records the ordinary TypeScript verification command. Use `../common/typescript-triggers.md` for advanced TypeScript review trigger conditions. Otherwise record `typescript-advanced-types: not_applicable` with rationale.

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
- Verdict: Preliminary readiness verdict (final decision goes in `## Verdict`)
```

## Verdict

Final authoritative verdict: Ready for execution / Blocked until <specific issue>

This standalone verdict is intentionally duplicated from `## Plan Readiness Report` so executors can scan outcome quickly.

If the readiness gate fails, patch the plan and rerun it. Do not hand off to `etrnl-dev-execute` until the report exists, the gate passes, and the verdict is ready.

## Hard Rules

- Save the finalized plan to disk.
- Keep the chat response short.
- Do not invent files or APIs without repo evidence.
- Do not leave placeholders.
- Do not put `## Immediate First Patch` in a `Status: Final` plan unless `Execution scope: first_patch_only` is intentional and explicitly user-approved.
- Do not let minimal-diff language narrow an implementation plan. If the repository owner later asks to "implement the plan", the executor must complete every item inside `Execution scope` or stop with a concrete blocker.
- Do not mark `Final` until review findings are fixed and `plan-readiness-check.mjs` passes when available.
