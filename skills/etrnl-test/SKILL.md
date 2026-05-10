---
name: etrnl-test
description: ETRNL control-plane test/preflight workflow for Claude Code. Use when the user explicitly asks to test, verify, or run checks; hidden from model auto-invocation.
disable-model-invocation: true
---
# Test

1. Detect project tooling from config.
2. Run typecheck, lint, tests, and build when available.
3. Report exact failures with file/command evidence.
4. Fix failures unless the user requested report-only.
