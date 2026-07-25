# Migration Notes

Rollout order is intentionally conservative:

1. Baseline commit and config backup.
2. Hook libraries, fixtures, doctor, rollback, and tests.
3. Default observer install: prompt routing, prompt expansion, `CLAUDE.md` reinjection, locked advisory rate limiter, post-tool observation, session cleanup, and installed `etrnl-*` agents.
4. Settings audit and update metadata check: `settings-audit.mjs ~/.claude/settings.json --json` and `update-check.mjs --json`.
5. Fresh Claude smoke session.
6. Confirm installed scripts, docs, agents, settings, and mode with `scripts/doctor.sh` and `~/.claude/scripts/doctor-etrnl.sh`.
7. Confirm local ledger and artifact helpers report cleanly with `scripts/workflow-health.mjs`.
8. Hard blockers one group at a time with `ETRNL_ENABLE_STRICT=1`, including `PreToolUse`, `PostToolUseFailure`, `Stop`, and `SubagentStop`.
9. CLAUDE.md pruning only after prompt reinjection is verified.
10. Hindsight canary and memory consolidation.
11. Plugin and permission cleanup. MCP and plugin pruning is a manual operator rollout step — see the `Codex-first efficiency profile` section in [configuration.md](configuration.md) — not an install-time side effect; Eternal Stack does not auto-remove user MCP servers during install.

Do not remove plugins, memory systems, or broad permissions until rollback and tests pass.
