---
name: etrnl-deps
description: ETRNL control-plane dependency maintenance workflow for Claude Code. Use only when the user explicitly asks to update dependencies; hidden from model auto-invocation.
model: sonnet
effort: medium
disable-model-invocation: true
---
# Deps

1. Inspect package manager and lockfile.
2. If the repo uses pnpm workspaces with a `pnpm-workspace.yaml` catalog, update shared dependency versions in the catalog instead of individual `package.json` files.
3. Run the project's dependency vulnerability scan (`npm audit`, `pnpm audit`, `yarn audit`, GitHub Dependabot/CodeQL, Snyk, or ecosystem equivalent), fail on critical/high issues, and capture results in the upgrade record.
4. Install dependencies, then run Knip (`pnpm knip`) or the repo's equivalent when available to detect unused dependencies, exports, and files.
5. Fail on unused production dependencies; record unused devDependencies for review unless the repo config says to fail on all Knip findings.
6. Use targeted upgrades. Broad upgrades require explicit user request, security evidence, or compatibility evidence.
7. Read changelogs for major or security-sensitive changes.
8. Run tests, typecheck, and build.
9. Document migration notes and dependency removals.
