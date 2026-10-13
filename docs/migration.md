# Migration Notes

## Migrating to the portable core

The v0.12.0 Core release installs shared guidance, one router skill, and a private capability library. The optional `orchestrated` and `full` profiles are separate layouts. Existing installs are not silently converted: old hooks, global rules and skills could keep enforcing a different workflow. Core detects incompatible install metadata and common runtime remnants and stops before writing either host. See the [host capability matrix](host-capabilities.md) for current boundaries.

1. Keep your existing install backup and inspect its ownership records.
2. Use the legacy `scripts/rollback-local.sh <backup-dir>` from the source/installed package to restore the pre-install state. This changes both hosts; perform it only as an explicitly chosen migration. If local files changed since the backup, reconcile those changes first rather than restoring over them. The legacy uninstall helper is still a no-op.
3. Inspect Claude hook settings and global `rules/etrnl`, Codex hook configuration, and installed `etrnl-*` skills for remnants. Rollback alone is not proof of a clean host.
4. Run `./scripts/install.sh --profile core --dry-run`, inspect the target files, then install core explicitly.
5. Start a fresh session on each host and verify effective instructions and absence of legacy hook/skill activation. Source tests do not substitute for this host check.

For a clean host, install Core directly. To retain the optional hook-based package deliberately, select `--profile orchestrated`; `full` adds its optional tool provisioning. These are alternative layouts, not an overlay. The installer does not migrate a live host automatically.


Rollout order is intentionally conservative:

1. Baseline commit and config backup.
2. Hook libraries, fixtures, doctor, rollback, and tests.
3. Optional reduced-hook orchestration install: prompt routing, prompt expansion, `CLAUDE.md` reinjection, locked advisory rate limiter, post-tool observation, session cleanup, and installed `etrnl-*` agents.
4. Settings audit and update metadata check: `settings-audit.mjs ~/.claude/settings.json --json` and `update-check.mjs --json`.
5. Fresh Claude smoke session.
6. Confirm installed scripts, docs, agents, settings, and mode with `scripts/doctor.sh` and `~/.claude/scripts/doctor-etrnl.sh`.
7. Confirm local ledger and artifact helpers report cleanly with `scripts/workflow-health.mjs`.
8. If you need reduced-hook behavior during rollout, set `ETRNL_ENABLE_STRICT=0` when installing `--profile orchestrated`; otherwise that optional profile registers the strict pretool, post-write, failure, stop, and subagent gates. The default Core install registers none.
8.5. After spawn-guard hooks install, set `ETRNL_SPAWN_GUARD_MODE=advisory` for one tier-0 canary execute (`etrnl-dev-execute` on a docs-only plan), confirm `check-spawn --explain` recovery works, then switch to `ETRNL_SPAWN_GUARD_MODE=enforce` before enabling strict spawn enforcement on production plans.
9. CLAUDE.md pruning only after prompt reinjection is verified.
10. Hindsight canary and memory consolidation.
11. Plugin and permission cleanup. MCP and plugin pruning is a manual operator rollout step — see the `Codex-first efficiency profile` section in [configuration.md](configuration.md) — not an install-time side effect; Eternal Stack does not auto-remove user MCP servers during install.

Do not remove plugins, memory systems, or broad permissions until rollback and tests pass.
