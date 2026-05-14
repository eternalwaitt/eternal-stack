# Best-of-All-Worlds Control Plane Gap Closure Plan

Status: Final
Created: 2026-05-13
Timeline note: this was a rapid single-session completion plan; phase completion notes and the final verdict were updated on the same date as implementation evidence landed.
Owner: ETRNL control plane
Execution Mode: AI-first, file-backed, fail-closed
Goal: Upgrade ETRNL skills, hooks, agents, scripts, tests, docs, and installed-runtime gates with the strongest verified control-plane patterns while preserving deterministic enforcement.
Non-goals: No private sync, GBrain, telemetry upload, remote memory defaults, broad Claude permissions, plugin/MCP migrations, or live local migrations during install.
Evidence: `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/control-plane-coverage.md`, `docs/health-stack.md`, `docs/skills.md`, `scripts/*`, `hooks/*`, `skills/etrnl-*`, `templates/settings*.json`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, and research artifacts under `docs/research/`.

## Objective

Upgrade ETRNL skills, hooks, agents, scripts, tests, docs, and installed-runtime gates using the strongest code-level patterns found in GStack, GSD, and Superpowers.

Keep ETRNL's current strengths:

- deterministic hooks over advisory prose
- installed-home parity checks
- source and installed doctor gates
- no silent fallbacks
- public repo boundary with no private telemetry or credentials
- local artifacts over chat-only state

## Constraints

- Do not copy private sync, GBrain, telemetry upload, or remote memory defaults.
- Do not replace hard blockers with advisory warnings.
- Do not add broad Claude permissions, plugins, MCPs, or live migrations during install.
- Do not create new workflow concepts without a deterministic checker, smoke test, or doctor gate.
- Keep `AGENTS.md`, `CLAUDE.md`, `docs/skills.md`, `docs/health-stack.md`, `docs/control-plane-coverage.md`, and `CHANGELOG.md` aligned when surfaces change.
- If installed behavior changes, run install plus installed-home gates before completion.

## Source Evidence

- ETRNL: strict hooks, run ledgers, task packets, browser QA reports, installed doctor, update checks, changelog gates.
- GStack: browser automation, plan/status footer, timeline/logging, review dashboard, release/ship UX.
- GSD: phase plans, workstreams, UAT artifacts, context monitor, specialized agents.
- Superpowers: skill-trigger discipline, TDD/verification skills, subagent-driven review loops, skill-trigger tests.

## Autoplan Review Results

Blocking corrections applied to this plan:

1. Ledger and state changes must not be parallelized. `scripts/execution-ledger.mjs`, `hooks/lib/state.sh`, and `scripts/skill-contract-check.mjs` are serialized ownership surfaces.
2. Browser QA v2 must be report-schema work first. Do not couple it to ledger schema changes in the same phase.
3. Subagent reviewer enforcement requires state schema migration tests before Stop-hook enforcement is widened.
4. Skill-trigger evals are a quick win because `cc-userprompt-router.sh` already routes several prompts and `tests/test-hooks.sh` already has router assertions.
5. Phase/UAT is useful, but it is not the first implementation batch. It touches plan readiness, ledger state, workflow health, and execution semantics.

Current code facts:

- `workflow-health.mjs` currently prints summary lines and has no `status` subcommand.
- `browser-qa-report.mjs` currently supports schema v1 `create`, `validate`, and `summary`.
- `execution-ledger.mjs` already has local run state, required artifacts, task status, agent status, and completion checks.
- `project-buglog.mjs` already supports `record`, `suggest`, and `validate`, but `suggest` is text-only.
- `cc-userprompt-router.sh` already records requested `etrnl-*` skills and emits routing context.
- `cc-posttoolbatch-observer.sh` already records implementation agent calls.

## What already exists

- Strict hook enforcement, state files, execution ledgers, review logs, browser QA v1 reports, installed-home doctor checks, update metadata, and changelog gates.
- Repo-owned `etrnl-*` skills, default `etrnl-*` agents, public `AGENTS.md` guidance, Claude wrapper templates, and namespaced `rules/etrnl/*`.
- Research inputs and scorecards for GStack, GSD, Superpowers, and related control-plane competitors.

## NOT in scope

- Private account, transcript, memory, credential, sync, or telemetry migration.
- Blind install-time plugin, MCP, permission, or live-home destructive cleanup.
- Replacing fail-closed blockers with advisory-only documentation.

## File map

- `hooks/*`: deterministic runtime enforcement, routing, state capture, and completion blocking.
- `scripts/*`: ledger, browser QA, plan readiness, update/install/rollback, health, research, and contract helpers.
- `skills/etrnl-*` and `agents/etrnl-*`: user-facing workflow entrypoints and subagent roles.
- `docs/*`, `CHANGELOG.md`, and `templates/*`: shareable repo documentation, release record, and installed settings surfaces.
- `tests/*` and `hooks/fixtures/*`: hook, workflow, install, packet, and skill-trigger coverage.

## Task groups

- Status and artifact surfaces: workflow health, browser QA v2, context freshness, and install canaries.
- Execution control: task packets, ledgers, phase/UAT metadata, reviewer-gated subagents, and Stop-hook completion gates.
- Learning and routing: skill-trigger evals, local project bug hints, and startup context.
- Release surfaces: docs, changelog, install/update/rollback metadata, and contract tests.

## Phases

- Phase 0: baseline docs, changelog, contracts, and quick-win ordering.
- Phase 1: workflow status JSON/text and SessionStart hints.
- Phase 2: phase/workstream/UAT ledger metadata.
- Phase 3: browser QA v2 matrix reports and screenshot hashes.
- Phase 4: skill-trigger eval harness.
- Phase 5: reviewer-gated subagent execution.
- Phase 6: local learning hints.
- Phase 7: install/update/rollback drift UX.
- Phase 8: documentation and contract sync.

## Skill/tool routing

- Use `etrnl-plan` for plan shape and readiness, `etrnl-autoplan` for the review gauntlet, `etrnl-execute` for implementation, `etrnl-review`/CodeRabbit for second-pass review, and `etrnl-qa-browser` for UI artifact evidence.
- Use `node scripts/plan-readiness-check.mjs`, `node scripts/skill-contract-check.mjs`, `node scripts/skill-behavior-smoke.mjs`, `./tests/test-hooks.sh`, `./tests/test-workflow-tools.sh`, and `./scripts/doctor.sh` as deterministic gates.

## Test plan

- Hook behavior: `./tests/test-hooks.sh`.
- Workflow scripts, browser QA, ledgers, install metadata, contracts, and planning checks: `./tests/test-workflow-tools.sh`.
- Installed behavior: `./tests/test-install.sh`, `./scripts/install.sh`, and `~/.claude/scripts/doctor-control-plane.sh` when install surfaces change.
- Whole repo health: `./scripts/doctor.sh` plus `rtk git diff --check`.

## Failure modes

- Ledger/state schema drift blocks valid completion; cover with migration fixtures, workflow-tool tests, and doctor checks.
- Browser QA accepts fake evidence; cover with required console/network summaries, screenshot hash validation, freshness checks, and post-upgrade canaries.
- Reviewer-gated execution blocks legitimate small work; cover with source-edit thresholds, packet fixtures, and explicit sequential-degraded fallback text.
- Install metadata misreports drift; cover with install tests and update-check JSON assertions.

## Parallelization strategy

- Parallelize independent docs/tests only after their owning code surface is stable.
- Do not parallelize `hooks/lib/state.sh`, `scripts/execution-ledger.mjs`, `scripts/skill-contract-check.mjs`, install/update/rollback scripts, or shared plan-readiness metadata.
- Use write-scoped task packets with `taskId`, `lineageId`, `packetHash`, `writeScope`, `forbiddenPaths`, and reviewer requirements for multi-file implementation lanes.

## Verification gates

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
./tests/test-install.sh
node scripts/skill-contract-check.mjs --root .
node scripts/skill-behavior-smoke.mjs --root .
node scripts/changelog-release-check.mjs
./scripts/doctor.sh
rtk git diff --check
```

## Rollback

- Source rollback: revert the specific commit or patch touching the failed surface.
- Installed-home rollback: run `~/.claude/scripts/rollback-local.sh <backup-dir>` from the most recent control-plane install backup.
- Runtime bypass only for emergencies: `CLAUDE_GUARD_DISABLED=1`, then restore source/install parity immediately after diagnosis.

## Execution handoff

- Execute sequentially in one session unless the user explicitly asks for parallel agents.
- For parallel execution, assign disjoint write scopes, preserve parent orchestration, require packet hashes, and record implementation plus spec/quality reviewer evidence before completion.

## Target Architecture

Add six repo-owned capability layers:

1. `workflow-status`: deterministic local status summary for current run, stale runs, artifact freshness, and next blocked action.
2. `phase-uat`: optional phase/workstream/UAT metadata in plans, ledgers, browser reports, and workflow health.
3. `browser-qa-v2`: stricter route x viewport browser evidence with console/network counts and tool provenance.
4. `skill-trigger-evals`: prompt-to-skill routing tests for `etrnl-*` workflows.
5. `local-learning-hints`: debounced local-only repeated-lesson hints backed by project buglog/state files.
6. `reviewer-gated-subagents`: write-mode multi-file execution requires implementation, spec review, and quality review evidence.

## Quick Win Batch

Run these first if continuing the stack incrementally:

1. `skill-trigger-evals` for existing router behavior.
2. `workflow-health status --json` with no schema changes.
3. `project-buglog suggest --json` with redaction and no hook behavior change.
4. Browser QA v2 validation for direct report files only.
5. Post-install canary for completed browser QA rejection.

Quick-win gate:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
node scripts/skill-behavior-smoke.mjs --root .
node scripts/changelog-release-check.mjs
./scripts/doctor.sh
```

## Phase 0: Baseline And Guardrails

Owner files:

- `docs/plans/2026-05-13-best-of-all-worlds-control-plane-gap-closure.md`
- `docs/control-plane-coverage.md`
- `docs/skills.md`
- `docs/health-stack.md`
- `CHANGELOG.md`

Tasks:

1. Record this plan as the canonical execution artifact.
2. Add a capability map section to `docs/control-plane-coverage.md` with the five target layers and their status.
3. Add helper/test expectations to `docs/health-stack.md`.
4. Add skill/helper descriptions to `docs/skills.md` as each layer lands.
5. Keep `CHANGELOG.md` under the latest release section; leave `Unreleased` empty unless a release process changes.

Acceptance:

- `node scripts/changelog-release-check.mjs`
- `./scripts/doctor.sh`

## Phase 1: Workflow Status Surface

Purpose:

Provide a local deterministic status surface equivalent to GStack's plan/status footer without remote telemetry.

Owner files:

- `scripts/workflow-health.mjs`
- `hooks/cc-sessionstart-restore.sh`
- `hooks/cc-postcompact-record.sh`
- `docs/skills.md`
- `docs/health-stack.md`
- `tests/test-workflow-tools.sh`
- `tests/test-hooks.sh`

Implementation:

1. Add `workflow-health.mjs status --json` output with:
   - active run id
   - unfinished tasks count
   - blocked tasks count
   - failed checks count
   - required artifacts missing
   - browser QA freshness
   - latest context save age
   - stale run count
   - next deterministic action
2. Add `workflow-health.mjs status` text output for hook/session hints.
3. Keep the existing default `workflow-health.mjs` summary output backward-compatible.
4. Update `cc-sessionstart-restore.sh` to include a short status block only when state exists or stale work is detected.
5. Update `cc-postcompact-record.sh` to record compact recovery state for the status surface.
6. Add tests for empty state, healthy state, stale run, missing artifact, and blocked run.

Output contract:

```json
{
  "schemaVersion": 1,
  "activeRunId": "run-default-123",
  "unfinishedTasks": 0,
  "blockedTasks": 0,
  "failedChecks": 0,
  "missingArtifacts": [],
  "browserQa": {"reports": 0, "latest": "none"},
  "contexts": {"saved": 0, "latest": "none", "stale": false},
  "staleRuns": 0,
  "nextAction": "none"
}
```

Acceptance:

- `node scripts/workflow-health.mjs status --json`
- `./tests/test-hooks.sh`
- `./tests/test-workflow-tools.sh`
- `./scripts/doctor.sh`

## Phase 2: Phase And UAT Artifacts

Purpose:

Adapt GSD's phase/workstream/UAT structure as optional ETRNL metadata without making every repo adopt GSD's process.

Owner files:

- `scripts/execution-ledger.mjs`
- `scripts/workflow-health.mjs`
- `scripts/plan-readiness-check.mjs`
- `skills/etrnl-autoplan/SKILL.md`
- `skills/etrnl-plan/SKILL.md`
- `skills/etrnl-execute/SKILL.md`
- `skills/etrnl-qa-browser/SKILL.md`
- `agents/etrnl-executor.md`
- `agents/etrnl-browser-qa.md`
- `tests/test-workflow-tools.sh`
- `hooks/fixtures/plans/good-plan.md`

Implementation:

1. Add optional ledger fields behind a version-preserving parser:
   - `phaseId`
   - `workstreamId`
   - `uatArtifact`
   - `uatOpenFindings`
   - `phaseStatus`
2. Add `execution-ledger.mjs set-phase` and `execution-ledger.mjs record-uat` commands.
3. Add plan-readiness recognition for optional `Phase`, `Workstream`, and `UAT Gate` sections.
4. Update `etrnl-autoplan` and `etrnl-plan` to include optional phase/UAT sections when a plan spans multiple sessions, routes, or workstreams.
5. Update `etrnl-execute` to block phase completion when `uatOpenFindings > 0`.
6. Update `workflow-health` to summarize UAT state.
7. Add fixtures for:
   - plan without phase metadata
   - plan with phase metadata
   - UAT open findings block
   - UAT closed findings pass
8. Preserve existing ledger v1 files. Missing phase fields must mean "not configured", not corrupt state.

Acceptance:

- `node scripts/plan-readiness-check.mjs hooks/fixtures/plans/good-plan.md`
- `node scripts/skill-contract-check.mjs --root .`
- `node scripts/skill-behavior-smoke.mjs --root .`
- `./tests/test-workflow-tools.sh`

## Phase 3: Browser QA v2

Purpose:

Move browser QA from "report exists" toward inspectable route/viewport/tool evidence while keeping completed reports fail-closed.

Owner files:

- `scripts/browser-qa-report.mjs`
- `skills/etrnl-qa-browser/SKILL.md`
- `skills/etrnl-execute/SKILL.md`
- `agents/etrnl-browser-qa.md`
- `docs/skills.md`
- `tests/test-workflow-tools.sh`

Schema additions:

- `schemaVersion: 2`
- `tool`
- `targetUrl`
- `matrix[]`
  - `route`
  - `viewport`
  - `status`
  - `screenshot`
  - `consoleErrors`
  - `failedRequests`
  - `accessibilityNotes`
  - `responsiveNotes`
- `provenance`
  - `command`
  - `startedAt`
  - `finishedAt`

Implementation:

1. Keep schema v1 validation working for existing artifacts.
2. Require schema v2 for new `--matrix` or `--target-url` reports.
3. Reject `status=complete` when:
   - no matrix rows exist
   - any matrix row is missing route or viewport
   - console/network summaries are unchecked
   - `consoleErrors` or `failedRequests` are non-numeric
4. Add `browser-qa-report.mjs migrate <file>` from v1 to v2 draft.
5. Update `etrnl-qa-browser` to require matrix evidence for UI work.
6. Update `etrnl-execute` artifact examples to prefer v2 reports. Do not change ledger schema in this phase.
7. Add installed smoke commands for unchecked fail, checked pass, v2 matrix pass, v2 matrix fail.

Acceptance:

- `node scripts/browser-qa-report.mjs create ... --status complete` rejects unchecked reports.
- `node scripts/browser-qa-report.mjs validate <v2-report>`
- `./tests/test-workflow-tools.sh`
- Installed smoke with `~/.claude/scripts/browser-qa-report.mjs`.

## Phase 4: Skill Trigger Eval Harness

Purpose:

Adapt Superpowers-style prompt-to-skill tests for ETRNL without depending on live Claude model behavior as the only proof.

Owner files:

- `tests/skill-triggering/`
- `scripts/skill-behavior-smoke.mjs`
- `hooks/cc-userprompt-router.sh`
- `hooks/lib/skill-hints.sh`
- `docs/health-stack.md`
- `docs/skills.md`

Implementation:

1. Add prompt fixtures for:
   - code health audit
   - browser QA
   - implementation plan
   - execute approved plan
   - commit
   - PR
   - dependency update
   - context save
   - context restore
   - review
2. Add deterministic router tests that feed prompts to `cc-userprompt-router.sh` and assert expected `etrnl-*` skill hint output.
3. Add negative fixtures proving ambiguous prompts do not over-route.
4. Add smoke coverage that confirms every `OWNED_SKILLS` entry has at least one trigger fixture or a documented reason.
5. Wire the harness into `tests/test-hooks.sh` or `tests/test-workflow-tools.sh`.
6. Keep this deterministic. Do not require live Claude output for this gate.

Fixture shape:

```json
{
  "name": "browser qa prompt routes etrnl-qa-browser",
  "prompt": "run browser QA on the changed routes",
  "expectedSkills": ["etrnl-qa-browser"],
  "unexpectedSkills": ["etrnl-execute"]
}
```

Acceptance:

- `./tests/test-hooks.sh`
- `node scripts/skill-behavior-smoke.mjs --root .`
- `./scripts/doctor.sh`

## Phase 5: Agent/Subagent Orchestration Hardening

Purpose:

Close remaining gaps between ETRNL subagent contracts and the stronger GStack/Superpowers review-loop patterns.

Owner files:

- `scripts/agent-task-packet-check.mjs`
- `scripts/execution-wave-check.mjs`
- `hooks/cc-pretooluse-guard.sh`
- `hooks/cc-posttoolbatch-observer.sh`
- `hooks/cc-stop-verifier.sh`
- `hooks/lib/state.sh`
- `skills/etrnl-execute/SKILL.md`
- `skills/etrnl-parallel/SKILL.md`
- `agents/etrnl-executor.md`
- `agents/etrnl-spec-reviewer.md`
- `agents/etrnl-quality-reviewer.md`
- `tests/test-hooks.sh`
- `tests/test-workflow-tools.sh`

Implementation:

1. Extend task packet schema with:
   - `reviewers`
   - `specReviewRequired`
   - `qualityReviewRequired`
   - `integrationOwner`
   - `expectedDiffShape`
2. Add a state schema migration for reviewer call buckets before hook logic consumes them.
3. Block write-mode packet dispatch when reviewer requirements are missing for multi-file tasks.
4. Record reviewer subagent calls separately from implementation subagent calls.
5. Update stop verifier to block multi-file completion when implementation happened but required review subagents did not run.
6. Add tests for:
   - implementation agent without review agents blocks
   - implementation plus spec and quality review passes
   - read-only scout/adversary calls do not satisfy implementation requirements
   - old state files upgrade without losing `agentCalls`

Acceptance:

- `./tests/test-hooks.sh`
- `./tests/test-workflow-tools.sh`
- `node scripts/skill-contract-check.mjs --root .`

## Phase 6: Local Learning Hints

Purpose:

Use local repeated-bug and workflow memory without copying GStack remote sync or private telemetry.

Owner files:

- `scripts/project-buglog.mjs`
- `hooks/cc-posttoolbatch-observer.sh`
- `hooks/cc-sessionstart-restore.sh`
- `hooks/lib/state.sh`
- `docs/configuration.md`
- `tests/test-hooks.sh`
- `tests/test-workflow-tools.sh`

Implementation:

1. Add `project-buglog.mjs suggest --json` with severity, fingerprint, lastSeen, and suggested guard.
2. Add debounce state so the same suggestion is not repeated in one session.
3. Surface only local project hints; never include raw transcript text.
4. Add env flag `CLAUDE_CONTROL_PLANE_LEARNING_HINTS=0`.
5. Add tests for redaction, debounce, disable flag, and stale hint suppression.
6. Do not include command history, raw prompts, raw transcript snippets, or secret-looking values in suggestions.

Acceptance:

- `./tests/test-hooks.sh`
- `./tests/test-workflow-tools.sh`
- credential scan in `./scripts/doctor.sh`

## Phase 7: Install, Update, Rollback, And Drift UX

Purpose:

Keep ETRNL ahead of competitors on portability and installed-runtime truth.

Owner files:

- `scripts/install.sh`
- `scripts/update-check.mjs`
- `scripts/update.sh`
- `scripts/rollback-local.sh`
- `scripts/post-upgrade-canary.sh`
- `scripts/doctor.sh`
- `docs/install.md`
- `docs/troubleshooting.md`
- `tests/test-install.sh`
- `tests/test-workflow-tools.sh`

Implementation:

1. Add an installed drift summary that reports:
   - source dirty state
   - installed commit
   - source commit
   - installed skill count
   - installed agent count
   - strict/default settings mode
   - stale installed scripts
2. Add `update-check.mjs --explain` for human-readable diagnosis and `--json` for automation.
3. Ensure rollback verifies:
   - skills restored
   - agents restored
   - hooks restored
   - settings still valid
4. Add a post-install canary for browser QA complete-report rejection.
5. Add installed drift checks only from local files. Do not call network or remote Git unless explicitly requested.

Acceptance:

- `./tests/test-install.sh`
- `node scripts/update-check.mjs --json`
- `./scripts/post-upgrade-canary.sh`
- `./scripts/doctor.sh`

## Phase 8: Documentation And Contract Sync

Purpose:

Make docs reflect enforcement, not hopes.

Owner files:

- `AGENTS.md`
- `templates/AGENTS.md`
- `templates/CLAUDE.md`
- `docs/control-plane-coverage.md`
- `docs/health-stack.md`
- `docs/skills.md`
- `docs/hooks.md`
- `docs/install.md`
- `CHANGELOG.md`
- `scripts/skill-contract-check.mjs`

Implementation:

1. Update docs only after code/tests exist.
2. Add skill-contract assertions for any new required helper, artifact, or gate.
3. Keep startup files under doctor line limits.
4. Keep Claude wrapper importing `AGENTS.md`.
5. Ensure docs name all new commands, scripts, and installed paths.

Acceptance:

- `node scripts/skill-contract-check.mjs --root .`
- `node scripts/changelog-release-check.mjs`
- `./scripts/doctor.sh`

## Execution Order

Run phases in this order:

1. Phase 4: Skill Trigger Eval Harness
2. Phase 1: Workflow Status Surface
3. Phase 3: Browser QA v2
4. Phase 6: Local Learning Hints
5. Phase 5: Agent/Subagent Orchestration Hardening
6. Phase 2: Phase And UAT Artifacts
7. Phase 7: Install/Update/Rollback UX
8. Phase 8: Documentation And Contract Sync

Reason:

- Skill-trigger tests are the cheapest confidence gain and use existing router behavior.
- Status and browser evidence improve reliability immediately.
- Learning hints can be added before subagent review gates if they stay local and read-only in hooks.
- Subagent review gates must land before larger phase/UAT execution semantics.
- Phase/UAT state is larger and should build on stable ledgers, status output, and review gates.
- Install/update changes should happen after new runtime surfaces stabilize.

## Parallelization

Allowed parallel-safe work:

- Phase 4 and Phase 1 after baseline.
- Phase 3 after Phase 1 if it does not touch ledger schema.
- Phase 6 after Phase 1 if it does not touch Stop verifier.
- Phase 8 only as documentation sync after code in each phase.

Do not parallelize:

- changes to `hooks/lib/state.sh`
- changes to `scripts/execution-ledger.mjs`
- changes to `scripts/skill-contract-check.mjs`
- install/update/rollback changes

## Required Task Packet Shape

For each implementation subagent:

```json
{
  "mode": "write",
  "taskId": "P1-status-json",
  "goal": "Add workflow-health status JSON output",
  "writeScope": ["scripts/workflow-health.mjs", "tests/test-workflow-tools.sh"],
  "forbidden": ["hooks/lib/state.sh", "scripts/install.sh"],
  "context": ["docs/plans/2026-05-13-best-of-all-worlds-control-plane-gap-closure.md"],
  "verification": ["./tests/test-workflow-tools.sh"],
  "reviewers": ["etrnl-spec-reviewer", "etrnl-quality-reviewer"],
  "noRevert": true
}
```

## Completion Gate

Run after each phase:

```bash
./tests/test-hooks.sh
./tests/test-workflow-tools.sh
node scripts/skill-contract-check.mjs --root .
node scripts/skill-behavior-smoke.mjs --root .
node scripts/changelog-release-check.mjs
./scripts/doctor.sh
```

Run after any installed behavior change:

```bash
./scripts/install.sh
~/.claude/scripts/doctor-control-plane.sh
node scripts/skill-contract-check.mjs --root . --installed
node ~/.claude/scripts/update-check.mjs --json
```

Completion requires:

- no failing gates
- no unchecked completed browser QA reports
- no missing skill docs
- no missing installed helpers
- no stale changelog entries under `Unreleased`
- no private identity, account, transcript, credential, or local memory content in tracked files

## Autoplan Decision Audit Trail

| # | Decision | Classification | Reason |
|---|----------|----------------|--------|
| 1 | Move skill-trigger evals before larger runtime work. | auto | Existing router tests make this the lowest-risk quick win. |
| 2 | Keep browser QA v2 separate from ledger schema changes. | auto | Prevents concurrent edits to `execution-ledger.mjs` and report schema logic. |
| 3 | Require state schema migration before reviewer-call stop gates. | auto | Stop verifier must not consume new buckets until legacy state upgrade is tested. |
| 4 | Keep Phase/UAT after status and subagent gates. | auto | Phase/UAT touches the broadest execution semantics and needs stable foundations. |

## Implementation Status

Completed on 2026-05-13:

- Phase 4 skill-trigger eval harness.
- Phase 1 workflow status JSON/text, SessionStart status hints, and compact recovery metadata.
- Phase 3 browser QA v2 report validation and migration.
- Phase 6 local learning hints with redaction, debounce, disable flag, and stale filtering.
- Phase 5 reviewer-gated subagent enforcement.
- Phase 2 optional phase/workstream/UAT ledger gates.
- Phase 7 install/update/rollback drift UX and post-upgrade canary.
- Phase 8 docs, changelog, skill, agent, and contract sync.

## Plan Readiness Report

- Scope Challenge: The plan reuses existing hooks, scripts, skills, tests, settings templates, research artifacts, and docs instead of creating a second control plane.
- Architecture Review: Changes remain file-backed and local-first, with deterministic hook/script gates and no blind live migrations.
- Code Quality Review: Shared state and ledger mutation surfaces are serialized; repeated contracts move into script checks where possible.
- Test Review: Coverage is anchored in hook fixtures, workflow-tool tests, install/rollback tests, skill smoke tests, and doctor.
- Performance Review: Workflow-health ledger reads are bounded and capped; startup hints are concise, debounced, and disabled by env when needed.
- Failure modes: Ledger drift, fake browser evidence, over-broad subagent gates, and install metadata drift each have explicit checks or rollback paths.
- Parallelization: Only disjoint file scopes can run in parallel; state, ledger, install, and contract surfaces stay sequential.
- Unresolved questions: none.

## Verdict

Completed on 2026-05-13.
