# Configuration

Profiles:

- Public default: observer hooks, prompt router, skill recorder, session cleanup.
- Strict local: PreToolUse guard, Stop verifier, SubagentStop recorder, compact recovery, WebSearch canary, and Hindsight canary.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Codex should receive shared standards through `AGENTS.md`, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
Repo-owned ETRNL agents install into `~/.claude/agents/` by default. Local run ledgers stay under `~/.claude/control-plane/runs/`; review logs, browser QA reports, and context saves stay under `~/.claude/control-plane/artifacts/`. These local workflow records are never committed.

Updater:

- `CLAUDE_CONTROL_PLANE_UPDATE_CHECK=0` disables startup drift checks (enabled by default when unset).
- `CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK=1` enables cached upstream checks (disabled by default when unset).
- `CLAUDE_CONTROL_PLANE_AUTO_UPDATE=1` lets startup repair a stale local install from the recorded source checkout (disabled by default when unset).
- `CLAUDE_CONTROL_PLANE_UPDATE_INTERVAL_SEC` controls the remote-check cache window; default is `21600` seconds (six hours) when unset.

Prompt context:

- `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0` disables UserPromptSubmit reinjection of global/project `CLAUDE.md` context.
- `CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS` caps the injected `CLAUDE.md` block; default is `20000` characters.
- `CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS` caps the full UserPromptSubmit context; default is `20000` characters.

Rate limiter:

- `CLAUDE_CONTROL_PLANE_RATE_LIMITER=0` disables the advisory rate limiter.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_WINDOW_SEC`, `CLAUDE_CONTROL_PLANE_RATE_LIMITER_RAPID_THRESHOLD`, and `CLAUDE_CONTROL_PLANE_RATE_LIMITER_FAILURE_THRESHOLD` tune pace/failure warnings.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_WARN_INTERVAL_SEC` debounces repeated warnings; default is `60` seconds.
