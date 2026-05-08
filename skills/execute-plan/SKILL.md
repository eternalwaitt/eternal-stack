---
name: execute-plan
description: User-invoked plan execution workflow for Claude Code. Use only when Victor explicitly asks to execute an implementation plan; hidden from model auto-invocation because it edits files and may run commands.
disable-model-invocation: true
---
# Execute Plan

1. Re-read the plan and extract phase gates.
2. Execute one phase at a time.
3. Stop after each Verify block if evidence is missing.
4. Do not delete plugins, memories, or permissions until rollback and tests pass.

