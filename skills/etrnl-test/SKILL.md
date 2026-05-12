---
name: etrnl-test
description: ETRNL control-plane test/preflight workflow for Claude Code. Use when the user explicitly asks to test, verify, or run checks; hidden from model auto-invocation.
disable-model-invocation: true
---
# Test

Run tests with red-green-refactor discipline. Evidence before fixes; gate before done.

## TDD Enforcement (hook_enforced)

Before fixing any failing test or writing new tests:

1. Capture the failing state: run the relevant test command and record the exact failure output (file, line, message).
2. If adding a new test: write the test first (red), confirm it fails with the expected failure message, then implement the fix (green), then verify the test passes.
3. Do not implement a fix before the failure is recorded as evidence.
4. After fixing: run the full test suite (not just the changed tests) to confirm no regressions. A narrowed run is only allowed as a preview; the full suite is required before done.

This flow is enforced by `hooks/cc-stop-verifier.sh` — completion is blocked when edits exist but no test verification run is recorded.

## Required Flow

1. Detect project tooling from config (package.json, pyproject.toml, Cargo.toml, go.mod).
2. Run typecheck, lint, tests, and build when available — in that order.
3. Report exact failures with file, line number, and command evidence.
4. For each failure, identify whether it is pre-existing or newly introduced.
5. Fix failures unless the user requested report-only.
6. After fixes: rerun the full gate to confirm zero failures, zero new warnings.

## Verification Gate

Record the final clean run as evidence before reporting done:

- Command run (exact)
- Pass/fail state
- Exit code
- Any remaining known issues with explicit accepted-risk disposition

Do not report done if the gate fails or was not run.
