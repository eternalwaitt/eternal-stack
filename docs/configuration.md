# Configuration

Profiles:

- Core install: observer hooks, prompt router, prompt expansion, `CLAUDE.md` reinjection, skill recorder, locked advisory rate limiter, session cleanup, scripts, docs, rules, skills, agents, settings audit, and Codex skill/runtime sync.
- Full install: core plus CodeGraph, Beads, Hindsight plugin/config, stack profile metadata, memory posture checks, and canaries.
- Strict mode: adds `PreToolUse` guard, post-write sycophancy and quality checks, `PostToolUseFailure` repeated-failure blocker, and `SubagentStop` recorder on top of the default template. Default install already registers `Stop` verifier, compact recovery, RTK `rg` compat, and observer hooks.
- Private overlay: identity, accounts, local permissions, and project-specific preferences.

Hook profiles (`ETRNL_HOOK_PROFILE`):

- `standard` (default when unset): all advisory hooks run; guards, compact recovery, session lifecycle, and stop verification are unchanged.
- `minimal`: early-exits advisory hooks only — `cc-posttooluse-sycophancy.sh`, `cc-posttoolbatch-observer.sh`, `cc-userprompt-expansion.sh`, `cc-rate-limiter.sh`, and `cc-compact-suggest.sh` — and skips the prompt router's advisory context (CLAUDE.md reinjection and the skill update check; deterministic skill-routing state still records). Guards (`cc-pretooluse-guard.sh`, `cc-stop-verifier.sh`), compact hooks, and session lifecycle hooks are never gated by profile.
- `strict`: same advisory surface as `standard`. Strict blocker hooks come from install strict mode (`ETRNL_ENABLE_STRICT=1` / `settings.strict.json`), not from this variable.

Invalid values fall back to `standard`. Missing `hooks/lib/profile.sh` is fail-open (standard behavior).

Per-hook skip (`ETRNL_SKIP_HOOKS`):

- A comma-separated list of hook names disables exactly those hooks without dropping to the minimal profile — for example `ETRNL_SKIP_HOOKS=cc-rate-limiter,cc-compact-suggest`.
- Names match the hook file basename with or without the `.sh` suffix, and surrounding whitespace is ignored.
- This is the narrow tool for turning off one noisy hook; `ETRNL_HOOK_PROFILE=minimal` remains the blunt instrument for turning off the whole advisory surface.

RTK token savings:

- Default recommendation: install Claude hooks with `rtk hook` (alias `rtk hook claude`) and sync Codex with `scripts/codex-rtk-pre-tool-use.sh` → `~/.codex/hooks/rtk-pre-tool-use.sh`.
- High-volume commands (`rg`, `git status`, and similar): route through `rtk proxy --ultra-compact <command>` when compact rewrite is unsafe. Repo hook `cc-rtk-rg-compat.sh` rewrites unsupported Claude `rg` forms before the guard runs.
- Measure savings: `rtk gain` reports global token savings; `scripts/doctor.sh` surfaces RTK presence and a short gain summary when RTK is installed (info-only, non-blocking).

MCP hygiene:

- When three or more MCP servers are configured, defer tool schema injection (lazy-mcp or equivalent) so dynamic MCP catalogs do not inflate every prompt prefix.
- Library and API doc lookups: Context7 MCP or ref-tools; do not duplicate that surface in skills or startup files.
- Repository code search: Codegraph MCP remains canonical for structure, call paths, and blast radius — prefer it over raw `rg`/`grep` for “how does X work” questions.

Codex-first efficiency profile:

Use this operator runbook before a long Codex CLI run when you want a cheap, low-context session. Measured agent runs show that context volume — not generation — dominates cost: in one 20-hour run, subagents accounted for most token spend, and the vast majority of subagent input was re-sent cached context rather than new output. Every MCP server enabled at session start inflates that baseline on every turn. The levers below shrink the fixed prefix without disabling guards, compact recovery, or session lifecycle hooks.

| Lever | Control | Where to read more |
| --- | --- | --- |
| RTK command proxy | Install `rtk hook` (alias `rtk hook claude`); sync Codex with `scripts/codex-rtk-pre-tool-use.sh` → `~/.codex/hooks/rtk-pre-tool-use.sh`; route high-volume commands through `rtk proxy --ultra-compact <command>` when compact rewrite is unsafe | see the `RTK token savings` section below |
| Minimal hook profile | `ETRNL_HOOK_PROFILE=minimal` early-exits advisory hooks only (`cc-posttooluse-sycophancy.sh`, `cc-posttoolbatch-observer.sh`, `cc-userprompt-expansion.sh`, `cc-rate-limiter.sh`, `cc-compact-suggest.sh`, and the prompt router's advisory context); guards and lifecycle hooks always run | see `Hook profiles (ETRNL_HOOK_PROFILE)` below |
| Per-hook skip | `ETRNL_SKIP_HOOKS=cc-rate-limiter,cc-compact-suggest` disables named hooks without the full minimal profile | see `Per-hook skip (ETRNL_SKIP_HOOKS)` below |
| Prompt budget caps | Keep startup files concise; tune `ETRNL_CLAUDE_MD_MAX_CHARS`, `ETRNL_USERPROMPT_CONTEXT_MAX_CHARS`, and `ETRNL_SKILL_UPDATE_MAX_CHARS`; doctor runs `scripts/prompt-budget-check.mjs` (repo-owned skills ≤ 18 000 bytes, agents ≤ 14 000 bytes) | see `Prompt context` below |
| Disable auto-update on dirty checkout | `ETRNL_AUTO_UPDATE=0` stops automatic local Eternal Stack repair from the recorded source checkout while you develop with uncommitted changes | see `Updater` below |
| Lazy MCP loading | When three or more MCP servers are configured, defer tool schema injection (lazy-mcp or equivalent) so dynamic MCP catalogs do not inflate every prompt prefix | see `MCP hygiene` above |
| Explicit subagent model | Every spawned agent carries an explicit model slug and reasoning effort instead of inheriting the parent thread's flagship model | see `Codex spawn model and reasoning effort` below |
| Lighter execute profile | `ETRNL_EXECUTE_HOST=codex` runs `/etrnl-dev-execute` with two concurrent lanes and merged per-wave review; `claude` forces the unchanged Claude path | see `Codex spawn model and reasoning effort` below |
| Review economy thresholds | Park a reviewer stream on recurring findings, stream alternation, or rounds without progress, and auto-skip reviewers that keep returning nothing | see `Review economy` below |

Pre-run MCP audit checklist (manual):

1. Count how many MCP servers are enabled in your Codex or Claude host config (`~/.codex/config.toml`, `$CODEX_HOME/config.toml`, or `~/.claude/settings.json` plugin/MCP entries — whichever host you are driving).
2. For each enabled server, decide whether this task needs its tools at all. Common prune candidates: doc-lookup MCPs when you are not fetching library docs, browser MCPs when you are not doing UI QA, secondary search/index MCPs when CodeGraph already covers code structure, and memory/recall plugins when you are not using them this session.
3. Disable or remove servers you do not need before starting a long run. Eternal Stack does not auto-uninstall user MCP servers at install time — pruning stays a deliberate operator step.
4. If three or more servers remain enabled, confirm lazy MCP loading (or an equivalent deferral) is active so tool schemas are not injected on every turn.

Why it matters: each listed MCP tool adds schema and instruction text to the session prefix. That prefix is re-sent on every turn and multiplied across subagents, so trimming servers before you start saves more than turning down model temperature or shortening individual replies.

Codex spawn model and reasoning effort:

A `spawn_agent` call that omits `model` inherits the parent thread's model, so a Sol-equivalent orchestrator spends flagship rates on every child turn. Because subagents dominate token spend, that single omission is the largest avoidable cost in a long run. `scripts/lib/codex-model-routing.mjs` is the one place the slug map lives; skills, packets, and the deep-audit lane registry all resolve through it rather than restating slugs.

`resolveCodexModel({ modelTier, codexModel, codexReasoningEffort, modelTierJustification })` returns a `{ model, reasoningEffort }` pair:

| Packet `modelTier` | Model | Reasoning effort | Typical lane |
| --- | --- | --- | --- |
| `fast` | `gpt-5.6-luna` | `low` | Read-only scout, reviewer, consumer trace, test lane |
| `standard` | `gpt-5.6-terra` | `medium` | Implementer with a write scope |
| `top` | `gpt-5.6-terra` | `high` | Schema, auth, money, migration, or install work |

- Precedence is packet `codexModel`/`codexReasoningEffort`, then `ETRNL_CODEX_MODEL_<TIER>` (`ETRNL_CODEX_MODEL_FAST`, `ETRNL_CODEX_MODEL_STANDARD`, `ETRNL_CODEX_MODEL_TOP`), then the static tier map above. There is no silent inherit at any step: an unknown tier, an unknown slug, or `codexReasoningEffort` without `codexModel` throws.
- `gpt-5.6-sol` resolves only when `modelTierJustification` names an integration-owner or adversarial escalation. Every other Sol request throws, including one supplied through the environment override.
- `node scripts/agent-task-packet-check.mjs` errors — not warns — when a write packet omits `codexModel`. Generate a starting packet with `--template read-only`, `--template write`, or `--template mini`; read-only templates emit `gpt-5.6-luna` and write templates emit `gpt-5.6-terra`.
- Deep-audit fan-out is routed the same way. Every lane in `scripts/lib/deep-audit-categories.mjs` declares a `modelTier` that is validated when the registry loads, and `resolveLaneDispatch(lane)` / `categoryLaneDispatch(categoryId)` return the resolved model and effort for a lane spawn. The eleven `ui-ux-product` and `performance` lanes currently resolve to seven at `gpt-5.6-terra`/medium and four at `gpt-5.6-luna`/low, with none inheriting.
- `ETRNL_EXECUTE_HOST` selects the execute profile: `codex` runs the lighter Codex profile, `claude` runs the unchanged Claude path, and leaving it unset auto-detects a Codex session. The Codex profile defaults `maxConcurrentLanes` to `2` (Claude keeps `3`) and merges review into one pass per wave for tier 0–2; tier 3 keeps all three reviewer roles and never has its declared risk tier downgraded by the profile.
- Progress reporting drops rolling hour ETAs, wall-clock finish times, and elapsed-time percentages on every host. User-facing status comes from `node scripts/execution-ledger.mjs history --gates [--plan <path>] [--json]`, which reports `tasks=<done>/<total>`, `phase`, `phaseStatus`, `workstream`, `uatGate`, and `uatOpenFindings`, then `planStatus`, `nextGate`, and `nextGatePhase`. Without `--plan` it reports `planStatus=not-provided` and still exits 0.

Review economy:

- `ETRNL_REVIEW_RECURRING_FINDING_LIMIT` (default `3`), `ETRNL_REVIEW_STREAM_ALTERNATION_LIMIT` (default `4`), and `ETRNL_REVIEW_ROUNDS_SINCE_PROGRESS_LIMIT` (default `2`) set the trajectory thresholds at which a review stream parks before the reopen cap is exhausted. `node scripts/execution-ledger.mjs record-trajectory --wave <id>` persists the matching per-wave counters that `review-merge.mjs` reads.
- `ETRNL_REVIEW_ADAPTIVE_SKIP_STREAK` (default `5`) sets how many consecutive zero-finding dispatches a reviewer needs before `node scripts/review-merge.mjs skip-plan` proposes skipping it. Counters live in an additive `reviewerDispatches` key inside the existing `review-learnings.json`, so `review-learn.mjs` recurrence data and dispatch counts share one store.
- Security lenses, tenancy lenses, and every deep-audit lane are exempt and always dispatch. The lane exemption is derived live from the deep-audit registry rather than copied into a second list, and when that registry cannot be loaded the plan reports `skipEvaluation: unavailable` and nothing skips.
- Skips carry a machine-readable `reasonCode`, so a review that did not happen stays distinguishable from one that found nothing.
- `node scripts/review-rules.mjs check --report-only` reports the same deterministic findings without escalating a block-mode match, and exits 0. Use it for advisory passes; the pre-push gate stays `check --changed-only`.

CodeGraph MCP tool surface:

CodeGraph's MCP server (`codegraph serve --mcp`) exposes one tool by default — `codegraph_explore` — because a single Read-equivalent lookup steers agents better than a menu of narrow tools and keeps the MCP catalog small. Seven auxiliary tools (`codegraph_node`, `codegraph_search`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_files`, `codegraph_status`) remain fully functional but unlisted unless you opt in; most of what they return already arrives inline on a `codegraph_explore` response (blast radius, relationship map, symbol bodies, callee lists).

- `CODEGRAPH_MCP_TOOLS`: comma-separated allowlist of short tool names (for example `explore,node`) that replaces the default listed surface. Matching is case-insensitive and accepts either short names (`node`) or full names (`codegraph_node`). Set it in the MCP server environment (Codex MCP config or the host's MCP launch env) before the session starts. Each additional listed tool adds schema tokens to every turn; only re-enable tools whose narrower contract you actually need.
- `codegraph_node` read mode: when listed, fetches one symbol's verbatim source plus caller/callee trail, or reads a whole indexed file with line numbers (Read-parity, capped like a normal file read). Use it when you want file- or symbol-scoped reads without the broader flow synthesis that `codegraph_explore` adds. Prefer leaving it unlisted and using `codegraph_explore` unless you have measured mis-picks or repeated whole-file reads that `node` would handle more cheaply.

Codex should receive shared standards through `AGENTS.md`, `AGENTS.override.md` where intentional, Codex hooks, or Codex skills. Claude-specific hook wiring should stay in Claude settings.

Installed public rules live under `~/.claude/rules/etrnl/` so they do not clobber existing personal rule files.
The cross-host eternal-saas pack installs as `~/.claude/rules/eternal-saas/` (global digest for Codex) and exports `.mdc` twins via `scripts/sync-rule-exports.mjs`. Project-level pack installs use `scripts/init-project-rules.sh --profile eternal-saas <repo>` and write to the target repo's `.claude/rules/eternal-saas/` and `.cursor/rules/eternal-saas/`. `rules-manifest.json` at the repo root is the schema-v1 authority for module checksums, privacy gates, and host metadata.
Repo-owned ETRNL agents install into `~/.claude/agents/` by default. Local run ledgers stay under `~/.claude/etrnl/runs/`; review logs, browser QA reports, and context saves stay under `~/.claude/etrnl/artifacts/`. These local workflow records are never committed.

Install:

- `ETRNL_STACK_PROFILE=core|full` sets the default install profile when `--profile` is omitted.
- `ETRNL_ENABLE_STRICT=1` merges strict blocker hooks during install.
- `./scripts/install.sh` backs up and resets managed `~/.claude/settings.json` to a vanilla settings shell before applying the selected stack, while preserving existing `enabledPlugins` and `statusLine` (for example a custom `~/.claude/statusline.sh` HUD). Use `--preserve-settings` only for a deliberate merge into existing settings.
- `ETRNL_INSTALL_STARTUP=1` overwrites installed `AGENTS.md` and `CLAUDE.md` startup files instead of preserving existing local copies.
- `ETRNL_INSTALL_SOURCE_TESTS=0` skips the pre-install source test suites (`tests/test-hooks.sh`, `tests/test-workflow-tools.sh`). Only for callers that already ran both suites as separate gates in the same pipeline (doctor heavy checks, `tests/test-install.sh`); a direct user install keeps them on, running in parallel with logs captured and the failing suite's log tail printed.
- `ETRNL_BACKUP_RETENTION` sets how many timestamped `etrnl-install-*` backup directories the installer keeps after a successful install; older backups beyond that count are pruned. Default is `5`; an invalid value falls back to `5`.
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
- `ETRNL_SKILL_UPDATE_CHECK=0` disables the prompt router's per-prompt requested-`etrnl-*`-skill freshness/auto-update check; enabled by default when unset. The check is non-blocking: local Eternal Stack updates are auto-applied silently (unless `ETRNL_AUTO_UPDATE=0` or the source checkout is dirty) and the agent continues the requested work — it never stops to ask update/snooze/continue. Any remaining remote or tool-stack updates are surfaced as informational only and are never turned into a blocking prompt.
- `ETRNL_SKILL_UPDATE_TIMEOUT_SEC` bounds each prompt-router skill-update subprocess; default is `5` seconds when unset.
- `ETRNL_SKILL_UPDATE_INTERVAL_SEC` stamp-gates the prompt-router skill-update check so it runs at most once per interval instead of on every prompt after a skill match; default is `1800` seconds. `ETRNL_SKILL_UPDATE_STAMP` overrides the stamp file path for tests.
- `ETRNL_SKILL_UPDATE_MAX_CHARS` caps the skill-update context the prompt router injects; default is `1200` characters when unset.
- `ETRNL_INSTALL_STATE` and `ETRNL_UPDATE_STATE` override the installed metadata and update cache paths for tests or custom Claude homes.

Prompt context:

- UserPromptSubmit reinjects global/project `CLAUDE.md` context once per session by default.
- `ETRNL_INJECT_CLAUDE_MD=0` disables UserPromptSubmit reinjection of global/project `CLAUDE.md` context.
- `ETRNL_INJECT_CLAUDE_MD=always` restores per-prompt reinjection for debugging startup hierarchy drift.
- `ETRNL_CLAUDE_MD_MAX_CHARS` caps the injected `CLAUDE.md` block; default is `20000` characters.
- `ETRNL_USERPROMPT_CONTEXT_MAX_CHARS` caps the advisory routing notes the prompt router injects, as a running total per session rather than per prompt; default is `8000` characters. Reinjected `CLAUDE.md` context is budgeted separately under `ETRNL_CLAUDE_MD_MAX_CHARS`. Setting this to `0` suppresses advisory notes entirely while leaving `CLAUDE.md` reinjection and skill routing intact.
- `ETRNL_USERPROMPT_DEDUP=0` disables per-session deduplication of routing hints, so an identical hint is re-injected on every matching prompt. Deduplication only changes what is re-sent: the routed skill is recorded in session state before the filter runs, so suppressing a hint never changes where a prompt routes.
- Global context is read from `~/.claude/CLAUDE.md`.
- Project context is read in Claude startup order from ancestor `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` files, from broader directories down to the current working directory.
- Markdown `@*.md` references inside those files are expanded recursively up to five hops only when the referenced file stays inside the global Claude root or the importing project file's directory tree.
- Keep startup files concise. Use `AGENTS.md` for agent-neutral shared guidance, a tiny `CLAUDE.md` bridge for Claude-specific routing, `.claude/rules/` for scoped rules, and hooks/scripts for deterministic enforcement.

Compact suggestion:

- `ETRNL_COMPACT_SUGGEST=0` disables the PreToolUse advisory that recommends checkpointing and compacting a large context window.
- `ETRNL_COMPACT_WINDOW_TOKENS` pins the context window and overrides every other source. Left unset, the window is resolved per session: the host's `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, then a `context_window.context_window_size` on the event payload, then the session model — `1000000` for the 1M generations (`claude-opus-4-7` and newer, `claude-sonnet-5`, `claude-fable-5`, `claude-mythos-*`) and for any model carrying a `[1m]` suffix, `200000` otherwise. `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` is honored and keeps the `200000` assumption. The threshold is a share of the window, so a smaller window makes the advisory fire earlier.
- `ETRNL_COMPACT_SUGGEST_PERCENT` sets the share of the window that triggers the advisory; default is `75` percent.
- `ETRNL_COMPACT_SUGGEST_INTERVAL_SEC` debounces repeats within a session; default is `900` seconds. Set to `0` to advise on every matching tool call.
- `ETRNL_COMPACT_SUGGEST_DIR` overrides the per-session debounce stamp directory.

Question preference:

- `ETRNL_QUESTION_PREFERENCE=0` disables the hook that auto-decides low-stakes `AskUserQuestion` and MCP ask-tool prompts.
- The preference map is read from the first readable file of `ETRNL_QUESTION_PREFERENCE_FILE`, then `.etrnl/question-preferences.json` in the project working directory, then `~/.claude/etrnl/question-preferences.json`. A malformed file is skipped rather than treated as empty.
- Release capability manifest: `ETRNL_RELEASE_MANIFEST` override, then `.etrnl/release.json` in the project working directory, then `~/.claude/etrnl/release.json`. Committed in app repos. **Auto-bootstrapped** on first guarded/migration PR or tier ≥ 2 plan gate in deployable app repos via `pr-preflight.mjs` and `plan-readiness-check.mjs` — no manual setup step.
- `ETRNL_QUESTION_PREFERENCE_MODE` overrides the resolved mode for a single run.
- Modes are `always-ask` (default when nothing is configured, and identical to not installing the hook), `never-ask` (auto-decide and deny the ask), and `ask-only-for-one-way` (auto-decide everything except one-way doors, which the safety clamp already protects).
- One-way doors always reach the user regardless of preference: deploy and release questions, production schema and migration changes, destructive data operations, auth and credentials, and money. No file entry or environment override can auto-answer them.
- When a mode would auto-decide but no option is available to carry, the hook allows the ask rather than stranding the turn.

A preference map sets a file-level mode and optional per-topic overrides. A topic matches when its `match` string (or the topic key, when `match` is absent) appears in the question text, and its `answer` becomes the auto-decided option:

```json
{
  "mode": "never-ask",
  "topics": {
    "test-framework": { "match": "test framework", "mode": "never-ask", "answer": "vitest" },
    "commit-style": { "match": "commit message", "mode": "always-ask" }
  }
}
```

Rate limiter:

- `ETRNL_RATE_LIMITER=0` disables the advisory rate limiter.
- `ETRNL_RATE_LIMITER_WINDOW_SEC`, `ETRNL_RATE_LIMITER_RAPID_THRESHOLD`, and `ETRNL_RATE_LIMITER_FAILURE_THRESHOLD` tune pace/failure warnings.
- `ETRNL_RATE_LIMITER_MAX_LINES` bounds rate-limiter state history; default is `50` lines.
- `ETRNL_RATE_LIMITER_WARN_INTERVAL_SEC` debounces repeated warnings; default is `60` seconds.
- `ETRNL_RATE_LIMITER_LOCK_TIMEOUT_SEC` controls lock wait time; default is `2` seconds.
- `ETRNL_RATE_LIMITER_DIR` overrides the advisory rate-limiter state directory.

Workflow state:

- `ETRNL_RUNS_DIR` overrides local execution-ledger storage.
- `CLAUDE_SESSION_ID` names the run-ledger bucket. When the host leaves it unset, the bucket is the worktree the command ran in, so concurrent sessions in different repositories keep separate ledgers. Set it explicitly only to share one ledger across worktrees on purpose.
- `ETRNL_ARTIFACTS_DIR` overrides local review, browser-QA, context, and buglog artifact storage.
- `ETRNL_STATE_DIR` overrides canonical ETRNL JSONL state storage for tests, staged installs, or local experiments.
- Default ETRNL state lives under `~/.claude/etrnl/state`; `events.jsonl` is canonical and `views/` are rebuildable materialized projections.
- `ETRNL_STATE_ROTATE_BYTES` (default 5MB) and `ETRNL_STATE_ROTATE_KEEP_DAYS` (default `14`) control event-log rotation: past the size threshold, events older than the window move to a dated `events-archive-*.jsonl` in the same directory on the next append.
- `ETRNL_STATE_LOCK_WAIT_MS` (default `10000`) bounds how long state appends wait for the store lock before failing.
- `ETRNL_TRANSCRIPT_SCAN_BYTES` (default `2000000`) caps how much of a large transcript the hooks scan when extracting the current assistant message.
- `ETRNL_BUGLOG` overrides the project bug-memory file used by `project-buglog.mjs`.
- `ETRNL_LEARNING_HINTS=0` disables the pretool guard's inline project bug-memory hints (from `scripts/project-buglog.mjs`); enabled by default when unset.
- `ETRNL_LEARNING_STARTUP_HINTS=1` enables project-level bug-memory hints at SessionStart; `0` disables them. When unset, hints are only considered when scoped workflow-health reports active trouble.
- `ETRNL_LEARNING_HINT_MAX_CHARS` caps SessionStart learning hints; default is `500` characters.
- `ETRNL_LEARNING_HINT_MAX_AGE_DAYS` caps stale bug-memory suggestions; default is `90` days.
- `ETRNL_STALE_RUN_HOURS`, `ETRNL_CONTEXT_STALE_HOURS`, and `ETRNL_LEDGER_READ_CONCURRENCY` tune workflow-health and context staleness checks.
- `ETRNL_STATE_PRIVATE_PROJECT_NAMES` and `ETRNL_TOOL_EFFECTIVENESS_PRIVATE_PROJECT_NAMES` add comma-separated local private project names to privacy rejection without committing those names to the public repo. `ETRNL_TOOL_EFFECTIVENESS_PRIVATE_PROJECT_NAMES` falls back to `ETRNL_STATE_PRIVATE_PROJECT_NAMES` when unset.
- `ETRNL_WORKFLOW_HEALTH_STRICT=1` or `node scripts/workflow-health.mjs doctor --strict` turns runtime workflow findings into a failing workflow-health doctor. `ETRNL_DOCTOR_STRICT_RUNTIME=1` applies that strict runtime gate from `scripts/doctor.sh`.
- `DOCTOR_JOBS` (default `min(16, nproc)`) and `scripts/doctor.sh --jobs N` tune parallel syntax, schema JSON, and heavy-suite concurrency in doctor.
- `DOCTOR_INSTALL_SUITE=smoke|full` and `ETRNL_DOCTOR_FULL_INSTALL=1` select the install integration tier in doctor. Default full doctor runs `tests/test-install-smoke.sh` with `RUN_INSTALL_SMOKE_MODE=fast`; release and install-path validation should set `ETRNL_DOCTOR_FULL_INSTALL=1` to run `tests/test-install.sh`.
- `ETRNL_PERF_MAX_GATE_REPEATS` (default `3`), `ETRNL_PERF_MAX_COMPACT_STALE` (default `5`), and `ETRNL_PERF_MAX_WAIT_RATIO` (default `0.5`) tune workflow-health performance threshold warnings on `gateMaxRepeatsAtTreeHash`, `compactStaleEvents`, and `waitCallRatio`; non-zero exit only under `workflow-health.mjs doctor --strict`.
- `ETRNL_TOOL_EFFECTIVENESS_DISABLED=1` disables the tool-effectiveness pipeline: `node scripts/tool-effectiveness.mjs summarize`, `import-codex`, and `baseline` emit `{ "disabled": true }` and exit cleanly; `node scripts/workflow-health.mjs status` and `doctor` omit effectiveness findings from their output.
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
- `CLAUDE_GUARD_LOCK_STALE_SECS` (seconds, default `30`, must be a positive integer or it falls back to `30`) tunes ownership-aware stale-lock reaping so a hook killed mid-write does not stall every later tool call. A lock records its holder's PID: a **dead-owner** lock is reaped immediately; an **ownerless/legacy** lock is reaped once it is older than this threshold; a **live-owner** lock is spared until an absurd age (`stale_secs × 20`) to defend against PID reuse. It is not the case that any lock held for this duration is orphaned — a live holder keeps its lock well past it.
- `CLAUDE_GUARD_METRICS_PATH` overrides the hook metrics JSONL path.
- `CLAUDE_GUARD_DEBUG=1` prints extra guard diagnostics.
- `CLAUDE_GUARD_FILE_SPRAWL=1` re-enables the opt-in new-source-file sprawl check (blocks a Write that would create the fourth-or-later new source file this session — i.e. when three or more new source files already exist — outside the active write scope); disabled by default when unset.
- `CLAUDE_GUARD_OVERRIDE_TOKEN` supplies a one-time override token for approved safety-critical commands.
- `CLAUDE_GUARD_WEBSEARCH_CANARY` points strict WebSearch checks at a custom canary result file.
- `CLAUDE_GUARD_PORT_START`, `CLAUDE_GUARD_PORT_END`, `CLAUDE_GUARD_MAX_PORT_SCAN`, and `CLAUDE_GUARD_FORCE_LARGE_SCAN=1` tune local dev-server port selection.
