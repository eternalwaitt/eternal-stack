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

## v0.5.2

2026-06-16

### Added

- `.github/workflows/health.yml` — CI health workflow for rule export sync, hook tests, workflow tests, install/rollback tests, and doctor.
- `rules/eternal-saas/project/tcg-contract.md` — scoped TCG/card-domain contract rule module and generated Cursor export.

### Changed

- `scripts/sync-rule-exports.mjs` and `scripts/init-project-rules.sh` — manifest-driven rule sync now validates profile membership, generated Cursor exports, privacy overlays, and install-time Cursor checksums.
- `rules/eternal-saas/*` — rule host metadata now reflects Claude and Cursor support without claiming unsupported Codex nested context output.
- `skills/bundled/stripe-best-practices` — hardens Stripe guidance from advisory wording to explicit policy gates for API versions, payment-surface selection, test/migration expectations, and Connect settlement/dispute behavior.

### Fixed

- `scripts/install.sh` — validate source install inputs before any non-dry-run mutation.
- `hooks/cc-stop-verifier.sh`, `hooks/cc-pretooluse-guard.sh`, and `scripts/code-health-ledger-check.mjs` — close enforcement gaps for invalid Stop JSON, live hook writes, and prompt-only code-health audits.
- `scripts/update-check.mjs`, `scripts/skill-contract-check.mjs`, `scripts/tool-stack-check.mjs`, and `scripts/doctor.sh` — harden update trust, bundled skill contracts, pinned tool install specs, ShellCheck, privacy scanning, and rule export drift detection.

### Security

- `rules-manifest.json` and `scripts/doctor.sh` — remove tracked private project literals from the privacy gate and support gitignored local banned-token overlays with redacted diagnostics.

## v0.5.1

2026-06-11


### Fixed

- `scripts/init-project-rules.sh` — guard against unbound `--profile` value under `set -u`; implement profile-based filtering in `collect_modules()` so the `eternal-saas` profile correctly excludes `tcg-only` modules; add `.cursor/rules/` drift checks to `--check` mode.
- `docs/hooks.md` and `hooks/README.md` — add `text` language specifier to directory-tree code fences.
- `rules/eternal-saas/project/local-overrides.md` and `orpc.md` — add `text` language specifiers to unlabeled code fences.
- `templates/AGENTS.override.codex.md` — normalize byte-budget figure to `32768` and clarify template vs installed startup file descriptions.

### Changed

- `rules/eternal-saas/global/20-verify.md` — improve `pnpm sanity` comment wording.

### Added

- `README.md`, `AGENTS.md`, `docs/install.md` — navigation links for `docs/migration.md`, `docs/configuration.md`, and `docs/troubleshooting.md`.

## v0.5.0

2026-06-10

### Added

- `docs/hooks.md` and `hooks/README.md` — full hook reference: catalog table, lifecycle wiring, per-hook behavior, shared libraries.
- Hook catalog covers all `cc-*` entrypoints including `cc-rtk-rg-compat.sh` and `cc-hindsight-lesson.py`.
- Cross-host eternal-saas rule pack (`rules/eternal-saas/`) — 3 global + 15 project modules covering the full SaaS stack (Next.js, Prisma, oRPC, Better Auth, Onveloz, React 19, TypeScript, testing, and more).
- `rules-manifest.json` (schema v1) — canonical authority for module checksums, privacy `bannedTokens` gate, host metadata, and Codex nesting.
- `scripts/init-project-rules.sh` — installs the eternal-saas (or `eternal-saas-tcg`) pack into any target repo, writing `.claude/rules/eternal-saas/` and `.cursor/rules/eternal-saas/`; supports `--dry-run`, `--check` (drift/locally-modified classification), and `--force`.
- `scripts/sync-rule-exports.mjs` — maintainer tool to generate Cursor `.mdc` twins from source modules.
- `templates/AGENTS.global.md` — portable ~32-line cross-host agent baseline for Codex startup.
- `templates/AGENTS.override.codex.md` — Codex-specific startup deltas (no slash commands, no hooks, byte budget, skills path).
- `docs/rules.md` — cross-host rules reference: module catalog, host activation per tool, install and drift-check commands.
- `docs/adr/0003-exodia-cross-host-rules.md` — decision record for the Exodia cross-host rule architecture.
- Codex byte gate in `scripts/doctor.sh` — warns when `~/.codex/AGENTS.md` exceeds 75 % of the configured `project_doc_max_bytes` limit.
- Manifest assertions in `scripts/doctor.sh` — validates `rules-manifest.json` schema version, `bannedTokens` non-empty, and `rules/eternal-saas/global/` module count.
- Rollback now restores `rules/eternal-saas` global digest and backed-up Codex startup files (`AGENTS.md`, `AGENTS.override.md`).
- `scripts/lib/skill-lists.sh` now includes `init-project-rules.sh` in `INSTALL_SCRIPTS` so it deploys to both Claude and Codex homes.
- Prompt router extended: "prune AGENTS/claude/rules", "rule bloat", "AGENTS.md/CLAUDE.md too long", "trim AGENTS/CLAUDE.md", and "startup file/context too long" prompts now route to `etrnl-ops-agent-files`. Three new skill-triggering fixture cases added.
- Six private project pilots with the eternal-saas pack, each with project-specific `local-overrides.md`, pruned `AGENTS.md`, and removed old flat rule files.
- One private pilot `.gitignore` updated to track `.claude/rules/` while keeping local session state ignored.

### Changed

- `docs/skills.md` groups repo-owned skills by namespace (`dev`, `audit`, `ops`, `comm`) so ops workflows like disk cleanup sit apart from dev commands.
- `docs/guards.md` — guard reference with accurate default vs strict matrix and corrected `hooks/lib/` inventory.
- `docs/configuration.md` clarifies which hooks strict mode adds vs default install; documents eternal-saas pack paths and `rules-manifest.json`.
- `docs/eternal-stack-coverage.md` Rules row updated to cover cross-host pack, init script, manifest, sync tool, Codex byte gate, and reference.
- `docs/install.md` documents project rules install/check, profiles, `local-overrides.md` step, and updated rollback scope.
- README and AGENTS doc map add `docs/rules.md` entry.

### Fixed

- `scripts/plan-readiness-check.mjs` no longer flags hyphenated proper names such as the `example-agency` repo as a `TBD` placeholder; standalone `TBD` markers still fail (regression tests in `tests/test-workflow-tools.sh`).
- `scripts/update-check.mjs` now correctly marks `sync-rule-exports.mjs` as source-only (not installed) to prevent false drift failures.
- `scripts/update-check.mjs` renamed map includes `doctor.sh → doctor-etrnl.sh` to suppress stale-scripts drift false positives.

## v0.4.0

2026-06-10

### Added

- Bundled stack skills — policy, review, domain, auth, tenancy, payments — installed as part of the stack, not optional extras.
- Install and doctor checks that bundled skills stay in sync with source.

### Changed

- Public README and docs reframed for onboarding.
- Stack boundaries clarified: bundled skills are first-class Eternal Stack surface area.

### Security

- Public repository boundary: no private identity, credentials, transcripts, or local planning artifacts in tracked files.
