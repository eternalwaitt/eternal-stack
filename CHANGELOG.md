# Changelog

## Unreleased

## v0.1.6 - 2026-05-10

- Namespace repo-owned skills as `etrnl-*` and document the skill map.
- Add `/etrnl-brainstorm` for design/spec work before implementation planning.
- Make `/etrnl-plan` a file-backed draft-review-finalize workflow with a plan review rubric.
- Rename the plan execution skill to `/etrnl-execute` and migrate the short-lived `/etrnl-run-plan` alias during install.
- Expand `/etrnl-execute` into a phase-gated execution workflow.
- Strengthen `/etrnl-plan` and `/etrnl-review` with engineering-review gates for reuse, non-goals, coverage diagrams, failure modes, distribution, confidence scoring, and parallelization lanes.
- Add `plan-readiness-check.mjs` and require `/etrnl-plan` to pass it before a plan is marked final or handed to `/etrnl-execute`.
- Address CodeRabbit review findings across shared skill manifests, install rollback safety, review routing, plan readiness checks, dependency audits, and write-enforcement rules.
- Address follow-up CodeRabbit nits for rollback backup selection and plan readiness fixtures.
- Remove private identity wording from public repo hooks and skill descriptions.
- Extract the good-plan fixture and tighten code-health inventory validation/counts.
- Clarify private overlays, parallel conflict handling, tool-hook enforcement, and skill list ordering.
- Respect explicit code-health roots, strengthen rollback restore staging, and polish final CodeRabbit nits.
- Complete skill hints, tighten hook path schema handling, and add dependency unused-code checks.
- Compare verification timestamps as ISO epochs and broaden inventory classification.
- Add side-effect metadata to agent-file/fix skills and extract lockfile patterns.
- Clarify install docs, brainstorm artifact routing, companion docs, and doctor parsing/configuration.
- Polish skill naming, fallback behavior, and regex maintainability from CodeRabbit follow-up.
- Move legacy unprefixed skill folders into the install backup during updates.
- Add namespaced rules, public AGENTS/CLAUDE templates, rollback/test harness installation, coverage documentation, and companion skill routing.
- Harden SessionStart skill discovery, requested-skill evidence, stale-verification blocking, and domain-sensitive companion skill gates.
- Add `/etrnl-code-health`, `docs/health-stack.md`, and `scripts/code-health-inventory.mjs` for no-skips codebase audits with deterministic coverage.
- Ignore local Serena workspace state so agent tooling does not dirty shareable checkouts.

## v0.1.5

- Enforce evidence-before-agreement behavior across prompt routing, pre-tool checks, post-tool checks, and stop verification.
- Add a stable Hindsight lesson upsert for evidence-first correction behavior when Hindsight is configured.

## v0.1.4

- Merge observer hooks into existing Claude settings instead of replacing them.
- Add strict settings support for opt-in blocker hooks and doctor checks for strict hook registration.

## v0.1.3

- Add a PostToolUse sycophancy blocker for persistent sessions where assistant text is only visible after the first tool call.

## v0.1.2

- Block sycophantic agreement phrases before tool calls and at Stop.

## v0.1.1

- Add WebSearch and Hindsight canary scripts for strict local rollouts.

## v0.1.0

- Add hook libraries for JSON, paths, state, code policy, complexity, and preflight detection.
- Add PreToolUse guard, PostToolBatch observer, failure diagnosis, prompt routing, compact recovery, stop verification, and session cleanup hooks.
- Add 85-check fixture harness.
- Add install, update, uninstall, and doctor scripts.
- Add concise skill templates for commit, PR, test, issue fixing, dependency work, plan writing/execution, review, adversarial review, parallel fan-out, and agent file maintenance.
