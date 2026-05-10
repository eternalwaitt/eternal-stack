---
name: etrnl-commit
description: ETRNL control-plane commit workflow for Claude Code. Use only when the user explicitly asks to commit; hidden from model auto-invocation because it has side effects.
disable-model-invocation: true
---
# Commit

1. Inspect git status.
2. Review the diff for secrets, unrelated changes, and generated noise.
3. Run the `etrnl-test` preflight/test workflow for the project.
4. Stage only relevant files.
5. Commit with a concise message that describes the actual change.
