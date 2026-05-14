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
Phase: <optional phase id for multi-phase work>
Workstream: <optional workstream id for split ownership>
UAT Gate: <optional UAT completion condition for browser/user-acceptance work>
```

Include `Status`, `Goal`, `Non-goals`, and `Evidence` as plain top-level key/value lines under the title (not `##` headings). Then add the required `##` section headings below.
`Phase`, `Workstream`, and `UAT Gate` are optional metadata. Use them only when the work spans multiple sessions, routes, workstreams, or user-acceptance/browser gates.

- `## What already exists`: existing code, scripts, flows, helpers, docs, or runtime surfaces that solve part of the problem.
- `## NOT in scope`: considered work that is explicitly deferred, with one-line rationale.
- `## File map`: exact files to create/modify/read, with each file's responsibility.
- `## Task groups`: group related tasks so one worker can keep context; mark independent groups that could run in parallel.
- `## Phases`: setup, implementation, tests, docs, rollout, rollback, verification, completion criteria.
- `## Skill/tool routing`: list required workflow skills and companion review passes.
- `## Test plan`: code paths, user flows, error states, regressions, E2E/eval needs, and exact test files/commands.
- `## Failure modes`: one realistic production failure per new codepath, with test/error-handling/user-message coverage.
- `## Parallelization strategy`: sequential lanes versus independent workstreams, module ownership, dependencies, and conflict risks.
- `## Verification gates`: exact commands or live checks, expected result, and stop condition.
- `## Rollback`: how to undo risky or irreversible changes.
- `## Execution handoff`: whether to use `etrnl-execute` inline or `etrnl-parallel` when the user explicitly asks for parallel agents.
- `## Plan Readiness Report`: scope challenge, architecture review, code quality review, test review, performance review, failure modes, parallelization, unresolved questions, and final verdict.
- `## Verdict`: explicit final go/no-go outcome (`Ready for execution` or `Blocked until ...`).

`## Verdict` remains a separate top-level section and must appear immediately after `## Plan Readiness Report`.

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
- Missing research flow inputs when the plan introduces new ETRNL skill or hook capabilities:
  - `docs/research/top10-lock.json` and `docs/research/capability-evidence.json` are generated by `node scripts/research-competitor-intel.mjs extract --manifest docs/research/top10-lock.json --repos-root <repos-dir> --out docs/research/capability-evidence.json --write-manifest`; derived docs/scorecard are refreshed via `node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research`.
  - Validate research inputs with `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json` and `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json` (or run `scripts/doctor.sh` for the bundled gate).
  - On a fresh clone with missing artifacts, fail with explicit messages (`docs/research/top10-lock.json missing`, `docs/research/capability-evidence.json missing`) and do not finalize silently.
  - `nextScan` staleness is enforced by the manifest validator (`validate-manifest`) and `scripts/doctor.sh`, not by `scripts/plan-readiness-check.mjs`; inspect `stalenessPolicy.nextScan` in `docs/research/capability-evidence.json`, or refresh with a new extract run (`--refresh-cadence-days <days>`) if cadence must change.
  - Each plan recommendation for a new capability must cite the parity gap or source row from the evidence file.
  - Plans without research grounding for new capabilities must include `research_flow: blocked — no evidence file` in `## Plan Readiness Report` -> `Unresolved questions` and require explicit user sign-off before `Status: Final`.
- Missing competitor matrix inputs for plans that overlap with documented competitor capabilities:
  - Reference `docs/research/top10-lock.json` if available, or name why no competitor analysis is needed.
- Missing companion-skill passes from the original control-plane vision:
  - `eternal-best-practices` for tenant, money, auth, i18n, Prisma, soft-delete, and domain policy.
  - `code-simplifier` before final scoring or completion.
  - `finding-duplicate-functions` for dedupe/refactor-heavy work.
  - `brooks-audit`/Brooks health when installed and relevant.

If a companion skill is unavailable, do not silently continue. Record the missing skill, impact, and next step under `## Plan Readiness Report` -> `Unresolved questions`. A missing domain-sensitive `eternal-best-practices` pass blocks finalization unless the user accepts the risk; `code-simplifier`, `finding-duplicate-functions`, and `brooks-audit` may be skipped only when unavailable or irrelevant, and the report must say why.

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
- Unresolved questions: <none or exact blockers; include `research_flow: auto-generated` OR `research_flow: manual — run node scripts/research-competitor-intel.mjs extract ...` OR `research_flow: blocked — no evidence file`>
- Verdict: Preliminary readiness verdict (final decision goes in `## Verdict`)
```

## Verdict

Final authoritative verdict: Ready for execution / Blocked until <specific issue>

This standalone verdict is intentionally duplicated from `## Plan Readiness Report` so executors can scan outcome quickly.

If the readiness gate fails, patch the plan and rerun it. Do not hand off to `etrnl-execute` until the report exists, the gate passes, and the verdict is ready.

## Hard Rules

- Save the finalized plan to disk.
- Keep the chat response short.
- Do not invent files or APIs without repo evidence.
- Do not leave placeholders.
- Do not mark `Final` until review findings are fixed and `plan-readiness-check.mjs` passes when available.
