---
name: etrnl-ops-context-save
description: ETRNL context-save workflow for Claude Code. Use when saving progress, preparing handoff, preserving decisions before compaction, or recording remaining work across sessions.
disable-model-invocation: true
---
# ETRNL Context Save

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-context-save`; on update, never stop to ask — continue the work; local updates auto-apply when enabled and safe.

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

## Agent-to-agent handoff

A handoff is the compact, durable state a fresh agent or a compacted successor needs to resume without re-deriving context. Write it so the successor acts immediately. A handoff a fresh agent cannot act on without asking a question is incomplete: reopen it and fill the missing part before you stop.

Capture all five fields:

1. Goal and open execution scope. State the original goal and list every execution-scope item still open. Mark each item done, in-progress, or not-started. Do not ship a handoff that says "continue the plan" without naming the remaining items.
2. Decisions already made and why. Record each chosen path, the rejected alternatives, and the reason. The successor does not re-litigate a settled decision; write the reason so a fresh agent inherits it as settled.
3. Exact next action and its verification gate. Name the single next command or edit and the exact verification that proves it (command plus expected result, per `docs/health-stack.md`). Do not write "keep going" — write the command.
4. Artifact paths and content hashes. Reference evidence already produced by path, not by pasted body. Record the sha256 of each artifact so the successor detects drift. Reuse the existing state/artifact convention — do not inline large evidence:
   - `node ~/.claude/scripts/context-state.mjs save --title "<short title>" --decision "<decision>" --remaining "<next step>" --verification "<command/result>"`
   - `node ~/.claude/scripts/execution-ledger.mjs record-artifact --type context-save --path <context-path> --session "$CLAUDE_SESSION_ID"`
   - `shasum -a 256 <artifact-path>` — record the digest next to each referenced path.
5. Forbidden and no-revert notes. List files the successor must not touch, decisions it must not undo, and user changes it must preserve. State the emergency-bypass rule only when a broken guard blocks the next action.

Do not ship the handoff until all five fields are present and the next action names a concrete command with its verification gate.

## Output

- Saved context path
- Branch and modified file count
- Remaining work count
- Blockers, if any
