---
status: accepted
date: 2026-06-10
---

# ADR 0003: Exodia Cross-Host Rule Stack

## Context

Claude Code, Codex, and Cursor each provide native agent-context surfaces (`.claude/rules/` with `paths:` frontmatter, `AGENTS.md` nesting, and `.mdc` with `globs`), but the rule content is currently authored separately for each project. This creates drift, duplication, and inconsistent enforcement surfaces across repos.

Host features verified on 2026-06-10:
- **Claude Code** natively loads `.claude/rules/` and `~/.claude/rules/` with `paths:` frontmatter scoping; no hooks needed.
- **Codex** reads `~/.codex/AGENTS.md` and `AGENTS.override.md`; nested `AGENTS.md` files are its only depth mechanism; no glob or import syntax.
- **Cursor** `.mdc` files with `globs`, `description`, and `alwaysApply` are native; Cursor has no user-level rules directory (settings UI only).

`scripts/install.sh` already syncs `rules/etrnl` to `~/.claude/rules/etrnl` with an atomic tmp/old swap and implements `ETRNL_INSTALL_STARTUP` gating for startup files. The bundled skill family already publishes Eternal-stack patterns publicly (`money-vo-discipline`, `abacatepay-integration`, `eternal-best-practices`).

## Decision

### 1. ADR number

This record is ADR 0003. ADR 0002 is taken by `etrnl-state-and-compact-handoff`.

### 2. Privacy boundary

The `eternal-saas` rule pack ships publicly. Excluded from tracked rule files: client business names, account facts, credentials, transcripts, and personal identity. Client-repo rollout lists stay in local gitignored planning paths. Enforcement: `rules-manifest.json` carries `privacy.bannedTokens`; `sync-rule-exports.mjs --check` fails when a tracked rule file contains one.

### 3. Codex scoped depth via nested AGENTS.md

Each rule module may declare `codexNested: <relative-dir>`; `sync-rule-exports.mjs` emits a nested `AGENTS.md` for declared modules; undeclared modules ride the root digest only. No import syntax exists in Codex — `@` imports are never used in Codex files.

### 4. Byte budget is read, not assumed

Doctor reads `project_doc_max_bytes` from `~/.codex/config.toml` when present; fallback assumption is 32768 bytes (documented as unverified default — official docs do not state one); warn at 75% of the effective limit.

### 5. Copies, not symlinks

All project-pack installs use file copies. Symlinks break for other clones, CI, and machines without eternal-stack at the same path. Drift is managed by checksums, not links.

### 6. Installed packs are checksum-tracked

`init-project-rules.sh --check` classifies each installed file as `current | stale | locally-modified` against manifest checksums; re-running never overwrites `locally-modified` files without `--force`.

### 7. Profiles are explicit

`init-project-rules.sh` requires `--profile eternal-saas|eternal-saas-tcg`; no auto-detection, no install on unrelated repos.

## Consequences

- One source of truth for rule content; Claude `.claude/rules/`, Cursor `.mdc`, and Codex `AGENTS.md` files are generated or installed from the same module.
- `sync-rule-exports.mjs --check` in the test suite prevents host-twin drift and banned-token leaks.
- The byte-gate in `doctor.sh` keeps Codex context under the effective limit; the explicit fallback prevents silent overflow.
- Checksum-tracked installs let pilot repos self-classify drift without re-running install.
- Profile guard prevents accidental application of SaaS rules to unrelated repos.

## Implementation Notes

- Source modules live under `rules/eternal-saas/`; generated `.mdc` twins under `templates/cursor/rules/eternal-saas/`.
- `scripts/init-project-rules.sh` and `scripts/sync-rule-exports.mjs` are the install and export surfaces.
- `docs/rules.md` documents operator activation modes per host including the Cursor global gap.
- See the Exodia plan (`docs/plans/exodia-rule-stack.plan.md`) for task groups, pilot order, and rollback procedures.
