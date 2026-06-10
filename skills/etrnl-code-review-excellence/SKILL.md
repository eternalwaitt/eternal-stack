---
name: etrnl-code-review-excellence
description: ETRNL code review and excellence orchestrator. Use when the user asks for code excellence, code quality, maintainability, architecture quality, Brooks architecture audit, module layering, circular imports, codebase tour, type safety, error handling, correctness, test signal, dead code, or complexity audit.
---
# ETRNL Code Review Excellence

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-code-review-excellence`; on update, ask update/snooze/continue.

Single entry point for code-excellence review and Brooks-style structural audit. Load `references/routing.md` before choosing modules. Read only the reference files the task needs; do not preload the whole suite.

## Required Flow

1. Classify the request against `references/routing.md`.
2. Load the minimum reference set - one or two modules by default, at most three unless the user asks for a full excellence pass or a deep-audit envelope run.
3. State the loaded modules in the first reply (`Loaded: audit-checks, brooks-architecture`).
4. For `code-excellence` deep-audit category runs, load `references/audit-checks.md`, use the shared envelope from `etrnl-deep-audit`, and refuse completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` passes or a concrete blocker is recorded.
5. For whole-repo health with no-skips inventory, route to `etrnl-audit-code` instead of this skill.
6. For PR-level line review without structural scope, use `etrnl-dev-pr` and execution reviewers (`etrnl-spec-reviewer`, `etrnl-quality-reviewer`) instead of this skill.
7. Pull companion skills (`code-simplifier`, `finding-duplicate-functions`, legacy `brooks-audit`) only when the task crosses boundaries this repo does not already cover.

## Module Files

| Module | File |
| --- | --- |
| Deep-audit checks (`code-excellence`) | `references/audit-checks.md` |
| Brooks finding rules | `references/brooks-foundation.md` |
| Brooks architecture audit | `references/brooks-architecture.md` |
| Brooks onboarding tour | `references/brooks-onboarding.md` |

## Full-Pass Mode

When the user asks for full code review excellence, Brooks health, or structural plus line-quality audit, load every module in dependency-friendly order: brooks-foundation → brooks-architecture → audit-checks → brooks-onboarding only when onboarding or tour output is requested.
