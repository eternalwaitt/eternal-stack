# Configuration

Profiles:

- Core install: observer hooks, prompt router, prompt expansion, `CLAUDE.md` reinjection, skill recorder, locked advisory rate limiter, session cleanup, scripts, docs, rules, skills, agents, settings audit, and Codex skill/runtime sync.
- Full install: core plus CodeGraph, Beads, Hindsight plugin/config, stack profile metadata, memory posture checks, and canaries.
- Strict mode: adds `PreToolUse` guard, post-write quality checks, `PostToolUseFailure` repeated-failure blocker, `Stop` verifier, `SubagentStop` recorder, compact recovery, WebSearch canary, and Hindsight canary to the selected core or full profile.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Codex should receive shared standards through `AGENTS.md`, `AGENTS.override.md` where intentional, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
Repo-owned ETRNL agents install into `~/.claude/agents/` by default. Local run ledgers stay under `~/.claude/etrnl/runs/`; review logs, browser QA reports, and context saves stay under `~/.claude/etrnl/artifacts/`. These local workflow records are never committed.

Install:

- `ETRNL_STACK_PROFILE=core|full` sets the default install profile when `--profile` is omitted.
- `ETRNL_ENABLE_STRICT=1` merges strict blocker hooks during install.
- `./scripts/install.sh` backs up and resets managed `~/.claude/settings.json` to a vanilla settings shell before applying the selected stack, while preserving existing `enabledPlugins` and `statusLine` (for example a custom `~/.claude/statusline.sh` HUD). Use `--preserve-settings` only for a deliberate merge into existing settings.
- `ETRNL_INSTALL_STARTUP=1` overwrites installed `AGENTS.md` and `CLAUDE.md` startup files instead of preserving existing local copies.
- `ETRNL_BOOTSTRAP_PROJECTS=1` lets a full install initialize or verify project-local `.codegraph` and `.beads` state.
- `ETRNL_HINDSIGHT_MODE=local-daemon|external-api|docker-server` selects full-profile Hindsight provisioning mode.
- `local-daemon` mode requires a local Hindsight daemon or `uvx hindsight-embed`/`hindsight-embed`; set `HINDSIGHT_DAEMON_SOCKET` only when your local daemon uses a non-default socket.
- `HINDSIGHT_API_URL` is required for `external-api` mode; `HINDSIGHT_API_TOKEN` remains an environment secret and is not written to tracked files.
- `docker-server` mode requires Docker plus the Hindsight image selection, such as `HINDSIGHT_DOCKER_IMAGE` and `HINDSIGHT_DOCKER_TAG`; configure registry credentials and host port mapping outside tracked files.

Updater:

- `ETRNL_UPDATE_CHECK=0` disables startup drift checks (enabled by default when unset).
- `ETRNL_REMOTE_UPDATE_CHECK=1` enables cached upstream checks (disabled by default when unset).
- `ETRNL_AUTO_UPDATE`: unset means local auto-update is enabled from the recorded source checkout (SessionStart, requested Claude `etrnl-*` skills via the prompt router, and Codex `skill-update-prompt.mjs`); set `ETRNL_AUTO_UPDATE=0` to disable automatic local etrnl repair while developing against a dirty source checkout.
- `ETRNL_AUTO_UPDATE_DIRTY=1` allows SessionStart auto-update even when `install.json` marks the source checkout as dirty (`sourceDirty: true`); leave unset to skip auto-update until the checkout is clean or changes are committed.
- `ETRNL_UPDATE_INTERVAL_SEC` controls the remote-check cache window; default is `21600` seconds (six hours) when unset.
- `ETRNL_INSTALL_STATE` and `ETRNL_UPDATE_STATE` override the installed metadata and update cache paths for tests or custom Claude homes.

Prompt context:

- UserPromptSubmit reinjects global/project `CLAUDE.md` context once per session by default.
- `ETRNL_INJECT_CLAUDE_MD=0` disables UserPromptSubmit reinjection of global/project `CLAUDE.md` context.
- `ETRNL_INJECT_CLAUDE_MD=always` restores per-prompt reinjection for debugging startup hierarchy drift.
- `ETRNL_CLAUDE_MD_MAX_CHARS` caps the injected `CLAUDE.md` block; default is `20000` characters.
- `ETRNL_USERPROMPT_CONTEXT_MAX_CHARS` caps the full UserPromptSubmit context; default is `20000` characters.
- Global context is read from `~/.claude/CLAUDE.md`.
- Project context is read in Claude startup order from ancestor `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` files, from broader directories down to the current working directory.
- Markdown `@*.md` references inside those files are expanded recursively up to five hops only when the referenced file stays inside the global Claude root or the importing project file's directory tree.
- Keep startup files concise. Use `AGENTS.md` for agent-neutral shared guidance, a tiny `CLAUDE.md` bridge for Claude-specific routing, `.claude/rules/` for scoped rules, and hooks/scripts for deterministic enforcement.

Rate limiter:

- `ETRNL_RATE_LIMITER=0` disables the advisory rate limiter.
- `ETRNL_RATE_LIMITER_WINDOW_SEC`, `ETRNL_RATE_LIMITER_RAPID_THRESHOLD`, and `ETRNL_RATE_LIMITER_FAILURE_THRESHOLD` tune pace/failure warnings.
- `ETRNL_RATE_LIMITER_MAX_LINES` bounds rate-limiter state history; default is `50` lines.
- `ETRNL_RATE_LIMITER_WARN_INTERVAL_SEC` debounces repeated warnings; default is `60` seconds.
- `ETRNL_RATE_LIMITER_LOCK_TIMEOUT_SEC` controls lock wait time; default is `2` seconds.
- `ETRNL_RATE_LIMITER_DIR` overrides the advisory rate-limiter state directory.

Workflow state:

- `ETRNL_RUNS_DIR` overrides local execution-ledger storage.
- `ETRNL_ARTIFACTS_DIR` overrides local review, browser-QA, context, and buglog artifact storage.
- `ETRNL_STATE_DIR` overrides canonical ETRNL JSONL state storage for tests, staged installs, or local experiments.
- Default ETRNL state lives under `~/.claude/etrnl/state`; `events.jsonl` is canonical and `views/` are rebuildable materialized projections.
- `ETRNL_BUGLOG` overrides the project bug-memory file used by `project-buglog.mjs`.
- `ETRNL_LEARNING_STARTUP_HINTS=1` enables project-level bug-memory hints at SessionStart; `0` disables them. When unset, hints are only considered when scoped workflow-health reports active trouble.
- `ETRNL_LEARNING_HINT_MAX_CHARS` caps SessionStart learning hints; default is `500` characters.
- `ETRNL_LEARNING_HINT_MAX_AGE_DAYS` caps stale bug-memory suggestions; default is `90` days.
- `ETRNL_STALE_RUN_HOURS`, `ETRNL_CONTEXT_STALE_HOURS`, and `ETRNL_LEDGER_READ_CONCURRENCY` tune workflow-health and context staleness checks.
- `ETRNL_STATE_PRIVATE_PROJECT_NAMES` and `ETRNL_TOOL_EFFECTIVENESS_PRIVATE_PROJECT_NAMES` add comma-separated local private project names to privacy rejection without committing those names to the public repo. `ETRNL_TOOL_EFFECTIVENESS_PRIVATE_PROJECT_NAMES` falls back to `ETRNL_STATE_PRIVATE_PROJECT_NAMES` when unset.
- `ETRNL_WORKFLOW_HEALTH_STRICT=1` or `node scripts/workflow-health.mjs doctor --strict` turns runtime workflow findings into a failing workflow-health doctor. `ETRNL_DOCTOR_STRICT_RUNTIME=1` applies that strict runtime gate from `scripts/doctor.sh`.
- `ETRNL_TOOL_EFFECTIVENESS_DISABLED=1` disables future hook-side tool-effectiveness recording if it becomes noisy during rollout.
- `~/.claude/etrnl/tool-effectiveness/projects.json` is the local continuous-project pilot registry for CodeGraph/Beads effectiveness. Keep real project paths there, not in this public repo. Use `templates/tool-effectiveness-projects.example.json` as the tracked schema example.
- `node scripts/tool-effectiveness.mjs baseline --since-days 7 --json` captures the pre-pilot comparison window when live data exists. `node scripts/tool-effectiveness.mjs import-codex --input <file-or-dir> --dry-run --json` imports only sanitized Codex tool names, timing buckets, edit/check classes, and project hashes.
- `node scripts/etrnl-state.mjs compact-handoff --latest --json` shows the exact compact recovery packet that a synchronous `SessionStart(source=compact)` would inject.
- `node scripts/etrnl-state.mjs doctor --compact --explain` diagnoses compact pre/post state, stale verification, projection errors, and the next local command.
- Hindsight integration is semantic recall/export only. It cannot override ETRNL compact handoff state, and `cc-hindsight-lesson.py` records accepted lessons to ETRNL state before optional Hindsight export.
- Beads integration is explicit and backlog-only. Do not run `bd setup` or inject `bd prime` output as part of startup, resume, compact, or Stop hooks. Use `node scripts/etrnl-state.mjs bead-prime-audit --json` to reject raw Beads startup doctrine in fixtures or rollout checks.
- Dolt remains an optional future projection target. It is not used by lifecycle hooks.
- `ETRNL_GIT_TIMEOUT_MS` and `ETRNL_GIT_MAX_BUFFER_BYTES` tune Git subprocess limits for Node helpers. Legacy `GIT_TIMEOUT_MS`, `GIT_MAX_BUFFER_BYTES`, and `GIT_MAX_BUFFER` are still accepted as fallbacks.
- `ETRNL_SERENA_SCOPE_GUARD` defaults to enabled when unset. It requires `mcp__serena__search_for_pattern` calls to include `relative_path` or `paths_include_glob`, `max_answer_chars` from `1..20000`, and `context_lines_before`/`context_lines_after` from `0..5`. Set `ETRNL_SERENA_SCOPE_GUARD=0` to opt out.

Guard state and break-glass:

- `CLAUDE_GUARD_DISABLED=1` bypasses hooks for emergency repair only.
- `CLAUDE_GUARD_STATE_DIR` overrides hook state storage; default is the system temp directory.
- `CLAUDE_GUARD_METRICS_PATH` overrides the hook metrics JSONL path.
- `CLAUDE_GUARD_DEBUG=1` prints extra guard diagnostics.
- `CLAUDE_GUARD_OVERRIDE_TOKEN` supplies a one-time override token for approved safety-critical commands.
- `CLAUDE_GUARD_WEBSEARCH_CANARY` points strict WebSearch checks at a custom canary result file.
- `CLAUDE_GUARD_PORT_START`, `CLAUDE_GUARD_PORT_END`, `CLAUDE_GUARD_MAX_PORT_SCAN`, and `CLAUDE_GUARD_FORCE_LARGE_SCAN=1` tune local dev-server port selection.
