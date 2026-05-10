---
name: etrnl-agent-files
description: ETRNL control-plane skill for reviewing and maintaining AGENTS.md, CLAUDE.md, Claude rules, Codex rules, and agent instruction files without bloat. Use when pruning, auditing, or updating agent instruction surfaces across Claude Code and Codex.
model: sonnet
effort: medium
disable-model-invocation: true
---
# Agent File Doctor

Maintain instruction files as routing/configuration surfaces, not memory stores.

## Workflow

1. Inventory active instruction files for the current tool:
   - Claude: `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, and hook-injected context.
   - Codex: `AGENTS.md`, nested `AGENTS.md`, `AGENTS.override.md`, Codex rules, Codex hooks, and local memories.
2. Report scope, owner, line count, startup impact, and whether the file is public/shareable or private/local.
3. Classify each proposed change:
   - keep in startup file
   - move to path-scoped rule
   - move to skill
   - move to Hindsight/memory
   - move to hook/settings
   - delete as stale or generic
4. Prune first, add second.
5. Require net-neutral or net-negative startup line count unless the user approves growth.
6. Keep stable operating rules in `AGENTS.md`, Claude-specific routing in `CLAUDE.md`, scoped policy in rules, workflows in skills, and hard enforcement in hooks.
7. Never duplicate the same rule across `AGENTS.md`, `CLAUDE.md`, and rules files.

## Hard Rules

- Do not append session learnings directly.
- Do not mine entire transcripts into instruction files.
- Do not store private identity, secrets, permissions, transcripts, or memory dumps in the public repo.
- Prefer fresh repo evidence over remembered instruction text.
