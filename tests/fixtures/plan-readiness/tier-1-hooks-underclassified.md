# Hook tweak

Status: Final

Execution scope: all_phases
Goal: Adjust one hook message string.
Non-goals: No install or auth changes.
Evidence: hooks/cc-stop-verifier.sh reviewed.
Risk tier: 1 — single hook string change.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `hooks/cc-stop-verifier.sh` | modify | Adjust one message string. |

## Task groups

### TG-1: Hook message

- Owner: parent agent.
- Dependencies: none.
- Acceptance criteria: message updated.
- Verification: `bash tests/test-hooks.sh`.

## Verification gates

| Phase | Command | Expected | Stop condition |
| --- | --- | --- | --- |
| 1 | `bash tests/test-hooks.sh` | pass | fail |

## Rollback

- Revert hook edit.

## Readiness checklist

- Scope verified: one hook string.
- Files bounded: one hook file.
- Verification defined: test-hooks.
- Rollback defined: git revert.
- Verdict: ready for execution.
