# Migration Notes

Rollout order is intentionally conservative:

1. Baseline commit and config backup.
2. Hook libraries, fixtures, doctor, rollback, and tests.
3. Observer hooks only.
4. Fresh Claude smoke session.
5. Hard blockers one group at a time.
6. CLAUDE.md pruning.
7. Hindsight canary and memory consolidation.
8. Plugin and permission cleanup.

Do not remove plugins, memory systems, or broad permissions until rollback and tests pass.

