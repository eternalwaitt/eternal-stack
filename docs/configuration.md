# Configuration

Profiles:

- Public default: observer hooks, prompt router, skill recorder, session cleanup.
- Strict local: PreToolUse guard, Stop verifier, SubagentStop recorder, compact recovery, WebSearch canary, and Hindsight canary.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Codex should receive shared standards through `AGENTS.md`, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
Repo-owned ETRNL agents install into `~/.claude/agents/` by default. Local run ledgers stay under `~/.claude/control-plane/runs/`; review logs, browser QA reports, and context saves stay under `~/.claude/control-plane/artifacts/`. These local workflow records are never committed.
