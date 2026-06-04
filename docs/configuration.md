# Configuration

Profiles:

- Public default: observer hooks, prompt router, prompt expansion, `CLAUDE.md` reinjection, skill recorder, locked advisory rate limiter, session cleanup, scripts, docs, rules, skills, and agents.
- Strict local: public default plus `PreToolUse` guard, post-write quality checks, `PostToolUseFailure` repeated-failure blocker, `Stop` verifier, `SubagentStop` recorder, compact recovery, WebSearch canary, and Hindsight canary.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Codex should receive shared standards through `AGENTS.md`, `AGENTS.override.md` where intentional, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
Repo-owned ETRNL agents install into `~/.claude/agents/` by default. Local run ledgers stay under `~/.claude/control-plane/runs/`; review logs, browser QA reports, and context saves stay under `~/.claude/control-plane/artifacts/`. These local workflow records are never committed.

Install:

- `CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1` merges strict blocker hooks during install.
- `CLAUDE_CONTROL_PLANE_INSTALL_STARTUP=1` overwrites installed `AGENTS.md` and `CLAUDE.md` startup files instead of preserving existing local copies.

Updater:

- `CLAUDE_CONTROL_PLANE_UPDATE_CHECK=0` disables startup drift checks (enabled by default when unset).
- `CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK=1` enables cached upstream checks (disabled by default when unset).
- `CLAUDE_CONTROL_PLANE_AUTO_UPDATE=1` lets startup repair a stale local install from the recorded source checkout (disabled by default when unset).
- `CLAUDE_CONTROL_PLANE_UPDATE_INTERVAL_SEC` controls the remote-check cache window; default is `21600` seconds (six hours) when unset.
- `CLAUDE_CONTROL_PLANE_INSTALL_STATE` and `CLAUDE_CONTROL_PLANE_UPDATE_STATE` override the installed metadata and update cache paths for tests or custom Claude homes.

Prompt context:

- UserPromptSubmit reinjects global/project `CLAUDE.md` context once per session by default.
- `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=0` disables UserPromptSubmit reinjection of global/project `CLAUDE.md` context.
- `CLAUDE_CONTROL_PLANE_INJECT_CLAUDE_MD=always` restores per-prompt reinjection for debugging startup hierarchy drift.
- `CLAUDE_CONTROL_PLANE_CLAUDE_MD_MAX_CHARS` caps the injected `CLAUDE.md` block; default is `20000` characters.
- `CLAUDE_CONTROL_PLANE_USERPROMPT_CONTEXT_MAX_CHARS` caps the full UserPromptSubmit context; default is `20000` characters.
- Global context is read from `~/.claude/CLAUDE.md`.
- Project context is read in Claude startup order from ancestor `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` files, from broader directories down to the current working directory.
- Markdown `@*.md` references inside those files are expanded recursively up to five hops only when the referenced file stays inside the global Claude root or the importing project file's directory tree.
- Keep startup files concise. Use `AGENTS.md` for agent-neutral shared guidance, a tiny `CLAUDE.md` bridge for Claude-specific routing, `.claude/rules/` for scoped rules, and hooks/scripts for deterministic enforcement.

Rate limiter:

- `CLAUDE_CONTROL_PLANE_RATE_LIMITER=0` disables the advisory rate limiter.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_WINDOW_SEC`, `CLAUDE_CONTROL_PLANE_RATE_LIMITER_RAPID_THRESHOLD`, and `CLAUDE_CONTROL_PLANE_RATE_LIMITER_FAILURE_THRESHOLD` tune pace/failure warnings.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_MAX_LINES` bounds rate-limiter state history; default is `50` lines.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_WARN_INTERVAL_SEC` debounces repeated warnings; default is `60` seconds.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_LOCK_TIMEOUT_SEC` controls lock wait time; default is `2` seconds.
- `CLAUDE_CONTROL_PLANE_RATE_LIMITER_DIR` overrides the advisory rate-limiter state directory.

Workflow state:

- `CLAUDE_CONTROL_PLANE_RUNS_DIR` overrides local execution-ledger storage.
- `CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR` overrides local review, browser-QA, context, and buglog artifact storage.
- `CLAUDE_CONTROL_PLANE_BUGLOG` overrides the project bug-memory file used by `project-buglog.mjs`.
- `CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS=1` enables project-level bug-memory hints at SessionStart; `0` disables them. When unset, hints are only considered when scoped workflow-health reports active trouble.
- `CLAUDE_CONTROL_PLANE_LEARNING_HINT_MAX_CHARS` caps SessionStart learning hints; default is `500` characters.
- `CLAUDE_CONTROL_PLANE_LEARNING_HINT_MAX_AGE_DAYS` caps stale bug-memory suggestions; default is `90` days.
- `ETRNL_STALE_RUN_HOURS`, `ETRNL_CONTEXT_STALE_HOURS`, and `ETRNL_LEDGER_READ_CONCURRENCY` tune workflow-health and context staleness checks.
- `ETRNL_TOOL_EFFECTIVENESS_DISABLED=1` disables future hook-side tool-effectiveness recording if it becomes noisy during rollout.
- `~/.claude/control-plane/tool-effectiveness/projects.json` is the local continuous-project pilot registry for CodeGraph/Beads effectiveness. Keep real project paths there, not in this public repo. Use `templates/tool-effectiveness-projects.example.json` as the tracked schema example.
- `node scripts/tool-effectiveness.mjs baseline --since-days 7 --json` captures the pre-pilot comparison window when live data exists. `node scripts/tool-effectiveness.mjs import-codex --input <file-or-dir> --dry-run --json` imports only sanitized Codex tool names, timing buckets, edit/check classes, and project hashes.
- `CLAUDE_CONTROL_PLANE_GIT_TIMEOUT_MS` and `CLAUDE_CONTROL_PLANE_GIT_MAX_BUFFER_BYTES` tune Git subprocess limits for Node helpers. Legacy `GIT_TIMEOUT_MS`, `GIT_MAX_BUFFER_BYTES`, and `GIT_MAX_BUFFER` are still accepted as fallbacks.
- `CLAUDE_CONTROL_PLANE_SERENA_SCOPE_GUARD` defaults to enabled when unset. It requires `mcp__serena__search_for_pattern` calls to include `relative_path` or `paths_include_glob`, `max_answer_chars` from `1..20000`, and `context_lines_before`/`context_lines_after` from `0..5`. Set `CLAUDE_CONTROL_PLANE_SERENA_SCOPE_GUARD=0` to opt out.

Guard state and break-glass:

- `CLAUDE_GUARD_DISABLED=1` bypasses hooks for emergency repair only.
- `CLAUDE_GUARD_STATE_DIR` overrides hook state storage; default is the system temp directory.
- `CLAUDE_GUARD_METRICS_PATH` overrides the hook metrics JSONL path.
- `CLAUDE_GUARD_DEBUG=1` prints extra guard diagnostics.
- `CLAUDE_GUARD_OVERRIDE_TOKEN` supplies a one-time override token for approved safety-critical commands.
- `CLAUDE_GUARD_WEBSEARCH_CANARY` points strict WebSearch checks at a custom canary result file.
- `CLAUDE_GUARD_PORT_START`, `CLAUDE_GUARD_PORT_END`, `CLAUDE_GUARD_MAX_PORT_SCAN`, and `CLAUDE_GUARD_FORCE_LARGE_SCAN=1` tune local dev-server port selection.
