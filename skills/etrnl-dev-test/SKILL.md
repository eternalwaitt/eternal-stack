---
name: etrnl-dev-test
description: ETRNL test/preflight workflow for Claude Code. Use when the user explicitly asks to test, verify, or run checks; hidden from model auto-invocation.
disable-model-invocation: true
---
# Test

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-test`; on update, ask update/snooze/continue.

Run tests with red-green-refactor discipline. Evidence before fixes; gate before done.

## TDD Protocol (required_process)

Before fixing any failing test or writing new tests:

1. Capture the failing state: run the relevant test command and record the exact failure output (file, line, message).
2. If adding a new test: write the test first (red), confirm it fails with the expected failure message, then implement the fix (green), then verify the test passes.
3. Do not implement a fix before the failure is recorded as evidence.
4. Here, "edits exist" means tracked source/runtime code changes or tracked test-file changes; documentation/editorial-only changes are excluded unless they also modify runtime or test code.

## Verification Gate (hook_enforced)

After fixing: run the full test suite (not just the changed tests) to confirm no regressions. A narrowed run is only allowed as a preview; the full suite is required before done.

`hooks/cc-stop-verifier.sh` enforces this completion gate by blocking completion when quality, test, stale-verification, or required review evidence is missing for edited work.

## Required Flow

1. Detect project tooling from config (package.json, pyproject.toml, Cargo.toml, go.mod).
2. Build a behavior inventory before adding tests: success path, invalid input, boundary values, permission/auth states, external failure, and regression case.
3. Accept generated tests only when they use deterministic inputs, clear Arrange/Act/Assert structure, and assertions that prove behavior rather than implementation details.
   - Reject test decay before accepting a test — screen every new or changed test against T1–T6: T1 Coverage Illusion (the assertion checks a mock's return, not the real behavior — coverage without proof); T2 Mock Abuse (mocking pins implementation detail so the test passes for the wrong reason); T3 Brittleness (the assertion targets incidental output — ordering, whitespace, timestamps, full-object snapshots — that breaks on a benign change); T4 Obscurity (magic values, no Arrange/Act/Assert, unreadable intent); T5 Skip/Focus decay (`it.skip`/`xit`/`it.only` left in the suite — delete or restore it, never park it; the `no-skipped-test` and `no-focused-tests` review guards fail these); T6 Tautology (an assertion that cannot fail, e.g. `expect(x).toBe(x)` or a snapshot of a mock). A test that trips any of T1–T6 is not done — rewrite it to assert observable behavior.
4. Run typecheck, lint, tests, and build when available - in that order.
5. Report exact failures with file, line number, and command evidence.
6. For each failure, identify whether it is pre-existing or newly introduced.
7. Fix failures unless the user requested report-only.
8. After fixes: rerun the full gate to confirm zero failures, zero new warnings.

## Verification Evidence Requirements

Record the final clean run as evidence before reporting done:

- Command run (exact)
- Pass/fail state
- Exit code
- Any remaining known issues with explicit accepted-risk disposition

Do not report done if the gate fails or was not run.
