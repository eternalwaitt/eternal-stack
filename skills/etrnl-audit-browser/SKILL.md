---
name: etrnl-audit-browser
description: ETRNL browser QA workflow for Claude Code. Use when the user asks for real browser QA, screenshots, route checks, viewport checks, console/network checks, or UI verification evidence.
disable-model-invocation: true
---
# ETRNL Browser QA

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-browser`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Run report-first browser QA for UI changes. Do not edit application source files in this skill.
This reusable skill is the canonical browser QA workflow; `agents/etrnl-browser-qa.md` mirrors it for delegated agent tasks.

## Workflow

1. Identify the target URL, changed routes, required auth state, and viewport set.
2. Resolve browser tooling in order:
   - `playwright-cli`
   - `browser-use`
   - repo-provided Playwright test command or script
   - exact unavailable-tool blocker
3. Use one named browser session per agent/task. Capture the right pre-interaction artifact before clicking, filling, or asserting elements: `page.screenshot()` for visual checks, `page.content()` or `page.evaluate()` for DOM assertions, and `page.context().tracing.start()` for replay/debugging evidence. Close or explicitly hand off sessions after the selected artifact is captured.
4. Start the provided local dev command when the target needs it. Do not leave browser QA "manual" or "outstanding" just because it needs a local server or browser tooling; run it or report the exact unavailable tool/error.
5. Check each route for:
   - page load success
   - console errors
   - failed network requests
   - desktop and mobile layout issues
   - visible empty/error/loading states when reachable
   - accessibility basics: keyboard reachability, labels, contrast risks, touch targets
6. Save screenshots or paths when they provide evidence. Capture trace or video for failures when the active tool exposes it without new setup.
7. Create a structured artifact. Use schema v2 matrix evidence for new UI work:
   - Build one matrix row per route x viewport with `route`, `viewport`, `status`, `screenshot`, `screenshotSha256`, `capturedAt`, `consoleErrors`, and `failedRequests`.
   - Failure rows include `trace`, `traceSha256`, `video`, `videoSha256`, and `pageErrors` when those artifacts exist; passed rows must keep `pageErrors` empty.
   - `status complete` must have real console/network summaries, numeric counts, non-empty screenshot files under the artifact root, matching screenshot hashes, fresh capture timestamps, and provenance fields: `tool`, `targetUrl`, `command`, `capturedAt`.
   - First run `node ~/.claude/scripts/browser-qa-report.mjs hash <screenshot-path>` for each screenshot.
   - Put the returned SHA256 value into that row's `screenshotSha256` field inside the `--matrix` JSON.
   - Only then run the create command with all v2 fields:

     ```bash
     node ~/.claude/scripts/browser-qa-report.mjs create \
       --schema-version 2 \
       --artifact-root "<artifact-root>" \
       --target-url "<url>" \
       --tool "<tool>" \
       --provenance '<json-provenance>' \
       --routes "<routes>" \
       --viewports "<viewports>" \
       --matrix '<json-matrix>' \
       --console "<console findings summary>" \
       --network "<network findings summary>" \
       --status complete
     ```

   - Error handling and troubleshooting:
     - If `hash` fails, check the exit code, verify the screenshot path and permissions, confirm the screenshot file exists under the artifact root, then rerun `hash`.
     - If the screenshot is still being written, use a short retry loop with backoff; abort with a clear message if the file never appears before hashing.
     - If `create` fails after hashing, verify the matrix still references the same screenshot path and `screenshotSha256`, rerun `create`, or rerun `hash` plus `create` if the file changed.
     - Capture the failed command output, exit code, timestamp, screenshot file size, and recalculated hash for debugging.
   - Existing v1 artifacts can be migrated to a draft with `node ~/.claude/scripts/browser-qa-report.mjs migrate <old-report> --path <new-report>`.
8. For legacy/simple runs, v1 is still accepted when the report includes checked console and network summaries:
   - `node ~/.claude/scripts/browser-qa-report.mjs create --routes "<routes>" --viewports "<viewports>" --console "<console findings summary>" --network "<network findings summary>" --status complete`
9. Validate the artifact:
   - `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>`
10. Record the artifact in the active ledger when one exists:
   - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <report-path> --session "$CLAUDE_SESSION_ID"`

## Output

- Target and routes checked
- Viewports checked
- Browser QA report path
- Findings, ordered by severity
- Verification command and result

## Common Rationalizations

- "It renders fine, screenshots are busywork." -> A screenshot with its SHA256 is the only artifact that proves the route loaded at that viewport; capture `page.screenshot()` and hash it, or the row stays unproven.
- "The console warnings are just noise from a library." -> Every `consoleErrors` and `pageErrors` entry gets recorded with its count; triage each one in the artifact, do not zero out the field to make the row pass.
- "I checked desktop, mobile is basically the same layout." -> Build one matrix row per route x viewport; a collapsed nav, clipped touch target, or overflow that only appears at mobile width is a finding that the desktop row cannot show.
- "No browser tooling is installed, so browser QA is manual." -> Resolve tooling in order (`playwright-cli`, `browser-use`, repo Playwright command) or emit the exact unavailable-tool blocker; do not mark browser QA outstanding.
- "A 404 or 500 network call still rendered the page, ship it." -> Record every failed request in `failedRequests`; a broken API call behind a rendered shell is a defect, not a passed route.

## Red Flags

- A matrix row marked `passed` while its `consoleErrors` count is above zero or `pageErrors` is non-empty (passed rows require empty `pageErrors`).
- A `status complete` report with a screenshot whose `screenshotSha256` does not match the on-disk file, a zero-byte screenshot, or a screenshot path outside the artifact root.
- Fewer matrix rows than `routes x viewports`, so a route or viewport combination was silently dropped from coverage.
- A failed row that omits `trace`, `traceSha256`, `video`, or `videoSha256` when the active tool produced those artifacts, leaving the failure without replay evidence.
- A `failedRequests` entry for a 4xx or 5xx network response on a route the row still reports as `passed`.
- An accessibility gap left unrecorded: an interactive element with no keyboard focus reachability, a form control with no label, or a touch target below the minimum hit area.
- A stale `capturedAt` timestamp reused across rows, or missing provenance fields (`tool`, `targetUrl`, `command`, `capturedAt`) on a `status complete` artifact.

## When NOT to use

- Injection, auth bypass, tenant-isolation leaks, secrets exposure, and header hardening belong to `etrnl-audit-security`.
- Diff-scoped correctness bugs, type errors, and spec conformance belong to `etrnl-quality-reviewer` and `etrnl-spec-reviewer`.
- Route latency budgets, bundle byte deltas, N+1 queries, and cold/warm timing belong to `etrnl-audit-performance`.
- Whole-codebase inventory, dead code, repo rot, and coverage-map gaps belong to `etrnl-audit-code`.

## Verification

Run counts every item. Any FAIL marks the run incomplete:

- PASS/FAIL: One matrix row exists per `route x viewport` in the target set, with no dropped combination.
- PASS/FAIL: Every row carries `route`, `viewport`, `status`, `consoleErrors` count, and `failedRequests`; passed rows keep `pageErrors` empty.
- PASS/FAIL: Each screenshot exists under the artifact root, is non-empty, and its `screenshotSha256` matches the `hash` output for that file.
- PASS/FAIL: Failed rows attach `trace`, `traceSha256`, `video`, and `videoSha256` when the active tool produced them, plus `pageErrors`.
- PASS/FAIL: A `status complete` artifact carries provenance (`tool`, `targetUrl`, `command`, `capturedAt`) and fresh capture timestamps, or names the exact unavailable-tool blocker.

Red-capable gate — this command exits non-zero when the report is malformed, incomplete, or has a screenshot hash or artifact-root mismatch:

```bash
node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>
```

Expected exit code: `0` when the report validates. Exit `1` names each malformed or missing evidence field and marks the run incomplete; exit `2` reports a missing file path.
