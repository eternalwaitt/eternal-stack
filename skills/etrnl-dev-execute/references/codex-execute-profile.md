# Codex adapter

This file documents Codex-specific mechanics only. Workflow mode, requirements, and budgets come from the stored `workflow-contract.json`; see the parent execute skill. No Codex setting adds work requirements beyond that contract.

- Codex loads the shared router through its native skill discovery. Codex hook behavior exists only when the relevant hook is registered and enabled in `config.toml`; the core installer does not imply that every optional hook is active.
- Use Codex native subagents when delegation is useful and the stored worker budget permits it. Follow Codex packet/model fields only when the contract requires packets and the active tool requires those fields; do not impose fixed model tiers or lane limits.
- Resolve helper paths through `{{ETRNL_COMPANION}}`, which supplies `ETRNL_HOME`, the shared `ETRNL_LIBRARY_ROOT`, and host-local state directories. Do not point Codex workflows at `~/.claude`.
- Keep host state and evidence under the paths the companion returns. When debugging, distinguish native skill discovery, actually loaded instructions, configured hooks, and runtime behavior.
