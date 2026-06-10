# Changelog

All notable changes to Eternal Stack are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

### Changed

### Fixed

### Removed

### Security

### Deprecated

## v0.4.0

2026-06-10


### Added

- Vendor 21 bundled stack skills under `skills/bundled/` and sync them to Claude/Codex homes during install (`scripts/vendor-bundled-skills.sh`, `BUNDLED_SKILLS` in `scripts/lib/skill-lists.sh`).

### Changed

- Reframe stack boundaries: bundled policy/review/domain skills are part of Eternal Stack, not optional externals (`AGENTS.md`, `docs/skills.md`, `CREDITS.md`, `docs/eternal-stack-coverage.md`, `rules/etrnl/domains.md`).
- Install and doctor verify bundled skill trees from `skills/bundled/`; install dry-run fails when any bundled source is missing.
- Rollback restores bundled skills from install backup; `update-check.mjs` ignores maintainer-only `vendor-bundled-skills.sh`.

### Security

- Remove tracked execution plans, generated artifact bundles, and background evidence outputs from the public release tree.
- Keep local Cursor, Claude, gstack, Beads, planning, and evidence artifacts ignored; preserve `CHANGELOG.md` as public history while allowing a clean-root public branch.

## v0.3.0

2026-06-09

### Added

- Add `VERSION`, `docs/RELEASING.md`, `scripts/release.mjs`, and `CREDITS.md` for semver releases and public attribution.
- Add `etrnl-deep-audit-ux` as a standalone `ui-ux-product` deep-audit skill excluded from `all_registered` orchestration.
- Add bundled `references/categories/shared-reuse.md` and `references/categories/repo-hygiene.md` under `etrnl-deep-audit`.
- Add `references/orpc.md`, `references/prisma.md`, and `references/sql-optimization.md` to `etrnl-backend-patterns`, vendoring companion oRPC, Prisma, and SQL optimization guidance.
- Add Brooks modules (`brooks-foundation`, `brooks-architecture`, `brooks-onboarding`) under `etrnl-code-review-excellence/references/`.

### Changed

- Restructure `CHANGELOG.md` with Keep a Changelog categories, split `v0.2.0` history, and harden `changelog-release-check.mjs` against untagged top releases.
- Rewrite `README.md` for public GitHub onboarding and link release documentation.
- Align `AGENTS.md`, root `CLAUDE.md`, `templates/CLAUDE.md`, `docs/skills.md`, `docs/health-stack.md`, `docs/RELEASING.md`, and `docs/eternal-stack-coverage.md` for public-repo documentation hygiene; run `changelog-release-check.mjs --strict-unreleased` from `scripts/doctor.sh`.
- Rename `etrnl-audit` to `etrnl-deep-audit` and fold orchestrator-included category routing into one application deep-audit entry point.
- Collapse six `etrnl-backend-*` slash commands into `etrnl-backend-patterns` with on-demand `references/` modules.
- Rename `etrnl-audit-excellence` to `etrnl-code-review-excellence` as a thin orchestrator with on-demand review modules.
- Retire standalone `etrnl-dev-review` and `etrnl-dev-parallel` skills in favor of autoplan/execute reference contracts and execution reviewers.
- Demote `etrnl-audit-code` to user-only invocation.
- Update deep-audit registry version `2026-06-09.1`, prompt router, trigger fixtures, docs, and parity scorecard for the consolidated skill surface.

### Removed

- Remove retired `etrnl-backend-*`, `etrnl-audit-excellence`, `etrnl-dev-review`, `etrnl-dev-parallel`, and bundled UX/reuse/repo standalone skills from `OWNED_SKILLS`; add old names to `REMOVED_SKILLS` for install cleanup.

## v0.2.0

2026-06-09

### Added

- Rebrand the project to **Eternal Stack** with repo slug `eternal-stack`.
- Add six repo-owned `etrnl-backend-*` reference skills derived from SkillsMP backend source review, later collapsed into `etrnl-backend-patterns`.
- Add shareable `core` and `full` stack install profiles with manifests, Hindsight templates, profile validation, and raw Beads doctrine rejection.
- Add the ETRNL compact state layer with append-only local JSONL events, bounded `compact-handoff` recovery, and stale-verification Stop checks.
- Add first-class deep-audit skills for excellence, UX, reuse, repo hygiene, tooling, production, security, and performance.
- Add `/etrnl-audit-docs`, documentation comment-health counters, code-health inventory/ledger checks, and shared audit exclusions.
- Add private email-triage workflows: `/email-triage`, `/etrnl-comm-email-reply-quality`, Inbox Zero gates, and draft quality checks.
- Add Hybrid Deep Stack artifact contract validated by `deep-stack-check.mjs`.
- Add local tool-effectiveness measurement, CodeGraph/Beads bootstrap checks, and per-skill advisory update prompts.
- Add shared EAGAIN-safe stdin helper (`scripts/lib/read-stdin.mjs`) with regression tests wired into `doctor.sh`.
- Add parallel `doctor.sh` syntax checks via `--jobs` / `DOCTOR_JOBS`.
- Add trap-based temp-file cleanup (`hooks/lib/cleanup.sh`) and shared jq payload extraction (`hooks/lib/event-extract.sh`).
- Add starred-agent stack review and convert high-value findings into enforcement (parallel subagent lifecycle, executable task groups, mandatory-rule gates).

### Changed

- Migrate every `CLAUDE_CONTROL_PLANE_*` / `CONTROL_PLANE_*` variable and stdout marker to `ETRNL_*` with no legacy fallbacks.
- Migrate runtime data from `~/.claude/control-plane/` to `~/.claude/etrnl/` on install.
- Rename repo-owned ETRNL skills to the canonical `etrnl-dev-*`, `etrnl-audit-*`, `etrnl-ops-*`, and `etrnl-comm-*` taxonomy.
- Stop `update.sh` from resetting Claude settings: run `install.sh --preserve-settings`, and skip SessionStart auto-update on dirty checkouts unless `ETRNL_AUTO_UPDATE_DIRTY=1`.
- Preserve Claude Code `statusLine` during default install settings reset.
- Reset managed Claude Code `settings.json` to vanilla during install after backup, then apply the selected profile; add `--preserve-settings` for merge-in-place installs.
- Enable local auto-update by default on requested-skill and Codex skill-update paths; set `ETRNL_AUTO_UPDATE=0` to keep checks non-mutating.
- Sync health-stack, guards, troubleshooting, coverage, and README docs with stdin helper, doctor parallelism, hook shared libs, and sycophancy strict hook coverage.
- Harden public Eternal Stack health checks with config-driven private project redaction and strict workflow runtime doctor mode.
- Rename `/etrnl-fix-issue` to `/etrnl-systematic-debugging` with stricter root-cause workflow.
- Tighten `/etrnl-dev-autoplan` against shallow fast-plan runs with depth contract and autoplan parity scorecard.
- Tighten `/etrnl-dev-deps` with audit/report read-only modes, catalog-first consolidation, and rollback requirements.
- Remove hard `model:`/`effort:` routing from repo-owned `etrnl-*` skills; enforce active-model inheritance in `skill-contract-check.mjs`.
- Bound `UserPromptSubmit` `CLAUDE.md` reinjection to once per session by default; document `ETRNL_INJECT_CLAUDE_MD=always`.
- Harden Claude/Codex session reliability: Codex RTK rewrites use `updatedInput`, unsafe `rg` forms proxy through RTK, and compact recovery records workflow breadcrumbs.
- Make planning and execution gates stricter: final plans require execution scope, test-first plans, verification gates, and UAT gates.
- Harden task packets, ledgers, and stop checks for multi-file source work with packet hashes and direct-parent-edit blocking.
- Sync repo-owned ETRNL skills and Codex runtime helpers into both Claude and Codex homes during install/update.

### Fixed

- Fix false Hindsight "not installed" reports by detecting the plugin from `~/.claude/plugins/cache` when hook PATH lacks `claude`.
- Fix `update-check` treating `pluginInstalled` tools as missing via the wrong `installed` field.
- Improve stop-hook completion classification so paused production handoffs do not get blocked as unverified completion claims.
- Repair hook ergonomics: settings audit removes legacy Stop handoff monitors; large-change guard honors recorded plan artifacts such as `.rulebook/PLANS.md`.
- Harden script reliability: clean up PreToolUse temp files, remove overlapping shell patterns, and bound Git child processes in script helpers.

### Removed

- Remove legacy unprefixed skill folder routing in favor of `etrnl-*` namespace (install migrates old folders into backup).

## v0.1.6

2026-05-13

### Added

- Namespace repo-owned skills as `etrnl-*` and document the skill map.
- Add `/etrnl-dev-brainstorm`, `/etrnl-dev-plan`, and `/etrnl-dev-execute` with phase-gated execution workflow.
- Add `plan-readiness-check.mjs` and require `/etrnl-dev-plan` to pass it before final handoff.
- Add `/etrnl-audit-code`, `docs/health-stack.md`, and `scripts/code-health-inventory.mjs` for no-skips codebase audits.
- Add namespaced rules, public AGENTS/CLAUDE templates, rollback/test harness installation, and companion skill routing.

### Changed

- Strengthen `/etrnl-dev-plan` and `/etrnl-dev-review` with engineering-review gates for reuse, failure modes, and parallelization lanes.
- Rename plan execution skill to `/etrnl-dev-execute` and migrate short-lived `/etrnl-run-plan` alias during install.
- Harden SessionStart skill discovery, requested-skill evidence, stale-verification blocking, and domain-sensitive companion gates.
- Remove private identity wording from public repo hooks and skill descriptions.

### Fixed

- Address CodeRabbit review findings across skill manifests, install rollback safety, review routing, and write-enforcement rules.
- Respect explicit code-health roots, strengthen rollback restore staging, and polish doctor parsing/configuration.
- Ignore local Serena workspace state so agent tooling does not dirty shareable checkouts.

## v0.1.5

2026-05-12

### Added

- Enforce evidence-before-agreement behavior across prompt routing, pre-tool checks, post-tool checks, and stop verification.
- Add a stable Hindsight lesson upsert for evidence-first correction behavior when Hindsight is configured.

## v0.1.4

2026-05-11

### Changed

- Merge observer hooks into existing Claude settings instead of replacing them.

### Added

- Add strict settings support for opt-in blocker hooks and doctor checks for strict hook registration.

## v0.1.3

2026-05-10

### Added

- Add a PostToolUse sycophancy blocker for persistent sessions where assistant text is only visible after the first tool call.

## v0.1.2

2026-05-09

### Added

- Block sycophantic agreement phrases before tool calls and at Stop.

## v0.1.1

2026-05-08

### Added

- Add WebSearch and Hindsight canary scripts for strict local rollouts.

## v0.1.0

2026-05-07

### Added

- Add hook libraries for JSON, paths, state, code policy, complexity, and preflight detection.
- Add PreToolUse guard, PostToolBatch observer, failure diagnosis, prompt routing, compact recovery, stop verification, and session cleanup hooks.
- Add 85-check fixture harness.
- Add install, update, uninstall, and doctor scripts.
- Add concise skill templates for commit, PR, test, issue fixing, dependency work, plan writing/execution, review, adversarial review, parallel fan-out, and agent file maintenance.

