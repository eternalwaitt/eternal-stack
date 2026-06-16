# Codex Host Overrides

This file adds Codex-specific deltas on top of the global AGENTS.md baseline. It should remain small; shared guidance stays in AGENTS.md.

## Host differences

- **No slash commands.** Codex invokes skills by task description, not `/etrnl-*` commands. Skills are installed under `~/.codex/skills/`.
- **No hooks.** Enforcement runs through guard scripts (`pnpm guard:essential`, `pnpm guard:all`, etc.) called by the agent, not automatic hook triggers.
- **No `@` import syntax.** AGENTS.md files in Codex cannot use `@rules/...` imports or declare nested context through the rules manifest. Codex receives the global startup digest through `~/.codex/AGENTS.md` and `AGENTS.override.md`.
- **Byte budget.** Keep combined AGENTS.md context under the effective `project_doc_max_bytes` limit set in `~/.codex/config.toml`. If that key is unset, doctor.sh assumes an unverified fallback of 32768 bytes.

## Skills

Eternal Stack skills are available in `~/.codex/skills/etrnl-*`. Reference them by task description rather than slash command. Example: "Use the etrnl-dev-plan workflow to write an implementation plan."

## Startup files

When installed: `~/.codex/AGENTS.md` provides the global baseline, `~/.codex/AGENTS.override.md` applies these Codex-specific overrides, and any project-level `AGENTS.md` in the repo root adds project context and overrides both.
