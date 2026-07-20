# Nine-file refactor

Status: Final

Execution scope: all_phases
Goal: Rename helper exports across scripts.
Non-goals: No hook or install changes.
Evidence: scripts/lib reviewed.
Risk tier: 1 — small rename across scripts.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `scripts/a.mjs` | modify | rename export |
| `scripts/b.mjs` | modify | rename export |
| `scripts/c.mjs` | modify | rename export |
| `scripts/d.mjs` | modify | rename export |
| `scripts/e.mjs` | modify | rename export |
| `scripts/f.mjs` | modify | rename export |
| `scripts/g.mjs` | modify | rename export |
| `scripts/h.mjs` | modify | rename export |
| `scripts/i.mjs` | modify | rename export |

## Task groups

### TG-1: Rename exports

- Owner: parent agent.
- Dependencies: none.
- Acceptance criteria: exports renamed consistently.
- Verification: `node --check scripts/a.mjs`.

## Verification gates

| Phase | Command | Expected | Stop condition |
| --- | --- | --- | --- |
| 1 | `node --check scripts/a.mjs` | pass | fail |

## Rollback

- Revert rename commit.

## Readiness checklist

- Scope verified: script rename only.
- Files bounded: nine script files.
- Verification defined: syntax check.
- Rollback defined: git revert.
- Verdict: ready for execution.
