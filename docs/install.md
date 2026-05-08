# Install

```bash
./scripts/install.sh
./scripts/doctor.sh
```

The installer:

- backs up existing Claude settings and `CLAUDE.md`
- copies reusable hooks, hook libraries, fixtures, docs, and skills
- runs the hook test harness
- merges safe observer hooks into existing settings by default
- merges strict blocker hooks only when `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1`

Rollback:

```bash
~/.claude/scripts/rollback-local.sh
```
