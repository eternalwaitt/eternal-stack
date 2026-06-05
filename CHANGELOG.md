# Changelog

## Unreleased

## v0.2.0

- Tighten `/etrnl-deps` with explicit audit/report read-only modes, catalog-first workspace version consolidation, related-package bundling, rollback command requirements, and dependency report fields.
- Rename `/etrnl-fix-issue` to `/etrnl-systematic-debugging` and fold in a stricter root-cause workflow with hypothesis ranking, evidence-first reproduction, instrumentation boundaries, failed-fix escalation, and legacy install cleanup.
- Complete the SkillsMP-driven P1/P2 ETRNL upgrades: add PR preflight, performance baseline, and disk-cleanup manifest helpers; register `/etrnl-security-audit`; add `prod-18-operability-prr`; enforce execution-wave drift, parallel packet critical-path/stop fields, documentation AI-context counters, browser QA trace/video/pageError evidence, and code-health risk hotspots.
- Sync repo-owned ETRNL skills and Codex runtime helpers into both Claude and Codex homes during install/update, with separate install metadata, rollback cleanup, and install-test coverage for Codex update prompts.
- Harden `/etrnl-autoplan` against shallow fast-plan runs with an explicit depth contract, full review/subagent/research parity requirements, deterministic final gates, and a required autoplan parity scorecard.
- Remove hard `model:`/`effort:` routing from repo-owned `etrnl-*` skills and enforce active-model inheritance in `skill-contract-check.mjs` to prevent slash-skill invocations from taking the wrong context-entitlement path.
- Register `/etrnl-deep-audit`, `/etrnl-production-readiness`, `/etrnl-performance-audit`, and `/etrnl-security-audit` as deep-audit skills with a shared category registry, artifact validator, fixture suite, and install/test coverage.
- Wire `/etrnl-ci-cd` into owned-skill install/discovery, prompt routing, trigger fixtures, docs, and parity-scorecard coverage as a canonical repo-owned skill.
- Introduce local tool-effectiveness measurement for CodeGraph, Beads, Codex imports, and hook-pattern signals, including deterministic keep/drop verdict fixtures, workflow-health projection, and a synthetic continuous-project config template.
- Enable CodeGraph/Beads bootstrap and update checks, including global MCP refresh, optional project-local `.codegraph`/`.beads` initialization, installed tool-stack health reporting, and per-skill advisory update prompts before requested `etrnl-*` skills run.

- Improve stop-hook completion classification so paused production handoffs and other explicit non-final status updates do not get blocked as unverified completion claims.
- Repair hook ergonomics around context and large edits: settings audit now removes legacy Stop handoff monitors that emit invalid context output, and the large-change guard honors recorded plan artifacts such as `.rulebook/PLANS.md`.
- Add quick-win runtime hardening from recent logs: preflight unscoped Serena searches and unbounded health JSON dumps, aggregate project buglog repeat-edit hints, and make local skill metadata validation opt-in at SessionStart.
- Harden script reliability after defensive Bash audit: clean up PreToolUse temp files, remove overlapping shell patterns, and bound Git child processes in script helpers.
- Bound `UserPromptSubmit` `CLAUDE.md` reinjection to once per session by default, document `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=always`, and add a scoped recovery hint for oversized Serena search output.
- Add the latest starred-agent stack research map and convert the highest-value findings into enforcement: parallel subagent lifecycle fields, executable task-group readiness checks, mandatory-rule mechanical gate validation, and optional CodeGraph/React Doctor/Brooks-Lint health-stack mappings.
- Add the Hybrid Deep Stack plan/review/execute contract: final plans validate `Deep stack artifacts:` through `deep-stack-check.mjs`, with source manifests, skill matrices, reuse inventories, review phase records, findings ledgers, completion audits, risk tiers, TypeScript trigger evidence, staged-install proof, and structured repair errors.
- Harden task packets, ledgers, and stop checks so multi-file source work is bound to implementation agents, spec/quality reviewers, reuse/TDD/simplifier/completion/install evidence, no-revert acknowledgement, overlap checks, packet hashes, and direct-parent-edit blocking unless a sequential-degraded blocker is recorded.
- Make planning and execution gates stricter: final plans require execution scope, test-first red/green plans, verification gates, verdict handoff, execution digest for oversized plans, explicit transitional deep-stack flags, UAT gates, and no ambiguous first-patch execution.
- Harden Claude/Codex session reliability: Codex RTK rewrites use `updatedInput`, unsafe `rg` forms proxy through RTK before execution, broad `.codex` scans are blocked, startup context reinjection is bounded, compact recovery records workflow breadcrumbs, and workflow-health reports stale runs, artifacts, UAT state, and next action.
- Add and harden VIVAZ email-triage workflows: `/email-triage`, `/etrnl-email-reply-quality`, provider-verified Inbox Zero gates, queue-ready-without-mutation support, reply queue completion checks, ML insight routing, draft quality gates, and dry-run/queue-before-verify blockers.
- Add documentation and code-health gates: `/etrnl-documentation-health`, deterministic comment-health counters, code-health inventory and ledger checks, shared audit exclusions, baseline-only completion blockers, and terminal findings requirements.
- Tighten `/etrnl-documentation-health` so final reports must prove source-truth freshness with recent commit/PR impact review, stale-reference searches, active plan/work-queue counters, all-docs coverage, and a hard block on `100/100` while stale, misleading, outdated, or unreviewed docs remain.
- Expand installed control-plane operations: rollback/update metadata, settings audit repair, strict hook templates, install-home doctor coverage, repo-owned agents, skill behavior smoke checks, replay fixtures, browser QA v2 matrix/hash validation, prompt-budget checks, changelog release hygiene, and post-upgrade canaries.
- Add safety and quality guards for sycophancy, ownership deflection, dangerous filesystem paths, secret/prod commands with signed override tokens, schema migration evidence, output-limiter pipes, large edits, file sprawl, stale verification, repeated failures, and dev-server port collisions.

## v0.1.6

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
