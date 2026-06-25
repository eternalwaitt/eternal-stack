# Guard Reference

Pretool deny rules, stop-verifier completion gates, fail-open behavior, and shared hook libraries. For the full hook catalog (every `cc-*` file, Claude events, default vs strict registration), start with [hooks.md](hooks.md).

## What runs when

| Layer | Registered in default install | Added in strict install |
| --- | --- | --- |
| Session / prompt | `cc-sessionstart-restore.sh`, `cc-userprompt-router.sh`, `cc-userprompt-expansion.sh` | — |
| Pretool | `cc-rtk-rg-compat.sh` (`Bash` only) | `cc-pretooluse-guard.sh` (expanded matchers) |
| Post-tool | `cc-rate-limiter.sh`, `cc-posttoolbatch-observer.sh` | `cc-posttooluse-sycophancy.sh`, `cc-posttooluse-quality.sh`, `cc-posttoolusefailure-diagnose.sh` |
| Completion | `cc-stop-verifier.sh` | `cc-subagentstop-record.sh` |
| Compact / end | `cc-precompact-save.sh`, `cc-postcompact-record.sh`, `cc-sessionend-save.sh` | — |

`cc-stop-verifier.sh` is not strict-only: both templates register it on `Stop`. Strict mode adds pretool and post-write blockers plus subagent recording.

## `cc-pretooluse-guard.sh`

Blocks unsafe or unscoped tool use before Claude executes the tool. Matcher (strict template): `Bash|Read|Edit|Write|MultiEdit|WebSearch|Task|TaskCreate|Agent|mcp__serena__search_for_pattern`.

Rule families (aggregated where possible so the agent can fix multiple issues in one pass):

| Family | Examples |
| --- | --- |
| Destructive Bash | `rm -rf`, broad deletes outside approved cleanup manifests |
| Output limiters | Pipes through `head`, `tail`, `sed -n` on command output that must be fully inspected |
| Inventory dumps | Unbounded `code-health-inventory.mjs --json` or `workflow-health.mjs --json` |
| Memory scans | Broad `~/.codex` memory directory scans instead of bounded file queries |
| Serena scope | `mcp__serena__search_for_pattern` without `relative_path` / glob / char limits |
| Read scope | Directory `Read` calls |
| Edit scope | Blind source edits, new source files without reuse search |
| File sprawl | Optional: `CLAUDE_GUARD_FILE_SPRAWL=1` blocks 3+ new source files per session unless write-scope coverage exists |
| Repeats | Identical verification or shell commands with no state change |
| Dev servers | Local servers without an explicit port from `port-guard.mjs` |
| Email / GWS writes | Risky outbound writes without triage context |
| WebSearch | Stale or missing canary when strict WebSearch checks are active |
| Policy / complexity | `code-patterns` and `complexity-check.mjs` violations on edited paths |
| Test weakening | Edits that remove assertions or safety checks |
| Subagents | Underspecified `Task` / `Agent` packets when a ledger expects structure |
| Disk cleanup | When `/etrnl-ops-disk-cleanup` is active: filesystem commands limited to dry-run manifests and `trash` on approved transient paths |

Override approved safety-critical commands with `CLAUDE_GUARD_OVERRIDE_TOKEN` when documented in your runbook.

## `cc-stop-verifier.sh`

Blocks completion claims on `Stop` when evidence is missing or stale. Runs in default and strict installs.

Checks include:

- Evidence-discipline violations (agreement before verification). Completion claims still block; non-final status updates receive advisory context instead of a hard Stop block.
- Completion language (`done`, `fixed`, `tests pass`, and similar) without matching verification runs after source edits.
- Incomplete execution-ledger evidence when a plan run is active.
- Stale verification after compact (`compact_post` marks verification stale until re-run). Status-only completions are advisory unless a plan run or edits make verification relevant.
- Dated source evidence for advice/search-style answers.
- Required artifacts: review logs, browser QA reports, context saves, skill-specific ledgers.
- Deflection language that labels failures as pre-existing or out-of-scope without evidence.
- Second-pass review requirements for broad or risky edits.

Explicit non-final status updates (paused deploy, awaiting approval, work in progress) are allowed when the message clearly defers completion.

## Post-write strict hooks

- **`cc-posttooluse-sycophancy.sh`**: blocks reflexive agreement phrases without evidence in the post-tool assistant message; may trigger `cc-hindsight-lesson.py`.
- **`cc-posttooluse-quality.sh`**: blocks when `complexity-check.mjs` reports complexity or test-quality regressions on the edited file.
- **`cc-posttoolusefailure-diagnose.sh`**: records failures; blocks only repeated identical failure fingerprints.

## Observer hooks (reference)

These hooks are documented in [hooks.md](hooks.md); they are listed here because operators often tune them alongside guards.

- **`cc-rate-limiter.sh`**: locked, debounced advisory warnings for tool-call spirals and repeated failures.
- **`cc-posttoolbatch-observer.sh`**: records reads, searches, commands, skills, edits, verification runs, repeated edits, and project bug-memory notes.
- **`cc-userprompt-router.sh`**: records requested skills, reinjects `CLAUDE.md` once per session, expands imports, injects routing hints.
- **`cc-userprompt-expansion.sh`**: markdown `@` import expansion (separate from routing).
- **`cc-sessionstart-restore.sh`**: compact handoff restore, drift/update checks via `update-check.mjs`.
- **`cc-precompact-save.sh` / `cc-postcompact-record.sh` / `cc-sessionend-save.sh`**: durable compact and session lifecycle events.

## Fail-open vs fail-closed matrix

| Hook / script | On internal error | On guard match |
| --- | --- | --- |
| `cc-rate-limiter.sh` | fail-open (exit 0) | advisory warning only |
| `cc-rtk-rg-compat.sh` | fail-open (exit 0) | rewrite Bash input when applicable |
| `cc-pretooluse-guard.sh` | fail-closed when strict hooks are enabled | block tool use |
| `cc-posttooluse-sycophancy.sh` | fail-open without dedup | block assistant turn |
| `cc-posttooluse-quality.sh` | fail-open | block assistant turn |
| `cc-posttoolusefailure-diagnose.sh` | fail-open | block on repeated identical failure |
| `cc-stop-verifier.sh` | fail-closed when verifier logic runs | block/reprompt completion |
| `cc-subagentstop-record.sh` | fail-closed when ledger active | block malformed subagent output |
| `cc-userprompt-router.sh` | fail-open (skip injection) | route/inject context |
| `cc-sessionstart-restore.sh` / `update-check.mjs` | skip update check silently | run local auto-update when enabled |
| `update-check.mjs` dirty source | skip auto-update unless `ETRNL_AUTO_UPDATE_DIRTY=1` | n/a |

`hooks/lib/complexity-check.mjs` lives under `hooks/lib/` on purpose: pretool guard and post-write quality hooks call it directly without a Node round-trip through `scripts/`.

## Dev-server ports

Pick a free port before running the project command:

```bash
port=$(node ~/.claude/scripts/port-guard.mjs pick --start 3100)
pnpm dev -- --port "$port"
```

Port checking is active for dev-server commands in strict mode. If `node` or `~/.claude/scripts/port-guard.mjs` is missing, the guard denies the dev-server command until the helper/runtime is restored. Install Node and rerun `scripts/install.sh` to restore strict checking.

Tune scanning with `CLAUDE_GUARD_PORT_START`, `CLAUDE_GUARD_PORT_END`, `CLAUDE_GUARD_MAX_PORT_SCAN`, and `CLAUDE_GUARD_FORCE_LARGE_SCAN=1`.

## Emergency bypass

```bash
export CLAUDE_GUARD_DISABLED=1
```

Use bypass only to repair broken hook configuration.

## Hook libraries

Shared modules under `hooks/lib/`:

| File | Role |
| --- | --- |
| `json.sh` | Stdin JSON, jq guards, block/context/allow responses |
| `state.sh` | Per-session state file, fingerprints, ETRNL append |
| `paths.sh` | Claude/Codex home and project path resolution |
| `event-extract.sh` | Resilient event field extraction |
| `command-classifiers.sh` | Bash and edit command classification |
| `code-patterns.sh` | Evidence discipline and completion phrase detection |
| `verification.sh` | Verification command recognition |
| `project-preflight.sh` | Project preflight command mapping |
| `skill-hints.sh` | Compact recovery skill reminders |
| `cleanup.sh` | EXIT-trap temp-file cleanup |
| `complexity-check.mjs` | File complexity and test-quality analysis |

See [hooks.md](hooks.md) for which hooks source each library.
