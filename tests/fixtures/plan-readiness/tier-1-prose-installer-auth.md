# Installer wording tweak

Status: Final

Execution scope: all_phases
Goal: Adjust installer messaging for auth and tenancy rollout without touching runtime code paths.
Non-goals: No schema or migration work.
Evidence: install docs reviewed.
Risk tier: 1 — docs-only installer wording.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `docs/install.md` | modify | Clarify installer wording. |

## Task groups

### TG-1: Installer docs

- Owner: parent agent.
- Dependencies: none.
- Acceptance criteria: wording updated.
- Verification: `bash tests/test-read-stdin.sh`.

## Verification gates

| Phase | Command | Expected | Stop condition |
| --- | --- | --- | --- |
| 1 | `bash tests/test-read-stdin.sh` | pass | fail |

## Rollback

- Revert doc edit.

## Readiness checklist

- Scope verified: one doc file.
- Files bounded: one doc file.
- Verification defined: read-stdin test.
- Rollback defined: git revert.
- Verdict: ready for execution.
