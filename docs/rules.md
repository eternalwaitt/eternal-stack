# Rules Reference

Rule modules live in `rules/` and ship as a cross-host pack. Each module is a focused markdown file with YAML frontmatter. `scripts/sync-rule-exports.mjs` generates Cursor `.mdc` twins; `scripts/init-project-rules.sh` copies the pack into a target repo.

## How rules activate per host

| Host | Mechanism | Scope |
| --- | --- | --- |
| **Claude Code** | `.claude/rules/` in project or `~/.claude/rules/` globally; `paths:` frontmatter scopes to matched paths | Path-scoped or global |
| **Codex** | `~/.codex/AGENTS.md` and `~/.codex/AGENTS.override.md` installed by `scripts/install.sh` | Global startup digest |
| **Cursor** | `.cursor/rules/*.mdc` with `globs:` and `description:` frontmatter | Glob-matched per file |

Cursor has no user-level rules directory — project `.mdc` files are the only automated surface. Global rules require manual copy to each project.

## Install

**Global rules** (eternal-saas digest + etrnl rules) are installed by `scripts/install.sh`:

```bash
./scripts/install.sh --profile core
```

**Project rules** (full scoped pack) are installed by `scripts/init-project-rules.sh`:

```bash
./scripts/init-project-rules.sh --profile eternal-saas /path/to/project
./scripts/init-project-rules.sh --dry-run --profile eternal-saas /path/to/project   # preview
./scripts/init-project-rules.sh --check --profile eternal-saas /path/to/project     # drift check
```

Profiles: `eternal-saas` (full SaaS stack), `eternal-saas-tcg` (+ TCG contract rules).

## Drift management

`sync-rule-exports.mjs --check` validates that generated `.mdc` files match sources and contain no banned tokens:

```bash
node scripts/sync-rule-exports.mjs --check
```

`init-project-rules.sh --check` classifies each installed file:

| Status | Meaning |
| --- | --- |
| `current` | Installed file matches receipt; source unchanged |
| `stale` | Source was modified after install; re-run init to update |
| `locally-modified` | Target file was edited locally; `--force` required to overwrite |

## Manifest

`rules-manifest.json` at the repo root declares profiles, module metadata, and the generic privacy sentinel tokens used by the export check. The `modules:` object is populated by `sync-rule-exports.mjs`. Schema version 1.

## Privacy gate

`sync-rule-exports.mjs --check` fails when any tracked rule file contains a generic privacy sentinel token or a token from the optional untracked local privacy files. Keep tracked sentinels generic; client repo names, account facts, credentials, and personal identity belong only in local gitignored overlays, never in tracked files.

## Module authoring

Each module needs YAML frontmatter:

```yaml
---
id: eternal-saas-<name>
paths:
  - "apps/web/src/lib/**"
globs:
  - "apps/web/src/lib/**"
description: "One-line description for context matching."
hosts: [claude, cursor]
verify: "pnpm guard:essential"
---
```

Rules of thumb:
- One concern per file.
- Keep prose short; examples are worth more than paragraphs.
- Include a `## verify` section with a runnable command.
- Name the enforcement guard or hook when one exists.
- Use `local-overrides.md` for project-specific package names and paths.

## Reactive loop

The rules pack is a living document:

1. **New rule**: an agent fails twice on the same mistake → write one scoped module file.
2. **Guard pointer**: a mechanical rule belongs in a hook or guard; the rule file names the enforcement surface and keeps one example.
3. **Monthly scorecard**: run `etrnl-ops-agent-files` on before/after byte counts to prevent rules creep.
4. **Release**: `VERSION` bump + `node scripts/sync-rule-exports.mjs --check` + `./scripts/install.sh --dry-run` + `./scripts/init-project-rules.sh --dry-run --profile eternal-saas /target` all green.

## Cursor global rules gap

Cursor does not support user-level or global rules directories (settings UI only). The only Cursor automation surface is project `.mdc` files. Document this limitation in project onboarding and rely on `init-project-rules.sh` to install `.cursor/rules/eternal-saas/` alongside the Claude rules.

## verify

```bash
node scripts/sync-rule-exports.mjs --check
./scripts/doctor.sh
```
