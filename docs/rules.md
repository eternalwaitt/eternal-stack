# Rules Reference

Rule modules live in `rules/` and ship as a cross-host pack. Each module is a focused markdown file with YAML frontmatter. `scripts/sync-rule-exports.mjs` generates Cursor `.mdc` twins; `scripts/init-project-rules.sh` copies the pack into a target repo.

## How rules activate per host

| Host | Mechanism | Scope |
| --- | --- | --- |
| **Claude Code** | `.claude/rules/` in project or `~/.claude/rules/` globally; `paths:` frontmatter scopes to matched paths | Path-scoped or global |
| **Codex** | `~/.codex/AGENTS.md` (global digest); nested `AGENTS.md` for depth (declared via `codexNested:` in manifest) | Digest in global; modules in nested |
| **Cursor** | `.cursor/rules/*.mdc` with `globs:` and `description:` frontmatter | Glob-matched per file |

Cursor has no user-level rules directory — project `.mdc` files are the only automated surface. Global rules require manual copy to each project.

Claude Code discovers every `.md` under a rules directory recursively and loads it as memory. A module **without** `paths:` frontmatter loads unconditionally in every session; `globs:` and `alwaysApply:` are Cursor fields and do not scope anything for Claude. Path scoping is also only reliable at project level, so treat `~/.claude/rules/` as always-on context: put a module there only when it should apply to every repo. The eternal-saas pack is stack-specific, so `install.sh` stages it under `~/.claude/docs/templates/rules/eternal-saas/` — source material for `init-project-rules.sh`, deliberately outside the auto-load surface — and only `rules/etrnl/` installs to `~/.claude/rules/`.

## Install

**Global rules** (`rules/etrnl/` only) are installed to `~/.claude/rules/etrnl/` by `scripts/install.sh`, which also stages the eternal-saas pack under `~/.claude/docs/templates/rules/eternal-saas/` without loading it:

```bash
./scripts/install.sh --profile core
```

**Project rules** (full scoped pack, both scopes) are installed by `scripts/init-project-rules.sh`:

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

`rules-manifest.json` at the repo root declares profiles, module metadata, and privacy `bannedTokens`. The `modules:` object is populated by `sync-rule-exports.mjs`. Schema version 1.

## Privacy gate

`sync-rule-exports.mjs --check` fails when any tracked rule file contains a token from `privacy.bannedTokens`. Client repo names, account facts, credentials, and personal identity must stay in local gitignored overlays, never in tracked rule files.

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
hosts: [claude, codex, cursor]
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
