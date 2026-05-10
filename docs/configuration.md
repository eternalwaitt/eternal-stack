# Configuration

Profiles:

- Public default: observer hooks, prompt router, skill recorder, session cleanup.
- Strict local: PreToolUse guard, Stop verifier, compact recovery, WebSearch canary, and Hindsight canary.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Codex should receive shared standards through `AGENTS.md`, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
