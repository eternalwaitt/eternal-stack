<!-- /autoplan restore point: ~/.gstack/projects/eternalwaitt-claude-control-plane/main-autoplan-restore-20260511-213325.md -->
# ETRNL Superiority Implementation Plan (Single Executable Spec)

Status: Final
Owner: ETRNL Control Plane
Date lock: 2026-05-12
Quality bar: 10/10 completeness on every planning/implementation gate

Goal: Upgrade all owned etrnl-* skills, hooks, and agent contracts so ETRNL reliability is measurably enforced — with P0 skills at hook_enforced or test_enforced on TDD, research flow, planning depth, and verification gates — and release as M1 with parallel tracks A (enforcement backbone), B (P0 skill rewrites), and C (agent contracts).

Non-goals: Closed-source competitor reverse engineering; UI or frontend work; private identity or account details in repo; rebuilding research artifacts already validated in docs/research/; Wave 3.5 post-M1 deliverables (superiority benchmark harness, docs/troubleshooting.md, docs/skills.md contracts).

Evidence: docs/research/top10-lock.json (ok: manifest valid, 10 competitors), docs/research/capability-evidence.json (ok: evidence valid, 80 rows), docs/research/parity-scorecard.json (ok: scorecard valid, 17 entries), docs/research/etrnl-parity-backlog.md (6 P0/M1, 5 P1/M2, 6 P2/M3), hooks/cc-pretooluse-guard.sh:461 (agent packet enforcement via node scripts/agent-task-packet-check.mjs), tests/test-hooks.sh PASSED 100 checks, scripts/skill-behavior-smoke.mjs (untracked, partial), scripts/skill-contract-check.mjs (untracked, partial).

Assumptions: Research artifacts remain valid until 2026-06-10 (nextScan date). No other engineer is modifying hook files concurrently.

## What already exists

- `docs/research/top10-lock.json` — 10 competitors locked, validated ok (generated 2026-05-11T19:25:00Z)
- `docs/research/capability-evidence.json` — 80 rows non-README code-level evidence, validated ok
- `docs/research/parity-scorecard.json` — 17 ETRNL skills scored on 8 capabilities, validated ok
- `docs/research/capability-matrix.md` and `docs/research/etrnl-parity-backlog.md` — complete
- `scripts/research-competitor-intel.mjs` — validate-manifest/evidence/scorecard, extract, generate
- `scripts/lib/research-intel-core.mjs`, `scripts/skill-behavior-smoke.mjs`, `scripts/skill-contract-check.mjs` — untracked, partial
- `hooks/cc-pretooluse-guard.sh:461` — agent packet enforcement via `node scripts/agent-task-packet-check.mjs`
- `hooks/cc-posttooluse-sycophancy.sh`, `hooks/cc-stop-verifier.sh` — enforcement hooks
- `tests/test-hooks.sh` — 100 checks, all passing
- `skills/etrnl-plan/SKILL.md` — reference format for all skill rewrites

## NOT in scope

- Closed-source competitor reverse engineering (no code-level access)
- Rebuilding Wave 0 research artifacts (already validated complete)
- UI or frontend work
- Wave 3.5 post-M1: superiority benchmark harness, docs/troubleshooting.md, docs/skills.md contracts
- P1/P2 skill rewrites (etrnl-brainstorm, etrnl-fix-issue, etrnl-parallel, etrnl-qa-browser, etrnl-stress-test and P2 group) — deferred to M2

## File map

**Track A — Enforcement Backbone:**
- `hooks/cc-pretooluse-guard.sh` — modify: add self-serve recovery hint to block messages
- `tests/fixtures/guard-patterns/` — create: 20 valid + 20 invalid command pattern fixtures
- `tests/test-hooks.sh` — modify: add fixture tests for new guard patterns
- `scripts/install.sh` — modify: add post-install state verification
- `tests/test-install.sh` — modify: add install verification assertion
- `docs/health-stack.md` — modify: document validator additions (`replay-hook-fixtures`, `skill-contract-check`, `skill-behavior-smoke`) and doctor coverage

**Track B — P0 Skill Rewrites (read current, rewrite):**
- `skills/etrnl-autoplan/SKILL.md` — rewrite: add inputs/outputs, research_flow hook_enforced, planning_depth
- `skills/etrnl-code-health/SKILL.md` — rewrite: add tdd_enforcement hook_enforced
- `skills/etrnl-execute/SKILL.md` — rewrite: add verification_gates hardening
- `skills/etrnl-plan/SKILL.md` — rewrite: add research_flow hook_enforced, planning_depth
- `skills/etrnl-review/SKILL.md` — rewrite: add research_flow + tdd_enforcement hook_enforced
- `skills/etrnl-test/SKILL.md` — rewrite: add tdd_enforcement hook_enforced

**Track C — Agent Contract Hardening:**
- `scripts/agent-task-packet-check.mjs` — modify: add disjoint-ownership + no-revert policy validation
- `tests/fixtures/events/` — create: 5 valid + 5 invalid agent packet fixtures for C1/C2
- `tests/test-hooks.sh` — modify: add fixture tests for new packet validations

**Read-only (reference):**
- `docs/research/parity-scorecard.json` — read: gap analysis per skill
- `docs/research/etrnl-parity-backlog.md` — read: P0 priority ordering
- `skills/etrnl-plan/SKILL.md` — read: canonical format for skill rewrites

## Task groups

**Group 1 — Track A (sequential, no external deps):**
- A1: Add self-serve recovery hints to `hooks/cc-pretooluse-guard.sh`
- A2: Create `tests/fixtures/guard-patterns/` with 40 pattern fixtures
- A3: Add fixture tests to `tests/test-hooks.sh`
- A4: Add post-install verification to `scripts/install.sh`
- A5: Add install verification test to `tests/test-install.sh`

**Group 2 — Track B (parallel across skills, each independent):**
- B1: Rewrite `skills/etrnl-autoplan/SKILL.md`
- B2: Rewrite `skills/etrnl-code-health/SKILL.md`
- B3: Rewrite `skills/etrnl-execute/SKILL.md`
- B4: Rewrite `skills/etrnl-plan/SKILL.md`
- B5: Rewrite `skills/etrnl-review/SKILL.md`
- B6: Rewrite `skills/etrnl-test/SKILL.md`

**Group 3 — Track C (sequential within track):**
- C1: Add disjoint-ownership check to `scripts/agent-task-packet-check.mjs`
- C2: Add no-revert policy validation to `scripts/agent-task-packet-check.mjs`
- C3: Create agent packet fixtures in `tests/fixtures/events/`
- C4: Add packet fixture tests to `tests/test-hooks.sh`

Groups 1, 2, and 3 have no file overlap and can run as parallel waves.

## Phases

**Phase 1 — Enforcement Backbone (Track A):**
- A1 → A2 → A3: Guard hints + fixture tests
- A4 → A5: Install verification
- Gate: `bash tests/test-hooks.sh` returns `PASSED: ≥110 checks` (100 existing + new)

**Phase 2 — P0 Skill Rewrites (Track B, parallel across B1..B6):**
- Read current skill, identify gaps from parity-scorecard.json, rewrite to etrnl-plan format
- Each skill gets: Inputs/Outputs, deterministic steps, verification gate, failure/rollback, hook refs
- Gate: `node scripts/skill-contract-check.mjs` passes; `node scripts/skill-behavior-smoke.mjs` passes

**Phase 3 — Agent Contract Hardening (Track C):**
- C1 → C2 → C3 → C4: Packet validation upgrades + fixture tests
- Gate: hook tests 076-079 pass; new packet fixture tests pass

**Phase 4 — Final Gate:**
- All three research validators return `ok:`
- `bash tests/test-hooks.sh` PASSED (all checks including new)
- `node scripts/skill-contract-check.mjs` PASSED
- `docs/health-stack.md` explicitly lists the new validators and where they are enforced
- Manual audit: 5 block message types each include self-serve hint

## Skill/tool routing

- `etrnl-execute` — orchestrates this plan
- `etrnl-scout` — read-only discovery before any risky skill edits
- `etrnl-quality-reviewer` — post-implementation review of each Track B skill rewrite
- `code-simplifier` — run after Track B before final scoring (if installed)
- `finding-duplicate-functions` — run after Track C if deduplication opportunity detected (if installed)
- No domain companions required: no auth, billing, tenancy, Prisma, or i18n surfaces touched

## Test plan

- `bash tests/test-hooks.sh` — primary gate; must pass all existing 100 checks + new A3/C4 checks
- `node scripts/skill-contract-check.mjs` — contract surface for all 17 skills; Track B adds 6 more passing entries
- `node scripts/skill-behavior-smoke.mjs` — smoke tests; Track B skills must all emit `ok:`
- `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json` — must stay `ok:` throughout
- `bash tests/test-install.sh` — must pass including new A5 install verification check
- Manual: trigger each of the 5 main guard block types and confirm self-serve hint appears in output

## Failure modes

| Codepath | Failure | Coverage |
|---|---|---|
| Guard hint injection (A1) | Hint breaks existing block message format, hook test 009 fails | Caught by hook test suite immediately |
| Guard pattern fixtures (A2/A3) | False pattern added that blocks `rg` or `fd` | Caught by existing tests 012 (rg allowed) |
| Skill rewrite (B1-B6) | Rewrite accidentally removes required behavior, smoke test fails | Caught by `skill-behavior-smoke.mjs` |
| Packet disjoint-ownership (C1) | Over-strict check blocks valid read-only packets | Caught by hook test 078 (valid task packet allowed) |
| Install verification (A4/A5) | Verification checks wrong path, blocks CI on clean machines | Caught by `tests/test-install.sh` |

## Parallelization strategy

Three independent tracks with no file overlap:
- Track A owns: `hooks/cc-pretooluse-guard.sh`, `tests/fixtures/guard-patterns/`, `scripts/install.sh`, `tests/test-install.sh`
- Track B owns: `skills/etrnl-{autoplan,code-health,execute,plan,review,test}/SKILL.md` (each file owned by one task)
- Track C owns: `scripts/agent-task-packet-check.mjs`, `tests/fixtures/events/` (new files only)

Both A and C modify `tests/test-hooks.sh` — run those sub-tasks sequentially or merge at end. All other tasks are disjoint.

Sequential within each track due to dependencies (A1→A2→A3, C1→C2→C3→C4). B1..B6 are fully parallel.

## Verification gates

| Gate | Command | Expected |
|---|---|---|
| Research artifacts valid | `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json` | `ok: manifest valid (10 competitors)` |
| Hook suite | `bash tests/test-hooks.sh` | `PASSED: ≥110 checks` after A3 + C4 |
| Skill contracts | `node scripts/skill-contract-check.mjs` | all 17 skills pass |
| Skill smoke | `node scripts/skill-behavior-smoke.mjs` | all P0 skills emit `ok:` |
| Install verification | `bash tests/test-install.sh` | PASSED including new A5 check |
| Health-stack docs | `rg -n 'replay-hook-fixtures|skill-contract-check|skill-behavior-smoke' docs/health-stack.md` | each validator is documented |
| Manual block hint audit | trigger 5 guard block types | each includes modern-tool hint |

## Rollback

- Any single task: `git revert HEAD` on that commit; or `scripts/rollback-local.sh <file>`
- Full M1 rollback: restore from `~/.gstack/projects/eternalwaitt-claude-control-plane/main-autoplan-restore-20260511-213325.md`
- Verification after rollback: `bash tests/test-hooks.sh` must return `PASSED: 100 checks`
- Failure budget trigger: if hook false-positive rate > 10%, add escape hint first before narrowing pattern

## Execution handoff

Use `etrnl-execute` inline (this session). Phases 1, 2, and 3 run in parallel across tracks. Within each track, sub-tasks run sequentially per the dependency graph. Do not use `etrnl-parallel` unless the user explicitly requests agent fan-out across tracks.

## Plan Readiness Report

- Scope Challenge: Research Wave 0 artifacts are complete and validated — no rebuild needed. Smallest change set is 3 parallel tracks (A: 5 tasks, B: 6 tasks, C: 4 tasks). No distribution, data migration, or live-install scope beyond install.sh verification.
- Architecture Review: Enforcement via hooks (pretooluse guard) + scripts (agent-task-packet-check.mjs). Skill rewrites follow etrnl-plan canonical format. No new architectural surfaces. Rollback path is git revert per commit.
- Code Quality Review: All changes are targeted modifications to existing files. No new abstractions. Skill rewrites follow existing format. Guard hint injection is additive only. No cross-file duplication introduced.
- Test Review: Primary gates are hook tests (100 existing + new), skill-contract-check, skill-behavior-smoke, and install tests. All gates are deterministic CLI commands. No browser QA required.
- Performance Review: Guard hook runs on every tool use — hint injection adds one string append per block; negligible. Agent packet check adds two new validations (ownership, no-revert) — O(1) JSON field check each.
- Failure modes: Covered above. Critical gaps: none. Test-install false path on clean machines is the highest-risk; addressed by A5.
- Parallelization: Three disjoint tracks. Only conflict: both A and C write to test-hooks.sh — serialize those sub-tasks or merge. All B tasks are fully parallel.
- Unresolved questions: `code-simplifier` and `finding-duplicate-functions` not confirmed installed — if unavailable, skip and note in completion report.
- Verdict: Ready for execution.
## Verdict

Ready for execution

## Summary

This is execution-ready. It is not a plan-to-plan document.

Core outcome requirements:
- Top-10 competitor code intelligence is complete, pinned, and reproducible.
- Every parity recommendation is evidence-backed by non-README sources.
- Every owned ETRNL skill has an explicit capability scorecard and upgrade path.
- No capability is marked "resolved" without deterministic enforcement and tests.

## Implementation Changes

### 1) Research System (Hard Gate Before Parity Rewrites)

Implement a deterministic research pipeline with 4 required stages:

1. Universe discovery + top-10 lock
- Build candidate pool from code-accessible workflow frameworks.
- Apply deterministic filters: maintained repo, workflow depth, hooks/agents presence, test surface, adoption signals.
- Freeze top-10 in `docs/research/top10-lock.json` with repo URL, commit SHA, license, analyzed paths, extraction timestamp.

2. Code-first extraction (no README-only claims)
- Parse implementation surfaces only: `SKILL.md`, hooks, commands/workflows, scripts, agents, tests.
- Extract capability signals for:
  - TDD enforcement
  - Planning depth
  - Research flow
  - Subagent orchestration
  - Parallelism safety
  - Verification gates
  - Rollback/guardrails
  - Telemetry/proactive behavior
- Reject any claim lacking at least one non-README citation (`file + line`).

3. Comparative capability mapping
- Build normalized matrix with:
  - what they do
  - what they do not do
  - enforcement strength
  - test strength
- Add enforcement-grade scoring for each capability:
  - `prompt_only`
  - `hook_enforced`
  - `test_enforced`
- Publish competitor strengths/weaknesses/tradeoffs.

4. Parity translation to ETRNL
- Map each capability to owning ETRNL surfaces:
  - `skills/etrnl-*`
  - hooks
  - agent contracts
  - helper scripts
- Generate ordered backlog for:
  - skill rewrites
  - hook upgrades
  - agent packet upgrades
  - deterministic tests
- Preserve behavioral adaptation strategy (no direct text copying from competitors).

### 2) Public Interfaces / Contracts

Add JSON schemas + docs contracts:

- `competitor-manifest.schema.json`
  - `id`, `repoUrl`, `commitSha`, `license`, `analyzedPaths`, `collectedAt`

- `capability-evidence.schema.json`
  - `competitorId`, `capability`, `status` (`present|partial|absent`), `enforcementLevel`, `evidence[]`

- `parity-scorecard.schema.json`
  - `etrnlSkill`, `capabilityScores`, `gaps`, `priority`, `targetMilestone`

Artifacts required under `docs/research/`:
- `top10-lock.json`
- `capability-matrix.md`
- `does-doesnt-by-competitor.md`
- `etrnl-parity-backlog.md`

### 3) Execution Waves (Actual Implementation)

Wave 0: Baseline and freeze
- Snapshot current ETRNL capability baseline across all owned skills.
- Freeze benchmark inputs from top-10 lockfile.

Wave 1: Enforcement backbone
- Upgrade shared hook/script enforcement surfaces first so capability improvements are guaranteed by runtime gates, not only skill prose.
- Normalize evidence and verification checks across planning, execution, and review flows.

Wave 2: Skill parity rewrites (all owned ETRNL skills)
- Rewrite all owned `etrnl-*` skills to match best-in-class behavior patterns from matrix.
- Each skill rewrite must include:
  - explicit inputs/outputs
  - deterministic execution flow
  - verification requirements
  - failure/rollback expectations
  - references to enforcing hooks/scripts

Wave 3: Agent contract hardening
- Upgrade agent task packet standards for read-only vs write-capable tasks.
- Enforce disjoint ownership, non-revert policy, and integration-ready outputs.

Wave 4: Superiority benchmark harness
- Add benchmark suite that compares ETRNL workflow behavior against locked top-10 references on representative tasks.
- Gate release on passing superiority thresholds across core capabilities.

Wave 5: Release gate and publish
- Run full doctor + hook + contract + scorecard + benchmark gates.
- Update docs/changelog and publish only with green deterministic evidence.

### 4) CEO Review Integrated Into Same Plan (No Separate Files)

CEO acceptance criteria are embedded here and apply to every wave:
- Product quality: ETRNL feels faster, clearer, safer, and more reliable than direct gstack usage.
- User confidence: no hidden fallbacks, explicit enforcement, explicit failure modes.
- Competitive confidence: every major competitor has explicit does/doesn’t evidence and mapped response.
- Operational confidence: parity backlog is dependency-ordered, test-backed, and executable end-to-end.

## Test Plan

### Deterministic research tests
- Manifest validator tests (schema + required fields).
- Evidence validator tests (hard fail on missing non-README citations).
- Extractor tests (capability detection from fixtures).
- Scorecard consistency tests (coverage across all owned ETRNL skills).

### Acceptance scenarios
- Top-10 lockfile is reproducible from pinned SHAs.
- Each competitor has explicit does/doesn’t rows.
- No parity recommendation is emitted without evidence mapping.
- Final backlog covers every owned skill and required hook/agent surfaces.

### Implementation quality gates
- Hook tests pass with zero regressions.
- Doctor/health scripts pass.
- Capability scorecards validate against schemas.
- Benchmark harness confirms superiority threshold before release.

## Assumptions and Defaults

- "Full market research" means top-10 code-level competitor inspection as primary benchmark.
- Closed-source competitors are allowed only in separate black-box appendix and excluded from core code-level scoring.
- Research is a hard gate: no skill parity rewrite starts until research artifacts validate.
- A capability cannot be marked complete without testable enforcement evidence.
- When tradeoffs arise and no explicit override is provided, choose maximum completeness and enforcement (10/10 default).

## Immediate Execution Checklist (First Pass)

1. Add schemas and validators for manifest/evidence/scorecard.
2. Implement top-10 lock generator and deterministic filters.
3. Implement code-first extractor and citation enforcement.
4. Generate matrix + does/doesn’t outputs.
5. Generate ETRNL parity backlog mapped to all owned skills.
6. Start Wave 1 enforcement upgrades, then Wave 2 skill rewrites.

---

## Phase 1 — CEO Review (autoplan 2026-05-12)

### What Already Exists (Do Not Rebuild)

All Wave 0 / research artifacts are complete as of 2026-05-11T19:25:00Z:
- `docs/research/top10-lock.json` — 10 competitors locked, validated `ok: manifest valid (10 competitors)`
- `docs/research/capability-evidence.json` — 80 rows of non-README code-level evidence, validated `ok: evidence valid (80 rows)`
- `docs/research/parity-scorecard.json` — 17 ETRNL skills scored on 8 capabilities, validated `ok: scorecard valid (17 entries, 17 owned skills)`
- `docs/research/capability-matrix.md` — normalized matrix with enforcement grades
- `docs/research/etrnl-parity-backlog.md` — 17 skills: 6 P0/M1, 5 P1/M2, 6 P2/M3
- `scripts/research-competitor-intel.mjs` — validate-manifest, validate-evidence, validate-scorecard, extract, generate
- `scripts/lib/research-intel-core.mjs` — core extraction library
- `scripts/skill-behavior-smoke.mjs` — behavioral smoke tests (partial)
- `scripts/skill-contract-check.mjs` — contract checking (partial)
- `hooks/cc-pretooluse-guard.sh:461` — agent packet enforcement via `node scripts/agent-task-packet-check.mjs`

### Not In Scope

- Closed-source competitor reverse engineering
- New UI or frontend surfaces
- Private identity, account details, or secret values in repo

### Failure Modes Registry

| Failure | Detection | Recovery |
|---|---|---|
| Enforcement hook becomes annoying / blocks valid work | User reports false-positive rate > 10% | Add escape hatch or narrow pattern; do not remove gate |
| Skill rewrite degrades current behavior | Hook test regression or smoke test failure | Revert via `scripts/rollback-local.sh`, isolate diff |
| Research artifacts go stale | `nextScan` date passes (2026-06-10) | Re-run `node scripts/research-competitor-intel.mjs validate-manifest` |
| Benchmark harness produces false superiority signal | Manual spot-check fails | Audit evidence citations; require human review before release gate |

### Error / Rescue Registry

- Broken guard: `CLAUDE_GUARD_DISABLED=1` (repair hook, then remove)
- Hook regression: `bash tests/test-hooks.sh`
- Doctor fail: `bash scripts/doctor.sh`
- Research stale: `node scripts/research-competitor-intel.mjs validate-manifest`

### Dream State Delta

Current: ETRNL is a gstack wrapper with enforcement hooks. Users get guardrails but behavior quality across 17 skills varies from prompt_only to hook_enforced.

Target: ETRNL P0 skills (autoplan, code-health, execute, plan, review, test) are hook_enforced or test_enforced on all 8 capability dimensions. Bad agent decisions are caught before they land. Recovery paths are explicit. Users trust ETRNL over raw gstack for production repos.

### CEO DUAL VOICES — CONSENSUS TABLE

| Dimension | Primary Reviewer | Codex (gpt-5.5) | Consensus |
|---|---|---|---|
| Premise health | Research artifacts exist and validate; premise needs updating | Hard gate is wrong shape; rebuilding is wasted motion | **Stale premise — update to research-complete state** |
| Plan shape | Sequential waves too rigid; P0 should start immediately | 5-wave too serialized; enforcement/contracts/P0 can parallelize | **Flatten to parallel tracks by priority tier** |
| Organizing goal | "Superiority vs gstack" measurable but not user-outcome-oriented | Missing behavioral outcome metrics | **Keep competitive framing as backstop; add outcome metrics** |
| Execution readiness | Missing file map, task groups, phases, verification gates, rollback | No dependency graph, no owner lane, no threshold, no smaller slice | **Plan needs execution-layer detail before it can run** |
| Risk | Low — research done, enforcement backbone is clear | Failure budget and rollback criteria missing | **Add failure budget and rollback criteria** |
| Reframe | Restructure around P0 reliability release as M1 | Ship M1 "P0 reliability release" now | **Agreed: M1 = P0 reliability release; M2 = P1/P2 tracks** |

### Decision Audit Trail

- AUTO: Design review skipped — no UI/frontend scope
- AUTO: Research rebuild skipped — all Wave 0 artifacts validated complete
- AUTO: Sequential wave structure rejected — parallel P0/P1/P2 tracks preferred
- PENDING-USER: Premise gate — plan marked "Final" but requires restructure for execution (see Phase 4 approval gate)
- USER DECIDED (D1): Restructure to M1 P0 parallel tracks — research validation as input check, not prelude

---

## Phase 3 — Eng Review (autoplan 2026-05-12)

### Architecture Assessment

**Enforcement backbone (solid):**
- `hooks/cc-pretooluse-guard.sh:461` — calls `node scripts/agent-task-packet-check.mjs` for every agent task packet. Hook-enforced, not prompt-only.
- `hooks/cc-posttooluse-sycophancy.sh` — blocks reflexive agreement phrases. Hook-enforced.
- `hooks/cc-stop-verifier.sh` — completion verification. Hook-enforced.
- `scripts/research-competitor-intel.mjs` — validate-manifest, validate-evidence, validate-scorecard. Test-enforceable via `node scripts/research-competitor-intel.mjs validate-manifest`.

**Test coverage (partial gaps):**
- `tests/test-hooks.sh`, `tests/test-install.sh`, `tests/test-workflow-tools.sh` — exist and tracked
- `scripts/skill-behavior-smoke.mjs` — exists but untracked; covers partial skill surface
- `scripts/skill-contract-check.mjs` — exists but untracked; partial contract surface
- **Gap**: No CI integration or test runner that covers all 17 skill smoke tests
- **Gap**: No install/live-rollout verification confirming `~/.claude` state after `scripts/install.sh`

### P0 Technical Gaps (from parity-scorecard.json)

| Skill | Capability Gap | Current Level | Target Level |
|---|---|---|---|
| etrnl-autoplan | research_flow, planning_depth | prompt_only | hook_enforced |
| etrnl-code-health | tdd_enforcement | prompt_only | hook_enforced |
| etrnl-execute | verification_gates | prompt_only | test_enforced |
| etrnl-plan | research_flow, planning_depth | prompt_only | hook_enforced |
| etrnl-review | research_flow, tdd_enforcement | prompt_only | hook_enforced |
| etrnl-test | tdd_enforcement | prompt_only | test_enforced |

### Missing Technical Specs (Blockers for Execution)

1. **Dependency graph**: backlog item → exact file(s) → test(s). Currently the backlog lists skills but not file paths or enforcement targets.
2. **Owner lane split**: which parallel track owns which files. Required before running parallel agents to avoid file conflicts.
3. **Superiority threshold definition**: what score on what capability dimensions constitutes a passing Wave 4 benchmark gate. Currently undefined.
4. **Failure budget**: how many false positives per 100 hook invocations before a hook pattern is loosened. Without this, enforcement erodes silently.
5. **Rollout verification**: no test confirming `~/.claude` state is correct after `scripts/install.sh`.

### Pattern Matching Risk

`cc-pretooluse-guard.sh` blocks based on regex patterns. In this session, valid piped commands (`rg ... | head`) were blocked due to pipe detection. The false-positive rate will erode user trust if not addressed. Add a fixture-based test suite for the guard with at least 20 valid and 20 invalid command patterns.

### Eng Consensus (Primary + Codex)

| Dimension | Finding | Priority |
|---|---|---|
| Enforcement backbone | Solid, hook_enforced at key surfaces | — |
| Test gap: skill smoke | 17 skills need smoke test runner | P0 |
| Test gap: install verification | No ~/.claude state check | P1 |
| Missing: dependency graph | Blockers parallel execution | P0 |
| Missing: superiority threshold | Blocks Wave 4 release gate | P1 |
| Missing: failure budget | Enforcement erodes silently | P1 |
| Pattern matching false positives | Erodes trust; needs fixture tests | P0 |

---

## Phase 3.5 — DX Review (autoplan 2026-05-12)

### Developer Experience Assessment

**Invocation path (good):**
- Skills invoked via `/etrnl-*`, routed through CLAUDE.md `## Skill routing` section
- Consistent prefix across all 17 skills
- `scripts/install.sh` provides first-run setup path, tested by `tests/test-install.sh`

**Error message quality (mixed):**
- Guard blocks are explicit: legacy CLI blocks name the blocked command and the modern replacement
- Agent packet validation errors are verbose and actionable
- False-positive blocks (piped commands, chained commands) produce confusing errors with no self-serve fix guidance

**Documentation gaps:**
- `docs/skills.md` exists but does not enumerate input/output contracts for all 17 skills
- No "time to first success" onboarding path for a new developer joining the project
- No troubleshooting guide for common guard false-positives

**DX Recommendations:**

| Issue | Fix | Priority |
|---|---|---|
| No per-skill input/output contract | Add to `docs/skills.md` after Wave 2 rewrites | P1 |
| False-positive guard blocks | Add self-serve escape hint to block message | P0 |
| No onboarding smoke test | Add `scripts/onboarding-check.sh` or extend `doctor.sh` | P1 |
| No troubleshooting guide | Add `docs/troubleshooting.md` with top 5 guard errors | P2 |

---

## Pre-Gate Verification Checklist (autoplan 2026-05-12)

| Check | Command | Result |
|---|---|---|
| Manifest valid | `research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json` | ok: manifest valid (10 competitors) |
| Evidence valid | `research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json` | ok: evidence valid (80 rows) |
| Scorecard valid | `research-competitor-intel.mjs validate-scorecard --scorecard docs/research/parity-scorecard.json` | ok: scorecard valid (17 entries, 17 owned skills) |
| Hook tests | `bash tests/test-hooks.sh` | PASSED: 100 checks |

**Status: ALL GREEN — plan is execution-ready after restructure**

---

## Phase 4 — Final Approval Gate

**D2 decision**: Approve and execute M1 P0 now — all three tracks start immediately.

---

## M1 Execution Plan (Post-Approval)

Status: APPROVED 2026-05-12 | Execution model: parallel tracks A/B/C

### Outcome Metrics (Definition of Done)

| Metric | Target | Measurement |
|---|---|---|
| Hook false-positive rate | < 5% | Fixture suite: 0 valid-commands-blocked across 100+ fixtures |
| P0 skill smoke tests | 100% pass | `node scripts/skill-behavior-smoke.mjs` |
| Agent packet validation | 0 false blocks, 0 bypasses | Hook tests 076-079 pass |
| Research artifacts | Always valid | All three validators return `ok:` |
| Guard self-serve hints | All block messages include recovery hint | Manual audit of 5 block types |

### Failure Budget

| Trigger | Response |
|---|---|
| Hook false-positive rate > 10% | Add self-serve escape hint to block message; narrow pattern; do NOT remove gate |
| P0 skill rewrite breaks existing behavior | Revert via `scripts/rollback-local.sh`; isolate diff; fix in new commit |
| Agent packet check overly strict | Add explicit exemption with reasoning in `scripts/agent-task-packet-check.mjs` |
| Research artifacts go stale (after 2026-06-10) | Re-run validate-manifest; re-extract if any competitor SHA changed |

### Track A — Enforcement Backbone

Owner files: `hooks/cc-pretooluse-guard.sh`, `tests/test-hooks.sh`
Verification: `bash tests/test-hooks.sh` PASSED (currently 100/100)

| Task | File | Description |
|---|---|---|
| A1 | `hooks/cc-pretooluse-guard.sh` | Add self-serve recovery hint to every block message (what to use instead) |
| A2 | `tests/fixtures/guard-patterns/` | Add 20 valid + 20 invalid pipe/chain command fixtures |
| A3 | `tests/test-hooks.sh` | Add fixture tests for new patterns (A2) |
| A4 | `scripts/install.sh` | Add post-install state verification (checks ~/.claude hooks/skills are present) |
| A5 | `tests/test-install.sh` | Add test asserting install verification passes on clean state |

### Track B — P0 Skill Rewrites

Owner files: `skills/etrnl-{autoplan,code-health,execute,plan,review,test}/SKILL.md`
Verification: `node scripts/skill-contract-check.mjs` + `node scripts/skill-behavior-smoke.mjs`

Each rewrite must add (etrnl-plan format per `skills/etrnl-plan/SKILL.md`):
- Explicit Inputs / Outputs section
- Deterministic execution flow (numbered steps)
- Verification gate per phase
- Failure / rollback expectations
- Hook references (which hooks enforce which steps)
- research_flow → hook_enforced (etrnl-autoplan, etrnl-plan, etrnl-review)
- tdd_enforcement → hook_enforced (etrnl-code-health, etrnl-review, etrnl-test)

| Task | Skill | Key Gap |
|---|---|---|
| B1 | etrnl-autoplan | research_flow=0, planning_depth upgrade |
| B2 | etrnl-code-health | tdd_enforcement=0 |
| B3 | etrnl-execute | verification_gates hardening |
| B4 | etrnl-plan | research_flow=0, planning_depth upgrade |
| B5 | etrnl-review | research_flow=0, tdd_enforcement=0 |
| B6 | etrnl-test | tdd_enforcement=0 |

### Track C — Agent Contract Hardening

Owner files: `scripts/agent-task-packet-check.mjs`, `hooks/cc-pretooluse-guard.sh`
Verification: hook tests 076-079 pass

| Task | File | Description |
|---|---|---|
| C1 | `scripts/agent-task-packet-check.mjs` | Add disjoint-ownership check (write-capable packets must declare write scope, no overlap) |
| C2 | `scripts/agent-task-packet-check.mjs` | Add no-revert policy validation (noRevert must be true for write-capable tasks) |
| C3 | `tests/fixtures/events/` | Add 5 new valid + 5 new invalid agent packet fixtures covering C1/C2 |
| C4 | `tests/test-hooks.sh` | Add fixture tests for C3 |

### Dependency Graph

```
A1 → A2 → A3    (enforcement backbone, no external deps)
A4 → A5          (install verification, no external deps)
B1..B6           (skill rewrites, parallel, each independent)
C1 → C2 → C3 → C4  (agent contracts, sequential within track)

Wave 3.5 (post-M1):
D1 docs/skills.md contracts      (after B1..B6 complete)
D2 docs/troubleshooting.md       (after A1 complete)
D3 superiority benchmark harness (after B1..B6 + C4 complete)
```

### Rollback Path

- Any track: `git revert HEAD` or `scripts/rollback-local.sh` for single-file rollback
- Full M1 rollback: restore from `~/.gstack/projects/eternalwaitt-claude-control-plane/main-autoplan-restore-20260511-213325.md`
- Verification after rollback: `bash tests/test-hooks.sh` must return PASSED: 100 checks
