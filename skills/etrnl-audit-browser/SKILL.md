---
name: etrnl-audit-browser
description: ETRNL browser QA workflow for Claude Code. Use when the user asks for real browser QA, screenshots, route checks, viewport checks, console/network checks, or UI verification evidence.
disable-model-invocation: true
---
# ETRNL Browser QA

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-browser`; on update, ask update/snooze/continue.

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
