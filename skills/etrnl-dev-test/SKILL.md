---
name: etrnl-dev-test
description: ETRNL test/preflight workflow for Claude Code and Codex. Use when the user explicitly asks to test, verify, or run checks; hidden from model auto-invocation.
disable-model-invocation: true
---
# Test


Run checks selected for the task and the target repository. Read the active workflow contract when present, then use the project's health stack and scope to choose a proportionate verification set. A green test proves only the behavior it covers.

## Test-first guidance

For a reproducible behavior regression, prefer red-green-refactor:

1. Capture the failing state: run the relevant test command and record the exact failure output (file, line, message).
2. If adding a new test: write the test first (red), confirm it fails with the expected failure message, then implement the fix (green), then verify the test passes.
3. When the resolved workflow contract requires test-first evidence, capture a failing focused test or executable probe before the fix. If that is infeasible, record the concrete reason and compensating verification in the run record; never invent a red result. Otherwise use test-first when a stable local fixture makes it proportionate.
4. Here, "edits exist" means tracked source/runtime code changes or tracked test-file changes; documentation/editorial-only changes are excluded unless they also modify runtime or test code.

## Verification

Run the focused test or check first. Expand to related suites based on the change's scope, risk, repository policy, and available time/budget. A full suite is useful for broad changes or when the repo requires it, but is not a universal prerequisite for every contained fix.

Hooks enforce a completion gate only when the target host has registered and enabled them. Eternal Stack Core does not register hooks; do not report an uninstalled or inactive verifier as an active gate.

## Required Flow

1. Detect project tooling from config (package.json, pyproject.toml, Cargo.toml, go.mod).
2. Build a behavior inventory before adding tests: success path, invalid input, boundary values, permission/auth states, external failure, and regression case.
3. Accept generated tests only when they use deterministic inputs, clear Arrange/Act/Assert structure, and assertions that prove behavior rather than implementation details.
   - Review new or changed tests for weak evidence: assertions that only check a mock return, unnecessary implementation-coupled mocks, brittle incidental output, opaque setup, accidentally committed skip/focus markers, or assertions that cannot fail. Apply repository-configured lint/review rules; do not assume every target installs named skip/focus guards.
4. Run the checks relevant to the change from the project's configured commands. Use typecheck, lint, tests, and build when the scope and repository policy call for them.
5. Report exact failures with file, line number, and command evidence.
6. For each failure, identify whether it is pre-existing or newly introduced.
7. Fix failures caused by the authorized change when in scope. Report pre-existing or unrelated failures and continue only when repairing them fits the user's request and workflow budget.
8. After fixes: rerun the checks needed to validate the changes and report any broader gates that remain unrun.

## Verification Evidence Requirements

Record the final clean run as evidence before reporting done:

- Command run (exact)
- Pass/fail state
- Exit code
- Any remaining known issues with explicit accepted-risk disposition

Do not claim a check passed unless it ran. Report why unavailable or broader checks were skipped; match the completion claim to the evidence available.
