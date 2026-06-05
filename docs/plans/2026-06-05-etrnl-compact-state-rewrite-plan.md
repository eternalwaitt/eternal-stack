# ETRNL Compact State Rewrite Implementation Plan

Status: Final

Execution scope: all_phases
Goal: Replace noisy manual compact reminders and tmp-only handoff state with a deterministic ETRNL state layer that supports native Claude auto-compaction, concise post-compact recovery, install drift detection, and backlog-only Beads integration.
Non-goals: No raw transcript storage, no secret or private prompt capture, no Beads issue/comment replacement for execution ledgers, no hook-triggered `/compact`, no broad startup context dump, no default Dolt/Beads dependency inside lifecycle hook hot paths, and no live install without an explicit rollout step.
Evidence: AGENTS.md; hooks/cc-sessionstart-restore.sh; hooks/cc-precompact-save.sh; hooks/cc-postcompact-record.sh; hooks/lib/state.sh; hooks/cc-posttoolbatch-observer.sh; hooks/cc-stop-verifier.sh; scripts/execution-ledger.mjs; scripts/context-state.mjs; scripts/workflow-health.mjs; scripts/tool-effectiveness.mjs; scripts/settings-audit.mjs; scripts/update-check.mjs; scripts/install.sh; scripts/deep-stack-check.mjs; scripts/plan-readiness-check.mjs; templates/settings.strict.json; tests/test-hooks.sh; tests/test-workflow-tools.sh; tests/test-install.sh; docs/plans/2026-06-03-tool-effectiveness-and-beads-pilot-plan.md; docs/research/2026-06-03-starred-agent-stack-map.md; docs/research/top10-lock.json; docs/research/capability-evidence.json; .beads/README.md; .beads/metadata.json; Claude home settings; `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`; `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`; `bd status --json`; `bd setup claude --check`; `bd setup codex --check`; `node scripts/workflow-health.mjs status --cwd "$PWD" --json`; `node scripts/tool-effectiveness.mjs summarize --cwd "$PWD" --json`; `node scripts/settings-audit.mjs "$CLAUDE_HOME/settings.json" --json`; `node "$CLAUDE_HOME/scripts/update-check.mjs" --json`; Claude Code hook docs for SessionStart, PreCompact, PostCompact, async hooks, and auto-compaction.
Assumptions: Claude Code keeps owning context compaction; ETRNL only records and rehydrates around compaction events. Victor wants the best personal-stack solution even when it requires refactors. Beads remains useful only when it records durable backlog, blockers, dependencies, claims, and discovered follow-ups outside active ETRNL execution.
Deep stack artifacts: docs/plans/artifacts/2026-06-05-etrnl-compact-state-rewrite/deep-stack-artifacts.json

## What already exists

- Claude Code provides the relevant lifecycle events. `PreCompact` and `PostCompact` match `manual` and `auto` triggers; `SessionStart` matches `startup`, `resume`, `clear`, and `compact`; async hooks cannot control Claude behavior and deliver context later.
- `templates/settings.strict.json` already configures repo-owned `cc-sessionstart-restore.sh` synchronously, with strict `PreCompact`, `PostCompact`, `Stop`, `SubagentStop`, and observer hooks.
- The installed `~/.claude/settings.json` has `cc-sessionstart-restore.sh` marked `async: true`, plus companion `suggest-compact.sh`, `pre-compact-context.sh`, `pre-compact-backup.sh`, and `log-compact-event.sh`.
- `suggest-compact.sh` is a tool-count reminder. It is not based on Claude's actual context pressure and does not trigger compaction.
- `pre-compact-context.sh` prints generic PreCompact text, but the supported compact rehydration path is `SessionStart` with source `compact`.
- `cc-precompact-save.sh` writes a small JSON summary from the current guard state before compaction.
- `cc-postcompact-record.sh` records Claude's `summary` or `compact_summary` after compaction.
- `cc-sessionstart-restore.sh` already emits a compact recovery message, skill hint, update hint, learning hint, and workflow-health status.
- `hooks/lib/state.sh` provides a session JSON schema, lock, migration filter, and fields for compact summary, edit/search/read evidence, requested skills, tool signals, and workflow counters. Its default directory is `${TMPDIR:-/tmp}`, so it is not durable enough for canonical state.
- `scripts/execution-ledger.mjs` already owns durable run evidence: tasks, phases, checks, artifacts, reviews, TDD, simplifier, specialist, completion audit, install proof, and stop validation.
- `scripts/context-state.mjs` already saves local context snapshots under `~/.claude/control-plane/artifacts/contexts`, but it is a separate schema and currently stores only coarse context saves.
- `scripts/workflow-health.mjs` already projects execution ledgers, review logs, browser QA, contexts, effectiveness stats, stale runs, and next action.
- `scripts/tool-effectiveness.mjs` already models keep/drop evidence for CodeGraph and Beads, but live summarize currently returns zero events for this repo. That means the keep/drop loop is not yet useful as canonical runtime truth.
- `scripts/settings-audit.mjs` detects duplicate, legacy, external, and conflicting hooks, but does not yet verify required hook registration, executable bits, matcher shape, sync/async expectations, or recorded-vs-observed settings mode.
- `scripts/update-check.mjs` infers settings mode from installed settings, but the live result reports `drift.settingsMode: "default"` even though strict hooks are present. The implementation must split recorded mode and observed mode.
- `bd` is installed at version 1.0.5 and `.beads` is initialized with backend `dolt`, mode `embedded`, and database `claude_control_plane`, but `bd status --json` reports zero issues.
- `bd setup claude --check` reports no Beads hooks installed. `bd setup codex --check` reports the repo-local Beads agent skill is missing. Beads is therefore not doing active workflow work unless manually invoked.
- The existing Beads pilot plan already defines Beads as backlog/dependency state only, not a replacement for ETRNL plans, execution ledgers, or workflow-health.
- Current starred-repo research identifies patterns to steal, not bundles to copy: structured compact handoff from claude-code-harness, bounded memory windows from mem9, deferred refresh from Beads, quiet hook output from claude-mem, historical-only startup replay from ECC, stale verification warnings from Writ, and compact project-memory formatting from oh-my-claudecode.

Current compact path:

```text
Claude auto/manual compact
  |
  +-- PreCompact
  |     +-- companion hooks print/log/backup
  |     +-- cc-precompact-save.sh writes tmp guard summary
  |
  +-- Claude compacts context
  |
  +-- PostCompact
  |     +-- cc-postcompact-record.sh writes compact summary to tmp guard state
  |
  +-- SessionStart(source=compact)
        +-- installed cc-sessionstart-restore.sh runs async, so context timing is weak
```

Target compact path:

```text
Claude auto/manual compact
  |
  +-- PreCompact(sync, small, deterministic)
  |     +-- etrnl-state append: compact.pre
  |     +-- state includes run id, phase, next action, changed files, stale checks
  |
  +-- Claude compacts context
  |
  +-- PostCompact(sync, small, deterministic)
  |     +-- etrnl-state append: compact.post
  |     +-- records trigger, compact_summary, verification_stale=true
  |
  +-- SessionStart(source=compact, sync)
        +-- etrnl-state query latest handoff
        +-- inject <= 1200 chars: task, last safe state, next action, stale verification warning
```

Target state boundaries:

```text
Hook hot path
  |
  +-- append-only local ETRNL state under ~/.claude/control-plane
  |     +-- sessions, runs, compactions, handoffs, checks, artifacts, tool signals
  |
  +-- projections
        +-- workflow-health.mjs
        +-- context-state.mjs
        +-- execution-ledger.mjs compatibility commands
        +-- settings-audit/update-check drift reports
        +-- optional Beads backlog bridge
        +-- optional Dolt projection outside lifecycle hooks
```

## NOT in scope

- No hook should call `claude -p`, summarize transcripts with a model, or invoke `/compact`.
- No hook should read or write raw transcript text by default.
- No hook should shell out to `bd`, Dolt SQL, or long-running database commands in the lifecycle hot path.
- No raw `bd prime` injection in startup, resume, or compact recovery context.
- No automatic `bd setup claude` or `bd setup codex` install before a separate Beads boundary decision is implemented.
- No tracked private project registry, local transcript path, prompt text, account data, or local home-directory state.
- No replacement of existing `scripts/execution-ledger.mjs` commands in the first compatibility slice; existing callers must keep working.
- No live mutation of `~/.claude/settings.json` or `~/.codex` until source gates, staged install gates, and rollback proof pass.
- No broad import of ECC, Writ, Octopus, mem9, claude-mem, or oh-my-claudecode hook bundles.
- No startup-file bloat. Durable state and skills own detail; startup context receives only compact summaries and pointers.

## File map

- `docs/plans/2026-06-05-etrnl-compact-state-rewrite-plan.md`: this implementation plan.
- `docs/plans/artifacts/2026-06-05-etrnl-compact-state-rewrite/deep-stack-artifacts.json`: deep-stack artifact bundle for plan readiness and later execution evidence.
- `scripts/etrnl-state.mjs`: new canonical local state CLI with append, query, migrate, compact-handoff, doctor, import-legacy, export, and validate commands.
- `scripts/lib/etrnl-state-core.mjs`: shared schema, validators, privacy rejection, file locking, append-only JSONL writer, materialized view builder, and a documented future adapter boundary.
- SQLite and Dolt adapter code is not created in the first implementation. Add it only after JSONL fixtures prove a query bottleneck and Victor approves a separate projection slice.
- `hooks/lib/state.sh`: keep compatibility reads and write a compact bridge to `scripts/etrnl-state.mjs`; do not keep tmp guard state as canonical truth.
- `hooks/cc-precompact-save.sh`: rewrite to append `compact.pre` and build a bounded handoff snapshot from ETRNL state.
- `hooks/cc-postcompact-record.sh`: rewrite to append `compact.post`, preserve Claude `compact_summary`, mark verification stale, and avoid context injection.
- `hooks/cc-sessionstart-restore.sh`: query `etrnl-state compact-handoff` synchronously for `source=compact`; keep startup/resume hints concise; avoid stale proof language.
- `hooks/cc-sessionend-save.sh`: append session-end state best-effort with bounded fields and no raw transcript content.
- `hooks/cc-posttoolbatch-observer.sh`: dual-write tool and workflow signals into ETRNL state while retaining legacy state during migration.
- `hooks/cc-stop-verifier.sh`: move large inline state checks to `scripts/etrnl-state.mjs stop-status` and existing ledger commands; keep shell hook as a thin dispatcher.
- `scripts/execution-ledger.mjs`: keep CLI compatibility and add optional event export/import path so run evidence can project into ETRNL state without losing schema v1/v2 validation.
- `scripts/context-state.mjs`: rewrite as a compatibility facade over typed ETRNL context entries: `decision`, `pattern`, `preference`, `fact`, `solution`, `blocker`, and `next_action`.
- `scripts/workflow-health.mjs`: read ETRNL state projections for compact freshness, handoff state, stale verification, and Beads backlog bridge status while preserving existing JSON fields.
- `scripts/tool-effectiveness.mjs`: persist imported/live events into the real events file and include compact/handoff usefulness metrics.
- `scripts/settings-audit.mjs`: add required-hook verification, sync/async expectation checks, stale absolute path detection, companion hook classification, and strict conflict gating for compact hooks.
- `scripts/update-check.mjs`: report `recordedSettingsMode`, `observedSettingsMode`, `settingsModeMismatch`, and stale installed hook/script/skill counts.
- `scripts/install.sh`: ensure source templates install compact restore synchronously, preserve known companion hooks only when accepted by settings audit, and record observed mode metadata.
- `scripts/rollback-local.sh`: restore pre-change settings and remove new ETRNL state scripts from installed homes without touching unrelated local files.
- `scripts/doctor.sh`: run ETRNL state validation, required-hook audit, installed-home drift checks, compact fixture replay, and privacy fixtures.
- `scripts/lib/skill-lists.sh`: expose required compact/state scripts and expected hook registration rules for tests and settings audit.
- `templates/settings.strict.json`: keep `cc-sessionstart-restore.sh` synchronous and include no compact reminder hook.
- `templates/settings.default.json` or equivalent generated default path if present in install logic: keep default behavior aligned with strict compact handoff semantics, with only strict-only blockers omitted.
- `tests/fixtures/etrnl-state/`: new JSONL and hook fixture corpus for compact pre/post, session start compact, stop stale verification, Beads bridge, privacy rejects, migration, and rollback.
- `tests/test-hooks.sh`: add compact lifecycle and sync restore assertions.
- `tests/test-workflow-tools.sh`: add ETRNL state CLI, migration, projection, privacy, and workflow-health assertions.
- `tests/test-install.sh`: assert installed `cc-sessionstart-restore.sh` is not async, required compact hooks are registered, and companion compact reminder/context hooks are either absent or explicitly classified.
- `docs/health-stack.md`: update health stack to describe canonical ETRNL state, compact handoff, and Beads/Dolt boundaries.
- `docs/compact-recovery.md`: new five-minute compact recovery quickstart, command spec table, expected outputs, temp-home install rehearsal, and failure/debugging recipes.
- `docs/skills.md`: document that ETRNL execution remains authoritative and Beads is backlog-only.
- `docs/configuration.md`: document state directory, retention, privacy, optional adapters, and rollback.
- `docs/research/2026-06-03-starred-agent-stack-map.md`: append the 2026-06-05 compact/context pattern decisions and rejection list.
- `docs/adr/0002-etrnl-state-and-compact-handoff.md`: new ADR for state substrate, compact lifecycle, Beads boundary, Dolt decision, and migration strategy.
- `CHANGELOG.md`: record compact hook behavior, Beads boundary, and install/update drift checks.

## Task groups

### Group A - State Contract And ADR

Owner: state architecture owner.
Dependencies: Existing execution-ledger, context-state, workflow-health, hook state schema, Beads pilot plan, Claude hook docs, and current starred-repo research.
Acceptance criteria: `docs/adr/0002-etrnl-state-and-compact-handoff.md` defines the canonical state model, privacy boundary, hook hot-path budget, Beads backlog-only rule, Dolt optional projection rule, migration stages, rollback, and rejected alternatives. `scripts/etrnl-state.mjs` has a versioned schema contract before hooks call it. The ADR explicitly says Claude owns auto-compaction and ETRNL does not trigger `/compact`.
Verification: `node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-05-etrnl-compact-state-rewrite-plan.md`; `node scripts/plan-readiness-check.mjs docs/plans/2026-06-05-etrnl-compact-state-rewrite-plan.md --allow-draft`; `git diff --check`.

### Group B - ETRNL State Core

Owner: workflow tooling owner.
Dependencies: Group A schema.
Acceptance criteria: Add `scripts/etrnl-state.mjs` and `scripts/lib/etrnl-state-core.mjs` with append-only local JSONL truth under `~/.claude/control-plane/state`, materialized JSON views, atomic writes, file locking, schema migrations, privacy rejection, bounded summaries, and deterministic query commands. The state model includes `session`, `run`, `run_event`, `check`, `artifact`, `context_entry`, `compact_pre`, `compact_post`, `handoff`, `tool_signal`, `settings_observation`, `bead_link`, and `projection_error` event kinds. JSONL remains canonical in the first implementation.
Additional DX acceptance criteria: every JSON error emits `code`, `message`, `action`, `diagnosticCommand`, and relevant `eventId` or state path when available. `compact-handoff --latest --json` shows the exact recovery packet that SessionStart would inject. `doctor --compact --explain` reports latest pre/post compact events, handoff preview, stale verification status, hook registration state, and the next command.
Verification: `node scripts/etrnl-state.mjs validate --fixtures tests/fixtures/etrnl-state`; `node scripts/etrnl-state.mjs append --fixture tests/fixtures/etrnl-state/compact-pre.json --dry-run --json`; `node scripts/etrnl-state.mjs compact-handoff --session fixture-compact --json`; `node scripts/etrnl-state.mjs compact-handoff --latest --json`; `node scripts/etrnl-state.mjs doctor --compact --explain`; `tests/test-workflow-tools.sh`.

### Group C - Legacy Compatibility And Dual Write

Owner: migration owner.
Dependencies: Group B.
Acceptance criteria: Existing `execution-ledger.mjs`, `context-state.mjs`, `workflow-health.mjs`, and `hooks/lib/state.sh` users keep working. Hook state writes dual-write into ETRNL state, existing ledgers can be imported without data loss, and workflow-health can read from both old and new sources during migration. Legacy tmp guard state is downgraded to a session cache, not canonical truth.
Verification: `tests/test-workflow-tools.sh`; `node scripts/execution-ledger.mjs check-stop --session fixture-ledger` through existing fixtures; `node scripts/context-state.mjs save --id fixture-compat --title "compat" --remaining "next"`; `node scripts/workflow-health.mjs status --cwd "$PWD" --json`.

### Group D - Compact Hook Rewrite

Owner: hook integration owner.
Dependencies: Groups B and C.
Acceptance criteria: `cc-precompact-save.sh` writes a bounded `compact.pre` event and returns JSON with `suppressOutput`. `cc-postcompact-record.sh` records Claude's generated summary and sets `verification_stale=true`. `cc-sessionstart-restore.sh` synchronously injects a compact handoff on `source=compact` and stays quiet when no useful handoff exists. `pre-compact-context.sh` and `suggest-compact.sh` are removed from repo-owned installed compact path and classified as rejected companion hooks unless Victor explicitly opts them back in.
Verification: `tests/test-hooks.sh`; `node scripts/replay-hook-fixtures.mjs`; fixture assertions for `PreCompact` manual and auto triggers, `PostCompact` summary capture, `SessionStart compact` additionalContext, and no prompt-text leakage.

### Group E - Stop Verifier And Workflow Health Projection

Owner: quality gate owner.
Dependencies: Groups B through D.
Acceptance criteria: Stop verification queries ETRNL state and existing ledger checks through bounded files or CLI output, not oversized `jq --argjson` payloads. Workflow-health reports compact handoff freshness, stale verification after compact, unresolved handoff blockers, and projection errors. A completion claim after compact is blocked until relevant verification is rerun or explicitly marked not applicable.
Verification: `tests/test-hooks.sh`; `tests/test-workflow-tools.sh`; `node scripts/workflow-health.mjs doctor --json --all`; targeted Stop fixtures for stale verification after compact, fresh verification after compact, missing handoff state, and completed run with no compact risk.

### Group F - Beads And Dolt Boundary

Owner: backlog integration owner.
Dependencies: Groups A and B, plus the thin-first compact gates from Groups D, E, and G. Group F is non-rollout-blocking.
Acceptance criteria: Add a Beads bridge that creates or links Beads issues only for durable backlog, blockers, dependencies, claims, and discovered follow-ups after compact recovery is already proven. The bridge never mirrors active ETRNL tasks, phases, checks, or execution evidence into Beads comments. Raw `bd prime` is never injected into startup or compact context. Dolt remains documentation-only in this plan unless a separate approved projection slice adds custom `etrnl_*` tables outside lifecycle hooks.
Verification: `node scripts/etrnl-state.mjs bead-link --dry-run --json`; `bd status --json`; fixture proving Beads backlog link counts as useful and active execution duplication counts as noise; `node scripts/tool-effectiveness.mjs validate-fixtures`.

### Group G - Settings, Install, Update, And Rollback

Owner: install/runtime owner.
Dependencies: Groups B through E.
Acceptance criteria: `settings-audit.mjs` verifies required hooks, executable files, matchers, sync/async expectations, stale absolute paths, and companion hook conflicts. `update-check.mjs` reports recorded and observed settings modes separately. `install.sh`, `update.sh`, and rollback preserve dual Claude/Codex sync and can stage install into temporary homes. Installed `cc-sessionstart-restore.sh` is synchronous. Source templates do not install compact reminder or unsupported PreCompact context hooks.
Verification: `node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts --json`; `node scripts/settings-audit.mjs ~/.claude/settings.json --json`; `tests/test-install.sh`; `node ~/.claude/scripts/update-check.mjs --json`; `CLAUDE_HOME="$(mktemp -d)" CODEX_HOME="$(mktemp -d)" ./scripts/install.sh`; staged settings audit/update-check against those temp homes; rollback rehearsal proving original homes are untouched.

### Group H - Docs, Research, And Final Gate

Owner: final integration owner.
Dependencies: Groups A through G.
Acceptance criteria: Docs explain the compact lifecycle, state schema, privacy model, Beads/Dolt boundary, install path, rollback, and how to inspect current handoff state. `docs/compact-recovery.md` gives a five-minute local-only quickstart with no CodeGraph/Beads bootstrap requirement, command spec table, exact expected outputs, temp-home install rehearsal, manual `/compact` smoke, and "why did compact restore fail?" path. Research docs capture the current pattern decisions and rejected bundles. Changelog records user-visible behavior changes. The final source and installed gates pass.
Verification: `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`; `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`; `node scripts/skill-contract-check.mjs`; `node scripts/prompt-budget-check.mjs .`; `tests/test-hooks.sh`; `tests/test-workflow-tools.sh`; `tests/test-install.sh`; `node scripts/replay-hook-fixtures.mjs`; `scripts/doctor.sh`; `git diff --check`.

## Task sizing and slices

- Slice 1: ADR plus state schema and fixtures. This touches docs, `scripts/etrnl-state.mjs`, `scripts/lib/etrnl-state-core.mjs`, and fixture files. It is testable with state-only commands.
- Slice 2: Hook dual-write and compact lifecycle. This touches compact/session hooks, `hooks/lib/state.sh`, and hook fixtures. It is testable with `tests/test-hooks.sh` and replay fixtures.
- Slice 3: Compatibility projections. This touches execution-ledger, context-state, workflow-health, and tool-effectiveness. It is testable with workflow tool tests.
- Slice 4: Stop verifier rewrite. This touches Stop hook and bounded state query helpers. It is testable with Stop fixtures and workflow-health doctor.
- Slice 5: Settings/install/update drift hardening. This touches settings audit, update check, install/update/rollback scripts, templates, and install tests.
- Slice 6: Beads boundary docs and dry-run bridge after compact recovery gates pass. This touches state bridge commands, docs, research notes, and tool-effectiveness fixtures. It does not block staged install or live compact recovery rollout.
- Slice 7: Installed-home staged rollout. This runs source gates, staged install, rollback rehearsal, and then live install only after Victor approves.

No slice should edit more than 8 files without splitting again. The integration choke points are `hooks/lib/state.sh`, `scripts/workflow-health.mjs`, `scripts/execution-ledger.mjs`, `scripts/install.sh`, and `scripts/settings-audit.mjs`; do not assign two parallel workers to those files in the same wave.

## Phases

### Phase 0 - Baseline And Freeze

Capture current source status, installed Claude/Codex metadata, current `~/.claude/settings.json`, required hook registration, Beads status, and current compact companion hooks. Save sanitized baseline artifacts under the plan artifact directory. No behavior changes.

### Phase 1 - Schema And ADR

Write the ADR and ETRNL state schema. Add fixtures for compact, stop, handoff, settings observation, Beads backlog link, Beads duplicate noise, privacy reject, and legacy migration.

### Phase 2 - State Core

Implement append-only JSONL state, materialized views, bounded handoff query, validation, privacy sanitizer, and migration commands. Keep JSONL canonical. Add SQLite or Dolt only as disabled adapters if the schema boundary is already clean.

### Phase 3 - Hook Migration

Dual-write from compact/session/observer hooks to ETRNL state. Keep old tmp guard state for compatibility during this phase. Make compact restore synchronous in source templates and staged installs.

### Phase 4 - Projection And Stop Gates

Teach workflow-health, context-state, execution-ledger compatibility paths, and Stop verifier to query ETRNL state. Add stale-verification-after-compact enforcement.

### Phase 5 - Beads Boundary, Non-Rollout-Blocking

Implement backlog-only Beads bridge after the thin compact gates pass. Keep Dolt as a documented optional projection direction only. Do not enable Beads hooks or raw Beads context injection. Keep all Beads actions explicit and dry-run first. This phase may run after live compact recovery rollout if the rollout gates are clean.

### Phase 6 - Install, Rollback, And Live Rollout

Run source gates, staged Claude/Codex install, update-check, settings-audit, rollback rehearsal, and post-upgrade canary after Groups B through E and G are clean. Live install requires explicit Victor approval after staged evidence is clean. Group F is not a prerequisite for live compact recovery rollout.

### Phase 7 - Completion Criteria

Close every plan outcome through completion reconciliation. Source and staged install gates must pass. Live stack is complete only after installed `~/.claude/settings.json` has synchronous compact restore, no compact reminder hook, required compact hooks registered, and update-check reports no mode mismatch.

## Skill/tool routing

- Use `etrnl-dev-plan` for this plan and readiness gates.
- Use `Hook Development` guidance for hook event boundaries, sync/async behavior, JSON stdout discipline, and matcher rules.
- Use `etrnl-execute` when Victor asks to implement this plan.
- Use `etrnl-parallel` only after task packets are split by the file ownership lanes above.
- Use `code-simplifier` before final completion because the state layer can overgrow quickly.
- Use `finding-duplicate-functions` for the migration/projection slices because execution-ledger, context-state, workflow-health, and hook state currently duplicate state concepts.
- Use `brooks-audit` after implementation if available because this touches control-plane health and failure-mode surfacing.
- `eternal-best-practices` is not domain-required for tenant/money/auth/i18n, but its general workflow discipline is optional. It does not block this plan unless implementation expands into domain policy rules.
- Use CodeGraph for impact discovery before editing shared scripts and hooks when the local index is healthy.
- Use Beads only as evidence/backlog tooling, not as the execution plan or active run tracker.

## Test plan

Code paths:

```text
CODE PATH COVERAGE
==================
[+] scripts/etrnl-state.mjs
    +-- [TEST] append valid event
    +-- [TEST] reject raw prompt/transcript/private path event
    +-- [TEST] build compact handoff from pre/post events
    +-- [TEST] migrate legacy tmp guard state
    +-- [TEST] dry-run Beads backlog link

[+] hooks/cc-precompact-save.sh
    +-- [TEST] manual compact writes compact.pre
    +-- [TEST] auto compact writes compact.pre
    +-- [TEST] missing state fails open with warning

[+] hooks/cc-postcompact-record.sh
    +-- [TEST] records compact_summary
    +-- [TEST] marks verification stale

[+] hooks/cc-sessionstart-restore.sh
    +-- [TEST] source=compact injects bounded handoff synchronously
    +-- [TEST] startup/resume stay concise
    +-- [TEST] no useful state stays quiet

[+] hooks/cc-stop-verifier.sh
    +-- [TEST] blocks completion claim when compact made verification stale
    +-- [TEST] allows completion after fresh verification
    +-- [TEST] handles large state through files, not jq arg payloads

[+] scripts/settings-audit.mjs / scripts/update-check.mjs
    +-- [TEST] required compact hooks registered and executable
    +-- [TEST] sessionstart compact restore is synchronous
    +-- [TEST] recorded/observed mode mismatch is reported
    +-- [TEST] compact reminder/context companion hooks are classified
```

User flows:

```text
USER FLOW COVERAGE
==================
[+] Long Claude session auto-compacts
    +-- [EVAL] PreCompact saves next action
    +-- [EVAL] PostCompact records Claude summary
    +-- [EVAL] SessionStart compact injects concise handoff
    +-- [GAP] live auto-compact cannot be forced deterministically; use fixture plus manual compact smoke

[+] New session resumes prior unfinished ETRNL work
    +-- [TEST] workflow-health reports active run and next action
    +-- [TEST] context-state facade returns typed entries

[+] Agent claims done after compaction
    +-- [TEST] Stop blocks stale verification
    +-- [TEST] fresh verification clears stale state

[+] Beads backlog follow-up created
    +-- [TEST] dry-run link records bead_link
    +-- [TEST] active execution duplication is classified as noise
```

Regression coverage:

- Existing hook guard behavior remains covered by `tests/test-hooks.sh`.
- Existing ledger and workflow tooling remain covered by `tests/test-workflow-tools.sh`.
- Existing install/update/rollback behavior remains covered by `tests/test-install.sh`.
- Existing deep-stack and plan-readiness gates remain unchanged except where new artifact rows are added.

## Test-first execution plan

Red tests and probes before implementation:

- Add failing `tests/fixtures/etrnl-state/compact-pre.json` and assert `node scripts/etrnl-state.mjs append --fixture ... --dry-run --json` succeeds only after the new CLI exists.
- Add failing `tests/fixtures/etrnl-state/privacy-raw-prompt.json` and assert validation rejects it.
- Add failing hook fixture for `PreCompact` auto trigger and assert no event exists until `cc-precompact-save.sh` dual-writes.
- Add failing hook fixture for `SessionStart source=compact` and assert `additionalContext` includes `verification stale` and `next=` once state exists.
- Add failing Stop fixture where compact happened after last verification and assert `cc-stop-verifier.sh` blocks completion.
- Add failing settings-audit fixture where `cc-sessionstart-restore.sh` is async and assert the audit reports a compact-restore-sync error.
- Add failing update-check fixture where metadata says default but observed settings are strict and assert recorded/observed mismatch is reported.
- Add failing Beads fixture where active ETRNL task is duplicated as a Beads issue and assert verdict/noise classification.
- Add failing install fixture where staged install includes `suggest-compact.sh` and assert strict audit fails unless explicitly accepted as companion.

Green criteria after implementation:

- All red fixtures pass.
- Existing hook/workflow/install tests still pass.
- `scripts/doctor.sh` passes without live effectiveness data.
- A staged Claude home shows synchronous compact restore and no compact reminder hook.
- Live install remains gated behind explicit approval.

Not-test-first rationale:

- Real Claude auto-compaction cannot be forced deterministically from repo tests. Cover it with official lifecycle fixture replay, manual `/compact` smoke, and live-session observation after install.
- Dolt server-mode behavior is not test-first in this plan unless Victor chooses the optional Dolt projection. Keep it disabled until a separate adapter fixture and local server-mode smoke exist.

## Failure modes

- Compact recovery arrives late because restore is async. Coverage: settings-audit and install tests reject async `cc-sessionstart-restore.sh`.
- PreCompact state write fails and the compact loses next-action context. Coverage: hook fixture verifies fail-open warning plus SessionStart fallback to workflow-health.
- PostCompact summary is empty or malformed. Coverage: fixture writes compact event with `summary_missing` marker and handoff falls back to precompact next action.
- Agent claims tests are green after compact using stale pre-compact evidence. Coverage: Stop fixture blocks until fresh verification appears after compact.
- State file lock times out. Coverage: state core fixture records `projection_error` and hooks fail open unless the hook is in explicit fail-closed mode.
- State grows too large and slows startup. Coverage: handoff formatter enforces a character budget and workflow-health reports state size.
- Privacy leak enters state. Coverage: sanitizer rejects raw prompt fields, transcript paths, private home paths, and secret-looking tokens before append.
- Beads conflicts with ETRNL authority. Coverage: bridge never injects raw `bd prime`; duplicate active run state is noise; docs state Beads backlog-only.
- Dolt projection locks or server mode is unavailable. Coverage: Dolt adapter is disabled by default and never called by hooks.
- Installed homes drift from source. Coverage: update-check reports recorded/observed mode and stale installed scripts; install tests assert Claude and Codex sync.
- Rollback removes unrelated user companion hooks. Coverage: rollback test proves only repo-owned files/settings entries are removed or restored.

## Parallelization strategy

| Lane | Can run in parallel | Owns | Conflicts |
| --- | --- | --- | --- |
| A | No, first | ADR, schema, plan artifact | Blocks all lanes |
| B | After A | `scripts/etrnl-state.mjs`, `scripts/lib/etrnl-state-core.mjs`, state fixtures | Conflicts with C/D/E if schema changes mid-flight |
| C | After B | execution-ledger/context-state/workflow-health compatibility | Conflicts with E on workflow-health |
| D | After B | compact/session hooks and hook fixtures | Conflicts with G on settings expectations only |
| E | After C/D | Stop verifier and workflow-health stale verification | Conflicts with C on workflow-health |
| F | After A/B | Beads bridge, docs, tool-effectiveness fixtures | Low conflict if no hook hot-path changes |
| G | After D/E | settings-audit, update-check, install/update/rollback/templates | Conflicts with D on installed hook expectations |
| H | After all | docs, changelog, final gates | Integration-only |

Use at most six workers in one wave. If using subagents, assign read-only research or disjoint write scopes and require every worker to report changed files and verification run.

## Verification gates

- `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`
- `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`
- `node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-05-etrnl-compact-state-rewrite-plan.md`
- `node scripts/plan-readiness-check.mjs docs/plans/2026-06-05-etrnl-compact-state-rewrite-plan.md`
- `node scripts/etrnl-state.mjs validate --fixtures tests/fixtures/etrnl-state`
- `node scripts/etrnl-state.mjs doctor --json`
- `tests/test-hooks.sh`
- `tests/test-workflow-tools.sh`
- `tests/test-install.sh`
- `node scripts/replay-hook-fixtures.mjs`
- `node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts --json`
- `node scripts/settings-audit.mjs ~/.claude/settings.json --json`
- `node scripts/skill-contract-check.mjs`
- `node scripts/prompt-budget-check.mjs .`
- `scripts/doctor.sh`
- `node "$CLAUDE_HOME/scripts/update-check.mjs" --json`
- `node "$CLAUDE_HOME/scripts/skill-contract-check.mjs" --root "$PWD" --installed`
- `git diff --check`

Stop conditions:

- Any privacy fixture stores raw prompt, transcript text, secret-looking token, private project name, or private path.
- Any source gate passes while staged installed home still has async compact restore.
- Any hook hot-path test shells out to Beads, Dolt SQL, or model summarization.
- Any completion claim can pass with stale pre-compact verification.
- Any Beads bridge mirrors active ETRNL execution ledger state.
- Any install/rollback test touches unrelated companion hooks without explicit classification.

## Rollback

- Source rollback: revert this plan's implementation commit or use `git revert <commit>` after preserving local state artifacts.
- Installed Claude rollback: run `~/.claude/scripts/rollback-local.sh` from the pre-upgrade backup, then verify `jq empty ~/.claude/settings.json`, `node ~/.claude/scripts/update-check.mjs --json`, and `/hooks` in Claude Code if needed.
- Installed Codex rollback: use the same rollback path to remove repo-owned Codex skills/scripts and restore metadata.
- State rollback: keep append-only state files under `~/.claude/control-plane/state/backups/<timestamp>` before migration. Revert materialized views by rebuilding from the previous JSONL snapshot.
- Beads rollback: delete only bridge-created links or issues with the bridge metadata marker; never run broad `bd update --status done` or Dolt reset.
- Dolt rollback: disabled by default. If later enabled, rollback drops only custom `etrnl_*` projection tables or restores from a Dolt backup after explicit approval.
- Companion hook rollback: restore previous `~/.claude/settings.json` backup; do not delete external hook files unless Victor explicitly requests cleanup.

## Execution handoff

Use `etrnl-execute` inline for Phase 0 through Phase 2 if implementing serially. Use `etrnl-parallel` only after Group A and Group B define stable schemas and worker packets can be split by file ownership. Parallel workers must not share `workflow-health.mjs`, `execution-ledger.mjs`, `hooks/lib/state.sh`, `settings-audit.mjs`, or install scripts in the same wave.

Initial execution packet:

- Start with Group A and Group B.
- Add state fixtures before implementation.
- Keep all live installed-home changes out of the first commit.
- Do not run `bd setup` in the implementation wave.
- Do not remove companion hook files from disk; remove or classify settings entries only through install/settings audit flow.

## Plan Readiness Report

- Scope Challenge: The plan is intentionally larger than a hook tweak because the verified failure spans source hooks, tmp-only state, installed settings drift, companion hook noise, Beads boundary, and install/update verification. Existing execution-ledger, context-state, workflow-health, settings-audit, update-check, and install tests are reused rather than replaced.
- Architecture Review: JSONL local ETRNL state is canonical for the first implementation because it is inspectable, local, reversible, and cheap in hooks. SQLite and Dolt are projection adapters only. Beads is backlog-only. Claude owns compaction; ETRNL records pre/post state and rehydrates through synchronous SessionStart compact.
- Code Quality Review: The main over-engineering risk is building a second workflow product. The mitigation is a small event schema, compatibility wrappers, fixture-first implementation, and no database dependency in lifecycle hooks. The main under-engineering risk is source-only fixes that leave installed settings wrong; install gates are in scope.
- Test Review: Test-first fixtures cover state validation, privacy rejects, compact pre/post, sessionstart compact recovery, stale verification Stop blocks, settings mode drift, Beads boundary, install sync, and rollback. Real auto-compact remains a manual smoke because repo tests cannot force Claude's internal context pressure.
- Performance Review: Hook hot path must do bounded file appends and small JSON queries only. Model summarization, Dolt SQL, Beads CLI, broad transcript scans, and large jq inline payloads are prohibited in hooks. Materialized views prevent startup scans over full history.
- Failure modes: Covered above. Critical open risk is live Claude behavior around auto-compact timing; mitigate with official lifecycle fixtures plus manual compact smoke before live rollout.
- Parallelization: Parallel lanes are available after the state schema stabilizes. Schema, workflow-health, install scripts, and Stop verifier are integration choke points and should remain single-owner.
- Unresolved questions: research_flow: manual with validated canonical research inputs. Current 2026-06-05 starred-repo deep dive supplements `docs/research/top10-lock.json` and `docs/research/capability-evidence.json`; implementation should append compact-context decisions to `docs/research/2026-06-03-starred-agent-stack-map.md` but does not need a new top10 lock refresh before source work. Live install requires explicit Victor approval after staged gates.
- Verdict: Preliminary readiness verdict is Ready for execution. Deep-stack artifact validation and draft readiness passed during finalization.

## Verdict

Autoplan review is complete. Victor approved taste decision T1; the plan is ready for execution.

## AUTOPLAN REVIEW REPORT

Status: Phase 1 CEO, Phase 3 engineering, and Phase 4 DX reviews are complete. Phase 2 design review is skipped because no UI scope was detected.

Review context:

- Branch: `codex/tool-stack-update-checkers`.
- Base branch: `main`.
- Restore point: captured under local `~/.gstack` storage. The private absolute restore path is intentionally not stored in this repo plan.
- Local-only warning: resolved. The `/autoplan` restore comment was removed before finalization because this public repo must not carry private absolute paths.
- Design doc check: no gstack `/office-hours` design doc found. Proceeding with standard review because this plan already includes a concrete problem statement, evidence, alternatives, and execution scope.
- UI scope: no. Matches mentioning "view", "render", or "dashboard" are technical/status language, not product UI.
- DX scope: yes. This plan changes hooks, CLIs, settings templates, install/update flows, docs, and agent-facing recovery behavior.
- Review mode: SELECTIVE EXPANSION per `/autoplan`.

### Phase 1 - CEO Review

#### 0A. Premise Challenge

| Premise | Evidence | Risk if wrong | Review decision |
| --- | --- | --- | --- |
| Claude Code should own when compaction happens. ETRNL should not trigger `/compact` or simulate Claude's context pressure. | Official hook lifecycle exposes `PreCompact`, `PostCompact`, and `SessionStart(source=compact)`. Current `suggest-compact.sh` is a tool-count reminder, not a context-window signal. | ETRNL becomes a noisy second compactor and repeats the current annoyance. | Accept. This is the right framing. |
| Handoff restore belongs in synchronous `SessionStart(source=compact)`, not async SessionStart or PostCompact. | Source strict template already configures repo-owned restore synchronously, but installed `~/.claude/settings.json` has it async. `PostCompact` records what happened after compaction, it is not the supported rehydrate path. | Restored context arrives late or not at all, making the agent start with stale state. | Accept, with install drift as first-class scope. |
| Hook hot paths must stay local, bounded, and deterministic. No Beads CLI, Dolt SQL, or model summarization inside compact lifecycle hooks. | Existing hook stack is shell/Node local. Prior Beads checks show setup is not installed into Claude/Codex hooks. Dolt embedded mode is present only through Beads metadata. | Compact hooks get slow, flaky, or lock-prone, which turns recovery into another failure source. | Accept. |
| Canonical state should start as append-only local ETRNL JSONL, with execution-ledger/context-state/workflow-health as projections or compatibility views. | Existing `execution-ledger.mjs`, `context-state.mjs`, and `workflow-health.mjs` already own adjacent state but are fragmented by purpose. | A full rewrite would strand existing gates, while a source-only hook patch would leave the state model split. | Accept, but require a narrow schema and migration fixtures. |
| Beads is backlog/dependency state only, not the active ETRNL execution ledger. | `.beads` exists, but `bd status --json` reports 0 issues and `bd setup` checks report Claude/Codex integration missing. The existing Beads pilot plan already defines backlog/dependency boundaries. | Raw `bd prime` semantics conflict with ETRNL task, plan, memory, and git authority. | Accept. |
| Dolt should not be the first canonical runtime. It can be an optional projection later. | Current `.beads` uses Dolt embedded mode, but the plan needs compact hook reliability before relational history. | A database-first plan adds lock/setup failure before the actual compact pain is fixed. | Accept. |
| Installed state is part of the product. Source green is not enough. | Current evidence shows source strict template and installed Claude settings can disagree. `update-check.mjs` currently infers mode but does not record strict/default install metadata. | The repo looks fixed while Victor's live Claude continues behaving badly. | Accept, make install/update/rollback gates mandatory. |

#### 0B. Existing Code Leverage

| Sub-problem | Existing surface to reuse | Review note |
| --- | --- | --- |
| Pre-compact state capture | `hooks/cc-precompact-save.sh`, `hooks/lib/state.sh` | Keep the shell hook envelope. Replace tmp-only assumptions with the new ETRNL state append path. |
| Post-compact event record | `hooks/cc-postcompact-record.sh` | Keep it as a recorder. Do not make it responsible for restore. |
| Compact/session rehydrate | `hooks/cc-sessionstart-restore.sh` | Reuse, but enforce sync registration and source-aware compact restore. |
| Stale verification blocking | `hooks/cc-stop-verifier.sh`, `hooks/lib/verification.sh` | Extend instead of creating a new verifier. |
| Durable run evidence | `scripts/execution-ledger.mjs` | Keep as compatibility projection and current execution evidence API. |
| Context snapshots | `scripts/context-state.mjs` | Reuse for compatibility, then migrate to materialized state view once schema exists. |
| Health summaries | `scripts/workflow-health.mjs`, `scripts/doctor.sh` | Reuse as operator-visible health surfaces. |
| Installed drift | `scripts/settings-audit.mjs`, `scripts/update-check.mjs`, `scripts/install.sh`, `scripts/uninstall.sh` | Expand existing install and audit gates, do not invent a second installer. |
| Tool usefulness and Beads boundary | `scripts/tool-effectiveness.mjs`, `docs/plans/2026-06-03-tool-effectiveness-and-beads-pilot-plan.md` | Reuse the pilot boundary. Add compact-state evidence rather than a competing tool tracker. |
| Hook replay | `scripts/replay-hook-fixtures.mjs`, `tests/test-hooks.sh` | Extend fixtures for PreCompact, PostCompact, SessionStart compact, and Stop stale verification. |

#### 0C. Dream State Mapping

```text
CURRENT STATE
  Claude owns native compaction, but ETRNL adds noisy reminder hooks.
  Compact state is scattered across tmp files, ledgers, context snapshots,
  and workflow health. Installed settings can drift from source templates.
  Beads exists but is not wired and has no issues.

        |
        v

THIS PLAN
  Claude still decides when to compact.
  ETRNL writes one bounded local state event before/after compact.
  Synchronous SessionStart(source=compact) restores the current handoff.
  Stop verifier rejects stale pre-compact completion claims.
  Existing ledgers and health tools become compatibility projections.
  Beads stays backlog-only. Dolt is optional projection-only.

        |
        v

12-MONTH IDEAL
  Starting, resuming, clearing, and compacting all feel like the same
  continuous session. Every handoff has a short current-state packet,
  stale evidence is obvious, install drift is detected before use, and
  optional richer history can be projected without touching hook hot paths.
```

Dream state delta: this plan moves toward the 12-month ideal if the state schema remains small and the installer proves the live Claude home matches source. It moves away from the ideal if ETRNL grows a second task product beside Beads or puts database work in compact hooks.

#### 0C-bis. Implementation Alternatives

| Approach | Summary | Effort | Risk | Pros | Cons | Reuses | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Minimal hook patch | Remove `suggest-compact.sh`, make restore sync, and tweak compact hooks without a new state core. | S | Medium | Smallest diff. Fixes the loudest annoyance quickly. | Leaves tmp/context/ledger split. Weak migration story. Beads and Dolt boundary remains advisory. | Existing hooks and settings audit. | Reject as incomplete. |
| B. ETRNL state core plus compatibility projections | Add a tiny append-only local state layer, dual-write from compact hooks, rehydrate through sync SessionStart compact, and project into existing ledgers/health views. | M | Medium | Solves root cause, keeps hooks cheap, preserves existing gates, and makes installed drift testable. | More files touched. Requires careful schema discipline. | Hooks, `state.sh`, ledgers, context-state, workflow-health, settings-audit, update-check, install tests. | Recommended. |
| C. Backend-first authority with Dolt or Beads primary | Make Dolt or Beads the durable task/context authority and route ETRNL through it. | L | High | Rich query/history semantics. One external-looking backlog source. | Conflicts with ETRNL authority, adds setup/lock risk, and puts non-essential systems near compact recovery. | Beads metadata and future Dolt projection only. | Reject for this plan. Keep as projection research later. |

Recommendation: choose Approach B because it is the most complete path that still keeps compact recovery local, explicit, and reversible.

#### 0D. SELECTIVE EXPANSION Analysis

Complexity check:

- The plan touches more than 8 files, which is a smell if this were only a hook tweak.
- The larger scope is justified because the verified failure spans runtime hooks, source-vs-installed drift, stale verification, settings templates, update metadata, and Beads/Dolt boundaries.
- The minimum useful set is Group A through Group E plus the install/settings gates in Group G. Docs and changelog remain necessary because this repo is a public control plane.

Scope decisions under `/autoplan` principles:

| Candidate | Decision | Reason |
| --- | --- | --- |
| Add strict audit failure for async compact restore in installed Claude settings. | Accept | In blast radius, prevents the exact live failure. |
| Add a privacy fixture that rejects private absolute paths and raw prompts in state. | Accept | In blast radius and required by repo boundary. |
| Add a local-only restore pointer cleanup requirement before commit. | Accept | The current `/autoplan` restore comment contains a private absolute path. This must not ship. |
| Add Beads bridge warnings for duplicate active ETRNL tasks. | Accept | Fits the backlog-only boundary without installing Beads hooks. |
| Add Dolt custom projection in this implementation. | Defer | Valuable only after JSONL state is stable. Not needed for compact reliability. |
| Run `bd setup claude` or `bd setup codex` during this plan. | Reject | Would import Beads hook semantics before the authority boundary is proven. |
| Add a UI dashboard for state history. | Defer | Useful later, but no UI is needed to solve compact recovery. |

#### 0E. Temporal Interrogation

| Time horizon | Decision to resolve now | Review answer |
| --- | --- | --- |
| Hour 1, foundations | What is canonical state? | Small local JSONL event stream under `~/.claude/control-plane/state`, with a versioned schema and privacy reject rules. |
| Hour 2-3, core logic | What happens if compact summary is empty, hook input is malformed, or state append fails? | Record typed degraded events where possible. Fail open with visible warning except where settings/install gates are explicitly fail-closed. |
| Hour 4-5, integration | Which existing tools remain authoritative? | `execution-ledger`, `context-state`, and `workflow-health` stay public compatibility surfaces until projections fully replace their fragmented internals. |
| Hour 6+, polish/tests | What will the implementer wish had been planned? | Installed-home verification, rollback proof, stale evidence Stop block, and private-path cleanup must be explicit gates, not follow-up notes. |

#### 0F. Mode Selection Confirmation

Mode: SELECTIVE EXPANSION.

Reason: this is a refactor and runtime-tooling correction, not a greenfield product. Holding scope would miss valuable small blast-radius fixes. Full expansion would turn compact recovery into a broader workflow product. Reduction would repeat the current source-only patch problem.

Premise gate status: confirmed by Victor. Continue with Approach B unless a later User Challenge is explicitly accepted.

#### 0.5. CEO Dual Voices

Degradation status: `codex exec` returned. Independent subagent timed out and was abandoned. This is single-model CEO outside voice, so it is not enough to create an `/autoplan` User Challenge by itself.

CODEX SAYS (CEO - strategy challenge):

- Verdict: do not execute as-is.
- Main critique: the plan turns three sharp problems, async compact restore, tmp/session state loss, and noisy compact companion hooks, into a broader control-plane substrate rewrite.
- Specific risks: pain is not quantified, a thinner patch was not fairly trialed, plan status contradicted itself before this update, Claude hook semantics may change, state/projection ownership drag can slow future work, Beads/Dolt consume budget while not part of the urgent fix, and privacy surface grows with every stored event.
- Recommended reframe: make compact recovery boring. Prove one live manual compact smoke, one staged install drift proof, one no-noise startup proof, and one stale-verification proof before expanding.

Codex SUBAGENT (CEO - strategic independence):

- Status: timed out. No findings available.

CEO dual voices consensus table:

| Dimension | Codex | Codex subagent | Consensus |
| --- | --- | --- | --- |
| Premises valid? | Partially. Compaction ownership and sync restore are right; platform-level state is questioned. | N/A | N/A, single-model only |
| Right problem to solve? | Yes, but reframed as compact recovery, not state substrate. | N/A | N/A, single-model only |
| Scope calibration correct? | No, recommends scope reduction. | N/A | N/A, single-model only |
| Alternatives sufficiently explored? | No, thinner patch under-explored. | N/A | N/A, single-model only |
| Competitive/market risks covered? | Weak. Claude lifecycle can change under the plan. | N/A | N/A, single-model only |
| 6-month trajectory sound? | Risky if every workflow bug becomes state/projection work. | N/A | N/A, single-model only |

Taste decision T1:

- Topic: thin compact patch vs confirmed Approach B.
- Auto-decision: keep Approach B as baseline because Victor confirmed the premises and the existing state split is real, but add a thin-first checkpoint inside execution.
- Constraint added by review: Group F Beads bridge, optional SQLite, and optional Dolt projection must not start until the compact core proves four boring-recovery gates: staged sync restore, durable bounded handoff, no compact reminder/context hooks in source template, and stale-verification Stop block.
- Final gate status: approved by Victor after `/autoplan` surfaced the smaller-plan challenge.

#### Section 1. Architecture Review

System architecture:

```text
Claude hook lifecycle
  |
  +-- PreCompact/PostCompact/SessionStart/Stop
        |
        v
  hooks/lib/state.sh compatibility shell helpers
        |
        v
  scripts/etrnl-state.mjs
        |
        +-- append-only JSONL event log
        +-- materialized compact handoff view
        +-- validation and privacy checks
        |
        v
  Existing projections and operators
        |
        +-- workflow-health.mjs
        +-- execution-ledger.mjs compatibility
        +-- context-state.mjs compatibility
        +-- settings-audit.mjs / update-check.mjs
        +-- tool-effectiveness.mjs
        +-- Beads backlog bridge after thin-first gate
        +-- Dolt projection disabled by default
```

Before/after dependency graph:

```text
BEFORE
  compact hooks -> tmp guard JSON -> SessionStart text
  workflow-health -> execution ledgers + context-state
  settings-audit/update-check -> partial installed drift view
  Beads -> initialized but idle

AFTER
  compact hooks -> ETRNL state event log -> compact handoff view -> SessionStart text
  Stop verifier -> ETRNL state + existing verification helpers
  workflow-health/context-state/execution-ledger -> compatibility projections
  settings-audit/update-check/install -> source and installed drift gates
  Beads/Dolt -> outside hook hot path
```

Findings:

| ID | Finding | Severity | Auto-decision |
| --- | --- | --- | --- |
| CEO-A1 | Direct surfaces are already 4,375 lines across compact hooks, state, stop, workflow, install, update, and tool-effectiveness scripts. A new state CLI can become a product rewrite if not bounded. | High | Add thin-first gate before Beads/Dolt/projection extras. Keep schema small. |
| CEO-A2 | Current `context-state.mjs` stores `cwd` and git status. The privacy rules cannot be aspirational. | High | Keep the privacy reject fixture as required and make private-path rejection a stop condition. |
| CEO-A3 | `scripts/update-check.mjs` currently has one `settingsMode` result, while the plan needs recorded and observed mode split. | Medium | Keep Group G in scope. This is directly tied to live installed drift. |
| CEO-A4 | Optional SQLite/Dolt files are named in the file map before the JSONL query problem is proven. | Medium | Treat both as disabled adapter boundaries. Do not create real adapter code until JSONL fixtures show a query need. |

#### Section 2. Error & Rescue Map

Error and rescue registry:

| Method/codepath | What can go wrong | Error name | Rescued? | Rescue action | User sees |
| --- | --- | --- | --- | --- | --- |
| `etrnl-state append` | Event missing required fields | `InvalidEventError` | Yes | Reject event, print JSON error, nonzero CLI exit. | Hook warning or test failure. |
| `etrnl-state append` | Raw prompt, transcript text, private path, or secret-looking token enters payload | `PrivacyRejectError` | Yes | Reject before write and record sanitized rejection reason only. | Hook warning in non-hot path; fixture failure in tests. |
| `etrnl-state append` | Lock cannot be acquired | `StateLockTimeout` | Yes | Fail open in lifecycle hooks with visible warning; fail closed in doctor/settings gates. | Compact recovery warning, not silent loss. |
| `etrnl-state compact-handoff` | No prior compact state exists | `HandoffMissingError` | Yes | Return quiet empty state for normal startup, explicit "no saved handoff" for compact source. | Bounded SessionStart text. |
| `etrnl-state compact-handoff` | Materialized view is stale or corrupt | `ProjectionError` | Yes | Rebuild from JSONL once, then emit warning and fallback to legacy state. | Recovery warning with next diagnostic command. |
| `cc-precompact-save.sh` | Malformed hook JSON or missing `jq` | `MalformedHookInput`, `JqUnavailable` | Yes | Current behavior exits 0. New behavior should emit bounded warning only if safe. | Usually nothing; doctor catches fixture. |
| `cc-postcompact-record.sh` | Claude sends empty `compact_summary` | `CompactSummaryMissing` | Yes | Append `compact.post` with `summary_missing=true` and use precompact next action. | Compact recovery says summary missing and gives next action. |
| `cc-sessionstart-restore.sh` | Restore is registered async or not registered | `CompactRestoreAsyncError`, `HookRegistrationError` | Yes | Settings audit and install tests fail. Runtime cannot self-fix. | Source/staged gate failure. |
| `cc-sessionstart-restore.sh` | State query exceeds budget | `HandoffBudgetExceeded` | Yes | Trim by priority: task, next action, stale verification, then diagnostics. | Concise handoff under budget. |
| `cc-stop-verifier.sh` | Completion claim after compact uses stale verification | `StaleVerificationAfterCompact` | Yes | Block until fresh verification runs or non-applicable reason is explicit. | Stop block with exact stale gate. |
| `settings-audit.mjs` | Companion compact reminder conflicts with source template | `CompanionHookConflict` | Yes | Classify and fail strict audit unless explicitly allowed. | Audit output names hook and event. |
| `update-check.mjs` | Recorded settings mode and observed mode disagree | `SettingsModeMismatch` | Yes | Report both fields and mark drift. | Update-check warning. |
| `bead-link --dry-run` | `bd` unavailable or repo not initialized | `BeadsUnavailable` | Yes | Return disabled bridge status, no hook failure. | CLI warning only. |
| Dolt projection | Embedded/server mode unavailable or locked | `DoltProjectionUnavailable` | Yes | Keep disabled. Never called by hooks. | Doctor note only if projection enabled. |

No unresolved error-rescue gap found after adding the thin-first and privacy constraints.

#### Section 3. Security & Threat Model

| Threat | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Local state captures raw prompts, transcript text, account names, or private paths. | Medium | High | Reject-list and allow-list fixture coverage, no raw transcript storage, private-path sanitizer before append. |
| Hook command injection through event fields. | Low | High | Use JSON parsing, no shell eval of hook fields, pass data through files or `--arg` only. |
| Secret-looking tokens stored in JSONL. | Medium | High | Reject before write, do not redact and store unless the field itself is required metadata. |
| Broad startup context leaks private history into every new session. | Medium | Medium | Compact handoff budget <= 1200 chars and source-specific restore. No raw `bd prime`. |
| Beads creates public-ish durable backlog entries from private active execution state. | Low | Medium | Backlog-only bridge, dry-run first, explicit metadata marker, no active task mirroring. |
| Dolt projection stores more than local JSONL intended. | Low | Medium | Disabled by default, custom `etrnl_*` tables only, never hook hot path. |
| Installed-home drift leaves unsafe hooks live. | Medium | High | Settings audit required-hook, sync/async, executable, and companion conflict checks. |

Security finding: the plan should avoid "redact then store" for private prompt data. Rejection is safer than mutation because it makes privacy bugs loud. Auto-decision: reject.

#### Section 4. Data Flow And Interaction Edge Cases

Data flow with shadow paths:

```text
Hook JSON
  |
  +-- nil/malformed -> exit 0 in hot path, fixture catches
  v
Validate event
  |
  +-- invalid/private -> reject before write
  v
Append JSONL under lock
  |
  +-- lock timeout -> warning, fail open in hook
  v
Update materialized view
  |
  +-- corrupt/stale -> rebuild once, then projection_error
  v
SessionStart compact handoff
  |
  +-- empty -> quiet fallback
  +-- too large -> priority trim
  +-- stale verification -> Stop blocks final claim
```

Interaction edge cases:

| Interaction | Edge case | Handled by plan? | Review decision |
| --- | --- | --- | --- |
| Claude auto-compacts mid-task | PreCompact fires but PostCompact summary is empty | Yes, after review | Store precompact next action and mark summary missing. |
| Agent resumes after compact | SessionStart restore is async | Yes | Settings/install gates fail async restore. |
| Agent claims done after compact | Tests ran before compact only | Yes | Stop blocks stale verification. |
| User starts a new session | No useful handoff exists | Yes | Quiet startup, no broad history dump. |
| State file grows large | Startup scans whole history | Partially | Materialized view required; add state-size doctor. |
| Beads bridge runs in repo without Beads | `bd` missing or no issues | Yes | Dry-run disabled status, no hook use. |

#### Section 5. Code Quality Review

Findings:

- The current compact source is intentionally tiny: 18-line precompact, 21-line postcompact, and an existing compact branch in `cc-sessionstart-restore.sh`. The new state layer must not bury that simple path under abstraction. Auto-decision: public hook scripts stay thin and shell-readable.
- `hooks/lib/state.sh` already has a migration and lock model. Rebuilding all lock behavior in shell would duplicate logic. Auto-decision: put new schema and append logic in Node core, keep shell as a caller.
- `execution-ledger`, `context-state`, and `workflow-health` duplicate state ideas today. Auto-decision: projections should preserve CLI compatibility but avoid adding new independent schemas.
- New file count risk is real. Auto-decision: do not create `etrnl-state-sqlite.mjs` or `etrnl-state-dolt.mjs` unless disabled stubs are needed for tests or docs.

#### Section 6. Test Review

Coverage map:

```text
NEW DATA FLOWS
  compact.pre append -> unit + hook fixture
  compact.post append -> unit + hook fixture
  compact-handoff query -> unit + SessionStart fixture
  stale verification -> Stop fixture
  settings observed-vs-recorded -> install/update fixture
  Beads backlog link -> dry-run CLI fixture

NEW ERROR PATHS
  invalid event -> unit
  privacy reject -> unit
  lock timeout -> unit or injected env fixture
  empty summary -> hook fixture
  async restore -> settings fixture
  stale installed script -> update-check fixture
```

Hostile QA tests to add:

- PreCompact writes `compact.pre` with `trigger:"auto"` and no compact summary yet.
- PostCompact writes `summary_missing=true` when summary is empty.
- SessionStart with `source:"compact"` after corrupt view rebuilds from JSONL once.
- Stop blocks `tests pass` when latest verification timestamp is older than latest compact event.
- Settings audit fails if `cc-sessionstart-restore.sh` has `"async": true`.
- Privacy fixture rejects `/Users/victorpenter/` and any raw prompt-like field names.

No test gap remains that should block the plan. Real auto-compact still needs manual smoke because Claude's internal pressure cannot be forced from repo tests.

#### Section 7. Performance Review

| Path | Risk | Bound |
| --- | --- | --- |
| PreCompact append | Hook delay | Single append, no Beads, no Dolt, no model, no broad scan. |
| SessionStart compact handoff | Startup delay | Query materialized view, trim to <= 1200 chars. |
| Workflow-health projection | Full history scan | Use bounded view and state-size doctor. |
| Stop verifier stale check | Large JSON payload | Query state by file or CLI output, avoid giant `jq --argjson`. |
| Update-check drift scan | Many installed scripts | Existing script scan is acceptable outside lifecycle hot path. |

Performance decision: compact lifecycle cannot call CodeGraph, Beads, Dolt, git history scans, model summarizers, or broad transcript readers. Keep this as a stop condition.

#### Section 8. Observability And Debuggability Review

Required operator signals:

- `etrnl-state doctor --json`: state directory, latest event, latest compact, view freshness, privacy reject count, projection errors, state size.
- `workflow-health.mjs status --json`: compact handoff freshness, stale verification after compact, next action, unresolved blockers.
- `settings-audit.mjs --json`: required hook status, sync/async mismatch, companion conflicts, executable status.
- `update-check.mjs --json`: recorded settings mode, observed settings mode, stale installed scripts.
- Hook warnings: bounded and rare. No recurring startup spam.

Debuggability finding: the plan needs a single command to answer "what will the next compact restore say?" Auto-decision: keep `etrnl-state compact-handoff --json` as required.

#### Section 9. Deployment And Rollout Review

Deployment sequence:

```text
source tests
  -> staged CLAUDE_HOME/CODEX_HOME install
  -> settings-audit staged homes
  -> update-check staged homes
  -> rollback rehearsal
  -> manual compact smoke in staging/local
  -> Victor approval
  -> live install
  -> live settings-audit/update-check
```

Rollout risks:

- Old hooks read tmp state while new hooks write JSONL. Mitigation: dual-write during migration.
- Installed source templates pass but live `~/.claude/settings.json` keeps async restore. Mitigation: installed-home audit gate.
- Companion hooks remain on disk. Mitigation: classify settings entries; do not delete companion files without explicit cleanup request.
- Live install breaks startup. Mitigation: rollback-local path and staged rehearsal.

#### Section 10. Long-Term Trajectory Review

Reversibility: 4/5 if JSONL is append-only, projections are rebuilt, Beads/Dolt are outside hooks, and live install is gated. Reversibility drops to 2/5 if Beads or Dolt becomes active execution authority.

Six-month risk:

- Good outcome: compact recovery is boring, installed drift is visible, stale completion claims are blocked, and Beads remains a backlog surface.
- Bad outcome: every ETRNL workflow bug gets routed through a new state substrate, causing adapter churn and more state to police.

Decision: keep the 12-month direction, but add a thin-first checkpoint so the plan earns the substrate instead of assuming it.

#### Section 11. Design And UX Review

Skipped. No UI scope detected. Developer-facing text and CLI output are reviewed in DX phase.

#### Required CEO Outputs

NOT in scope:

- Existing `## NOT in scope` section remains valid.
- Additional CEO-scoped non-goal: no real SQLite or Dolt adapter code until JSONL compact recovery passes thin-first gates and a query bottleneck is measured.

What already exists:

- Existing `## What already exists` section remains valid.
- Direct review added one scale fact: compact/state/install surfaces are 4,375 lines today across the 11 checked files.

Failure modes registry:

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
| --- | --- | --- | --- | --- | --- |
| PreCompact append | Lock timeout | Yes | Required | Warning | Yes |
| PreCompact append | Privacy reject | Yes | Required | Warning/test fail | Yes |
| PostCompact record | Empty summary | Yes | Required | Summary missing marker | Yes |
| SessionStart compact | Async installed hook | Yes | Required | Audit failure | Yes |
| SessionStart compact | Handoff too large | Yes | Required | Trimmed output | Yes |
| Stop verifier | Stale verification | Yes | Required | Block message | Yes |
| Settings audit | Companion hook conflict | Yes | Required | Audit issue | Yes |
| Update check | Mode mismatch | Yes | Required | Drift warning | Yes |
| Beads bridge | `bd` unavailable | Yes | Required | Disabled status | Yes |
| Dolt projection | Lock/unavailable | Yes | Deferred | Doctor note only | Yes if enabled |

Mandatory diagrams:

State machine:

```text
NO_STATE
  -> PRECOMPACT_SAVED
  -> POSTCOMPACT_RECORDED
  -> HANDOFF_READY
  -> RESTORED_AFTER_COMPACT
  -> VERIFIED_AFTER_COMPACT

Invalid transitions:
  POSTCOMPACT_RECORDED without PRECOMPACT_SAVED -> allow, mark pre_missing
  VERIFIED_AFTER_COMPACT before restore -> allow only if verification timestamp is after compact
  HANDOFF_READY with privacy reject -> impossible, append rejected before view update
```

Error flow:

```text
event -> validate -> privacy check -> lock -> append -> view
          |            |               |       |
          v            v               v       v
       invalid      rejected        timeout  projection_error
          |            |               |       |
          +------------+---------------+-------+
                       v
              visible warning or failing gate
```

Rollback flowchart:

```text
bad source change?
  -> git revert implementation commit

bad staged install?
  -> discard temp home

bad live install?
  -> run ~/.claude/scripts/rollback-local.sh
  -> jq empty ~/.claude/settings.json
  -> update-check --json
  -> settings-audit --json

bad state migration?
  -> preserve backup
  -> rebuild materialized view from previous JSONL
```

CEO completion summary:

```text
+====================================================================+
|            MEGA PLAN REVIEW - CEO PHASE SUMMARY                    |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION                         |
| System Audit         | 4,375 LOC direct surface, source/install drift|
| Step 0               | Approach B confirmed, thin-first gate added   |
| Dual voices          | codex returned, subagent timed out            |
| Section 1  Arch      | 4 issues found, 0 critical                    |
| Section 2  Errors    | 13 error paths mapped, 0 critical gaps        |
| Section 3  Security  | 7 threats mapped, privacy reject required     |
| Section 4  Data/UX   | 6 edge cases mapped, 0 unhandled              |
| Section 5  Quality   | 4 concerns, all auto-decided                  |
| Section 6  Tests     | Coverage map produced, live auto smoke manual |
| Section 7  Perf      | Hook hot path bounded                         |
| Section 8  Observ    | doctor/status/audit outputs required          |
| Section 9  Deploy    | staged install + rollback before live         |
| Section 10 Future    | Reversibility 4/5 with Beads/Dolt out of path |
| Section 11 Design    | skipped, no UI scope                          |
+--------------------------------------------------------------------+
| NOT in scope         | written                                      |
| What already exists  | written                                      |
| Error/rescue registry| 13 codepaths, 0 critical gaps                 |
| Failure modes        | 10 total, 0 critical gaps                     |
| Scope proposals      | 1 taste decision, 0 user challenges           |
| CEO plan             | not written separately, plan file updated     |
| Outside voice        | ran via codex, subagent timed out             |
| Diagrams produced    | architecture, data, state, error, deploy, rollback |
| Unresolved decisions | none                                          |
+====================================================================+
```

Phase 1 transition status: CEO phase complete enough to pass to Phase 2 after plan-file verification. Phase 2 will be skipped unless later review finds true UI scope.

### Phase 2 - Design Review

Status: skipped.

Reason: no UI scope detected. The plan affects Claude hooks, CLIs, settings templates, installer/update flows, local state, and developer-facing docs. It does not add product screens, components, forms, responsive flows, or visual states.

### Phase 3 - Engineering Review

#### Step 0. Scope Challenge

Scope decision: full Approach B continues, with one engineering correction already applied. Group F is non-rollout-blocking, Group G no longer depends on Group F, and SQLite/Dolt adapter code is not created in the first implementation.

Concrete code facts:

- Current compact hooks are small: `cc-precompact-save.sh` has 18 lines and `cc-postcompact-record.sh` has 21 lines.
- Current compact restore already exists in `cc-sessionstart-restore.sh`, but that file also runs update-check and workflow-health before compact message output.
- Direct compact/state/install surfaces checked for this review total 4,375 lines across 11 files.
- `cc-userprompt-router.sh` currently stores raw `lastPrompt`.
- `cc-precompact-save.sh` currently includes `lastPrompt` in the compact summary.
- `evidence-trace.mjs` intentionally strips milliseconds from timestamps, while `cc-stop-verifier.sh` compares event order using parsed timestamps.

#### 0.5. Engineering Dual Voices

Degradation status: Codex engineering voice returned. Subagent review is unavailable in this session because the CEO subagent timed out and could not be cleanly closed without blocking the main thread.

CODEX SAYS (eng - architecture challenge):

| Finding | Severity | Review decision |
| --- | --- | --- |
| Privacy contract is inconsistent: current state stores `cwd`, modified files, and `lastPrompt`, and precompact imports `lastPrompt`. | High | Accept. Add field-level allowlist, relative paths only, project fingerprints for private roots, command classifiers instead of raw command text, and migration fixture proving `lastPrompt` is not imported. |
| Sync compact restore would inherit slow startup work from update-check and workflow-health. | High | Accept. For `source=compact`, branch immediately and run only the bounded handoff query before output. |
| Stale-verification enforcement cannot rely on second-resolution wall-clock timestamps. | High | Accept. Add monotonic per-session `eventSeq` and compare sequence for compact vs verification. |
| Append-only canonical state lacks privacy incident escape hatch. | Medium | Accept. Add retention, rotation, max bytes, and explicit purge/rewrite procedure for privacy incidents. |
| Thin-first checkpoint was not executable because Group G depended on Group F. | Medium | Fixed in this review. Group F is now non-rollout-blocking. |

ENG dual voices consensus table:

| Dimension | Codex | Codex subagent | Consensus |
| --- | --- | --- | --- |
| Architecture sound? | Mostly, after thin-first dependency fix and compact fast path. | N/A | N/A, single-model |
| Test coverage sufficient? | Needs added fixtures for privacy, eventSeq, compact fast path, purge. | N/A | N/A, single-model |
| Performance risks addressed? | Needs compact fast path before slow startup checks. | N/A | N/A, single-model |
| Security threats covered? | Privacy contract needs field allowlist and purge path. | N/A | N/A, single-model |
| Error paths handled? | Mostly, add eventSeq ambiguity and privacy purge. | N/A | N/A, single-model |
| Deployment risk manageable? | Yes after Group F is removed from rollout prerequisites. | N/A | N/A, single-model |

#### Engineering Section 1. Architecture

Architecture diagram:

```text
source=compact SessionStart
  |
  +-- fast path first
  |     +-- etrnl-state compact-handoff --session <id> --json
  |     +-- trim and emit <= 1200 chars
  |
  +-- no update-check before handoff
  +-- no workflow-health before handoff
  +-- no learning hints before handoff

other SessionStart sources
  |
  +-- existing update-check
  +-- workflow-health
  +-- learning hints if enabled
```

Data model correction:

```text
ETRNL event
  +-- eventSeq: monotonic per session/run
  +-- eventKind
  +-- sessionHash / projectFingerprint
  +-- relative paths only
  +-- classified command metadata only
  +-- no lastPrompt
  +-- no transcript_path
```

Architecture issues:

| ID | Finding | Severity | Auto-decision |
| --- | --- | --- | --- |
| ENG-A1 | `source=compact` restore must not run update-check/workflow-health before the compact handoff. | High | Add fast path branch as a required acceptance criterion in Group D. |
| ENG-A2 | Stale verification needs `eventSeq`, not second-resolution timestamps. | High | Add `eventSeq` to state schema and tests. |
| ENG-A3 | First implementation should not create real SQLite or Dolt adapter files. | Medium | Already patched in file map. |
| ENG-A4 | Group F must not block live compact rollout. | Medium | Already patched in dependencies and phases. |

#### Engineering Section 2. Code Quality

Code quality issues:

| ID | Finding | Severity | Auto-decision |
| --- | --- | --- | --- |
| ENG-Q1 | Current hook state stores `lastPrompt`, and precompact summarizes it. This directly conflicts with the new privacy contract. | High | New state import must drop `lastPrompt`; existing tmp state can remain compatibility cache but not canonical. |
| ENG-Q2 | "Privacy redaction" wording is weaker than "privacy rejection." Redaction can normalize storing forbidden fields. | Medium | Plan wording changed in file map. Use reject before write. |
| ENG-Q3 | Compatibility projections risk another schema split. | Medium | Public compatibility commands can stay, but only `etrnl-state-core.mjs` owns the event schema. |
| ENG-Q4 | Shell hooks should stay thin. | Medium | Business rules live in Node CLI/core; shell only parses event, calls CLI, emits Claude JSON. |

Existing diagrams in touched files:

- `hooks/lib/state.sh` has a state transition map. It must be updated when tmp guard state becomes a cache.
- `hooks/cc-stop-verifier.sh` has a completion gate flow. It must be updated when stale verification is eventSeq-based.

#### Engineering Section 3. Test Review

Detected test framework: shell and Node script tests through `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, `tests/test-install.sh`, fixture JSON, and `node` CLIs.

Coverage diagram:

```text
CODE PATH COVERAGE
==================
[+] scripts/etrnl-state.mjs
    +-- [GAP] append valid compact.pre event
    +-- [GAP] reject lastPrompt, prompt, transcript_path, private absolute path
    +-- [GAP] assign monotonic eventSeq and preserve ordering under same-second events
    +-- [GAP] compact-handoff returns bounded payload
    +-- [GAP] purge/rewrite privacy incident command dry-run

[+] hooks/cc-precompact-save.sh
    +-- [GAP] manual trigger writes compact.pre without lastPrompt
    +-- [GAP] auto trigger writes compact.pre without lastPrompt
    +-- [GAP] CLI failure fails open with visible warning

[+] hooks/cc-postcompact-record.sh
    +-- [GAP] records summary
    +-- [GAP] records summary_missing when empty
    +-- [GAP] increments eventSeq after precompact

[+] hooks/cc-sessionstart-restore.sh
    +-- [GAP] source=compact branches before update-check/workflow-health
    +-- [GAP] source=compact emits <= 1200 chars
    +-- [GAP] non-compact sources keep existing startup hints

[+] hooks/cc-stop-verifier.sh
    +-- [GAP] blocks when latest compact eventSeq is greater than latest verification eventSeq
    +-- [GAP] allows when latest verification eventSeq is greater than latest compact eventSeq
    +-- [GAP] same-second compact/test/stop cannot bypass eventSeq

[+] scripts/settings-audit.mjs / scripts/update-check.mjs / install scripts
    +-- [GAP] async SessionStart restore fails strict audit
    +-- [GAP] compact reminder/context companion hooks fail strict audit unless accepted
    +-- [GAP] recordedSettingsMode and observedSettingsMode mismatch reports drift
    +-- [GAP] staged install proves Group F is not required for rollout
```

Test gaps identified: 22. All are already in scope or added by this review.

Critical regression tests:

- `cc-precompact-save.sh` must not import `lastPrompt` into ETRNL state.
- `cc-sessionstart-restore.sh` compact source must not call update-check/workflow-health before handoff.
- `cc-stop-verifier.sh` stale verification must use `eventSeq`, not timestamp order.
- Install rollout must not require Beads/Dolt Group F.

#### Engineering Section 4. Performance

Performance issues:

| ID | Finding | Severity | Auto-decision |
| --- | --- | --- | --- |
| ENG-P1 | Synchronous compact restore can become slow if it keeps existing generic SessionStart work before handoff. | High | Required compact fast path. |
| ENG-P2 | Full JSONL scan on every SessionStart will not scale. | Medium | Materialized compact handoff view required before hook migration. |
| ENG-P3 | Large inline state payloads already worry Stop verifier. | Medium | Use CLI/file boundary and eventSeq queries. |
| ENG-P4 | Update-check stale script scan is acceptable outside compact hot path only. | Medium | Keep it out of `source=compact` fast path. |

#### Engineering Required Outputs

NOT in scope additions:

- Real SQLite adapter implementation in this plan.
- Real Dolt projection implementation in this plan.
- Beads bridge as a prerequisite for live compact recovery rollout.
- Importing `lastPrompt` from legacy tmp state into canonical ETRNL state.

What already exists:

- Current compact restore tests at `tests/test-hooks.sh` lines 911-920 cover only the old tmp summary path and generic "Compact recovery" output.
- Existing `nowIso()` strips milliseconds for stable comparisons, so sequence order must be separate.
- Existing update-check can infer settings mode from hook commands but needs recorded vs observed split.

Failure modes:

| Codepath | Failure mode | Test? | Error handling? | User impact |
| --- | --- | --- | --- | --- |
| State import | `lastPrompt` imported into JSONL | Required | Reject/drop field | Prevents privacy leak |
| Compact restore | update-check blocks handoff | Required | Fast path | Avoids delayed recovery |
| Stop verifier | same-second events misordered | Required | eventSeq comparison | Prevents stale false pass |
| JSONL state | forbidden data appended once | Required | purge/rewrite command | Gives privacy incident response |
| Rollout | Beads/Dolt not ready | Required | Group F non-blocking | Allows compact fix to ship |

Parallelization strategy:

| Lane | Work | Modules | Depends on |
| --- | --- | --- | --- |
| A | Schema, privacy, eventSeq, compact handoff view | `scripts/`, `tests/fixtures/etrnl-state/` | none |
| B | Compact/session hooks | `hooks/`, `tests/test-hooks.sh` | A |
| C | Stop verifier and workflow-health projection | `hooks/`, `scripts/`, `tests/test-workflow-tools.sh` | A, B |
| D | Settings/install/update rollout gates | `scripts/`, `templates/`, `tests/test-install.sh` | B |
| E | Beads boundary docs/dry-run | `scripts/`, `docs/` | A and thin-first gates |

Execution order: run Lane A first. Then B and D can proceed with coordination on settings expectations. Run C after B. Run E only after compact gates are green.

Engineering completion summary:

```text
Step 0 Scope Challenge: Approach B accepted with thin-first correction
Architecture Review: 4 issues found
Code Quality Review: 4 issues found
Test Review: diagram produced, 22 gaps identified
Performance Review: 4 issues found
NOT in scope: written
What already exists: written
TODOs: 0 new repo TODOs proposed, all findings folded into plan
Failure modes: 0 critical gaps after accepted fixes
Outside voice: ran via codex, subagent unavailable
Parallelization: 5 lanes, 2 possible parallel after schema
Lake Score: 12/12 recommendations chose complete option
```

Phase 3 transition status: engineering review complete. Passing to Phase 4 DX review because DX scope is true.

### Phase 4 - DX Review

Product type: CLI/tooling platform for a solo Claude/Codex operator. Secondary type: documentation and install/update workflow.

Target developer persona:

```text
Who: Victor or a future maintainer using this control plane locally.
Context: Long Claude/Codex sessions where compact recovery, stale verification, and installed-home drift must be visible.
Tolerance: High tolerance for powerful internals, low tolerance for noisy hooks, hidden state, unclear recovery, or source-green/live-broken mismatch.
Expects: One local command path to install, one command to prove health, one command to explain compact recovery, and rollback that does not touch unrelated local hooks.
```

Developer perspective:

```text
I clone the repo and see README.md tells me to run ./scripts/install.sh and ./scripts/doctor.sh.
That is fine for the existing control plane, but the compact rewrite adds a new mental model:
state events, handoff views, stale verification, Beads boundary, and installed-vs-source mode.
If compact recovery fails, I need one command that says what happened and what to do next.
I do not want to read hooks/cc-sessionstart-restore.sh to know whether the restore was async,
or inspect JSONL by hand to know why stale verification is blocking me.
```

Competitive DX benchmark:

| Tool | TTHW pattern | Notable DX choice | Source |
| --- | --- | --- | --- |
| Claude Code hooks | Hook lifecycle is event-based; `SessionStart`, `PreCompact`, and `PostCompact` are documented surfaces. | Official lifecycle names and stdout behavior are the main mental model. | [Claude hooks docs](https://code.claude.com/docs/en/hooks) |
| pre-commit | Install and first hook run are one documented flow. | One command can install hook scripts and environments. | [pre-commit docs](https://pre-commit.com/) |
| Husky | Project setup centers on a tiny init path. | `init` creates a working hook setup quickly. | [Husky get started](https://typicode.github.io/husky/get-started.html) |
| This plan | Current path is install plus doctor, but compact proof is not a first-class hello world yet. | Needs a compact recovery smoke with expected output. | current plan |

Target TTHW: competitive tier, 2-5 minutes. Champion tier under 2 minutes is possible later, but the first plan should make "compact recovery works" provable in one terminal session.

Magical moment:

```text
Run one compact smoke and see:
  Compact recovery: task=<current task> next=<next action> verification_stale=true
Then run the fresh verification command and see Stop allow completion.
```

DX mode: DX POLISH. This is an existing local toolchain, not a new hosted developer product. The plan's job is to make every operator touchpoint clear and debuggable.

DX dual voices:

- Codex returned seven findings.
- Subagent review is unavailable in this session after prior subagent timeout.

DX Codex findings and decisions:

| Finding | Severity | Auto-decision |
| --- | --- | --- |
| No real compact "Hello World" path. | High | Add `docs/compact-recovery.md` with five-minute staged compact smoke and expected output. |
| CLI contract is underspecified. | High | Add command spec table for source and installed commands, flags, defaults, exit codes, JSON schema, examples. |
| Error messages are named but not operator-actionable. | High | Require `code`, `message`, `action`, `diagnosticCommand`, and `eventId` or state path where available. |
| Install/rollback confidence needs temp-home commands. | High | Add and test `CLAUDE_HOME="$(mktemp -d)" CODEX_HOME="$(mktemp -d)" ./scripts/install.sh`. |
| Debugging compact recovery needs one command. | Medium | Add `etrnl-state doctor --compact --explain`. |
| Optional tool bootstrap can distract from compact recovery. | Medium | Compact quickstart must be local-only/no-bootstrap by default. |
| Plan readiness status and restore pointer need cleanup. | Medium | Final plan status will be normalized and private restore comment removed before commit. |

DX journey:

| Stage | Developer does | Friction | Status |
| --- | --- | --- | --- |
| Discover | Reads README and docs/install.md. | Existing docs explain install, not compact recovery proof. | Fix with compact quickstart doc. |
| Install | Runs source or temp-home install. | Temp-home rehearsal is not documented as a first-class path. | Fix with exact commands and tests. |
| Hello World | Runs compact smoke. | No command yet shows "this is what SessionStart will restore." | Fix with `compact-handoff --latest --json` and expected text. |
| Real usage | Long session compacts. | Need stale verification warning and next action, not generic state dump. | Covered by compact handoff budget. |
| Debug | Compact restore fails or is empty. | Need one "why did it fail?" command. | Fix with `doctor --compact --explain`. |
| Upgrade | Source and installed homes drift. | Need recorded vs observed settings mode and rollback proof. | Covered by Group G. |

DX scorecard:

| Dimension | Initial | Target after plan updates | Reason |
| --- | --- | --- | --- |
| Getting Started | 5/10 | 9/10 | README install exists, but compact recovery hello world was missing. |
| API/CLI Design | 6/10 | 9/10 | CLI names exist in plan, but command grammar and JSON schema need a spec table. |
| Error Messages & Debugging | 5/10 | 9/10 | Error names existed, but exact recovery commands were missing. |
| Docs & Findability | 6/10 | 9/10 | Docs are strong, but compact recovery needs one dedicated page. |
| Local Dev & CI | 8/10 | 9/10 | Existing hook/workflow/install tests are good; add temp-home rehearsal and compact smoke. |
| Upgrade & Rollback | 7/10 | 9/10 | Existing rollback docs are good; add proof original homes are untouched in temp rehearsal. |
| Observability | 6/10 | 9/10 | workflow-health exists; add compact-specific explain command and handoff preview. |
| Trust & Desirability | 6/10 | 8/10 | Beads/Dolt boundaries and privacy rules improve trust; status cleanup required before commit. |

DX acceptance block:

```text
TTHW target: 2-5 minutes.
Required first-run proof:
  1. staged temp-home install
  2. replay compact fixture
  3. etrnl-state compact-handoff --latest --json
  4. etrnl-state doctor --compact --explain
  5. manual /compact smoke before live install

Required error shape:
  {
    "ok": false,
    "code": "PrivacyRejectError",
    "message": "...",
    "action": "...",
    "diagnosticCommand": "node scripts/etrnl-state.mjs doctor --compact --explain",
    "eventId": "..."
  }
```

DX completion summary:

```text
Product type: CLI/tooling platform + docs
Persona: solo control-plane operator
Mode: DX POLISH
Initial score: 6/10
Target score: 9/10
TTHW current: install/doctor only, compact proof missing
TTHW target: 2-5 minutes
Findings: 7
Unresolved: 0
Taste decisions: T1 approved
```

Phase 4 transition status: DX review complete. Passing to final `/autoplan` report and verification.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| CEO Review | `/plan-ceo-review` via `/autoplan` | Scope & strategy | 1 | CLEAR | Approach B confirmed, one single-model scope-reduction challenge logged and approved as T1, 0 user challenges |
| Codex Review | `codex exec` | Independent strategy/eng/DX voices | 3 | ISSUES_INCORPORATED | CEO challenged overbreadth; Eng found privacy/eventSeq/fast-path issues; DX found compact hello-world and CLI contract gaps |
| Eng Review | `/plan-eng-review` via `/autoplan` | Architecture & tests | 1 | CLEAR | 12 issues accepted, 22 test gaps folded into plan, 0 critical gaps after corrections |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | SKIPPED | No UI scope |
| DX Review | `/plan-devex-review` via `/autoplan` | Developer experience gaps | 1 | CLEAR | Initial 6/10 to target 9/10, TTHW target 2-5 minutes, 7 findings accepted |

**CODEX:** External voices found real issues and the plan was changed: compact fast path, `eventSeq`, privacy allowlist/reject rules, privacy purge path, Group F non-blocking, no first-pass SQLite/Dolt adapters, compact quickstart, command spec, actionable error shape, temp-home rehearsal, and compact explain command.

**CROSS-MODEL:** No two-model User Challenge exists because subagents were unavailable. The strongest single-model tension is T1: thinner compact patch vs confirmed Approach B.

**UNRESOLVED:** none.

**VERDICT:** CEO + ENG + DX complete. Design skipped. T1 approved. Ready to execute.
