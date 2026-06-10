---
name: etrnl-ops-context-save
description: ETRNL context-save workflow for Claude Code. Use when saving progress, preparing handoff, preserving decisions before compaction, or recording remaining work across sessions.
disable-model-invocation: true
---
# ETRNL Context Save

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-context-save`; on update, ask update/snooze/continue.

Save compact, local-only workflow context. Do not store private transcripts, credentials, API keys, account data, or raw chat logs.

Save only durable continuation material:

- `decision`: chosen path and rejected alternatives.
- `pattern`: reusable implementation or verification pattern.
- `preference`: stable user or repo preference.
- `fact`: verified repo/runtime state with timestamp or command.
- `solution`: repeated problem, fix, and verification.

Skip transient thoughts, raw chat, secrets, large logs, speculative claims, and details recoverable from git or current files.

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
