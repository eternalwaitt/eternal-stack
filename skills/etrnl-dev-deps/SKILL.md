---
name: etrnl-dev-deps
description: Dependency maintenance workflow for updates, audits, bot PR triage, security fixes, and version consolidation.
disable-model-invocation: true
---
# Deps

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-deps`; on update, ask update/snooze/continue.

Use compatibility-first dependency maintenance. Do not turn dependency work into a broad modernization pass unless Victor explicitly asks.

For detailed catalog, reporting, and rollback rules, load `references/catalogs-reporting-rollback.md` when a change touches multiple manifests, a dependency family, bot PRs, security alerts, or any lockfile.

## Modes

- `audit`: read-only dependency, vulnerability, and unused-package report.
- `upgrade`: targeted package update with install, migration, and verification.
- `bot-pr`: Dependabot, Renovate, or security-alert PR triage with CI/log evidence.
- `report`: read-only dependency health summary with next actions and no edits.

## Workflow

1. Inspect package manager, package-manager version, lockfile, workspace manifests, catalogs, overrides/resolutions, install command, existing dependency bots, and repo quality gates.
2. In `audit` or `report` mode, make no edits. Produce findings and next actions only.
3. Snapshot baseline state before upgrade edits: dirty worktree, changed dependency files, current versions, vulnerability scan, and the commands needed to restore touched manifests and lockfiles.
4. For bot PRs, read the PR body, changed manifests, lockfile diff, vulnerability notice, release notes, CI checks, and grouped-package rationale before editing.
5. Run the project's dependency vulnerability scan (`npm audit`, `pnpm audit`, `yarn audit`, GitHub Dependabot/CodeQL, Snyk, or ecosystem equivalent), fail on critical/high issues, and capture results in the upgrade record.
6. Read current changelog, migration notes, release notes, and official docs for major, security-sensitive, framework, auth, payment, build-tool, or TypeScript changes. Use Context7 or official docs for libraries whose behavior drifts.
7. Check related packages before changing versions: peer dependencies, `@types/*`, adapters, framework companions, eslint/tsconfig plugins, test helpers, generated clients, and packages that share one runtime contract.
8. Consolidate repeated external dependency versions into the repo's existing catalog or central version surface before updating scattered manifest literals. For pnpm workspaces, use `pnpm-workspace.yaml` `catalog` or named `catalogs` entries and `catalog:`/`catalog:<name>` manifest references instead of diverging package-level versions. For Yarn workspaces, use workspace constraints or the established central versions surface. For npm workspaces, keep version ranges consistent across package manifests or use the repo's root-level version policy.
9. Keep intentionally divergent versions explicit. Document the reason when a package cannot share the catalog because of framework, runtime, peer, or migration constraints.
10. Install dependencies with the repo package manager. Do not hand-edit lockfiles except for conflict resolution that the package manager cannot produce.
11. When Knip is configured, run it through the repo's configured command: check `package.json` scripts first, then use the project package manager (`npm run knip`, `pnpm knip`, `yarn knip`) or the repo's equivalent to detect unused dependencies, exports, files, and unused catalog entries. If Knip is unavailable, skip this check and document the limitation.
12. Fail on unused production dependencies. Record unused devDependencies for review by default; fail on unused devDependencies only when repo config sets `failOnUnusedDevDependencies` or `failOnAllKnipFindings`.
13. Use targeted upgrades. Broad upgrades require explicit user request, security evidence, or compatibility evidence.
14. Do not run `npm audit fix --force`, major upgrades, package-manager migration commands, global installs, or dependency removals without explicit approval.
15. If an upgrade breaks tests, typecheck, lint, build, or install, revert the specific package or catalog change, rerun the failing gate, and report the skipped package with the failure evidence.
16. Run tests, typecheck, lint, build, install/audit checks, and browser/runtime smoke checks when the dependency affects user-facing runtime behavior.
17. Document mode, packages changed, catalog decisions, lockfiles changed, migration notes, rollback command sequence, verification evidence, and residual compatibility risks.
