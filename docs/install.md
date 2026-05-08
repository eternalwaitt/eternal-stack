# Install

```bash
./scripts/install.sh
./scripts/doctor.sh
```

The installer:

- backs up existing Claude settings and `CLAUDE.md`
- copies reusable hooks, hook libraries, fixtures, docs, and skills
- runs the hook test harness
- registers only safe observer hooks unless `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1`

Rollback:

```bash
~/.claude/scripts/rollback-local.sh
```

