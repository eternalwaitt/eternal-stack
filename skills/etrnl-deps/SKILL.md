---
name: etrnl-deps
description: ETRNL control-plane dependency maintenance workflow for Claude Code. Use only when the user explicitly asks to update dependencies; hidden from model auto-invocation.
disable-model-invocation: true
---
# Deps

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-deps`; on update, ask update/snooze/continue.

Use compatibility-first dependency maintenance. Do not turn dependency work into a broad modernization pass unless Victor explicitly asks.

## Modes

- `audit`: read-only dependency, vulnerability, and unused-package report.
- `upgrade`: targeted package update with install, migration, and verification.
- `bot-pr`: Dependabot, Renovate, or security-alert PR triage with CI/log evidence.

## Workflow

1. Inspect package manager, lockfile, workspace manifests, catalogs, overrides/resolutions, package manager version, and install command.
2. If the repo uses pnpm workspaces with a `pnpm-workspace.yaml` catalog, update shared dependency versions in the catalog instead of individual `package.json` files.
3. For bot PRs, read the PR body, changed manifests, lockfile diff, vulnerability notice, release notes, and CI checks before editing.
4. Run the project's dependency vulnerability scan (`npm audit`, `pnpm audit`, `yarn audit`, GitHub Dependabot/CodeQL, Snyk, or ecosystem equivalent), fail on critical/high issues, and capture results in the upgrade record.
5. Read current changelog, migration notes, release notes, and official docs for major, security-sensitive, framework, auth, payment, build-tool, or TypeScript changes. Use Context7 or official docs for libraries whose behavior drifts.
6. Check related packages: peer dependencies, `@types/*`, adapters, framework companions, eslint/tsconfig plugins, test helpers, and generated clients.
7. Install dependencies with the repo package manager. Do not hand-edit lockfiles except for conflict resolution that the package manager cannot produce.
8. Run Knip (`pnpm knip`) or the repo's equivalent when available to detect unused dependencies, exports, and files.
9. Fail on unused production dependencies; record unused devDependencies for review unless the repo config says to fail on all Knip findings.
10. Use targeted upgrades. Broad upgrades require explicit user request, security evidence, or compatibility evidence.
11. Do not run `npm audit fix --force`, major upgrades, or package-manager migration commands without explicit approval.
12. Run tests, typecheck, lint, and build.
13. Document migration notes, dependency removals, changed lockfiles, and residual compatibility risks.
