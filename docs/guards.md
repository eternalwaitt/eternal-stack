# Guard Reference

Pretool deny rules, stop-verifier completion gates, fail-open behavior, and shared hook libraries. For the full hook catalog (every `cc-*` file, Claude events, default vs strict registration), start with [hooks.md](hooks.md).

## What runs when

| Layer | Default install | Observer-only opt-out (`ETRNL_ENABLE_STRICT=0`) |
| --- | --- | --- |
| Session / prompt | `cc-sessionstart-restore.sh`, `cc-userprompt-router.sh`, `cc-userprompt-expansion.sh` | same |
| Pretool | `cc-spawn-guard.sh` (`Task / Agent / TaskCreate`), `cc-rtk-rg-compat.sh` (`Bash`), `cc-pretooluse-guard.sh` | `cc-spawn-guard.sh`, `cc-rtk-rg-compat.sh` only |
| Post-tool | `cc-rate-limiter.sh`, `cc-posttoolbatch-observer.sh`, `cc-posttooluse-sycophancy.sh`, `cc-posttooluse-quality.sh`, `cc-posttoolusefailure-diagnose.sh` | `cc-rate-limiter.sh`, `cc-posttoolbatch-observer.sh` only |
| Completion | `cc-stop-verifier.sh`, `cc-subagentstop-record.sh` | `cc-stop-verifier.sh` only |
| Compact / end | `cc-precompact-save.sh`, `cc-postcompact-record.sh`, `cc-sessionend-save.sh` | same |

`cc-stop-verifier.sh` runs in both templates on `Stop`. Default install adds pretool and post-write blockers plus subagent recording.

### Install ordering and overrides

`scripts/merge-settings.mjs` merges stack hooks into your existing `settings.json` on every install. Two behaviors are intentional and worth knowing:

- **Stack guards run before user hooks.** Merge assigns a deterministic order — `cc-rtk-rg-compat.sh` (10), `cc-spawn-guard.sh` (15), `cc-pretooluse-guard.sh` (20), `rtk-rewrite.sh` (30) — and everything else defaults to 100. A `PreToolUse` hook you added yourself therefore runs *after* the stack guards even if it was originally listed first; user hooks keep their relative order among themselves. This guarantees the guard inspects a tool call before any user hook can act on it.
- **Stack-owned hook metadata is reset to template values on every install; matcher tokens are merged.** When a hook command already exists in your settings, the template entry wins on `timeout`, `statusMessage`, and `enabled` (last-write-wins), so a stale or hand-edited copy of that metadata is repaired to the current template. The `matcher` is treated differently: merge computes the *union* of the template's matcher tokens and your existing ones (`mergeMatcher` → `matcherFromTokens`), so extra matcher tokens you added persist across installs. Only a matcher you shrank below the template set is restored — the template tokens are re-added, but nothing you added on top is dropped. To change `timeout`, `statusMessage`, or `enabled` durably, edit the template you install from rather than `settings.json`, since an in-place edit to those fields is overwritten on the next install/update.

## `cc-pretooluse-guard.sh`

Blocks unsafe or unscoped tool use before Claude executes the tool. Matcher (default template): `Bash|Read|Edit|Write|MultiEdit|WebSearch|Task|TaskCreate|Agent|mcp__serena__search_for_pattern`.

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
| File sprawl | Optional: `CLAUDE_GUARD_FILE_SPRAWL=1` blocks a fourth-or-later new source file per session (once three already exist) unless write-scope coverage exists |
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

Blocks completion claims on `Stop` when evidence is missing or stale. Runs in both install templates.

Checks include:

- Evidence-discipline violations (agreement before verification). Completion claims still block; non-final status updates receive advisory context instead of a hard Stop block.
- Completion language (`done`, `fixed`, `tests pass`, and similar) without matching verification runs after source edits.
- Incomplete execution-ledger evidence when a plan run is active.
- Stale verification when the worktree hash changed or is unknown. A green ledger check with matching `treeHash` stays fresh after compact; `compact_post` no longer unconditionally marks verification stale when the hash resolves. Status-only completions are advisory unless a plan run or edits make verification relevant. Staleness is scoped to the paths edited *after* the last recorded verification: when every one of them is non-runtime under the `diff-triviality.mjs` taxonomy (docs, assets, metadata), the green run still describes the executable state and the gate stays quiet — one runtime path among them puts it back in force. Verification runs include project gate scripts (`bash tests/test-hooks.sh`, `node --test`) and health gates (`bash scripts/doctor.sh`) alongside package-manager tasks, but only when the command actually executes them; reading or searching a gate script does not count.
- Dated source evidence for advice/search-style answers.
- Required artifacts: review logs, browser QA reports, context saves, skill-specific ledgers.
- A routed skill (`requestedSkills`) that was never invoked. Only requests from the last hour count: `requestedSkills` is append-only and never cleared, so an unbounded gate let one keyword match block every later completion in the session; an entry without a parseable timestamp is treated the same as an expired one. The block is satisfiable two ways — invoke the skill, or name it in the final message and say why it does not apply. An accepted rationale is recorded in `skillRequestWaivers`, so it is needed once rather than in every later message, and a request newer than its waiver blocks again because that is a new ask. Naming the skill without a reason, or giving a reason without naming it, does not clear the gate.
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
- **`cc-posttoolbatch-observer.sh`**: records reads, searches, commands, skills, edits, verification runs, repeated edits, and project bug-memory notes; auto-records allowlisted gate commands (`test-hooks`, `test-workflow-tools`, `doctor`, `doctor --changed`, `plan-readiness-check.mjs`) into the active ledger via `ledger-gate-record.sh`.
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
| Worktree hash lookup (`cc_worktree_hash`) | fail-open to stale verification (re-run required) | treat verification as stale |
| Auto gate recording (`ledger-gate-record.sh`) | fail-open (skip record) | record allowlisted gate commands only; non-allowlisted commands never auto-recorded |
| `cc-subagentstop-record.sh` | fail-closed when ledger active | block malformed subagent output |
| `cc-userprompt-router.sh` | fail-open (skip injection) | route/inject context |
| `cc-compact-suggest.sh` | fail-open (exit 0) | advisory checkpoint-and-compact note only |
| `cc-question-preference.sh` | fail-open (allow the ask) | deny the ask and carry the auto-decided option, except one-way doors which always allow |
| `cc-sessionstart-restore.sh` / `update-check.mjs` | skip update check silently | run local auto-update when enabled |
| `update-check.mjs` dirty source | skip auto-update unless `ETRNL_AUTO_UPDATE_DIRTY=1` | n/a |

`hooks/lib/complexity-check.mjs` lives under `hooks/lib/` on purpose: pretool guard and post-write quality hooks call it directly without a Node round-trip through `scripts/`.

## Dev-server ports

Pick a free port before running the project command:

```bash
port=$(node ~/.claude/scripts/port-guard.mjs pick --start 3100)
pnpm dev -- --port "$port"
```

Port checking is active for dev-server commands when the pretool guard is installed (default). If `node` or `~/.claude/scripts/port-guard.mjs` is missing, the guard denies the dev-server command until the helper/runtime is restored. Install Node and rerun `scripts/install.sh` to restore checking.

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
| `state.sh` | Per-session state file, fingerprints, ETRNL append, worktree hash and tree-hash verification freshness |
| `ledger-gate-record.sh` | Allowlisted gate-command detection and async ledger `record-check` |
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

## Spawn guard (`cc-spawn-guard.sh`, Codex `spawn-guard-pre-tool-use.sh`)

Deterministic spawn economics via `execution-ledger.mjs check-spawn`. The hook is the **sole spawn recorder** when mode is `enforce`; the skill uses `--dry-run` only while debugging.

| Condition | Behavior |
| --- | --- |
| Active execution ledger + enforce mode | Fail-closed on economics violations |
| No ledger / outside execute (`planExecutionRequested` false) | Fail-open (allow spawn) |
| Execute context without ledger (`planExecutionRequested` true) | Fail-closed with init hint |
| `ETRNL_SPAWN_GUARD_MODE=advisory` | Allow with context message |
| `ETRNL_SPAWN_GUARD_MODE=off` or skip env | Hook exits 0 immediately |
| Missing `execution-ledger.mjs` | Fail-closed in enforce; fail-open in advisory |

Deny payloads include `reasonCode`, `exactFix`, and `exampleCommand` from `check-spawn --explain`.

Economics enforced by `spawn-guard.mjs` include:

| Gate | Trigger |
| --- | --- |
| Wave 2+ merged review | Per-patch reviewer names on wave/phase ≥ 2 |
| Batch adoption | `planScope=large`, ≥3 task groups (`ETRNL_BATCH_TASK_GROUP_THRESHOLD`), third lane, or 20+/55% reviewer-heavy backstop (`ETRNL_BATCH_*`) |
| Review scope (tier 0–2) | `review-scope.mjs` integrated into `check-spawn`; tier ≥3 always `full_lenses` |
| Role classification | Reviewer `subagent_type` overrides `_writer` task aliases; reviewer spawns require explicit `--wave` |

Registry: `record-spawn-registry --plan <path>` refreshes allowlist; `enrichLedgerPlanMetadata` runs on every `check-spawn`.
