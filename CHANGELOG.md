# Changelog

## Unreleased

## v0.1.19 - 2026-05-17

- Block `etrnl-documentation-health` completion when a run writes or refreshes documentation/comment baselines as a substitute for remediation, unless baseline work was explicitly requested and recorded as blocked or accepted risk with an owner.
- Tighten the documentation-health skill contract so audit mode must return an actionable remediation ledger, while fix/execute mode must remediate or terminally dispose every finding instead of stopping at a debt ratchet.

## v0.1.18 - 2026-05-17

- Harden `etrnl-code-health` and `etrnl-documentation-health` completion gates so shallow reports, open action items, non-terminal findings, missing comment-health counters, and missing resolution plans block completion instead of passing as advisory summaries.
- Add a shared audit exclusion policy for code-health inventory, documentation comment health, research evidence extraction, and credential scans so dependency folders, build output, caches, generated files, worktrees, local agent state, logs, and `.audit` artifacts are listed or skipped with reasons instead of audited as source/docs findings.
- Tighten execute/parallel orchestration checks with stricter packet overlap detection, bound implementation/reviewer evidence, failed-check rejection, existing-artifact validation, and direct parent source-edit blocking unless the run is explicitly recorded as sequential degraded.

## v0.1.17 - 2026-05-16

- Add a deterministic `documentation-comment-health.mjs` scanner and require documentation-health reports to include TSDoc/JSDoc comment-health counters, blocking sampled-only comment-health claims unless the repo is explicitly not applicable.

## v0.1.16 - 2026-05-16

- Harden repo-owned ETRNL skills and reference docs from advisory phrasing into directive workflow contracts, and make `skill-contract-check.mjs` fail on soft directive language unless the text states an unavailable, not-applicable, or blocker path.

## v0.1.15 - 2026-05-16

- Add a machine-checkable `/etrnl-documentation-health` completion gate so shallow docs-health summaries are blocked unless they include inventory evidence, source-of-truth mapping, classifications, findings ledger dispositions, skipped-check reasons, scorecard, and validation.

## v0.1.14 - 2026-05-16

- Block `/etrnl-execute` source edits after malformed Agent/Task packets until a valid JSON-only implementation subagent packet succeeds, and recognize RTK-wrapped filtered `check-types` commands as quality evidence.

## v0.1.13 - 2026-05-16

- Add `/etrnl-documentation-health` as the documentation-health specialist for docs drift, ADR/runbook/API/runtime docs, AI context, and TSDoc/JSDoc audits with progressive-disclosure references and parallel review lanes.

## v0.1.12 - 2026-05-15

- Fix Claude Code session-friction found in the May 13-15 transcript audit: existing-file `Write` calls now read disk content before safety checks, prompt-wrapped task packets are accepted and recorded, planned write scopes can justify file-split sprawl, diagnostic verification tails are allowed for long logs, and large final plans require an execution digest or plan index.
- Harden completion/failure guidance with targeted `PostToolUseFailure` diagnostics and stricter email-triage stop checks for latest-thread state plus pre-existing action backlog evidence.

## v0.1.11 - 2026-05-14

- Enforce plan-execution completeness by requiring `Execution scope` in readiness checks, rejecting ambiguous final `Immediate First Patch` plans, routing active-plan shorthand into `/etrnl-execute`, and blocking completion without a task/phase ledger for requested plan execution.
- Fix PostToolBatch success detection for Claude Code payloads that omit top-level status fields, add an RTK `rg` compatibility prehook so unsafe `rg` forms route through `rtk proxy --ultra-compact rg` instead of broken `rtk grep` rewrites, and surface stale external hook conflicts such as pre-v4 `rtk-rewrite.sh` in settings audit output.

## v0.1.10 - 2026-05-13

- Add best-of-all-worlds quick wins from the GStack/GSD/Superpowers gap-closure plan: skill-trigger fixtures for every owned `etrnl-*` skill, `workflow-health status`/`status --json`, SessionStart workflow hints, compact timestamp/count recovery metadata, redacted `project-buglog suggest --json`, browser QA v2 matrix validation/migration, and installed browser-QA rejection canary coverage.
- Harden the next control-plane evidence path with screenshot-hash/provenance checks for complete browser QA v2 reports, task packet `taskId`/`lineageId` plus packet hashes, schema v2 execution ledger events/reviews, packet-bound write evidence checks, cwd-filtered workflow health, and cross-session project buglog hints.
- Add optional phase/workstream/UAT ledger metadata with `execution-ledger.mjs set-phase` and `record-uat`; open UAT findings now block ledger completion and appear in workflow-health status.
- Harden subagent orchestration so multi-file write task packets require spec/quality reviewer contracts, reviewer subagent calls are recorded separately, and `etrnl-execute` multi-file completion requires implementation plus spec and quality reviewer evidence.
- Expand install/update/rollback drift UX with settings-mode metadata, `update-check.mjs --explain`, installed skill/agent/stale-script drift counts, `uninstall.sh` installation, rollback removal/restoration of repo-owned skills/hooks/agents, and settings validation after rollback.
- Block `etrnl-execute` completion when a run changes multiple source files after the execute request without write-mode implementation subagent evidence, and harden the skill contract so parallel-safe waves require `etrnl-executor`/write-task workers or an explicit sequential-degraded blocker.
- Deny `plan-readiness-check.mjs --help` probes during execute startup so `/etrnl-execute` runs the readiness checker directly against the plan path.
- Reject completed browser QA reports unless they include real console and network summaries, so `etrnl-qa-browser` cannot validate unchecked UI evidence.
- Add a canonical best-of-all-worlds gap-closure plan for the larger GStack/GSD/Superpowers-inspired workflow upgrades that are too broad for a drive-by patch.
- Reinject global and project `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` context in Claude startup order on every `UserPromptSubmit` so Claude Code sessions keep active guidance even when the host does not reliably include it.
- Add `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0`, `CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS`, and `CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS` controls for prompt reinjection and context caps.
- Expand in-root markdown `@*.md` references from global/project startup files recursively up to five hops while skipping references outside the allowed global or project roots.
- Add doctor checks that keep control-plane startup files under 200 lines and ensure Claude wrappers import `AGENTS.md`.
- Canonicalize installed hook commands during settings merge so `~/.claude` and absolute-home variants dedupe.
- Add `settings-audit.mjs --fix` with matcher-set compaction, duplicate hook cleanup, legacy rate-limiter migration, and collision-safe temp writes.
- Replace the legacy race-prone `rate-limiter.sh` with locked repo-owned `cc-rate-limiter.sh`, bounded state rotation, warning debounce, and install-time migration.
- Add `PreToolUse` denial for directory `Read` calls so agents use inventory/search tools before bulk-reading directories.
- Add `PreToolUse` denial for shell output-limiter pipes so agents do not hide command output that hooks need to classify.
- Make local dev-server port guarding fail closed when the helper or Node runtime is unavailable instead of silently skipping the check.
- Add first-failure context and repeated-identical-failure blocking in `PostToolUseFailure` so agents pivot after the first diagnostic hint.
- Debounce `PostToolBatch` warning fingerprints so repeated observer guidance does not flood the session.
- Require `agent-task-packet-check.mjs --template read-only|write` to choose an explicit subagent mode before delegation.
- Add `plan-readiness-check.mjs --json` repair hints and `--explain` output for deterministic plan repair.
- Add installed `update-check.mjs` metadata and source-fingerprint drift detection for startup and manual update checks.
- Expand install verification around strict mode, installed-home doctor, installed update metadata, post-upgrade canary, and settings audit repair.
- Harden prompt-reference containment, AWS-secret redaction, browser-QA strict summaries, research refresh cadence, and shell command canonicalization from the CodeRabbit follow-up.
- Expand regression coverage to 181 hook checks and 149 workflow-tool checks for the current release.

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
