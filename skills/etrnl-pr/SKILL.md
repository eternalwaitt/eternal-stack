---
name: etrnl-pr
description: ETRNL control-plane pull request workflow for Claude Code. Use only when the user explicitly asks to create or update a PR; hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# PR

1. Confirm branch, diff, and pushed status.
2. Run project preflight and relevant smoke checks.
3. Write a terse PR title and implementation-focused body.
4. Include verification evidence and known residual risks.
