---
name: deps
description: User-invoked dependency maintenance workflow for Claude Code. Use only when Victor explicitly asks to update dependencies; hidden from model auto-invocation.
disable-model-invocation: true
---
# Deps

1. Inspect package manager and lockfile.
2. Prefer targeted upgrades.
3. Read changelogs for major or security-sensitive changes.
4. Run install, tests, typecheck, and build.
5. Document migration notes.

