# Codex Host Overrides

This file adds Codex-specific deltas on top of the global AGENTS.md baseline. It should remain small; shared guidance stays in AGENTS.md.

## Host differences

- **No slash commands.** Codex invokes skills by task description, not `/etrnl-*` commands. Skills are installed under `~/.codex/skills/`.
- **No hooks.** Enforcement runs through guard scripts (`pnpm guard:essential`, `pnpm guard:all`, etc.) called by the agent, not automatic hook triggers.
- **No `@` import syntax.** AGENTS.md files in Codex cannot use `@rules/...` import syntax. Depth lives in nested `AGENTS.md` files (declared via `codexNested:` in the rules manifest).
- **Byte budget.** Keep combined AGENTS.md context under the effective project_doc_max_bytes limit. When uncertain, check `~/.codex/config.toml`; default assumption is 32 768 bytes.

## Skills

Eternal Stack skills are available in `~/.codex/skills/etrnl-*`. Reference them by task description rather than slash command. Example: "Use the etrnl-dev-plan workflow to write an implementation plan."

## Startup files

`~/.codex/AGENTS.md` is this global baseline. `~/.codex/AGENTS.override.md` is this file. Project-level `AGENTS.md` in the repo root adds project context and overrides both.
