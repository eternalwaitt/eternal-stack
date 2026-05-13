# Changelog

## Unreleased

## v0.1.10 - 2026-05-13

- Reinject global/project `CLAUDE.md` context on every user prompt with a `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0` kill switch.
- Canonicalize installed hook commands during settings merge so `~/.claude` and absolute-home variants dedupe.
- Add `settings-audit.mjs --fix` and matcher-set compaction so overlapping hook matchers are deduped during install.
- Replace the legacy race-prone rate limiter with locked `cc-rate-limiter.sh` and migrate installed settings to it.
- Add first-failure context/repeated-failure blocking, debounced observer warnings, output-limiter denial, directory `Read` preflight, task-packet templates, and plan-readiness repair hints.

## v0.1.9 - 2026-05-12

- Add install-aware update metadata, startup drift checks, and Gstack-style local auto-update support for the Claude control plane.

## v0.1.8 - 2026-05-11

- Harden hook storm control-plane behavior with a shared command-classifier layer, state schema v2 auto-migration, command outcome tracking, and per-event batched state writes.
- Add one-time signed override tokens for safety-critical prod schema and secret-disclosure commands, including replay/fingerprint/expiry abuse protections.
- Switch subagent packet validation to structured JSON contracts with explicit `read-only` and `write` modes.
- Scope port checks to dev-server commands only, require review evidence before risky completion commands, and require migration evidence for schema-related completion claims.
- Add scrubbed replay fixtures plus `replay-hook-fixtures.mjs`, and expand hook tests with migration, override-token, degraded-mode, and structured-packet matrices.
- Add a top-10 competitor code-intelligence pipeline with pinned manifests, non-README evidence contracts, and parity scorecard/backlog generation for all `etrnl-*` skills.
- Require readiness-plan sections to include explicit verification gates and a standalone final `## Verdict` handoff.
- Require planning flows to document research-gating for new capability claims and keep `CHANGELOG.md`, `docs/skills.md`, and `docs/health-stack.md` synchronized for repo-owned workflow changes.

## v0.1.7 - 2026-05-10

- Add strict quality gates for real post-edit verification, test weakening, safety-removal edits, full-file complexity, file sprawl, repeated-edit bug memory, and second-pass review triggers.
- Block ownership-deflection language such as "pre-existing issue", "not from my changes", and "out of scope" when agents should fix or precisely block issues found during the work.
- Make `/etrnl-autoplan` emit plans that match `plan-readiness-check.mjs`, and make `/etrnl-execute` run that checker directly before edits.
- Add a skill-contract doctor gate and generated SessionStart skill hints so every repo-owned `/etrnl-*` skill stays documented, helper-backed, and installed consistently.
- Add skill behavior smoke coverage for readiness, ledger, browser QA, review log, context save/restore, task packet, wave, code-health, and prompt-budget helpers.
- Add Agent-OS execution support: local run ledger helpers, workflow health summaries, structured subagent task-packet validation, and `SubagentStop` recording.
- Install repo-owned `etrnl-*` agents by default and include rollback/doctor coverage for them.
- Add `/etrnl-autoplan` and upgrade `/etrnl-execute` with no-pause execution, task-packet fanout, reviewer roles, and ledger checks.
- Aggregate policy and complexity hook failures so agents can fix all detected issues in one pass.
- Add installer, ledger, task-packet, and aggregate-complexity test coverage.
- Upgrade ETRNL to completeness 10/10 defaults with autoplan gauntlet-lite review, wave execution, overlap checks, durable review/browser/context artifacts, and workflow-health artifact summaries.
- Add repo-owned scout, adversary, design, DX, and browser-QA agent templates plus `/etrnl-qa-browser`, `/etrnl-context-save`, and `/etrnl-context-restore`.
- Block completion claims when a planned browser/manual QA pass is still outstanding.
- Add deterministic changelog release hygiene checks to prevent release-branch work from lingering under `Unreleased`.
- Add port-guard: force local dev servers onto explicit checked ports so agents do not collide with occupied/default ports.
- Harden script guards for large hook payloads, state-file locking, parameterized silent catches, and dangerous filesystem paths outside the current project or temp dirs.
- Split workflow-tool coverage out of the hook harness, install source-style tests, exclude Python bytecode from installs, and add source-followed ShellCheck cleanup.
- Address CodeRabbit follow-up by symlinking installed legacy test entrypoints, guarding harness path helpers, and making changelog validation fail clearly for missing files or malformed semver tags.
- Finish CodeRabbit hardening for portable hook-input reads, `--json --quiet` inventory output, atomic rule installs, stable skill metadata assertions, and port-guard scan guidance.

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
