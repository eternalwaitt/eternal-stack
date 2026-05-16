---
name: etrnl-fix-issue
description: ETRNL control-plane issue-fixing workflow for Claude Code. Use only when the user explicitly asks to fix a tracked issue; hidden from model auto-invocation because it edits code.
model: sonnet
effort: medium
disable-model-invocation: true
---
# Fix Issue

1. Read the issue and local code before editing.
2. Reproduce or prove the bug.
3. Make the smallest fix that addresses root cause.
4. Add or update focused tests.
5. Run preflight and summarize evidence.
