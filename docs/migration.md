# Migration Notes

Rollout order is intentionally conservative:

1. Baseline commit and config backup.
2. Hook libraries, fixtures, doctor, rollback, and tests.
3. Observer hooks only.
4. Fresh Claude smoke session.
5. Confirm default-installed `etrnl-*` agents with `scripts/doctor.sh`.
6. Confirm local ledger and artifact helpers report cleanly with `scripts/workflow-health.mjs`.
7. Hard blockers one group at a time, including `SubagentStop` when using Agent-OS execution.
8. CLAUDE.md pruning.
9. Hindsight canary and memory consolidation.
10. Plugin and permission cleanup.

Do not remove plugins, memory systems, or broad permissions until rollback and tests pass.
