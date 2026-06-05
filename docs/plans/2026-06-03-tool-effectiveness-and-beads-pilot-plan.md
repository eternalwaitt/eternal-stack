<!-- /autoplan restore point: /Users/victorpenter/.gstack/projects/eternalwaitt-claude-control-plane/codex-control-plane-runtime-hardening-autoplan-restore-20260603-200101.md -->
# Tool Effectiveness And Beads Pilot Implementation Plan

Status: Final

Execution scope: all_phases
Deep stack artifacts: docs/plans/artifacts/2026-06-03-tool-effectiveness-and-beads-pilot/deep-stack-artifacts.json
Goal: Add automatic local evidence that shows whether CodeGraph, Beads, and stolen hook patterns reduce coding friction or add noise.
Non-goals: No remote telemetry, no private transcript upload, no replacement for ETRNL plans or execution ledgers, no default Beads rollout to every repo before pilot evidence, and no weakening of existing hook or doctor gates.
Evidence: AGENTS.md; docs/configuration.md; docs/control-plane-coverage.md; docs/guards.md; docs/health-stack.md; docs/research/2026-06-03-starred-agent-stack-map.md; docs/research/top10-lock.json; docs/research/capability-evidence.json; scripts/execution-ledger.mjs; scripts/workflow-health.mjs; scripts/doctor.sh; hooks/cc-posttoolbatch-observer.sh; hooks/lib/state.sh; skills/etrnl-dev-plan/SKILL.md; skills/etrnl-autoplan/SKILL.md; skills/etrnl-execute/SKILL.md; `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`; `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`.
Assumptions: Beads is a durable backlog and dependency ledger, not an execution ledger; GitHub issues are not currently used as task truth; all continuous projects are in scope for the Beads pilot through a local untracked project registry; CodeGraph is globally installed and repo-local indexes are initialized only for pilot repos; Codex and Claude usage must both be measurable; effectiveness data stays local, sanitized, advisory-only for the first week, and automated enough that Victor can revisit later without manual log reading.

## What already exists

- `cc-posttoolbatch-observer.sh` already observes successful and failed tool batches, recording reads, searches, edits, skills, agents, verification commands, browser checks, repeated edits, and review triggers into a per-session state file.
- `hooks/lib/state.sh` already provides a JSON session state schema, migration filter, file locking, and local metrics path support through `CLAUDE_GUARD_METRICS_PATH`.
- `scripts/execution-ledger.mjs` already stores run-scoped events, tasks, phases, agents, checks, artifacts, TDD evidence, simplifier evidence, specialist evidence, install proof, and completion audit rows.
- `scripts/workflow-health.mjs` already summarizes ledgers by cwd, session, project, stale status, missing artifacts, failed checks, browser-QA reports, contexts, review logs, and next action.
- `scripts/doctor.sh`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, and `node scripts/replay-hook-fixtures.mjs` already provide deterministic source gates for hooks and workflow tooling.
- `etrnl-dev-plan`, `etrnl-autoplan`, and `etrnl-execute` already define a complete plan-to-execution loop with readiness checks, execution ledgers, task packets, phase gates, review artifacts, and final verification.
- `docs/research/2026-06-03-starred-agent-stack-map.md` already classifies CodeGraph as the strongest local code graph MCP candidate and Beads as a durable work-state candidate.

Existing evidence flow:

```text
Claude/Codex tool calls
  |
  v
cc-posttoolbatch-observer.sh / Codex local session importer
  |
  +-- per-session guard state
  +-- execution ledgers and artifacts during etrnl-execute
  |
  v
workflow-health.mjs / doctor.sh
  |
  v
human-readable and JSON keep/drop signals
```

Target evidence flow:

```text
Tool usage and workflow outcomes
  |
  v
sanitized local effectiveness events
  |
  +-- session-level metrics
  +-- run-ledger metrics
  +-- weekly project summaries
  |
  v
tool-effectiveness.mjs
  |
  v
keep / enforce / repo-specific / remove-watch verdict
```

## NOT in scope

- No cloud analytics or cross-machine aggregation. This plan keeps data under local control-plane run and artifact directories.
- No tracked private project inventory. Public repo files may include templates and schemas only; local project names and paths live in ignored home-directory config.
- No automatic Beads rollout to dormant or one-off repos. The first implementation supports all continuous-work projects and produces evidence before expanding beyond that class.
- No Beads replacement for `docs/plans/**`, `execution-ledger.mjs`, or `workflow-health.mjs`.
- No forced CodeGraph use for every tiny file read. Enforcement is limited to non-trivial code edits and impact-oriented work.
- No adoption of Claude Context, claude-mem, Headroom proxy, AgentHandover, or smart-memory as default tools in this plan.
- No change to existing ETRNL execution semantics. `Execution scope: all_phases` remains the contract for approved plans.

## File map

- `.gitignore`: already updated to ignore `.codegraph/` so repo-local CodeGraph indexes do not pollute git status.
- `hooks/cc-posttoolbatch-observer.sh`: extend tool classification to record CodeGraph, Beads, and pattern-trigger events in sanitized local state.
- `hooks/lib/state.sh`: add state fields for `toolSignals`, `firstEditAt`, `firstEditGeneration`, `toolUseBeforeFirstEdit`, `toolNoise`, and effectiveness event counters.
- `scripts/tool-effectiveness.mjs`: new local aggregator that reads guard state snapshots, execution ledgers, optional artifact rows, and opt-in sanitized Codex session imports, then emits JSON and text weekly verdicts.
- `scripts/workflow-health.mjs`: add an optional effectiveness projection to `status --json` and `doctor --json` without changing existing fields; first-week live findings are advisory and never fail `doctor`.
- `scripts/execution-ledger.mjs`: add a narrow `record-tool-signal` command only if direct ledger persistence is cleaner than artifact-only aggregation.
- `scripts/doctor.sh`: add source gate coverage for the new effectiveness checker, fixtures, and docs.
- `tests/fixtures/tool-effectiveness/`: add representative session and ledger fixtures for CodeGraph useful use, CodeGraph missing-before-edit, Beads useful resume, Beads duplicate-task-state noise, and hook-pattern catch events.
- `tests/test-workflow-tools.sh`: validate `tool-effectiveness.mjs` JSON/text output and fixture verdicts.
- `tests/test-hooks.sh`: cover observer classification for MCP CodeGraph calls, Beads calls, and ignored unrelated MCP calls.
- `docs/health-stack.md`: document the effectiveness checker and its weekly review command.
- `docs/configuration.md`: document local-only paths, env vars, retention knobs, and privacy boundaries.
- `docs/skills.md`: document how the measurement layer fits `etrnl-dev-plan`, `etrnl-autoplan`, and `etrnl-execute`, and that Beads owns backlog/dependency state only.
- `templates/tool-effectiveness-projects.example.json`: tracked schema example for the local continuous-project registry, with synthetic aliases only.
- `docs/research/2026-06-03-starred-agent-stack-map.md`: append the pilot measurement criteria and Beads decision boundary, without changing existing evidence rows.
- `CHANGELOG.md`: record CodeGraph global install support, CodeGraph ignore hygiene, and planned effectiveness instrumentation.

## Task groups

### Group A - Measurement Contract And Fixtures

Owner: workflow tooling owner.
Dependencies: existing `workflow-health.mjs`, `execution-ledger.mjs`, `cc-posttoolbatch-observer.sh`, Codex RTK hook coverage, and research artifacts validated by `research-competitor-intel`.
Acceptance criteria: a versioned local-only effectiveness schema exists; fixtures cover useful, forgotten, noisy, neutral, insufficient-data, malformed, and privacy-rejected tool use; the schema records only sanitized tool names, timing classes, command classes, counts, repo path hash or cwd filter, and outcome signals; no prompt text, secret values, transcript text, private project names, local absolute repo paths, or full commands beyond existing sanitized command classes are required; a baseline snapshot command exists for comparison against pre-pilot behavior.
Verification: `node scripts/tool-effectiveness.mjs validate-fixtures`, `node scripts/tool-effectiveness.mjs baseline --since-days 7 --fixtures tests/fixtures/tool-effectiveness --json`, and `node scripts/tool-effectiveness.mjs summarize --fixtures tests/fixtures/tool-effectiveness --json`.

### Group B - Hook Observation Integration

Owner: hook integration owner.
Dependencies: Group A schema and existing state migration in `hooks/lib/state.sh`.
Acceptance criteria: post-tool observation records CodeGraph MCP usage, Beads CLI/MCP usage, RTK/search/read/edit order, review-trigger patterns, repeated edits, failed checks, and verification recovery without blocking normal tool use; Codex sessions are covered by an explicit local importer that extracts only tool names, timing buckets, edit/check classes, and project hash from allowed session files; failed observer writes warn but do not stop sessions; `.codegraph/` remains ignored.
Verification: `tests/test-hooks.sh` and `node scripts/replay-hook-fixtures.mjs`.

### Group C - Aggregator And Verdict Engine

Owner: workflow-health tooling owner.
Dependencies: Groups A and B.
Acceptance criteria: `scripts/tool-effectiveness.mjs` summarizes the last N days by repo and tool, computes adoption without prompting, before-first-edit usage, exploratory read/search pressure, repeated-edit deltas, failed-check recovery, noise rate, baseline deltas, and verdict; verdicts are deterministic and stable under fixture replay; every verdict includes the exact evidence counts that produced it.
Verification: `tests/test-workflow-tools.sh`, `node scripts/tool-effectiveness.mjs import-codex --fixtures tests/fixtures/tool-effectiveness/codex --dry-run --json`, and `node scripts/tool-effectiveness.mjs summarize --since-days 7 --cwd "$PWD" --json`.

### Group D - Workflow Health And Doctor Projection

Owner: control-plane health owner.
Dependencies: Group C.
Acceptance criteria: `workflow-health.mjs status --json` includes an optional `effectiveness` object when effectiveness data exists; `workflow-health.mjs doctor --json --all` reports malformed effectiveness events and stale pilot windows; `scripts/doctor.sh` runs the fixture validator and summary smoke without requiring live tool data.
Verification: `node scripts/workflow-health.mjs status --json`, `node scripts/workflow-health.mjs doctor --json --all`, and `scripts/doctor.sh`.

### Group E - Beads Pilot Boundary

Owner: product/workflow decision owner.
Dependencies: Group C verdict schema and a config-driven list of continuous-work projects.
Acceptance criteria: docs define Beads as durable backlog, dependency, claim, blocker, and discovered-follow-up state; docs explicitly prohibit Beads from replacing `etrnl-dev-plan`, `etrnl-autoplan`, `etrnl-execute`, execution ledgers, or any future external issue tracker; the first pilot includes all continuous-work projects through `~/.claude/control-plane/tool-effectiveness/projects.json`; the tracked template contains only synthetic project aliases and no Victor-specific paths; the list can be updated without code changes.
Verification: `node scripts/tool-effectiveness.mjs summarize --tool beads --since-days 7 --projects-config "$HOME/.claude/control-plane/tool-effectiveness/projects.json" --json` after pilot data exists; before pilot data exists, fixture replay proves useful and noisy Beads cases are classified separately.

### Group F - Documentation, Rollout, And Final Gate

Owner: final integration owner.
Dependencies: Groups A through E.
Acceptance criteria: docs explain what is measured, how weekly verdicts are generated, what thresholds mean, how to disable the feature, how to add continuous-work repos, how Codex and Claude evidence differ, and how to rollback; changelog records user-visible workflow changes; all source gates pass with zero warnings and zero errors.
Verification: `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, `node scripts/replay-hook-fixtures.mjs`, `node scripts/skill-contract-check.mjs`, `node scripts/plan-readiness-check.mjs docs/plans/2026-06-03-tool-effectiveness-and-beads-pilot-plan.md --allow-draft`, `scripts/doctor.sh`, and `git diff --check`.

## Phases

### Phase 0 - Confirm Pilot Scope

Configure the Beads pilot for all continuous-work projects through a local untracked registry. Record that Beads owns backlog-only state: durable tasks, dependencies, claims, blockers, and discovered follow-ups. It must not mirror an execution ledger or future GitHub issue tracker by default.

### Phase 1 - Schema And Fixtures

Create a minimal local schema and fixtures before touching hooks. Model five verdicts: `keep`, `enforce`, `repo-specific`, `remove-watch`, and `insufficient-data`. Add a baseline command before live collection starts.

### Phase 2 - Hook And State Instrumentation

Extend observer classification and state migration. Keep all hook writes best-effort and local. Do not block agent sessions if effectiveness recording fails.

### Phase 3 - Aggregator

Build `tool-effectiveness.mjs` with `validate-fixtures`, `baseline`, `import-codex`, `summarize`, and `doctor` commands. Support `--since-days`, `--cwd`, `--project`, `--projects-config`, `--tool`, `--json`, `--all`, and fixture input.

### Phase 4 - Workflow Health Integration

Add optional projections to `workflow-health.mjs` and `scripts/doctor.sh`. The absence of live effectiveness data is not a failure; live first-week verdicts are advisory-only; malformed fixture or schema data is a source-gate failure.

### Phase 5 - Beads Pilot Docs And Config

Document Beads as a backlog/dependency layer that feeds ETRNL planning, not as another plan or run ledger. Add local continuous-project pilot selection and adoption criteria.

### Phase 6 - Verification And Rollout

Run the full source gate, inspect the JSON summaries, and write a one-week revisit command that produces the keep/drop report without manual log reading. The revisit command must work even when some tools have insufficient data, reporting `insufficient-data` rather than failing.

## Effectiveness Scoring Contract

Each tool verdict must be reproducible from a JSON summary. The text report is only a rendering of that JSON.

Metrics:

- `eligibleSessions`: sessions where the task class made the tool relevant, such as non-trivial code edits for CodeGraph or resumed/backlog-linked work for Beads.
- `autonomousUseRate`: eligible sessions where the tool was used before the first edit or before plan execution resumed, without Victor reminding the agent inside that session.
- `beforeFirstEditRate`: CodeGraph or code-context tool use before the first source edit.
- `explorationDelta`: median read/search/tool-call pressure versus the baseline or versus eligible sessions where the tool was not used.
- `reworkDelta`: repeated-edit and failed-check recovery delta versus baseline.
- `verificationRecoveryRate`: tool-use sessions that recovered a failed check or stale quality state.
- `usefulArtifactRate`: tool-use sessions that produced a downstream edit, check, plan update, decision, or durable artifact.
- `noiseRate`: tool-use sessions with no downstream edit, check, plan update, discovered follow-up, or useful artifact.
- `privacyRejectCount`: events rejected for raw prompts, secrets, private paths, transcript content, or private project names.

Verdicts:

- `keep`: at least 5 eligible sessions, score >= 70, `noiseRate <= 25%`, and no privacy rejects.
- `enforce`: `keep` criteria plus `autonomousUseRate < 60%`, meaning the tool adds value but agents do not remember it reliably.
- `repo-specific`: score >= 70 in at least one project class but below 70 globally, or fewer than 5 eligible global sessions with strong project-local evidence.
- `remove-watch`: score < 50, `noiseRate > 40%`, any unresolved privacy reject, or duplicated truth-state that conflicts with ETRNL ledgers.
- `insufficient-data`: fewer than 5 eligible sessions and no privacy or correctness failure.

Initial score formula:

```text
score =
  25 * autonomousUseRate
  + 20 * beforeFirstEditRate
  + 20 * explorationDelta
  + 15 * reworkDelta
  + 10 * verificationRecoveryRate
  + 10 * usefulArtifactRate
  - 30 * noiseRate
  - 100 * (privacyRejectCount > 0)
```

Beads-specific value is counted only when Beads provides durable state before planning, before a resumed task, or between ETRNL runs: dependencies, claims, blockers, backlog items, or discovered follow-ups. Beads use during an active ETRNL execution is noise if it merely duplicates the execution ledger.

CodeGraph-specific value is counted when it is used before source edits for impact discovery, symbol relationship lookup, cross-file navigation, or code-health investigation. Late use after manual `rg`/read exploration is not counted as autonomous value, though it may still be neutral.

## Skill/tool routing

- Use `etrnl-dev-plan` for this plan and readiness gate.
- Use `etrnl-autoplan` only if Victor asks for a deeper execution-ready expansion after answering pilot questions.
- Use `etrnl-execute` when Victor explicitly asks to implement the finalized plan.
- Use CodeGraph for implementation discovery after the next agent restart exposes the MCP tools, or use the `codegraph` CLI status when MCP is unavailable.
- Use `code-simplifier` during implementation review if available because the aggregator can easily become overbuilt.
- Use `finding-duplicate-functions` if effectiveness summarization duplicates workflow-health parsing.
- Use `brooks-audit` only if the final implementation touches broad workflow enforcement or public docs in a way that needs a second-pass health review.
- `eternal-best-practices` is not required unless the implementation expands into auth, tenant, money, i18n, Prisma, permissions, or soft-delete domains.

## Test plan

- Fixture validator: prove each useful/noisy/missing tool pattern classifies deterministically.
- Hook tests: replay single and batched tool events for CodeGraph MCP calls, Beads calls, read/search/edit order, repeated edits, and failed checks.
- Workflow tool tests: verify text and JSON summaries, filters, verdict thresholds, malformed event handling, and no-data behavior.
- Doctor: ensure the new checker participates in source health without requiring live pilot data.
- Privacy tests: reject fixture events containing secret-looking values, absolute private transcript paths, raw prompt text, or full tool result bodies.
- Regression tests: keep existing `workflow-health.mjs status --json` consumers stable by adding optional fields only.

## Test-first execution plan

Red: Add failing fixtures for:

- CodeGraph used before first edit with lower read/search pressure.
- CodeGraph missing before first non-trivial edit.
- CodeGraph used too late after manual exploration.
- Beads useful on resumed work with captured follow-up and dependency.
- Beads noisy when duplicating an already-active ETRNL execution ledger.
- Codex imported session with sanitized tool events and no prompt text.
- Local project registry with synthetic tracked template and private untracked real config.
- Pattern catch for repeated edits, failed check recovery, and review-trigger reduction.

Green: Implement schema, hook recording, and aggregator behavior until each fixture produces the expected verdict and `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, and `scripts/doctor.sh` pass.

## Failure modes

- Tool usage looks high but value is low: the verdict engine must distinguish useful before-first-edit usage from late or irrelevant calls.
- Beads duplicates ETRNL plan/execution state: docs and verdict thresholds classify duplicate task-state as noise.
- Hooks become noisy or slow: observer writes stay best-effort, fixture replay covers hook output, and doctor rejects malformed events.
- Codex evidence is unavailable or too raw: importer reports `insufficient-data` or rejects the event; it never ingests prompt text to make the metric look complete.
- Effectiveness data leaks private content: schema stores sanitized classes and counts, not prompt text, transcript text, secrets, or raw command output.
- Public repo accidentally tracks private pilot projects: fixture and doctor privacy tests reject Victor-specific names, home-directory paths, and transcript paths in tracked config.
- No live data exists after one week: weekly summary reports `insufficient-data` instead of pretending a tool is good or bad.
- CodeGraph index pollution across repos: `.codegraph/` stays ignored and repo-local indexes remain separate from global MCP config.

## Parallelization strategy

- Group A and Group C should be sequential because the aggregator depends on the schema.
- Group B can start after the fixture schema is stable.
- Group D can proceed after the aggregator has stable JSON output.
- Group E docs can run in parallel with Group C because Victor confirmed all continuous-work projects are in pilot scope and Beads is backlog-only.
- Group F is sequential final integration.
- No write-capable parallel wave should edit the same files: `scripts/workflow-health.mjs`, `scripts/execution-ledger.mjs`, `hooks/cc-posttoolbatch-observer.sh`, `hooks/lib/state.sh`, and `scripts/doctor.sh` are integration choke points.

## Verification gates

- `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`
- `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`
- `node scripts/plan-readiness-check.mjs docs/plans/2026-06-03-tool-effectiveness-and-beads-pilot-plan.md --allow-draft`
- `node scripts/tool-effectiveness.mjs validate-fixtures`
- `node scripts/tool-effectiveness.mjs baseline --since-days 7 --fixtures tests/fixtures/tool-effectiveness --json`
- `node scripts/tool-effectiveness.mjs import-codex --fixtures tests/fixtures/tool-effectiveness/codex --dry-run --json`
- `node scripts/tool-effectiveness.mjs summarize --fixtures tests/fixtures/tool-effectiveness --json`
- `tests/test-hooks.sh`
- `tests/test-workflow-tools.sh`
- `node scripts/replay-hook-fixtures.mjs`
- `node scripts/workflow-health.mjs status --json`
- `node scripts/workflow-health.mjs doctor --json --all`
- `node scripts/tool-effectiveness.mjs summarize --since-days 7 --all --json`
- `node scripts/tool-effectiveness.mjs summarize --since-days 7 --all --projects-config "$HOME/.claude/control-plane/tool-effectiveness/projects.json" --json`
- `scripts/doctor.sh`
- `git diff --check`

## Rollback

- Revert changes to `hooks/cc-posttoolbatch-observer.sh`, `hooks/lib/state.sh`, `scripts/tool-effectiveness.mjs`, `scripts/workflow-health.mjs`, `scripts/execution-ledger.mjs`, tests, and docs from this implementation.
- Remove effectiveness fixture directories if the feature is abandoned before rollout.
- Leave `.gitignore` ignoring `.codegraph/`; it is a safe repo hygiene rule for local CodeGraph indexes.
- Disable runtime collection through an environment variable such as `ETRNL_TOOL_EFFECTIVENESS_DISABLED=1` if hook recording causes unexpected runtime noise.
- Do not delete existing execution ledgers or guard state during rollback; only stop writing new effectiveness events.

## Execution handoff

Use `etrnl-execute` after Victor explicitly asks to implement this plan. The executor should start with Group A fixtures, then implement in dependency order. Multiple pilot repo installs for Beads belong in the rollout phase after source gates pass and should be driven from the local continuous-project config list.

## Autoplan Review Report

Mode: completeness 10/10, final answer defaults selected by Victor.

CEO review:

- Decision: keep the plan, but make the value question auditable rather than preference-based.
- Required correction applied: all continuous projects are in scope, but public tracked files cannot contain Victor's private project inventory. The plan now uses a local untracked registry plus a synthetic tracked template.
- Required correction applied: first-week verdicts are advisory only, while fixture/schema/privacy failures still fail source gates.

Engineering review:

- Decision: reuse the existing observer, state, execution-ledger, workflow-health, doctor, and fixture surfaces.
- Required correction applied: the aggregator now has explicit `baseline` and `import-codex` commands, because Claude hook events alone would not answer whether Codex actually benefits.
- Required correction applied: verdicts now have deterministic thresholds and evidence counts instead of a vague weekly judgment.

DX review:

- Decision: the revisit path must be one command and JSON output, not manual log inspection.
- Required correction applied: the plan now requires a local project config, no-data behavior, advisory verdicts, and exact keep/enforce/repo-specific/remove-watch/insufficient-data meanings.
- Required correction applied: Beads is framed as backlog and dependency state that feeds ETRNL planning, not another work management layer the user has to remember.

Decision audit trail:

- Auto-decided with Victor's completeness instruction: include all continuous projects through local config, not a manually curated subset in tracked docs.
- Auto-decided with privacy rule: reject raw prompts, transcript text, private paths, and private project names in tracked fixtures/config.
- Auto-decided with no-manual-checking rule: add baseline, Codex import, workflow-health projection, doctor checks, and one-week summarize commands.
- Auto-decided with too-many-tools rule: no additional always-on MCPs beyond CodeGraph and no Beads enforcement until the first-week evidence supports it.

## Plan Readiness Report

- Scope Challenge: The plan reuses existing hooks, state, ledgers, workflow-health, doctor, research artifacts, and Codex RTK coverage instead of creating a new manual scorecard; Beads is scoped to backlog/dependency state so it does not compete with ETRNL execution.
- Architecture Review: Local-only sanitized events feed a deterministic aggregator and optional workflow-health projection; no remote telemetry, private transcript sync, or tracked private project inventory is introduced.
- Code Quality Review: The main risk is overbuilding a metrics subsystem, so the implementation starts with fixtures, small schema fields, one aggregator script, and a tracked synthetic project-registry template.
- Test Review: The plan includes red/green fixtures, hook replay, Codex import fixtures, workflow tool tests, privacy rejection, no-data behavior, baseline capture, and full doctor coverage.
- Performance Review: Hook work must remain constant-time classification plus best-effort writes; weekly aggregation can scan ledgers in bounded batches like `workflow-health.mjs`.
- Failure modes: Primary risks are duplicate Beads truth, irrelevant tool usage counted as value, malformed local events, raw Codex transcript ingestion, tracked private project inventory, and private-content leakage; each has a fixture or schema constraint.
- Parallelization: Schema and aggregator are sequential; Beads docs can parallelize after pilot scope is confirmed; final integration is sequential.
- Unresolved questions: research_flow: auto-generated; none. Victor confirmed no current GitHub issue usage, all continuous projects in scope, Beads backlog-only, and advisory-only first-week verdicts.
- Verdict: Ready for execution.

## Verdict

Ready for execution.
