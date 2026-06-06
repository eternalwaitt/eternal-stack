# Next Control Plane Hardening Plan

Status: Final
Created: 2026-05-13
Owner: ETRNL control plane
Execution Mode: AI-first, deterministic, installed-runtime verified
Goal: Ship the next dev hardening pass so false QA evidence, unrelated reviewer calls, mutable phase state, stale workflow status, and repeated-failure blind spots fail through deterministic local gates.
Evidence: AGENTS.md, README.md, CHANGELOG.md, docs/control-plane-coverage.md, docs/health-stack.md, scripts/browser-qa-report.mjs, scripts/execution-ledger.mjs, scripts/workflow-health.mjs, scripts/project-buglog.mjs, hooks/cc-stop-verifier.sh, hooks/cc-posttoolbatch-observer.sh, hooks/lib/state.sh, tests/test-hooks.sh, tests/test-workflow-tools.sh, tests/test-install.sh, live readiness/browser/workflow/buglog probes, and dual CEO/engineering/DX review voices.
Non-goals: No remote telemetry, no remote memory sync, no plugin/MCP permission expansion, no migration of private transcripts or local memories, no production install claim until source and installed-home gates pass.

## Objective

Close the remaining hardening gaps after the best-of-all-worlds rollout:

1. Browser QA screenshot/provenance validation.
2. Task-packet, subagent, reviewer, and ledger lineage binding.
3. Multi-phase ledger state instead of one mutable phase slot.
4. Workflow-health project/session scoping and stale-run cleanup.
5. Optional session-start learning summary with strict context and privacy caps.

## Rules

- No advisory-only behavior. Required behavior needs a hook, checker, test, doctor gate, canary, or install-time verification.
- No silent fallback. A required validator that cannot prove evidence must fail clearly.
- No remote telemetry, remote memory sync, broad permission migration, or plugin/MCP expansion.
- Preserve old v1 ledgers and report legacy mode explicitly.
- If installed behavior changes, run source gates, install, then installed-home gates.
- Keep docs and changelog aligned with behavior in the same patch.

## Evidence

| Gap | Current code fact | Risk |
| --- | --- | --- |
| Browser screenshots | `browser-qa-report.mjs` validates v2 matrix shape/counts, not screenshot files, hash, freshness, or path safety. | False visual QA evidence can pass. |
| Reviewer lineage | `cc-posttoolbatch-observer.sh` records agent/reviewer calls as strings; `cc-stop-verifier.sh` checks strings. | Unrelated subagent calls can satisfy gates. |
| Phase state | `execution-ledger.mjs` stores one top-level phase/UAT slot. | Parallel or multi-session phases overwrite each other. |
| Workflow status | `workflow-health.mjs status` selects latest ledger from the run directory. | SessionStart can surface unrelated stale work. |
| Learning hints | `project-buglog.mjs suggest` is file-scoped and edit-time only. | Project-level repeated failures are invisible at session start. |

## Execution Order

1. Browser QA evidence hardening.
2. Local evidence trace and identity contract.
3. Reviewer/task binding stop gates.
4. Multi-phase ledger projections.
5. Workflow-health scoping and cleanup.
6. Session-start learning summary.
7. Docs, install, canary, release gates.

Do not parallelize phases 2-5. They all consume the same evidence identity contract and must share one writer/query model.

## Implementation Status

| Phase | State | PR | Notes |
| --- | --- | --- | --- |
| Phase 0: Baseline | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Plan, coverage, docs, health stack, and changelog are updated in this working tree. |
| Phase 1: Browser QA Screenshot And Provenance Validation | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | v2 screenshot file/hash/freshness/provenance checks, hash command, canary, docs, and tests landed. |
| Phase 2: Local Evidence Trace And Ledger Lineage | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Packet hashes, lineage fields, structured agent/review records, and bound evidence checks landed. |
| Phase 3: Reviewer Binding Stop Gates | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Stop-hook reviewer binding uses task identity, lineage, packet hashes, and implementation evidence. |
| Phase 4: Multi-Phase Ledger Projections | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Phase/workstream/UAT metadata and workflow status summaries landed as additive ledger v2 fields. |
| Phase 5: Workflow-Health Scoping And Cleanup | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | `--session`, `--cwd`, `--project`, `--all`, `doctor`, and `prune` surfaces landed. |
| Phase 6: Session-Start Learning Summary | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Redacted project-level hints, debounce, caps, and disable flags landed. |
| Phase 7: Install, Canary, Docs, Release | Implementation Complete (pending PR merge and done criteria) | local uncommitted CodeRabbit-reviewed patch | Install/update/rollback drift UX, post-upgrade canary, docs, and release gates landed. |

## Phase 0: Baseline

Status: Complete; see `## Implementation Status`.

Owner files: `docs/plans/2026-05-13-next-control-plane-hardening-plan.md`, `docs/control-plane-coverage.md`, `docs/health-stack.md`, `docs/skills.md`, `CHANGELOG.md`.

Tasks:

1. Save this plan.
2. Add coverage rows as each layer lands.
3. Keep `CHANGELOG.md` under the current semantic version section; leave `Unreleased` empty unless release policy changes.

Gate:

```bash
node scripts/changelog-release-check.mjs
```

## Phase 1: Browser QA Screenshot And Provenance Validation

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/browser-qa-report.mjs`, `scripts/post-upgrade-canary.sh`, `skills/etrnl-qa-browser/SKILL.md`, `agents/etrnl-browser-qa.md`, `docs/health-stack.md`, `docs/troubleshooting.md`, `tests/test-workflow-tools.sh`, `tests/test-install.sh`.

Implementation:

1. Add `--artifact-root`; default to `CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR`.
2. For complete v2 reports, validate each non-skipped matrix row: `screenshot` is non-empty, path is relative or inside artifact root, file exists, file size > 0, `screenshotSha256` is present and matches, `capturedAt` is fresh ISO, counts are numeric.
3. For complete v2 reports, validate `provenance.tool`, `provenance.targetUrl`, `provenance.command`, and `provenance.capturedAt`, and bind screenshot evidence to route, viewport, and target URL.
4. Add `browser-qa-report.mjs hash <file>`.
5. Keep migrated v1 reports as `draft`.
6. Add post-upgrade canary rejecting complete v2 reports with missing screenshots.

Acceptance:

```bash
./tests/test-workflow-tools.sh
./tests/test-install.sh
./scripts/post-upgrade-canary.sh
./scripts/doctor.sh
```

Rollback: revert browser QA helper, skill/agent docs, canary, and tests only. Existing v1/v2 draft reports stay readable.

## Phase 2: Local Evidence Trace And Ledger Lineage

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/execution-ledger.mjs`, `scripts/agent-task-packet-check.mjs`, `hooks/cc-posttoolbatch-observer.sh`, `hooks/cc-subagentstop-record.sh`, `hooks/lib/state.sh`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`.

Implementation:

1. Add ledger `schemaVersion: 2`; read v1 ledgers as legacy-valid and label them `legacy`.
2. Add one canonical local evidence event contract before widening gates: `eventId`, `eventType`, `runId`, `sessionId`, `cwd`, `projectId`, `taskId`, `lineageId`, `packetHash`, `artifactPath`, `artifactSha256`, `source`, `status`, `at`.
3. Add an atomic, locked event writer before `record-agent`, `record-review`, phase, UAT, or workflow status writes depend on the ledger. Direct read-modify-write JSON updates are not enough for concurrent subagent stops.
4. Add packet hash helper in `agent-task-packet-check.mjs`.
5. Require write-mode packets to include `taskId`; generate or validate `lineageId`; compute canonical `packetHash`.
6. Add `execution-ledger.mjs record-agent` and `record-review` as event writers plus derived legacy views.
7. Store structured agent fields: `id`, `taskId`, `lineageId`, `role`, `mode`, `packetHash`, `reviewOf`, `startedAt`, `endedAt`, `status`.
8. Store structured review fields: `id`, `taskId`, `lineageId`, `reviewer`, `reviewOf`, `packetHash`, `status`, `at`.
9. Update observer/subagent-stop hooks to write structured lineage when task id and packet hash exist.
10. Keep string `agentCalls` as legacy evidence only.

Acceptance:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
node scripts/skill-contract-check.mjs --root .
```

Rollback: keep the v2 reader additive and preserve v1 read compatibility. For current `/etrnl-execute` runs, missing structured evidence must fail closed; string evidence is legacy compatibility, not a pass for new execution.

## Phase 3: Reviewer Binding Stop Gates

Status: Complete; see `## Implementation Status`.

Owner files: `hooks/cc-stop-verifier.sh`, `scripts/execution-ledger.mjs`, `scripts/agent-task-packet-check.mjs`, `skills/etrnl-execute/SKILL.md`, `agents/etrnl-executor.md`, `agents/etrnl-spec-reviewer.md`, `agents/etrnl-quality-reviewer.md`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`.

Implementation:

1. For multi-file source edits after `/etrnl-execute`, require v2 ledger evidence for the current run: write-mode `etrnl-executor`, matching `taskId`, matching `packetHash`, bound `etrnl-spec-reviewer`, bound `etrnl-quality-reviewer`, and reviews after executor completion.
2. If no active v2 ledger exists for a current `/etrnl-execute`, fail closed with a clear setup/ledger-init fix. Preserve the current string-based gate only for legacy runs outside `/etrnl-execute` and report `legacy` mode explicitly.
3. Add tests for wrong task, wrong packet hash, reviewer-before-executor, and valid bound reviews.

Acceptance:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
node scripts/skill-behavior-smoke.mjs --root .
```

Rollback: revert Stop gate to current string evidence path. Keep v2 recording if already installed.

## Phase 4: Multi-Phase Ledger Projections

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/execution-ledger.mjs`, `scripts/workflow-health.mjs`, `scripts/plan-readiness-check.mjs`, `skills/etrnl-autoplan/SKILL.md`, `skills/etrnl-plan/SKILL.md`, `skills/etrnl-execute/SKILL.md`, `skills/etrnl-qa-browser/SKILL.md`, `tests/test-workflow-tools.sh`.

Implementation:

1. Add `phases[]` as a projection over evidence events with `id`, `workstreamId`, `status`, `uatArtifact`, `uatOpenFindings`, `tasks`.
2. Preserve top-level phase fields as legacy aliases derived from the active phase.
3. Add `execution-ledger.mjs add-phase`, `set-phase-status`, and `record-uat --phase`.
4. Completion blocks if any phase has open UAT findings or non-terminal status.
5. `workflow-health status --json` reports `phases.total`, `phases.blocked`, `phases.uatOpen`, and `phases.nextAction`.
6. Plan readiness accepts optional phase tables and rejects duplicate phase ids.

Acceptance:

```bash
./tests/test-workflow-tools.sh
node scripts/plan-readiness-check.mjs hooks/fixtures/plans/good-plan.md
node scripts/skill-contract-check.mjs --root .
```

Rollback: keep top-level phase fields readable for v1 ledgers. New v2 phase writes stay event-backed; do not create a second mutable phase source of truth.

## Phase 5: Workflow-Health Scoping And Cleanup

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/workflow-health.mjs`, `scripts/execution-ledger.mjs`, `hooks/cc-sessionstart-restore.sh`, `docs/health-stack.md`, `docs/troubleshooting.md`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`.

Implementation:

1. Add `workflow-health` flags: `--session`, `--cwd`, `--project`, `--all`.
2. Store normalized `cwd` and `projectId` in new ledgers/events.
3. Default SessionStart hints to current `cwd` and current session when available; require `--all` for global status.
4. Add `workflow-health.mjs prune --older-than-days N --status terminal-only`.
5. Add `workflow-health.mjs doctor --json` for stale, malformed, and prunable counts.
6. Doctor reports stale/prunable state, but pruning requires explicit command.

Acceptance:

```bash
node scripts/workflow-health.mjs status --cwd "$PWD" --json
node scripts/workflow-health.mjs prune --older-than-days 30 --dry-run
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
./scripts/doctor.sh
```

Rollback: do not delete ledgers without explicit prune command. If scoping cannot be proven for SessionStart, emit no scoped workflow status and explain the parser failure; do not silently fall back to unrelated global status.

## Phase 6: Session-Start Learning Summary

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/project-buglog.mjs`, `hooks/cc-sessionstart-restore.sh`, `hooks/lib/state.sh`, `docs/configuration.md`, `docs/health-stack.md`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`.

Implementation:

1. Add `project-buglog.mjs suggest-project --json`.
2. Return only top 3 fresh fingerprints with category, severity, redacted summary, and suggested guard.
3. Default SessionStart injection off unless `CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS=1` or workflow-health reports stale/blocked/repeated-failure state.
4. Cap injected text with `CLAUDE_CONTROL_PLANE_LEARNING_HINT_MAX_CHARS`, default 500.
5. Aggregate project-level fingerprints without `sessionId`; keep session only for debounce/noise control.
6. Exclude command history, raw prompts, transcripts, absolute home paths, raw `cwd`, and secret-looking values.
7. Debounce once per session per fingerprint.

Acceptance:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
./scripts/doctor.sh
```

Rollback: set `CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS=0`. Edit-time learning hints stay independently gated.

## Phase 7: Install, Canary, Docs, Release

Status: Complete; see `## Implementation Status`.

Owner files: `scripts/install.sh`, `scripts/update-check.mjs`, `scripts/post-upgrade-canary.sh`, `scripts/doctor.sh`, `docs/control-plane-coverage.md`, `docs/health-stack.md`, `docs/skills.md`, `docs/install.md`, `docs/troubleshooting.md`, `CHANGELOG.md`, `tests/test-install.sh`.

Tasks:

1. Install changed helpers and fixtures.
2. Add installed drift checks for new helper behavior.
3. Add canaries for missing screenshot rejection, v2 ledger lineage validation, and scoped workflow-health status.
4. Update docs in the same patch.

Source gate:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
./tests/test-install.sh
node scripts/skill-contract-check.mjs --root .
node scripts/skill-behavior-smoke.mjs --root .
node scripts/changelog-release-check.mjs
./scripts/doctor.sh
```

Installed gate:

```bash
./scripts/install.sh
~/.claude/scripts/doctor-control-plane.sh
node scripts/skill-contract-check.mjs --root . --installed
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
~/.claude/scripts/post-upgrade-canary.sh
```

Strict-mode smoke gate:

```bash
_STRICT_HOME="$(mktemp -d)"
CLAUDE_CONTROL_PLANE_ENABLE_STRICT=1 CLAUDE_HOME="$_STRICT_HOME" ./scripts/install.sh
CLAUDE_HOME="$_STRICT_HOME" "$_STRICT_HOME/scripts/doctor-control-plane.sh"
```

## Backlog Priority

| Priority | Item | Reason |
| --- | --- | --- |
| P0 | Browser screenshot/provenance validation | Prevents false visual QA evidence. |
| P0 | Reviewer/task lineage binding | Prevents unrelated subagent calls from satisfying gates. |
| P1 | Multi-phase ledger arrays | Prevents phase/UAT overwrite in longer runs. |
| P1 | Workflow-health scoping | Prevents unrelated stale runs from polluting status output. |
| P2 | Session-start learning summary | Useful, but must be opt-in/noise-controlled. |

## Done Criteria

- Every required behavior has at least one failing fixture before implementation and passing fixture after implementation.
- `workflow-health status --json` remains backward-compatible.
- Old ledgers validate or report legacy mode clearly.
- Installed `~/.claude` has no stale helper scripts.
- Docs and changelog describe landed behavior.
- No private identity, credentials, transcripts, or local memories are added to tracked files.

## What already exists

- `scripts/browser-qa-report.mjs` already creates, validates, migrates, and summarizes browser QA reports. This plan extends it instead of adding another report tool.
- `scripts/execution-ledger.mjs` already owns run ledgers, task states, checks, artifacts, and UAT blocking. This plan should keep it as the source surface while moving toward structured evidence.
- `scripts/workflow-health.mjs` already summarizes run health, stale runs, browser QA artifacts, context artifacts, review logs, and next action. This plan scopes that query instead of creating a second status command.
- `scripts/project-buglog.mjs` already stores local repeated-failure notes with redaction and file-scoped suggestions. This plan adds project-level startup-safe summaries.
- `hooks/cc-posttoolbatch-observer.sh`, `hooks/cc-stop-verifier.sh`, and `hooks/lib/state.sh` already collect tool evidence and block unsafe completion claims. This plan makes the evidence identity-bound.
- `scripts/install.sh`, `scripts/update-check.mjs`, `scripts/post-upgrade-canary.sh`, and `tests/test-install.sh` already prove installed-home drift. This plan adds canaries for the new helper behavior.

## NOT in scope

- Remote telemetry collection: excluded because the repo boundary is local-first and private by default.
- Plugin, MCP, and broad permission migration: excluded because these are personal live-rollout operations, not shareable repo defaults.
- Private transcript, account, credential, or memory migration: excluded because tracked repo files must stay public-safe.
- A visual-diff product or hosted dashboard: deferred because this pass hardens evidence capture and gates, not a new UI.
- Full OpenTelemetry/LangSmith-compatible export: deferred unless the evidence trace contract becomes the selected architecture and export stays local or explicit.

## File map

- `scripts/browser-qa-report.mjs`: schema v2 artifact validation, hash command, artifact-root containment, complete-report provenance checks.
- `scripts/execution-ledger.mjs`: lineage schema, phase/UAT state, structured agent/review records, legacy reader behavior.
- `scripts/lib/evidence-trace.mjs` or a comparably small helper: canonical event identity, packet/artifact hashing, containment checks, atomic locked append/write helpers, and shared query helpers if adding this keeps entrypoint scripts under control.
- `scripts/agent-task-packet-check.mjs`: write packet identity fields, packet hash helper, reviewer contract validation.
- `hooks/cc-posttoolbatch-observer.sh`: structured agent/reviewer recording from Agent/Task tool calls.
- `hooks/cc-subagentstop-record.sh`: subagent completion evidence and task binding.
- `hooks/cc-stop-verifier.sh`: completion blocking based on bound implementation and reviewer evidence.
- `hooks/lib/state.sh`: state migration buckets for compact metadata, agent calls, reviewer calls, and learning hint debounce.
- `scripts/workflow-health.mjs`: scoped status, prune, doctor, stale/malformed/prunable accounting.
- `scripts/project-buglog.mjs`: project-level suggestions, redaction, top-3 cap, freshness and startup-safe output.
- `hooks/cc-sessionstart-restore.sh`: scoped workflow status and optional learning summary injection.
- `scripts/post-upgrade-canary.sh`: installed canaries for missing screenshot rejection, lineage validation, and scoped status.
- `scripts/install.sh`, `scripts/update-check.mjs`, `tests/test-install.sh`: installed drift and helper-surface proof.
- `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`: source fixtures for hooks, ledgers, workflow status, browser QA, and buglog behavior.
- `docs/control-plane-coverage.md`, `docs/health-stack.md`, `docs/skills.md`, `docs/install.md`, `docs/troubleshooting.md`, `CHANGELOG.md`: release and operator documentation.

## Task groups

- Browser QA provenance: reject complete v2 reports without real, fresh, in-root screenshot evidence.
- Evidence lineage: bind write packets, implementation agents, reviewers, and ledger records through stable task and packet identity.
- Stop-gate binding: require correct executor and reviewer evidence for multi-file `/etrnl-execute` completion.
- Phase and UAT state: prevent one mutable phase slot from overwriting longer multi-phase runs.
- Workflow-health scoping: keep current project/session status from being polluted by unrelated stale ledgers.
- Session learning hints: surface top local repeated failures only when gated, redacted, scoped, capped, and debounced.
- Install and release proof: keep source gates, installed-home gates, docs, and changelog aligned.

## Phases

- Phase 0: Baseline plan, docs, and changelog alignment.
- Phase 1: Browser QA screenshot and provenance validation.
- Phase 2: Local evidence trace and ledger lineage.
- Phase 3: Reviewer binding Stop gates.
- Phase 4: Multi-phase ledger projections.
- Phase 5: Workflow-health scoping and cleanup.
- Phase 6: Session-start learning summary.
- Phase 7: Install, canary, docs, and release gates.

## Skill/tool routing

- Use `/etrnl-plan` or this plan file as the planning artifact.
- Use `/autoplan` for strategy, engineering, and DX review before execution.
- Use `/etrnl-execute` only after `plan-readiness-check.mjs` passes.
- Use `etrnl-executor` for write-mode implementation packets when parallel-safe or multi-file work is involved.
- Use `etrnl-spec-reviewer` and `etrnl-quality-reviewer` after implementation evidence is recorded.
- Use `etrnl-qa-browser` only for browser QA reports that include validated artifact evidence.
- Use RTK-wrapped git/search commands in this repo when hooks require them.

## Test plan

CODE PATH COVERAGE

- `browser-qa-report.mjs create/validate/hash`
  - Happy path: complete v2 report with existing screenshot, positive size, fresh `capturedAt`, valid SHA-256, numeric console/network counts, and valid provenance passes.
  - Failure path: complete v2 report with missing screenshot, out-of-root screenshot, stale capture time, empty file, hash mismatch, missing provenance, and unchecked summaries fails.
  - Migration path: v1 complete report migrates to v2 draft and remains readable.
- `agent-task-packet-check.mjs`
  - Happy path: write packet with `taskId`, `lineageId`, packet hash, write scope, reviewers, spec/quality requirements, and no overlap passes.
  - Failure path: missing reviewer contract, missing task identity, wrong reviewer, overlapping scope, and non-boolean review flags fail.
- `execution-ledger.mjs`
  - Happy path: v1 ledgers remain legacy-valid; v2 lineage records validate; closed UAT findings allow completion.
  - Failure path: open UAT findings, unknown task, missing check, malformed legacy ledger, wrong packet hash, reviewer-before-executor, and non-terminal phase block completion.
- `cc-posttoolbatch-observer.sh` and `cc-stop-verifier.sh`
  - Happy path: multi-file execute with bound write executor plus spec and quality reviewers passes.
  - Failure path: no implementation agent, read-only scout only, wrong task, wrong packet hash, missing spec reviewer, missing quality reviewer, and reviewer before executor block.
- `workflow-health.mjs`
  - Happy path: `status --cwd "$PWD" --json` reports the current project/session run, phase counts, UAT findings, stale runs, and next action.
  - Failure path: unrelated newer ledger is ignored unless `--all` is explicit; malformed ledgers appear in doctor output; prune dry-run does not delete.
- `project-buglog.mjs`
  - Happy path: `suggest-project --json` emits at most three fresh redacted fingerprints with category, severity, summary, and suggested guard.
  - Failure path: secrets, absolute home paths, command history, raw prompts, stale entries, and duplicate-per-session hints are excluded.

## Failure modes

- False browser QA proof passes without a real screenshot. Mitigation: artifact-root, existence, size, freshness, hash, and provenance checks plus installed canary.
- Unrelated subagent or reviewer call satisfies `/etrnl-execute` completion. Mitigation: taskId, lineageId, packetHash, executor, reviewer, and time-order binding.
- Phase/UAT state is overwritten by later work. Mitigation: phase records with stable IDs and completion checks across all non-terminal/open UAT states.
- SessionStart surfaces stale work from another cwd/session. Mitigation: default scoped workflow-health status and explicit `--all`.
- Learning hints leak sensitive context or become noisy. Mitigation: opt-in or failure-triggered injection, strict redaction, top-3 cap, max chars, freshness, and session debounce.
- Docs/changelog claim behavior before install proof. Mitigation: source gates, install, installed doctor, update-check JSON/explain, post-upgrade canary, and stale script checks.

## Parallelization strategy

Do not parallelize phases 2-5 until the evidence identity model is settled. Browser QA provenance can run independently from session-learning hints, but ledger lineage, reviewer binding, phase arrays, and workflow-health scoping share the same state semantics and should be sequential or split only after file ownership is disjoint.

| Lane | Work | Depends on | Notes |
| --- | --- | --- | --- |
| A | Browser QA provenance and canary | Phase 0 | Independent after plan readiness passes. |
| B | Evidence lineage, reviewer binding, phase/UAT, workflow-health scoping | Phase 0 | Sequential core; shared ledger semantics. |
| C | Session-start learning summary | Phase 0, optional workflow-health trigger shape | Can run after scoped status output is stable. |
| D | Docs/install/release gates | A, B, C | Final integration lane only. |

## Verification gates

Source gate:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
./tests/test-install.sh
node scripts/skill-contract-check.mjs --root .
node scripts/skill-behavior-smoke.mjs --root .
node scripts/changelog-release-check.mjs
node scripts/plan-readiness-check.mjs docs/plans/2026-05-13-next-control-plane-hardening-plan.md
./scripts/post-upgrade-canary.sh
./scripts/doctor.sh
```

Installed gate:

```bash
./scripts/install.sh
~/.claude/scripts/doctor-control-plane.sh
node scripts/skill-contract-check.mjs --root . --installed
node ~/.claude/scripts/update-check.mjs --json
node ~/.claude/scripts/update-check.mjs --explain
~/.claude/scripts/post-upgrade-canary.sh
```

## Rollback

- Browser QA rollback: revert `scripts/browser-qa-report.mjs`, browser QA docs/agent/skill edits, related tests, and post-upgrade canary checks. Existing draft reports remain readable.
- Ledger rollback: keep v1 read path intact, disable structured recording, and leave string evidence checks as legacy fallback.
- Stop-gate rollback: revert to current string evidence gate while preserving any installed ledger data.
- Workflow-health rollback: do not delete ledgers automatically; disable scoped filtering only if parser failure blocks status.
- Learning-hint rollback: set `CLAUDE_CONTROL_PLANE_LEARNING_STARTUP_HINTS=0`; edit-time buglog suggestions remain separate.
- Install rollback: use `~/.claude/scripts/rollback-local.sh`, then rerun installed doctor.

## Execution handoff

- Start by making this plan pass `node scripts/plan-readiness-check.mjs docs/plans/2026-05-13-next-control-plane-hardening-plan.md`.
- Implement Phase 1 first because the live probe shows missing screenshots currently validate.
- Before Phase 2 code, implement the local evidence trace contract as the source of truth. Ledger fields, workflow-health, Stop gates, phase state, UAT, and learning hints are projections over that trace.
- Keep source fixtures red before behavior changes and green after.
- Do not update docs/changelog to claim completion until the matching source and installed-home gates pass.

## Plan Readiness Report

- Scope Challenge: passed with dev-context correction; hardening is valid, but phases 2-5 should be treated as one evidence identity problem during implementation.
- Architecture Review: current architecture reuses the right hooks/scripts, but mutable ledger fields risk compounding unless evidence identity is centralized.
- Code Quality Review: touched files already include several oversized hook/script surfaces; keep new logic in thin helpers when directly touching those files.
- Test Review: required path-by-path fixtures are listed for browser QA, packet checks, ledgers, Stop gates, workflow status, buglog, source gates, and installed gates.
- Performance Review: no hot user path, but `workflow-health.mjs` must keep bounded ledger reads and explicit prune behavior.
- Failure modes: critical false-evidence, unrelated-reviewer, stale-status, privacy-leak, and release-overclaim modes are named with gates.
- Parallelization: browser QA and learning hints are separable; ledger lineage, reviewer binding, phase arrays, and workflow scoping are sequential until identity semantics are settled.
- Unresolved questions: none for dev execution. The review outcome selects a unified local evidence trace contract and keeps the original phases as delivery slices.

## Verdict

Approved for dev execution with the evidence trace framing. The current implementation surface is allowed to stay in progress, but release/docs claims must not be treated as production-complete until source and installed-home gates pass.

## Strategy Review Addendum

Status: Premise gate passed for dev execution
Reviewer mode: SELECTIVE EXPANSION
UI scope: no
DX scope: yes
Base branch: main
Restore point: stored in the local gstack project artifact directory.

### 0A. Premise Challenge

| Premise | Evidence | Initial judgment |
| --- | --- | --- |
| The remaining hardening gaps are real and worth addressing. | Direct probes confirmed `browser-qa-report.mjs` accepts a complete v2 report with a missing screenshot, `workflow-health.mjs status --cwd /target --json` still selects a newer `/other` run, and `project-buglog.mjs suggest-project --json` exits with usage/status 2. | Valid. This is not imaginary polish. |
| The current plan file is ready for execution because it is marked `Status: Final`. | `node scripts/plan-readiness-check.mjs docs/plans/2026-05-13-next-control-plane-hardening-plan.md --json --explain` fails missing `Goal`, `Non-goals`, `What already exists`, `NOT in scope`, `File map`, `Task groups`, `Test plan`, `Failure modes`, `Verification gates`, `Plan Readiness Report`, and `Verdict`. | Invalid. The plan idea is sound, but the artifact is not execution-ready by this repo's own contract. |
| More deterministic enforcement is the highest-leverage next move. | The dirty tree already has 34 modified files and 1,230 insertions across hooks, ledgers, workflow health, browser QA, docs, install, and tests. Independent reviewers warned that the stronger framing is a unified evidence trace contract, not five more disconnected gates. | Partially valid. Enforcement is valuable, but the plan should be reframed around one trace contract with projections. |
| Browser screenshot/provenance validation is P0. | Probe: a complete v2 report with `screenshot: "missing.png"` created and validated successfully. Current code validates matrix shape/counts but not file existence/hash/freshness/path containment. | Valid P0, but should include route priority and inspectability so hashes do not become ceremony. |
| Reviewer lineage and phase/workflow scoping are separable phases. | Current `execution-ledger.mjs` still validates `schemaVersion: 1`, stores one top-level phase/UAT slot, and `cc-posttoolbatch-observer.sh` records agent calls as strings. | Weak. These are all symptoms of the same missing event/lineage model. |
| Local-only learning hints are enough. | The plan forbids remote telemetry, which fits the privacy boundary. But it does not define a strong local export/metrics loop for deciding whether hardening actually reduces bad completions. | Needs user judgment. Privacy is right; learning-loop shape is a product decision. |

### Premises Resolved For Dev Execution

1. Should the plan stay framed as six ordered hardening phases, or should it be rewritten around one local agent evidence trace contract with browser QA, lineage, phases, workflow status, and learning hints as projections?
2. Should `Status: Final` mean execution-ready only after `plan-readiness-check.mjs` passes, even for gstack/autoplan-created plans?
3. Should docs/changelog describe the current dirty implementation as `done`, or should those claims be downgraded until source gates plus installed-home gates pass?
4. Should privacy stay strict local-only, or should the plan add an opt-in local export/anonymized metrics path so the product can learn across real runs?

Gate response: the implementation may proceed in dev mode while preserving final release proof for the actual install/source gates.

### 0B. Existing Code Leverage

| Sub-problem | Existing code to reuse | Reuse assessment |
| --- | --- | --- |
| Browser QA evidence | `scripts/browser-qa-report.mjs`, `scripts/post-upgrade-canary.sh`, `tests/test-workflow-tools.sh`, `tests/test-install.sh`, `agents/etrnl-browser-qa.md`, `skills/etrnl-qa-browser/SKILL.md` | Reuse. Add artifact-root, hash, freshness, and path-safety validation here rather than new tooling. |
| Task packets and reviewer contracts | `scripts/agent-task-packet-check.mjs`, `tests/fixtures/events/packet-*`, `hooks/cc-pretooluse-guard.sh` | Reuse. Extend packet validation to require `taskId`, `lineageId`, and packet hash for write mode. |
| Execution ledgers | `scripts/execution-ledger.mjs`, `scripts/workflow-health.mjs`, `hooks/cc-sessionstart-restore.sh` | Reuse, but refactor toward append-only event receipts before adding more mutable top-level fields. |
| Stop gates | `hooks/cc-stop-verifier.sh`, `hooks/cc-posttoolbatch-observer.sh`, `hooks/cc-subagentstop-record.sh`, `hooks/lib/state.sh` | Reuse. Stop should consume structured evidence when available and keep string evidence as legacy-only fallback. |
| Local bug memory | `scripts/project-buglog.mjs`, `hooks/cc-pretooluse-guard.sh`, `hooks/lib/state.sh` | Reuse. Add project-level `suggest-project`, top-3 cap, and startup privacy gates. |
| Install drift proof | `scripts/install.sh`, `scripts/update-check.mjs`, `scripts/post-upgrade-canary.sh`, `tests/test-install.sh` | Reuse. Add installed canaries for new helper behavior before release claims. |

### 0C. Dream State Delta

```text
CURRENT STATE
  Many local hooks and helpers can block obvious bad completions, but evidence is split
  across strings, mutable ledgers, docs, and installed-home drift checks.

        |
        v

THIS PLAN
  Hardens browser artifacts, task/reviewer lineage, UAT phase state, workflow scoping,
  and learning hints. It reduces false completion claims, but risks adding more state
  shapes unless the lineage model is unified.

        |
        v

12-MONTH IDEAL
  One local evidence trace contract records agent events, artifacts, checks, reviews,
  phases, and recovery hints. Hooks are policy consumers. Docs, doctor, status,
  SessionStart, and release checks are projections over that trace.
```

### 0C-bis. Implementation Alternatives

| Approach | Summary | Effort | Risk | Pros | Cons | Reuses |
| --- | --- | --- | --- | --- | --- | --- |
| A. Patch the six phases as written | Implement each helper/gate in sequence with additive compatibility. | M | Medium | Fastest path from current dirty tree to stronger gates; easiest rollback by phase. | More mutable state and long scripts; may leave plan-vs-product strategy unresolved. | Existing scripts/hooks/tests. |
| B. Unified evidence trace first | Define append-only event receipts for browser QA, agent, review, task, phase, UAT, workflow status, and learning hints, then migrate projections. | L | Medium-high | Cleanest 12-month architecture; makes workflow-health, Stop, docs, and canaries read one source of truth. | Larger refactor; more risk in a dirty tree unless split carefully. | `execution-ledger.mjs`, `workflow-health.mjs`, hook state, browser QA artifacts. |
| C. Minimal P0 closure | Land only browser screenshot/provenance validation plus current string-based reviewer gate fixes, defer ledger arrays/scoping/learning. | S | Low | Removes the easiest false-evidence bugs quickly. | Leaves repeated stale-run and lineage problems alive; likely creates another follow-up hardening plan. | Browser QA and Stop verifier only. |

Recommendation: choose B as the plan framing, but execute it in A-sized increments. The complete version is worth it because the same evidence contract solves phases 2-5 instead of adding four more partial state models.

### 0D. Selective Expansion Scan

| Candidate | Classification | Decision | Rationale |
| --- | --- | --- | --- |
| Add plan-readiness gate before any `Status: Final` execution | Mechanical | Auto-accept into plan | The current plan failed the repo's own readiness checker. Completion claims need deterministic gates. |
| Reframe phases 2-5 as a single evidence trace contract | User Challenge | Pending user decision | Independent reviewers recommend changing the stated six-phase structure. This is strategic, not mechanical. |
| Add route priority/assertion layer to browser QA validation | Taste | Recommend accept | Screenshot hashes prove provenance, not correctness. Route priority plus assertions prevents ceremony. |
| Add privacy-preserving local export/anonymized metrics | Taste | Recommend defer to explicit product decision | The repo boundary says no remote telemetry. A local export may be useful, but it changes the product story. |
| Extract oversized policy modules before widening gates | Taste | Recommend accept where touched | Files over 300 lines are already present. Keep hook/CLI entrypoints thin while changing them. |

### 0E. Temporal Interrogation

| Time | Human-team question | CC+gstack compressed question |
| --- | --- | --- |
| Hour 1 foundations | Is the source of truth mutable ledger fields or append-only receipts? | Decide now before writing more validators. |
| Hour 2-3 core logic | What is the stable identity tuple: `taskId`, `lineageId`, `packetHash`, `sessionId`, `cwd`, `projectId`? | Add fixtures first so wrong-task and wrong-hash fail red. |
| Hour 4-5 integration | How do Stop, workflow-health, SessionStart, browser QA, and install canary read the same evidence without duplicating state logic? | Centralize parser/query helpers before widening policies. |
| Hour 6+ polish/tests | What proves this improved outcomes rather than just adding gates? | Add source and installed gates plus a local metrics/export story or explicit non-goal. |

### 0F. Mode Confirmation

Selected mode: SELECTIVE EXPANSION.

Reason: The plan is an enhancement to an existing control plane, not a greenfield product. Scope should stay mostly intact, but the strategy review found a real reframing: phases 2-5 should likely collapse into one evidence trace contract.

### Strategy Review Findings

Reviewer A findings:

- The plan assumes stricter local machinery automatically creates user value.
- Browser screenshot hashing can become ceremony unless paired with route priority, assertions, accessibility, or regression checks.
- The repo markets a small deterministic hook layer, but the plan still looks like a personal Claude OS tied to `~/.claude`.
- Strict enforcement remains opt-in, so product positioning is unresolved.
- Competitive risk is not another hook repo; it is simpler observability/agent-trace systems.

Reviewer B findings:

- The right 10x framing is one local agent evidence trace contract.
- The plan is marked `Final` but fails `plan-readiness-check.mjs`.
- Docs/changelog currently overclaim `done` while current code still uses weak browser artifacts and string lineage.
- Browser QA is a valid P0.
- Ledger lineage, phase arrays, and workflow scoping should be designed together.

Strategy review consensus:

| Dimension | Reviewer A | Reviewer B | Consensus |
| --- | --- | --- | --- |
| Premises valid? | Partial | Partial | DISAGREE/PARTIAL: gaps valid, plan artifact not ready |
| Right problem to solve? | Maybe, but value proof missing | Reframe as evidence trace | DISAGREE -> user challenge |
| Scope calibration correct? | Too much machinery without outcome metric | Six phases should collapse | DISAGREE -> user challenge |
| Alternatives sufficiently explored? | No | No | CONFIRMED gap |
| Competitive/market risks covered? | No | No | CONFIRMED gap |
| 6-month trajectory sound? | Risk of brittle maze | Risk of oversized state model | CONFIRMED concern |

### Strategy Pre-Gate Error And Rescue Registry

| Codepath | What can go wrong | Current behavior observed | Rescue action needed |
| --- | --- | --- | --- |
| `plan-readiness-check.mjs <plan>` | Final plan lacks required execution sections | Fails clearly with JSON repairs. | Treat as blocking before execution. |
| `browser-qa-report.mjs create/validate` | Missing screenshot path in complete v2 report | Probe passed create and validate. | Reject missing/out-of-root/empty/stale/hash-mismatch screenshots. |
| `workflow-health.mjs status --cwd` | Current project/session gets polluted by newer unrelated ledger | Probe reported `/other` run for `--cwd /target`. | Implement real cwd/project/session filtering and make `--all` explicit. |
| `project-buglog.mjs suggest-project` | SessionStart learning summary command absent | Exits usage/status 2. | Add command or remove Phase 6 claim until implemented. |

### Strategy Pre-Gate Failure Modes

| Failure mode | Severity | Why it matters | Gate |
| --- | --- | --- | --- |
| False visual QA evidence passes because screenshot file is missing. | Critical | User trusts a QA report that did not inspect a real rendered state. | Browser QA fixture and post-upgrade canary. |
| Unrelated reviewer/subagent call satisfies completion. | Critical | `etrnl-execute` can claim reviewed work without task binding. | Structured packet hash + task lineage + Stop gate. |
| Unrelated stale run pollutes SessionStart. | High | Claude starts a new session with wrong next action. | `workflow-health status --cwd/--session` fixture. |
| Final plan fails readiness checker. | High | Execution starts from an artifact the repo would reject elsewhere. | `plan-readiness-check` before implementation. |
| Docs/changelog claim `done` before installed proof. | High | Shareable repo trust erodes. | Source gates + installed-home gates before release docs. |

## AUTOPLAN PHASE 2 DESIGN REVIEW

Status: skipped.

Reason: UI scope detection returned zero qualifying UI terms. This plan changes local hooks, scripts, agents, docs, install flow, and workflow state, not a user-facing interface.

## AUTOPLAN PHASE 3 ENGINEERING REVIEW

Status: complete.
Test plan artifact: local gstack project artifact `main-eng-review-test-plan-20260513T193504.md`.

### Eng Step 0. Scope Challenge

| Sub-problem | Code evidence | Finding | Decision |
| --- | --- | --- | --- |
| Browser QA proof | `scripts/browser-qa-report.mjs` validates v2 matrix shape/status/counts but not screenshot file existence, hash, freshness, or root containment. | Real P0. Complete reports can still cite fake visual proof. | Keep Phase 1 first and make `screenshotSha256` mandatory for complete reports. |
| Agent/reviewer lineage | `hooks/cc-posttoolbatch-observer.sh` records strings; `hooks/cc-stop-verifier.sh` counts string matches. | Real P0. Unrelated or early reviewer evidence can satisfy completion. | Require structured v2 trace evidence for current `/etrnl-execute`; strings are legacy only. |
| Packet identity | `scripts/agent-task-packet-check.mjs` write packet validation omits `taskId`, `lineageId`, and canonical packet hash. | High. The plan depends on identity fields that the packet checker does not yet require. | Add identity requirements before reviewer binding. |
| Phase/UAT state | `scripts/execution-ledger.mjs` writes one top-level phase/UAT slot. | High. Later phases can overwrite earlier UAT state. | Make `phases[]` a projection over the evidence trace, with legacy aliases. |
| Workflow status | `scripts/workflow-health.mjs` loads all ledgers and selects latest; SessionStart calls it unscoped. | High. Current project can inherit stale state from another cwd/session. | Add scoped filters and require `--all` for global status. |
| Learning hints | `scripts/project-buglog.mjs` only supports file-scoped `suggest`; fingerprint includes `sessionId`. | Medium. Project-level repeated failures are invisible or over-fragmented. | Add `suggest-project`, remove `sessionId` from project fingerprint, keep session for debounce. |
| Ledger writes | `scripts/execution-ledger.mjs` uses direct JSON read/write mutations. | Medium-high. Concurrent subagent stops/checks can lose evidence. | Add atomic locked event append/write helpers before widening v2 evidence. |

### Engineering Review Findings

Reviewer A findings:

- Plan readiness passes, but phases 2-5 should not execute as separate state patches.
- Ledger writes need an atomic or append-only event writer before evidence becomes authoritative.
- Current `/etrnl-execute` should fail closed without v2 evidence; upgrade hints are too soft.
- The plan file had local absolute paths that should not enter the public repo.
- Browser screenshots need mandatory hash and route/viewport/target binding, not optional hashes.

Reviewer B findings:

- Browser QA accepts fake screenshot evidence today.
- Reviewer binding is string-based and can be satisfied by unrelated calls.
- Write packets pass without identity fields.
- Workflow-health scoping, multi-phase ledgers, prune/doctor, and project learning are plan-only or partial.
- Path containment and ledger pointer trust need central helpers.

| Dimension | Reviewer A | Reviewer B | Consensus |
| --- | --- | --- | --- |
| Architecture sound? | Partial; needs append-only/locked trace | Partial; one evidence identity problem | CONFIRMED concern |
| Test coverage sufficient? | No; missing race, wrong-task, hash, scoping tests | No; missing browser/packet/workflow fixtures | CONFIRMED gap |
| Performance risks addressed? | Partial; workflow scans must stay bounded | Partial; concurrency and ledger reads matter | CONFIRMED gap |
| Security threats covered? | Partial; local paths and path containment gaps | Partial; path traversal/pointer trust gaps | CONFIRMED gap |
| Error paths handled? | No; fallback/legacy semantics too soft | No; missing fail-closed command dispatch | CONFIRMED gap |
| Deployment risk manageable? | Yes if source + installed + strict smoke gates run | Yes if canaries cover new behavior | CONFIRMED with gates |

### Eng Architecture Diagram

```text
Agent/Task packet
  -> agent-task-packet-check.mjs
      -> taskId + lineageId + packetHash
      -> local evidence trace event
          -> execution-ledger.mjs derived views
          -> cc-stop-verifier.sh policy checks
          -> workflow-health.mjs scoped status
          -> cc-sessionstart-restore.sh hints

Browser QA runner/report
  -> browser-qa-report.mjs
      -> artifact-root containment
      -> screenshotSha256 + capturedAt + route/viewport/target binding
      -> local evidence trace event
      -> post-upgrade-canary.sh installed proof

Project bug memory
  -> project-buglog.mjs record/suggest/suggest-project
      -> redacted project fingerprints
      -> optional SessionStart hints
```

### Eng Code Quality Review

| Issue | Severity | Fix |
| --- | --- | --- |
| `execution-ledger.mjs`, `workflow-health.mjs`, `cc-stop-verifier.sh`, `cc-posttoolbatch-observer.sh`, and `hooks/lib/state.sh` are already over or near the repo's size limits. | Medium | Add a small helper only where it prevents more entrypoint swelling: evidence identity, atomic writing, hashing, containment, and query helpers. |
| Current evidence is duplicated across strings, ledger fields, hook state, report files, and docs. | High | Make the trace contract canonical and keep older fields as compatibility projections. |
| Rollback language previously allowed global/status fallback. | High | Fail closed for current execution when required scoped evidence cannot be proven. |
| Plan file contained local absolute paths. | High | Scrub tracked plan content to public-safe descriptions. |

### Eng Test Review Diagram

| Codepath | New branch or behavior | Existing coverage | Required new coverage |
| --- | --- | --- | --- |
| `browser-qa-report.mjs validate` | complete v2 screenshot file required | Matrix status/count tests only | missing, out-of-root, empty, stale, hash-mismatch, valid hash fixtures |
| `browser-qa-report.mjs hash` | returns SHA-256 for artifact | None | hash command fixture and installed canary |
| `agent-task-packet-check.mjs` | write packet identity required | reviewer contract fixtures | missing `taskId`, missing/invalid `lineageId`, canonical hash |
| `execution-ledger.mjs` | v2 trace/event writer | v1 ledger and UAT tests | legacy read, v2 append, concurrent record, malformed pointer, current `/etrnl-execute` fail-closed |
| `cc-posttoolbatch-observer.sh` | structured Agent/Task recording | string agent/reviewer tests | task/packet/lineage extraction and legacy string preservation |
| `cc-stop-verifier.sh` | bound executor/reviewer evidence | string implementation/reviewer tests | wrong task, wrong hash, reviewer before executor, valid bound reviewers |
| `execution-ledger.mjs` phase commands | phase projections from events | single top-level phase/UAT | multiple phases, open UAT blocks, legacy top-level alias |
| `workflow-health.mjs` | scoped status/prune/doctor | global latest status, stale/UAT | `--cwd`, `--session`, `--project`, `--all`, unknown legacy scope, `prune --dry-run`, `doctor --json` |
| `project-buglog.mjs` | project suggestions | file-level suggest/redaction | project aggregation, no session in fingerprint, no home/raw cwd leaks, top-3 cap, debounce |
| `install.sh` / canary | source and installed proof | install and canary tests | installed helper stale checks for browser hash, trace validation, scoped workflow status |

### Eng Failure Modes Registry

| Failure mode | Test? | Error handling? | User-visible? | Severity |
| --- | --- | --- | --- | --- |
| Complete browser report cites a missing screenshot. | Missing today | Validator currently passes | Silent false proof | Critical |
| Concurrent subagent stops overwrite ledger evidence. | Missing today | No lock/append helper today | Silent lost review/agent record | Critical |
| Unrelated reviewer satisfies `/etrnl-execute`. | Missing today | String gate passes too broadly | Silent false completion | Critical |
| Workflow status shows another cwd/session. | Missing today | No real scoping today | Misleading SessionStart hint | High |
| Phase 2 overwrites Phase 1 UAT state. | Missing today | One mutable slot today | Silent lost UAT blocker | High |
| Project learning hint leaks home path or raw cwd. | Partial today | Redaction incomplete for cwd output | Privacy leak in startup context | High |
| Unknown workflow command returns status because `--json` short-circuits command dispatch. | Missing today | No explicit unknown-command failure | Confusing CLI behavior | Medium |

Critical gaps flagged: 3.

### Eng Performance Review

- `workflow-health.mjs` already caps ledger read concurrency to 12; keep that and add `--limit`/scope filters before expensive derived views.
- Browser screenshot hashing is local file IO; bound it to report validation and avoid scanning whole artifact trees during normal `summary`.
- Evidence trace queries should read current run pointers first and only scan all runs when `--all`, `history`, `doctor`, or `prune` is explicit.

### Eng NOT In Scope

- Hosted dashboard or remote trace backend: deferred; this pass is local-first.
- Full OpenTelemetry export: deferred, but the event contract should not prevent a later explicit export.
- Broad refactor of every over-300-line script: defer unless directly touched by the trace helper split.
- Automatic destructive ledger pruning: excluded; prune requires explicit command.

### Eng What Already Exists

- Hook event capture, Stop blocking, execution ledgers, browser QA report helpers, workflow-health summaries, project buglog, installer backups, rollback, update-check, and installed canary all exist and should be extended rather than replaced.

### Eng Parallelization

| Lane | Work | Depends on | Notes |
| --- | --- | --- | --- |
| A | Browser QA provenance | Phase 0 | Can start first. |
| B | Evidence trace, packet identity, reviewer binding, phase projections, workflow scoping | Phase 0 | Sequential core; same semantics. |
| C | Session learning hints | B project/cwd semantics | Can follow scoped workflow status. |
| D | Docs/install/canaries/release gates | A + B + C | Final integration. |

Launch A while designing B. Do not split B across worktrees until event identity, writer locking, and query semantics are fixed.

### Eng Completion Summary

- Step 0: Scope Challenge - scope accepted with architecture rewrite to one evidence trace contract.
- Architecture Review: 3 critical issues, 4 high issues.
- Code Quality Review: 4 issues found.
- Test Review: diagram produced, 10 required fixture groups identified.
- Performance Review: 3 bounded-read/hash recommendations.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 separate TODOs; critical deferred items folded into this plan.
- Failure modes: 3 critical gaps flagged.
- Independent review: engineering concerns folded into this plan.
- Parallelization: 4 lanes, 1 independent browser lane, 1 sequential core lane.
- Lake Score: 8/8 complete recommendations accepted into the plan.

## AUTOPLAN PHASE 3.5 DX REVIEW

Status: complete.
Mode: DX POLISH.
Product type: local Claude Code control-plane repo with hooks, scripts, skills, agents, install/update/rollback workflow, and local evidence artifacts.

### Developer Persona Card

| Field | Value |
| --- | --- |
| Persona | Solo or small-team AI builder using Claude Code daily. |
| Goal | Install deterministic local guardrails, prove they are working, and recover quickly if a hook blocks the wrong thing. |
| Stress | Does not want a personal `~/.claude` install broken by a partial install or unclear strict-mode behavior. |
| First success | Install into a sandbox Claude home, run doctor, see one meaningful workflow status or hook behavior, and know rollback works. |
| Trust trigger | Exact commands, expected output, source/installed gates, and a clear mode matrix. |

### Developer Empathy Narrative

I clone the repo because I want Claude to stop making sloppy completion claims. The first commands are short, but they touch `~/.claude`, so I need to know what will change, what tools I need, what success looks like, and how to undo it. If the first failure says only that something is missing, I slow down and start reading scripts. If the quickstart gives me a sandbox install, doctor output, one visible behavior, and rollback proof, I trust the system much faster.

### Competitive DX Benchmark

| Reference | Relevant benchmark | Plan response |
| --- | --- | --- |
| Claude Code hooks docs | Hooks have many lifecycle events, JSON input/output, exit-code behavior, async modes, and a read-only `/hooks` inspection menu. | Add mode matrix and expected hook evidence so users can inspect what installed and why. |
| OpenTelemetry GenAI conventions | Agent/GenAI systems are moving toward common trace/event/span vocabulary. | Keep the local trace contract export-friendly even while remote telemetry stays out of scope. |
| LangSmith observability | Competing DX promises quick instrumentation plus trace visibility for each call, step, and decision. | The local equivalent is a fast sandbox install plus a readable evidence trace/status command. |
| Current repo | Install, doctor, rollback, update-check, and canaries exist. | Strong base; missing first-run path and mode clarity. |

Sources checked: <https://code.claude.com/docs/en/hooks>, <https://opentelemetry.io/docs/specs/semconv/gen-ai/>, <https://info.langchain.com/AI-Observability>.

### DX Review Findings

Reviewer A findings:

- DX score 5.5/10.
- Happy path is 4-6 minutes, real first-time path is 12-20 minutes.
- No true hello-world path, installer preflight can happen too late, error actionability is uneven, and the plan assumes internal terms.
- Add a wrapper command, mode matrix, rollback dry-run/listing, and standardized error shape.

Reviewer B findings:

- DX score 6.5/10.
- Target TTHW is under 10 minutes for default install and under 20 minutes for strict install plus smoke/rollback.
- Install can mutate before all prerequisites are proven, strict/dev/default modes are not explicit enough, and the plan needs one identity contract first.
- Add copy-paste quickstart, preflight, mode matrix, configuration-by-task docs, and rollback walkthrough.

| Dimension | Reviewer A | Reviewer B | Consensus |
| --- | --- | --- | --- |
| Getting started < 5 min? | No, real path 12-20 min | No, target <= 10 min default | CONFIRMED gap |
| API/CLI naming guessable? | Partial; too many commands/envs | Partial; namespaces noisy | CONFIRMED gap |
| Error messages actionable? | Uneven | Uneven | CONFIRMED gap |
| Docs findable and complete? | Partial | Partial | CONFIRMED gap |
| Upgrade path safe? | Mostly, but rollback UX incomplete | Mostly asserted, not walked | CONFIRMED gap |
| Dev environment friction-free? | No true sandbox quickstart | Mode verification unclear | CONFIRMED gap |

### Developer Journey Map

| Stage | Current friction | Plan addition |
| --- | --- | --- |
| Discover | README says what it enforces but not first outcome. | Add quickstart promise: sandbox install, doctor, status, rollback. |
| Prerequisites | Missing tools surface during/after mutation. | Add preflight before any install mutation. |
| Install | `~/.claude` mutation feels risky. | Document sandbox `CLAUDE_HOME` path and backup location. |
| Verify | Doctor exists, expected outputs are scattered. | Add expected pass signals and mode matrix. |
| First behavior | No single hello-world workflow. | Add one `/etrnl-plan` or workflow-health smoke path. |
| Strict mode | Opt-in exists but fresh smoke is undefined. | Add strict isolated smoke gate. |
| Failure | Troubleshooting is list-based, not error-to-fix. | Standardize error shape and docs links. |
| Upgrade | Update exists, dirty checkout refusal is good. | Add failure recovery and backup selection walkthrough. |
| Rollback | Rollback exists, but no dry-run/listing. | Add plan item for listing/dry-run or documented latest-backup selection. |

### First-Time Developer Confusion Report

| Confusion | Severity | Resolution |
| --- | --- | --- |
| Does default install mutate my real Claude home? | High | Add sandbox quickstart and exact backup path. |
| Which mode am I in: dev, default, observer, strict, guard-disabled? | High | Add explicit mode matrix and doctor output. |
| What output proves success? | High | Add expected snippets for install, doctor, workflow-health, update-check. |
| What do I do when `jq`, `node`, `rg`, `fd`, or `sg` is missing? | Medium | Add preflight and error format with exact fix. |
| Is `uninstall.sh` an uninstall or a pointer to rollback? | Medium | Rename/expand or document as rollback guide. |

### Magical Moment Specification

Delivery vehicle: sandbox quickstart plus `workflow-health status --cwd "$PWD" --json`.

Requirement: in under 10 minutes, a new developer can install into a temporary Claude home, run doctor, produce scoped workflow status, and see exactly how rollback would restore the backup. This is the smallest local equivalent of observability competitors' "trace every step" pitch.

### DX Scorecard

| Dimension | Score | Prior | Trend |
| --- | --- | --- | --- |
| Getting Started | 6/10 | 5/10 | up with quickstart/preflight |
| API/CLI/SDK | 6/10 | 6/10 | flat until wrapper/config table |
| Error Messages | 6/10 | 5/10 | up with standard error shape |
| Documentation | 7/10 | 6/10 | up with mode matrix |
| Upgrade Path | 7/10 | 6/10 | up with rollback walkthrough |
| Dev Environment | 6/10 | 5/10 | up with sandbox install |
| Community | 4/10 | 4/10 | flat; not core to this local repo pass |
| DX Measurement | 5/10 | 4/10 | up with TTHW target and local trace status |

TTHW: current 12-20 minutes, target <= 10 minutes default install, <= 20 minutes strict smoke.
Competitive rank: Competitive for local deterministic enforcement, Needs Work for first-run clarity.
Magical moment: designed via sandbox install plus scoped workflow status.
Overall DX: 6/10 current, 7/10 if checklist items land.

### DX Implementation Checklist

- [ ] Time to hello world <= 10 minutes for default sandbox install.
- [ ] Installation preflight runs before mutating `~/.claude`.
- [ ] First run produces meaningful output with expected success snippets.
- [ ] Magical moment delivered via sandbox install plus scoped workflow status.
- [ ] Every error message has problem, cause, fix, and verification command.
- [ ] CLI naming is documented through a task-based command table.
- [ ] Environment variables are grouped by user task and public namespace.
- [ ] Docs have copy-paste examples that work in a temporary `CLAUDE_HOME`.
- [ ] Upgrade path documents dirty-checkout refusal and recovery.
- [ ] Rollback path documents backup selection and post-rollback doctor.
- [ ] Strict mode has an isolated smoke checklist.
- [ ] Changelog remains maintained and source/installed gates are separate.

### DX NOT In Scope

- Hosted docs search or community support channel: deferred; this is a local dev-control repo.
- Full wrapper CLI: recommended but can follow the evidence trace unless the current command list blocks adoption.
- Remote observability: excluded unless explicitly added as opt-in export later.

### DX Completion Summary

- DX overall: 6/10 current, 7/10 target after checklist.
- TTHW: 12-20 minutes current, <= 10 minutes default target.
- Reviewer A: 7 concerns.
- Reviewer B: 7 concerns.
- Consensus: 6/6 confirmed DX gaps.
- User challenges: none; DX improvements are mechanical plan additions.

### Cross-Phase Themes

1. Evidence needs identity. File hashes, reviewer calls, UAT artifacts, workflow status, and learning hints only matter when bound to the right session, task, cwd, packet, and artifact root.
2. `done` needs a stronger definition. Local implementation, source gates, installed-home gates, strict-mode smoke, and release/docs claims are different states.
3. The product story is drifting. The repo says small deterministic hook layer; the plan is becoming a local agent OS. The selected direction is still local-first, but the evidence trace should stay export-friendly.
4. First-run trust is now part of hardening. If a new developer cannot install into a sandbox, see one useful status, and roll back, the control plane feels risky even when the internals are strong.

### Decision Log

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Phase 0 | Use the active gstack review skills after the generated legacy skill path was missing. | Mechanical | Bias toward action | Active session skill roots have the required files; the generated path is stale in this environment. | Abort due stale generated path. |
| 2 | Phase 0 | Skip Design Review phase. | Mechanical | Explicit over clever | Plan has zero qualifying UI terms; no UI scope detected. | Run design review anyway. |
| 3 | Phase 0 | Run DX Review later. | Mechanical | Completeness | Plan is a developer tool and includes commands, agents, skills, install, docs, and workflow surfaces. | Treat as backend-only. |
| 4 | Strategy | Select SELECTIVE EXPANSION mode. | Mechanical | Completeness + pragmatism | Existing system enhancement with real optional strategic expansions. | Scope expansion or reduction as default. |
| 5 | Strategy | Treat plan-readiness failure as a blocking premise issue. | Mechanical | No silent fallback | The repo has an explicit plan checker and this plan fails it. | Proceed as if `Status: Final` were enough. |
| 6 | Strategy | Surface unified evidence trace contract as a scope decision, not an implicit rewrite. | User Challenge | User sovereignty | Independent reviewers recommend changing the stated phase structure; this should stay explicit. | Silently rewrite the plan framing. |
| 7 | Strategy | Recommend browser QA P0 remains in scope. | Mechanical | Completeness | Live probe proves missing screenshots pass. | Defer browser QA provenance. |
| 8 | Strategy | Treat dev-context correction as premise gate approval to continue. | Mechanical | Bias toward action | The execution context allows implementation to proceed while release proof remains gated. | Pause again for the same premise gate. |
| 9 | Engineering | Select one local evidence trace contract as the Phase 2 architecture and keep original phases as delivery slices. | Mechanical | Explicit over clever | Strategy, engineering, and DX reviews all found the same identity problem across phases 2-5. | Add separate state models for lineage, phases, workflow, and hints. |
| 10 | Eng | Make missing v2 evidence fail closed for current `/etrnl-execute`. | Mechanical | No silent fallback | String evidence can be unrelated; current execution needs bound task and packet evidence. | Treat missing v2 evidence as upgrade hint. |
| 11 | Eng | Require `screenshotSha256` for complete v2 browser QA reports. | Mechanical | Evidence first | File existence alone proves little; route/viewport/target-bound hash prevents fake or stale screenshots. | Keep screenshot hash optional for complete reports. |
| 12 | Eng | Add atomic locked event writing before relying on concurrent agent/reviewer evidence. | Mechanical | Correctness before breadth | Direct read-modify-write JSON can lose concurrent subagent records. | Add record-agent/review on top of unlocked writes. |
| 13 | DX | Add sandbox quickstart, install preflight, mode matrix, and rollback walkthrough to the hardening scope. | Mechanical | Reduce first-run friction | New developers need proof before mutating their real Claude home. | Keep docs as terse command lists. |
| 14 | DX | Defer hosted/community DX and remote observability while keeping the local trace export-friendly. | Taste | Local-first boundary | Competitive systems trace steps, but this repo's current promise is private local enforcement. | Add remote telemetry or hosted dashboard now. |

## Plan Review Report

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| Strategy Review | `/autoplan` | Scope and strategy | 2 reviewers | issues_open | Evidence gaps are real; phases 2-5 reframed as one local evidence trace contract. |
| Independent Review | review pass | Independent second opinion | 4 reviewers | issues_open | Strategy, engineering, and DX reviews agree on identity, proof, and first-run trust gaps. |
| Engineering Review | `/plan-eng-review` via `/autoplan` | Architecture and tests | 2 reviewers | issues_open | 10 fixture groups, 3 critical failure modes, and a required trace writer/identity contract. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | skipped | No UI scope detected. |
| DX Review | `/plan-devex-review` via `/autoplan` | Developer experience gaps | 2 reviewers | issues_open | DX 6/10, TTHW 12-20 min current, sandbox quickstart/preflight/mode matrix needed. |

- CROSS-REVIEW: all non-design reviewers converged on the same core issue: evidence must be identity-bound before more gates are added.
- UNRESOLVED: 0 for dev execution; source and installed gates still decide release readiness.
- VERDICT: strategy, engineering, and DX reviews complete. Plan is dev-ready with the evidence trace framing; implementation is not release-complete until source, installed, strict smoke, docs, and changelog gates pass.
