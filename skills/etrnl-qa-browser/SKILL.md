---
name: etrnl-qa-browser
description: ETRNL browser QA workflow for Claude Code. Use when the user asks for real browser QA, screenshots, route checks, viewport checks, console/network checks, or UI verification evidence.
model: sonnet
effort: medium
disable-model-invocation: true
---
# ETRNL Browser QA

Run report-first browser QA for UI changes. Do not edit application source files in this skill.
This reusable skill is the canonical browser QA workflow; `agents/etrnl-browser-qa.md` mirrors it for delegated agent tasks.

## Workflow

1. Identify the target URL, changed routes, required auth state, and viewport set.
2. Prefer `playwright-cli` when installed. Use one named browser session per agent/task.
3. Start the provided local dev command when the target needs it. Do not leave browser QA "manual" or "outstanding" just because it needs a local server or browser tooling; run it or report the exact unavailable tool/error.
4. Check each route for:
   - page load success
   - console errors
   - failed network requests
   - desktop and mobile layout issues
   - visible empty/error/loading states when reachable
   - accessibility basics: keyboard reachability, labels, contrast risks, touch targets
5. Save screenshots or paths only when useful for evidence.
6. Create a structured artifact:
   - `node ~/.claude/scripts/browser-qa-report.mjs create --routes "<routes>" --viewports "<viewports>" --status complete`
7. Validate the artifact:
   - `node ~/.claude/scripts/browser-qa-report.mjs validate <report-path>`
8. Record the artifact in the active ledger when one exists:
   - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type browser-qa-report --path <report-path> --session "$CLAUDE_SESSION_ID"`

## Output

- Target and routes checked
- Viewports checked
- Browser QA report path
- Findings, ordered by severity
- Verification command and result
