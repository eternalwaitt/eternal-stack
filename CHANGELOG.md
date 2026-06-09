# Changelog

## Unreleased

## v0.3.0

- Rename the project to **Eternal Stack** (repo slug `eternal-stack`). Clean break on environment variables: every `CLAUDE_CONTROL_PLANE_*` / `CONTROL_PLANE_*` variable and stdout marker is now `ETRNL_*`, with no legacy fallbacks. Runtime data under `~/.claude/control-plane/` (and the Codex equivalent) is migrated to `~/.claude/etrnl/` on install.
- Vendor a repo-owned backend reference suite as six `etrnl-backend-*` skills (`api`, `data`, `security`, `resilience`, `observability`, `architecture`), derived from the SkillsMP backend-development deep search and rewritten in directive voice; register them in `OWNED_SKILLS`, `docs/skills.md`, and the parity scorecard, with prompt-router triggers and skill-trigger fixtures.
- Stop update churn from resetting Claude settings: `update.sh` now runs `install.sh --preserve-settings`, and SessionStart auto-update skips when the source checkout is dirty unless `ETRNL_AUTO_UPDATE_DIRTY=1`.
- Fix false Hindsight "not installed" reports: detect the plugin from `~/.claude/plugins/cache` when hook PATH lacks `claude`, and stop `update-check` from treating `pluginInstalled` tools as missing via the wrong `installed` field.
- Enable local auto-update by default on requested-skill and Codex skill-update paths; set `ETRNL_AUTO_UPDATE=0` to keep those checks non-mutating.
- Sync health-stack, guards, troubleshooting, coverage, and README docs with stdin helper, doctor parallelism, hook shared libs, and sycophancy strict hook coverage.
- Add shared EAGAIN-safe stdin helper (`scripts/lib/read-stdin.mjs`) and refactor all stdin-reading scripts onto it, with `tests/test-read-stdin.sh` regression coverage wired into `doctor.sh`.
- Parallelize `doctor.sh` syntax checks and heavy test suites with `--jobs` / `DOCTOR_JOBS`, keeping deterministic result aggregation.
- Harden hot hooks with trap-based temp-file cleanup (`hooks/lib/cleanup.sh`) and shared jq payload extraction (`hooks/lib/event-extract.sh`) for Claude Code event drift resilience.
- Harden public Eternal Stack health checks with config-driven private project redaction, strict workflow runtime doctor mode, clean `shellcheck -x` coverage, and updated documentation for the new runtime health flags. `workflow-health.mjs doctor` now exits non-zero when the doctor payload is unhealthy, so callers that capture doctor output should guard the command substitution instead of assuming success.
- Rename repo-owned ETRNL skills to the canonical `etrnl-dev-*`, `etrnl-audit-*`, `etrnl-ops-*`, and `etrnl-comm-*` taxonomy and remove old slash alias routing.
- Expand the deep-audit registry to code excellence, UI/UX/product, production, security, performance, shared reuse, repo hygiene, and tooling ecosystem.
- Register `etrnl-audit-repo` and `etrnl-audit-tooling` in `scripts/lib/deep-audit-categories.mjs`, with health-stack docs for repo hygiene and tooling-ecosystem audit coverage.
- Add first-class audit skills for excellence, UX, reuse, repo hygiene, and tooling.
- Reset managed Claude Code `settings.json` to vanilla during install after backing it up, then apply the selected Eternal Stack profile; add `--preserve-settings` for deliberate merge-in-place installs.
- Add shareable `core` and `full` stack install profiles with profile manifests, Hindsight config templates, profile validation, full-profile bootstrap flags, Hindsight plugin/config posture checks, ETRNL-first lesson retention, and raw Beads doctrine rejection.
- Add the ETRNL compact state layer with append-only local JSONL events, bounded `compact-handoff` recovery, stale-verification Stop checks, privacy-reject fixtures, staged install assertions for synchronous compact restore, and explicit Beads backlog-only/Dolt projection boundaries.
- Tighten `/etrnl-dev-deps` with explicit audit/report read-only modes, catalog-first workspace version consolidation, related-package bundling, rollback command requirements, and dependency report fields.
- Rename `/etrnl-fix-issue` to `/etrnl-systematic-debugging` and fold in a stricter root-cause workflow with hypothesis ranking, evidence-first reproduction, instrumentation boundaries, failed-fix escalation, and legacy install cleanup.
- Complete the SkillsMP-driven P1/P2 ETRNL upgrades: add PR preflight, performance baseline, and disk-cleanup manifest helpers; register `/etrnl-audit-security`; add `prod-18-operability-prr`; enforce execution-wave drift, parallel packet critical-path/stop fields, documentation AI-context counters, browser QA trace/video/pageError evidence, and code-health risk hotspots.
- Sync repo-owned ETRNL skills and Codex runtime helpers into both Claude and Codex homes during install/update, with separate install metadata, rollback cleanup, and install-test coverage for Codex update prompts.
- Harden `/etrnl-dev-autoplan` against shallow fast-plan runs with an explicit depth contract, full review/subagent/research parity requirements, deterministic final gates, and a required autoplan parity scorecard.
- Remove hard `model:`/`effort:` routing from repo-owned `etrnl-*` skills and enforce active-model inheritance in `skill-contract-check.mjs` to prevent slash-skill invocations from taking the wrong context-entitlement path.
- Register `/etrnl-audit`, `/etrnl-audit-production`, `/etrnl-audit-performance`, and `/etrnl-audit-security` as deep-audit skills with a shared category registry, artifact validator, fixture suite, and install/test coverage.
- Wire `/etrnl-dev-ci` into owned-skill install/discovery, prompt routing, trigger fixtures, docs, and parity-scorecard coverage as a canonical repo-owned skill.
- Introduce local tool-effectiveness measurement for CodeGraph, Beads, Codex imports, and hook-pattern signals, including deterministic keep/drop verdict fixtures, workflow-health projection, and a synthetic continuous-project config template.
- Enable CodeGraph/Beads bootstrap and update checks, including global MCP refresh, optional project-local `.codegraph`/`.beads` initialization, installed tool-stack health reporting, and per-skill advisory update prompts before requested `etrnl-*` skills run.
- Make local Eternal Stack repair opt-out during startup update checks; set `ETRNL_AUTO_UPDATE=0` to keep checks non-mutating.

- Improve stop-hook completion classification so paused production handoffs and other explicit non-final status updates do not get blocked as unverified completion claims.
- Repair hook ergonomics around context and large edits: settings audit now removes legacy Stop handoff monitors that emit invalid context output, and the large-change guard honors recorded plan artifacts such as `.rulebook/PLANS.md`.
- Add quick-win runtime hardening from recent logs: preflight unscoped Serena searches and unbounded health JSON dumps, aggregate project buglog repeat-edit hints, and make local skill metadata validation opt-in at SessionStart.
- Harden script reliability after defensive Bash audit: clean up PreToolUse temp files, remove overlapping shell patterns, and bound Git child processes in script helpers.
- Bound `UserPromptSubmit` `CLAUDE.md` reinjection to once per session by default, document `ETRNL_INJECT_CLAUDE_MD=always`, and add a scoped recovery hint for oversized Serena search output.
- Add the latest starred-agent stack research map and convert the highest-value findings into enforcement: parallel subagent lifecycle fields, executable task-group readiness checks, mandatory-rule mechanical gate validation, and optional CodeGraph/React Doctor/Brooks-Lint health-stack mappings.
- Add the Hybrid Deep Stack plan/review/execute contract: final plans validate `Deep stack artifacts:` through `deep-stack-check.mjs`, with source manifests, skill matrices, reuse inventories, review phase records, findings ledgers, completion audits, risk tiers, TypeScript trigger evidence, staged-install proof, and structured repair errors.
- Harden task packets, ledgers, and stop checks so multi-file source work is bound to implementation agents, spec/quality reviewers, reuse/TDD/simplifier/completion/install evidence, no-revert acknowledgement, overlap checks, packet hashes, and direct-parent-edit blocking unless a sequential-degraded blocker is recorded.
- Make planning and execution gates stricter: final plans require execution scope, test-first red/green plans, verification gates, verdict handoff, execution digest for oversized plans, explicit transitional deep-stack flags, UAT gates, and no ambiguous first-patch execution.
- Harden Claude/Codex session reliability: Codex RTK rewrites use `updatedInput`, unsafe `rg` forms proxy through RTK before execution, broad `.codex` scans are blocked, startup context reinjection is bounded, compact recovery records workflow breadcrumbs, and workflow-health reports stale runs, artifacts, UAT state, and next action.
- Add and harden private email-triage workflows: `/email-triage`, `/etrnl-comm-email-reply-quality`, provider-verified Inbox Zero gates, queue-ready-without-mutation support, reply queue completion checks, ML insight routing, draft quality gates, and dry-run/queue-before-verify blockers.
- Add documentation and code-health gates: `/etrnl-audit-docs`, deterministic comment-health counters, code-health inventory and ledger checks, shared audit exclusions, baseline-only completion blockers, and terminal findings requirements.
- Tighten `/etrnl-audit-docs` so final reports must prove source-truth freshness with recent commit/PR impact review, stale-reference searches, active plan/work-queue counters, all-docs coverage, and a hard block on `100/100` while stale, misleading, outdated, or unreviewed docs remain.
- Expand installed Eternal Stack operations: rollback/update metadata, settings audit repair, strict hook templates, install-home doctor coverage, repo-owned agents, skill behavior smoke checks, replay fixtures, browser QA v2 matrix/hash validation, prompt-budget checks, changelog release hygiene, and post-upgrade canaries.
- Add safety and quality guards for sycophancy, ownership deflection, dangerous filesystem paths, secret/prod commands with signed override tokens, schema migration evidence, output-limiter pipes, large edits, file sprawl, stale verification, repeated failures, and dev-server port collisions.

## v0.1.6

- Namespace repo-owned skills as `etrnl-*` and document the skill map.
- Add `/etrnl-dev-brainstorm` for design/spec work before implementation planning.
- Make `/etrnl-dev-plan` a file-backed draft-review-finalize workflow with a plan review rubric.
- Rename the plan execution skill to `/etrnl-dev-execute` and migrate the short-lived `/etrnl-run-plan` alias during install.
- Expand `/etrnl-dev-execute` into a phase-gated execution workflow.
- Strengthen `/etrnl-dev-plan` and `/etrnl-dev-review` with engineering-review gates for reuse, non-goals, coverage diagrams, failure modes, distribution, confidence scoring, and parallelization lanes.
- Add `plan-readiness-check.mjs` and require `/etrnl-dev-plan` to pass it before a plan is marked final or handed to `/etrnl-dev-execute`.
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
- Add `/etrnl-audit-code`, `docs/health-stack.md`, and `scripts/code-health-inventory.mjs` for no-skips codebase audits with deterministic coverage.
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
