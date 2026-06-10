# Changelog

All notable changes to Eternal Stack are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `docs/hooks.md` and `hooks/README.md` — full hook reference: catalog table, lifecycle wiring, per-hook behavior, shared libraries.
- Hook catalog covers all `cc-*` entrypoints including `cc-rtk-rg-compat.sh` and `cc-hindsight-lesson.py`.

### Changed

- `docs/skills.md` groups repo-owned skills by namespace (`dev`, `audit`, `ops`, `comm`) so ops workflows like disk cleanup sit apart from dev commands.
- `docs/guards.md` — guard reference with accurate default vs strict matrix and corrected `hooks/lib/` inventory.
- `docs/configuration.md` clarifies which hooks strict mode adds vs default install.
- README, AGENTS, and install docs link the hooks guide and trim promotional phrasing.

### Fixed

- `scripts/plan-readiness-check.mjs` no longer flags hyphenated proper names such as the `agency-tbd` repo as a `TBD` placeholder; standalone `TBD` markers still fail (regression tests in `tests/test-workflow-tools.sh`).

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
