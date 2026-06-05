# Claude Session Reliability Improvements Implementation Plan

Status: Final

Goal: Convert the Claude Code session failures from `<SESSION_ID_1>` and the `mimo-finance` session `<SESSION_ID_2>` into deterministic control-plane improvements that reduce noisy hook loops, make real failures actionable, and keep the installed `~/.claude` surface aligned with repo truth.

Evidence: `~/.claude/projects/-Users-<username>-Github-mimo-finance/<SESSION_ID_2>.jsonl` lines 34-49, 56, 95-103, 124-148, 180-215, 225, 251-294, and 309-310; `~/.claude/settings.json` duplicate hook registrations for `cc-pretooluse-guard.sh`, `cc-posttoolbatch-observer.sh`, `cc-posttooluse-sycophancy.sh`, `cc-posttoolusefailure-diagnose.sh`, `cc-stop-verifier.sh`, and `cc-sessionstart-restore.sh`; `scripts/update-check.mjs`; `scripts/update.sh`; `scripts/install.sh`; `scripts/merge-settings.mjs`; `scripts/doctor.sh`; `hooks/cc-sessionstart-restore.sh`; `hooks/cc-posttoolbatch-observer.sh`; `hooks/cc-posttoolusefailure-diagnose.sh`; `scripts/agent-task-packet-check.mjs`; `scripts/plan-readiness-check.mjs`; installed-home doctor run after the updater work; `docs/plans/2026-05-12-sprint-autoplan.md` in `mimo-finance`.

Non-goals: No changes to `mimo-finance` application features; no weakening of safety checks; no remote auto-pull without explicit opt-in; no blind migration of third-party hooks into the public repo; no private transcript vendoring; no change to Claude Code runtime internals.

## What already exists

- `scripts/update-check.mjs` and `scripts/update.sh` now provide install metadata, source fingerprinting, and local install drift detection.
- `scripts/install.sh` now installs updater scripts, `scripts/lib/*`, test fixtures, and `merge-settings.mjs` into `~/.claude`.
- `scripts/doctor.sh` and installed `~/.claude/scripts/doctor-control-plane.sh` now verify both repo-local and installed-home surfaces.
- `scripts/merge-settings.mjs` updates exact-match hook metadata instead of silently keeping stale timeouts.
- `hooks/cc-sessionstart-restore.sh` reports update-check failures as compact warnings instead of hiding them.
- `hooks/cc-posttoolbatch-observer.sh` already detects stale verification and repeated edits.
- `hooks/cc-posttoolusefailure-diagnose.sh` already records repeated failures, but its current output appears as blank blocking hook errors in the transcript.
- `scripts/agent-task-packet-check.mjs` already blocks underspecified subagent packets.
- `scripts/plan-readiness-check.mjs` already catches missing readiness sections and final verdict lines.

## NOT in scope

- Reworking `mimo-finance` auth, recurring payments, or Atendimento behavior.
- Removing external hooks such as `rate-limiter.sh`, `rtk-rewrite.sh`, `pre-stop-checklist.sh`, or `terminal-title.sh` without an inventory decision.
- Storing raw private Claude transcripts in this repo.
- Turning advisory quality nudges into silent pass-through behavior.
- Auto-fixing a dirty application repo while writing this control-plane plan.

## File map

- `scripts/merge-settings.mjs`: canonicalize hook commands so `bash ~/.claude/hooks/x.sh` and `bash /Users/<username>/.claude/hooks/x.sh` dedupe to one logical hook.
- `scripts/install.sh`: run a settings cleanup pass after merge, keep one canonical command form, and preserve unrelated non-owned hooks.
- `scripts/doctor.sh`: add installed settings duplicate detection, missing companion hook classification, and stale project-rule drift checks.
- `scripts/settings-audit.mjs`: new helper to normalize hooks, classify repo-owned versus external hooks, detect duplicates, and emit JSON plus human output.
- `hooks/cc-posttoolbatch-observer.sh`: debounce repeated stale-verification warnings and treat plan-readiness checks as valid verification for plan-only edits.
- `hooks/cc-posttoolusefailure-diagnose.sh`: emit visible context with the failed tool, likely cause, and next command; block only repeated identical failures.
- `hooks/cc-pretooluse-guard.sh`: preflight directory reads, refine repeated-command logic, and classify safe output limiters.
- `hooks/lib/state.sh`: add warning fingerprints so the same advisory message is not repeated every batch.
- `hooks/lib/command-classifiers.sh`: add canonical command helpers for output limiters, modern CLI wrappers, verification commands, and directory-read alternatives.
- `scripts/agent-task-packet-check.mjs`: add a copy-ready packet template in denials and support a smaller read-only packet contract.
- `skills/etrnl-autoplan/SKILL.md`: require valid subagent packet shape before outside-voice or worker fan-out.
- `scripts/plan-readiness-check.mjs`: optionally emit machine-readable fix suggestions for missing readiness sections.
- `tests/test-hooks.sh`: add regression coverage for every transcript-derived hook failure.
- `tests/test-install.sh`: assert installed settings are deduped and installed-home doctor has all fixture/helper dependencies.
- `docs/install.md`, `docs/configuration.md`, `docs/health-stack.md`, and `CHANGELOG.md`: document update, settings hygiene, hook ownership, and noisy-session fixes.

## Task groups

### Group A: Installed Settings Hygiene

Owner files: `scripts/settings-audit.mjs`, `scripts/merge-settings.mjs`, `scripts/install.sh`, `scripts/doctor.sh`, `tests/test-install.sh`.

Steps:
1. Implement `scripts/settings-audit.mjs --json <settings-path>` to parse Claude settings and return duplicate logical hooks by event, matcher, and canonical command.
2. Canonical command rules:
   - Expand leading `~` to the current home directory.
   - Normalize `/Users/<username>/.claude` and `~/.claude` as the same installed root.
   - Preserve command arguments, matcher, timeout, and status message.
   - Treat repo-owned `cc-*` hooks as one logical family even when path style differs.
3. Add `scripts/settings-audit.mjs --fix <settings-path>` for installer use.
4. In `scripts/install.sh`, run the fix pass after `merge-settings.mjs`.
5. In `scripts/doctor.sh`, fail when repo-owned duplicate hooks remain in installed settings.
6. Add fixtures covering duplicate `~` and absolute path hook commands.

Quick win: this directly removes doubled PostToolBatch, Stop, PostToolUseFailure, SessionStart, and PreToolUse warnings seen in `mimo-finance`.

### Group B: Hook Noise Debounce

Owner files: `hooks/cc-posttoolbatch-observer.sh`, `hooks/lib/state.sh`, `tests/test-hooks.sh`.

Steps:
1. Add a `warningFingerprints` bucket to hook state.
2. Fingerprint advisory messages by hook event, cwd, edit generation, and message body.
3. Emit stale-verification context once per edit generation instead of after every batch.
4. Emit repeated-edit review context once per file per generation.
5. Clear stale-verification warnings when a matching verification command succeeds.
6. Treat `node ~/.claude/scripts/plan-readiness-check.mjs <plan>` as a valid plan-edit verification command.

Quick win: the `mimo-finance` session had 68 transcript rows containing stale-verification text; this should drop to one or two visible nudges.

### Group C: Failure Hook Output Quality

Owner files: `hooks/cc-posttoolusefailure-diagnose.sh`, `hooks/lib/json.sh`, `tests/test-hooks.sh`.

Steps:
1. Change first-time tool failures from blank `hook_blocking_error` output to visible additional context.
2. Include tool name, normalized failure class, and one next diagnostic command.
3. Block only repeated identical failures after the first failure has been recorded.
4. Add specialized messages:
   - `EISDIR`: "This path is a directory; use `fd` or `eza`, then read a file."
   - `grep: <path>: Is a directory`: "Use `rg <pattern> <dir>` or `rtk proxy rg`, not `rtk grep` on a directory."
   - plan readiness failure: show the missing section names and the exact headings required.
5. Add tests asserting that failure hook output is non-empty and user-visible.

Quick win: blank blocking hook errors become actionable diagnostics.

### Group D: Command Rewrite and Modern CLI Compatibility

Owner files: `hooks/cc-pretooluse-guard.sh`, `hooks/lib/command-classifiers.sh`, `tests/fixtures/guard-patterns/`, `tests/test-hooks.sh`.

Steps:
1. Classify safe output limiters before legacy-command denial.
2. Allow safe pipelines such as `rg ... | head -30` and `fd ... | head -20` when the primary command is modern and read-only.
3. Detect invalid `rtk grep <pattern> <directory> -l` rewrites and suggest `rg -l <pattern> <directory>` or `rtk proxy rg`.
4. Add a guard fixture for the exact `mimo-finance` failure shape: `rtk grep "better.auth" /path/to/repo -l`.
5. Add a guard fixture for `rg "better.auth" <repo> --include="*.json" -l | head -10`.
6. Ensure the denial message names the primary issue once, not a generic toolkit lecture.

Quick win: fewer self-inflicted command retries at the start of planning sessions.

### Group E: Directory Read Preflight

Owner files: `hooks/cc-pretooluse-guard.sh`, `tests/test-hooks.sh`.

Steps:
1. Add PreToolUse handling for Read inputs with a filesystem path.
2. If the path is a directory, deny before the Read tool runs.
3. Return a short replacement:
   - `eza -la <dir>` for visual listing.
   - `fd . <dir> -t f` for file discovery.
4. Preserve normal file reads.
5. Add fixtures for `apps/web/src/app/api` and `apps/web/src/app/api/rpc`.

Quick win: removes the repeated `EISDIR` failures seen in the `mimo-finance` plan run.

### Group F: Subagent Packet Builder

Owner files: `scripts/agent-task-packet-check.mjs`, `skills/etrnl-autoplan/SKILL.md`, `hooks/fixtures/events/pretooluse-task-*.json`, `tests/test-hooks.sh`.

Steps:
1. Add `scripts/agent-task-packet-check.mjs --template read-only` and `--template write`.
2. Include required fields in the denial output, formatted as copy-ready markdown.
3. For read-only review agents, require goal, cwd, context summary, read set, forbidden files, expected output, timeout, retry policy, no-revert statement, and WebSearch guidance.
4. For write-capable agents, keep write scope and verification command mandatory.
5. Update `skills/etrnl-autoplan/SKILL.md` so outside-voice fan-out builds packets from the helper template.
6. Add a regression case matching the `mimo-finance` denial.

Quick win: Claude can recover from packet denials without inventing a new packet shape each time.

### Group G: Plan Readiness Repair Hints

Owner files: `scripts/plan-readiness-check.mjs`, `scripts/lib/plan-headings.mjs`, `tests/test-workflow-tools.sh`, `skills/etrnl-autoplan/SKILL.md`.

Steps:
1. Add `--explain` mode that maps each failure to exact text to add.
2. For missing Failure modes, suggest `- Failure modes: PASS|WARN|FAIL - <reason>`.
3. For missing Verdict, suggest a standalone `## Verdict` heading or `Verdict:` line depending on current checker rules.
4. Update `etrnl-autoplan` instructions to run `--json --explain` before retrying.
5. Prevent repeated identical readiness-check commands after the plan has changed by including file mtime or content hash in repeat detection.

Quick win: readiness failures become one edit, not inspect-script-then-retry.

### Group H: Installed Hook Ownership Inventory

Owner files: `scripts/settings-audit.mjs`, `docs/health-stack.md`, `docs/configuration.md`, `scripts/doctor.sh`.

Steps:
1. Classify installed hooks into:
   - repo-owned ETRNL hooks,
   - known companion hooks,
   - unknown external hooks.
2. Report unknown hooks with event, matcher, command, and whether they exited non-zero in recent transcripts.
3. Add a doctor warning when unknown hooks can emit blocking errors without visible content.
4. Add docs explaining how to disable or migrate unknown hooks.
5. Do not delete unknown hooks automatically.

Quick win: `rate-limiter.sh`, `rtk-rewrite.sh`, `pre-stop-checklist.sh`, and `terminal-title.sh` become visible dependencies instead of hidden behavior.

### Group I: Rate Limiter Atomicity

Owner files: `scripts/settings-audit.mjs`, optional installed companion hook notes in `docs/health-stack.md`.

Steps:
1. If `rate-limiter.sh` remains external, doctor should flag it as non-owned and race-prone when it uses a shared temp file.
2. If brought under repo ownership later, replace shared `COUNTER_FILE.tmp` with a process-specific temp file plus atomic rename guarded by `flock` or a Node helper.
3. Avoid legacy `tail` in the installed hook body; use Node or `bat`-free POSIX logic that passes the control-plane CLI rules.
4. Add a concurrent invocation test with two rate-limiter processes writing to the same session id.

Quick win: removes non-blocking `mv: ... No such file or directory` warnings during fast tool batches.

## Phases

### Phase 1: Evidence fixtures and settings audit

1. Add minimized fixtures for:
   - duplicate `~/.claude` and absolute hook commands,
   - stale verification warning after plan writes,
   - blank PostToolUseFailure output,
   - directory Read attempt,
   - invalid `rtk grep` directory rewrite,
   - missing subagent packet fields,
   - readiness failure missing Failure modes and Verdict.
2. Add `scripts/settings-audit.mjs` in read-only mode.
3. Gate: `node scripts/settings-audit.mjs --json ~/.claude/settings.json`.

### Phase 2: Dedupe and install contract

1. Add `settings-audit --fix`.
2. Call it from `scripts/install.sh`.
3. Extend `tests/test-install.sh` with duplicate settings fixtures.
4. Extend `scripts/doctor.sh` to fail on repo-owned duplicates.
5. Gate: `bash tests/test-install.sh`.

### Phase 3: Hook output and debounce

1. Patch `cc-posttoolbatch-observer.sh` warning debounce.
2. Patch `cc-posttoolusefailure-diagnose.sh` to emit visible context and block only repeated identical failures.
3. Add state fingerprint support in `hooks/lib/state.sh`.
4. Gate: `bash tests/test-hooks.sh`.

### Phase 4: Tool-use preflight fixes

1. Add directory Read preflight.
2. Add modern CLI and output-limiter classifier fixes.
3. Add readiness-check repeat hash logic.
4. Gate: `bash tests/test-hooks.sh && bash tests/test-workflow-tools.sh`.

### Phase 5: Skill updates

1. Update `etrnl-autoplan` to use packet templates and plan-readiness explain mode.
2. Update `etrnl-dev-plan` to treat design-spec approval and implementation-plan readiness as separate gates.
3. Add skill behavior smoke cases for packet creation and readiness repair.
4. Gate: `node scripts/skill-behavior-smoke.mjs --root .`.

### Phase 6: Docs, changelog, installed-home rollout

1. Update docs and changelog.
2. Run source doctor.
3. Run installer.
4. Run installed-home doctor.
5. Run installed `update-check`.
6. Gate: `bash scripts/doctor.sh && bash scripts/install.sh && bash ~/.claude/scripts/doctor-control-plane.sh && node ~/.claude/scripts/update-check.mjs --json`.

## Skill/tool routing

- Use `etrnl-dev-plan` for plan updates and readiness checks.
- Use `etrnl-execute` after this plan is accepted.
- Use `etrnl-dev-review` before commit or push because hook semantics affect every Claude Code session.
- Use `investigate` posture for fixture extraction: evidence first, hypothesis second.
- Use `bash-defensive-patterns` when editing shell hooks.
- Use `ast-grep` only for structural code scans; use `rtk grep` or `rg` for plain text.
- Use no browser tooling for this plan unless a hook UI or web docs page becomes part of scope.

## Test plan

### Unit and fixture tests

- `tests/test-hooks.sh` covers:
  - duplicate settings fixture is detected by `settings-audit`,
  - first tool failure emits visible context,
  - repeated identical failure blocks with a clear message,
  - directory Read is denied before the Read tool fails,
  - safe output limiter pipeline is allowed,
  - invalid `rtk grep` directory command is denied with an `rg` replacement,
  - stale verification warning emits once per edit generation,
  - plan-readiness success clears plan-edit verification warnings,
  - read-only packet template satisfies the packet checker,
  - write packet still requires write scope and verification command.

- `tests/test-workflow-tools.sh` covers:
  - `settings-audit.mjs` syntax and JSON output,
  - plan-readiness `--explain` output,
  - packet template output.

- `tests/test-install.sh` covers:
  - installed settings are deduped,
  - installed fixtures and helper libs are present,
  - installed-home doctor can run without source-only files.

### Transcript regression checks

- Build scrubbed fixture rows from the `mimo-finance` session:
  - lines 34-49 for RTK rewrite and legacy-tool conflict,
  - line 56 for rate-limiter file race,
  - lines 95-98 and 274-306 for stale verification and repeated edit spam,
  - lines 146 and 213 for directory Read failures,
  - line 225 for subagent packet denial,
  - line 251 for plan readiness missing sections.

- Build scrubbed fixture rows from session `<SESSION_ID_1>` for:
  - source versus installed-home drift,
  - updater absence,
  - installed package missing helper files,
  - installed-home doctor failing after source doctor passed.

### Manual smoke tests

- Start a fresh Claude session in a temp repo with installed hooks.
- Confirm SessionStart shows one ETRNL context entry, not duplicates.
- Run a safe `rg ... | head -5` search and confirm it is allowed.
- Try reading a directory and confirm the guard suggests `fd` or `eza`.
- Write a plan file, run plan-readiness, and confirm stale-verification warnings stop.
- Trigger one failed Bash command and confirm the failure hook message is visible.
- Repeat the same failed Bash command and confirm the second attempt blocks.

## Failure modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Hook dedupe removes a non-owned hook | Settings audit fixture with external hook command | Only dedupe repo-owned `cc-*` hooks by default; external hooks are report-only |
| Canonicalization collapses two hooks with different matchers | Unit test with same command and different matcher | Deduping key includes event, matcher, and canonical command |
| Stale-verification debounce hides a real missing gate | Stop verifier test after source edits with no verification | Stop remains strict; debounce only affects repeated PostToolBatch context |
| Failure hook context becomes too noisy | Transcript fixture with multiple unique failures | First failure is context only; repeated identical failure blocks |
| Read directory preflight blocks valid virtual paths | Fixture for normal file reads and non-filesystem tool inputs | Only apply when input path exists and is a directory |
| Output limiter allowance lets unsafe shell through | Guard fixture with destructive command piped to `head` | Allowance checks primary command safety before considering limiter |
| Packet template becomes stale versus checker | Test invokes template output through `agent-task-packet-check.mjs` | Template is generated by the checker itself |
| Installed doctor needs source-only files again | Installed-home doctor in CI-like temp home | `test-install.sh` asserts every required helper and fixture is packaged |

## Parallelization strategy

- Phase 1 can run in parallel across fixtures and `settings-audit` implementation because fixtures are data files and the helper is a new script.
- Phase 2 should run after Phase 1 because installer behavior depends on `settings-audit`.
- Phase 3 hook-output work can run in parallel with Phase 4 command-classifier work if file ownership is split:
  - Worker 1 owns `cc-posttoolbatch-observer.sh`, `cc-posttoolusefailure-diagnose.sh`, and `state.sh`.
  - Worker 2 owns `cc-pretooluse-guard.sh` and `command-classifiers.sh`.
- Phase 5 skill updates must wait for helper CLI flags to exist.
- Phase 6 is serial because installed-home verification depends on all source checks passing.

## Verification gates

After Phase 1:

```bash
node --check scripts/settings-audit.mjs
bash tests/test-hooks.sh
```

After Phase 2:

```bash
bash tests/test-install.sh
bash scripts/doctor.sh
```

After Phase 3 and Phase 4:

```bash
bash tests/test-hooks.sh
bash tests/test-workflow-tools.sh
```

After Phase 5:

```bash
node scripts/skill-contract-check.mjs --root .
node scripts/skill-behavior-smoke.mjs --root .
```

Final gate:

```bash
bash scripts/doctor.sh
bash scripts/install.sh
bash ~/.claude/scripts/doctor-control-plane.sh
node ~/.claude/scripts/update-check.mjs --json
```

## Rollback

- Settings dedupe rollback: restore the installer backup under `~/.claude/backups/control-plane-install-*`, then run installed doctor.
- Hook-output rollback: revert `cc-posttoolbatch-observer.sh`, `cc-posttoolusefailure-diagnose.sh`, and `state.sh`; run hook tests.
- Command-classifier rollback: revert `cc-pretooluse-guard.sh` and `hooks/lib/command-classifiers.sh`; run guard fixtures.
- Skill rollback: revert `skills/etrnl-autoplan/SKILL.md` and skill smoke tests.
- Installed-home rollback: run `~/.claude/scripts/rollback-local.sh` when available, then reinstall the previous known-good commit.

## Execution handoff

Recommended order:

1. Implement Group A first. It removes duplicate installed hooks and reduces every other symptom.
2. Implement Groups B and C together. They turn repeated hook noise into one actionable message.
3. Implement Groups D and E. They prevent avoidable failed tool calls before they hit Claude.
4. Implement Groups F and G. They improve recovery from planning and subagent failures.
5. Implement Groups H and I as hardening after the core noise is gone.
6. Run source doctor, install, installed-home doctor, and update-check before calling the work complete.

Operator note: the `mimo-finance` app plan is execution-ready, but it should not be executed until the duplicate-hook and failure-output fixes are at least planned into the control plane. Otherwise the next implementation session will inherit the same warning storm.

## Plan Readiness Report

- Scope Challenge: PASS - the plan targets control-plane behavior observed in two Claude Code sessions and keeps application feature work out of scope.
- Architecture Review: PASS - settings hygiene, hook state, command classification, packet templates, and installed verification are separated into clear modules.
- Code Quality Review: PASS - each task group has bounded files, explicit outputs, and tests tied to transcript evidence.
- Test Review: PASS - source, fixture, install, installed-home, and manual smoke gates are listed with exact commands.
- Performance Review: PASS - the main runtime change is less repeated hook output; settings audit runs during install or doctor, not during every tool call.
- Failure modes: PASS - duplicate-hook, over-dedupe, debounce, output-limiter, packet-template, and installed-home packaging failures are listed with detection and mitigation.
- Parallelization: PASS - independent hook-output and command-classifier tracks can run in parallel with disjoint file ownership; install rollout remains serial.

## Verdict

READY FOR EXECUTION - start with Group A because installed duplicate hooks are the highest-leverage fix and directly explain the doubled warnings in the `mimo-finance` session.
