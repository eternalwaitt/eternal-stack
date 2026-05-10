---
name: etrnl-context-save
description: ETRNL context-save workflow for Claude Code. Use when saving progress, preparing handoff, preserving decisions before compaction, or recording remaining work across sessions.
model: haiku
effort: low
disable-model-invocation: true
---
# ETRNL Context Save

Save compact, local-only workflow context. Do not store private transcripts, credentials, API keys, account data, or raw chat logs.

## Workflow

1. Summarize the current goal, branch, important decisions, blockers, remaining work, and verification state.
2. Save the context:
   - `node ~/.claude/scripts/context-state.mjs save --title "<short title>" --decision "<decision>" --remaining "<next step>" --verification "<command/result>"`
3. If a run ledger is active, record the artifact:
   - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type context-save --path <context-path> --session "$CLAUDE_SESSION_ID"`

## Output

- Saved context path
- Branch and modified file count
- Remaining work count
- Blockers, if any
