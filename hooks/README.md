# Hooks

Bash and Python entrypoints Claude Code runs at session and tool lifecycle events. Installed to `~/.claude/hooks/` by `scripts/install.sh`.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/hooks.md](../docs/hooks.md) | **Hook reference** — full catalog, lifecycle wiring, per-hook behavior, libraries |
| [docs/guards.md](../docs/guards.md) | Pretool deny rules, stop-verifier gates, fail-open matrix |
| [docs/compact-recovery.md](../docs/compact-recovery.md) | Compact handoff debugging |

## Layout

```text
hooks/
  cc-*.sh                 # Bash entrypoints (see catalog in docs/hooks.md)
  cc-hindsight-lesson.py  # Background lesson retain (not in settings.json)
  lib/                    # Shared Bash/Node libraries
  fixtures/               # Regression payloads for tests/test-hooks.sh
```

## Verify

```bash
tests/test-hooks.sh
./scripts/doctor.sh
```
