# Code Review Excellence Module Router

Match prompt signals to reference modules. Load the smallest set that covers the task.

| If the task involves… | Load |
| --- | --- |
| Registered `code-excellence` deep-audit category, artifact validation, `code-01` through `code-06` checks | `audit-checks.md` |
| Brooks architecture audit, module dependencies, circular imports, layering, clean architecture, structural decay, Conway's Law, testability seams | `brooks-foundation.md` + `brooks-architecture.md` |
| Codebase tour, onboarding report, explain codebase to a new developer | `brooks-onboarding.md` |
| Correctness invariants, type contracts, error handling, test signal, complexity debt without structural graph | `audit-checks.md` |
| Architecture boundaries check inside a deep-audit run | `audit-checks.md` + `brooks-architecture.md` |
| Prisma schema, migrations, ORM queries, slow SQL, missing indexes | `audit-checks.md`; load `etrnl-backend-patterns/references/prisma.md` and `sql-optimization.md` when query performance is in scope |

## Brooks Mode Map

| Brooks mode (when named) | Load |
| --- | --- |
| Architecture audit | `brooks-foundation.md`, `brooks-architecture.md` |
| Onboarding / tour | `brooks-onboarding.md` |
| Debt (structural) | `brooks-architecture.md`, `audit-checks.md` (`code-06-complexity-debt`) |
| Test (testability / seams) | `brooks-architecture.md` (Step 5), `audit-checks.md` (`code-05-test-signal`) |
| Health / sweep | Full-pass order from `SKILL.md` |
| Review (PR line-level) | Use `etrnl-dev-pr` and execution reviewers; load `brooks-architecture.md` only when the diff touches module boundaries |

## Common Pairs

- Deep-audit category only: `audit-checks.md`
- Brooks architecture only: `brooks-foundation.md` + `brooks-architecture.md`
- Excellence plus structure: `audit-checks.md` + `brooks-architecture.md`
- New-hire orientation: `brooks-onboarding.md`

## Anti-Patterns

- Do not load all four modules for a narrow question (for example, only type-contract review).
- Do not run Brooks architecture audit with only `audit-checks.md`; load `brooks-architecture.md`.
- Do not substitute `etrnl-audit-code` when the user asked for the registered `code-excellence` category artifact.
- Do not use this skill for whole-repo no-skips inventory; route to `etrnl-audit-code`.
