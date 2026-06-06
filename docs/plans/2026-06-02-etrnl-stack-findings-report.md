# ETRNL Planning Review Execution Stack Findings Report

Date: 2026-06-02

Scope: compare current ETRNL control-plane behavior against GSD, Superpowers, GStack, and installed companion skills, then identify the remaining work needed to make ETRNL top-level without implementing it yet.

Evidence base:

- Current ETRNL skills: `skills/etrnl-dev-plan/SKILL.md`, `skills/etrnl-dev-autoplan/SKILL.md`, `skills/etrnl-dev-review/SKILL.md`, `skills/etrnl-dev-execute/SKILL.md`, `skills/etrnl-dev-brainstorm/SKILL.md`.
- Current deterministic helpers: `scripts/plan-readiness-check.mjs`, `scripts/deep-stack-check.mjs`, `scripts/lib/deep-stack-artifacts.mjs`, `scripts/agent-task-packet-check.mjs`, `scripts/execution-ledger.mjs`, `scripts/execute-evidence-check.mjs`.
- Current live hook surfaces: `hooks/cc-pretooluse-guard.sh`, `hooks/cc-stop-verifier.sh`.
- Current tests and fixtures: `tests/test-workflow-tools.sh`, `tests/test-hooks.sh`, `tests/fixtures/deep-stack/**`, `hooks/fixtures/**`.
- Current docs: `docs/skills.md`, `docs/health-stack.md`, `docs/research/capability-matrix.md`, `docs/research/etrnl-parity-backlog.md`, `docs/plans/2026-06-01-etrnl-deep-stack-top-level-plan.md`.
- Sanitized local Superpowers source snapshot: `skills/brainstorming`, `skills/writing-plans`, `skills/subagent-driven-development`, `skills/test-driven-development`, `skills/executing-plans`, `skills/verification-before-completion`.
- Sanitized local GSD source snapshot: `get-shit-done/workflows/plan-phase.md`, `execute-phase.md`, `code-review.md`, `add-tests.md`, `references/agent-contracts.md`, `references/gates.md`.
- Installed GStack skill sources: `gstack/autoplan`, `gstack/plan-ceo-review`, `gstack/plan-eng-review`, `gstack/plan-design-review`, `gstack/plan-devex-review`, `gstack/review`.
- Installed companion skills located for routing: `code-simplifier`, `code-review-excellence`, `eternal-best-practices`, `finding-duplicate-functions`, `typescript-advanced-types`, and domain skills for auth, API, Next.js, React, Prisma, i18n, money, frontend, and backend work.

## 1. Current State

### `etrnl-dev-plan`

Current enforcement:

- File-backed planning is explicit: the skill requires creating a plan file, reviewing it, adding a readiness report, creating deep-stack artifacts, and rerunning readiness before finalization (`skills/etrnl-dev-plan/SKILL.md:13-40`).
- Required plan metadata is strong: `Execution scope`, `Goal`, `Non-goals`, `Evidence`, and `Deep stack artifacts` are declared in the plan header contract (`skills/etrnl-dev-plan/SKILL.md:42-65`).
- Required plan sections are broad enough for execution: reuse inventory, file map, task groups, test-first plan, failure modes, verification gates, rollback, handoff, readiness report, and verdict are all required by skill text (`skills/etrnl-dev-plan/SKILL.md:73-89`).
- The deterministic readiness gate checks status, execution scope, top metadata, required sections, vague placeholder terms, oversized final plans without an index, and deep-stack artifacts (`scripts/plan-readiness-check.mjs:93-224`).
- The deep-stack artifact validator fails final plans without an artifact unless an explicit transitional flag is passed (`scripts/lib/deep-stack-artifacts.mjs:114-151`).

Deterministic versus advisory:

- Deterministic: section presence, metadata presence, execution-scope format, placeholder scans, artifact existence, artifact schema, high/open findings in artifacts, reuse inventory shape, advanced TypeScript trigger shape, Tier 3 install/rollback fields (`scripts/plan-readiness-check.mjs:126-224`; `scripts/lib/deep-stack-artifacts.mjs:165-311`).
- Advisory/model-discipline: whether CEO/engineering/DX/adversarial reviews are genuinely high-quality, whether reuse search was complete, whether the plan's test-first steps are materially sufficient, and whether external companion skills were actually loaded versus merely listed.

### `etrnl-dev-autoplan`

Current enforcement:

- Autoplan declares completeness 10/10 by default and forbids MVP/partial plans unless explicitly requested (`skills/etrnl-dev-autoplan/SKILL.md:9-13`).
- It requires CEO, engineering, design, DX, adversarial, outside-voice, and specialist convergence passes before finalization (`skills/etrnl-dev-autoplan/SKILL.md:15-38`).
- It requires a Hybrid Deep Stack bundle with source manifest, skill matrix, reuse inventory, findings ledger, completion audit, and risk tier (`skills/etrnl-dev-autoplan/SKILL.md:40-61`).
- It defines a decision policy that auto-picks mechanical and bounded blast-radius decisions while reserving human gates for destructive, subjective, contradictory, or repeatedly stalled work (`skills/etrnl-dev-autoplan/SKILL.md:63-69`).
- It requires research artifacts for capability work and blocks finalization when research evidence is absent or expired unless risk is explicitly acknowledged (`skills/etrnl-dev-autoplan/SKILL.md:71-81`).

Deterministic versus advisory:

- Deterministic: final plan readiness can reject missing deep-stack artifacts and invalid artifact fields.
- Advisory/model-discipline: the "full review gauntlet" is encoded mostly as skill instructions and artifact fields, not as a transcript-free machine check that each phase produced an evidence row with reviewer identity, result, and disposition.

### `etrnl-dev-review`

Current enforcement:

- Review starts from distinct truth sources: request, plan, diff, installed surface, and verification evidence (`skills/etrnl-dev-review/SKILL.md:9-15`).
- It explicitly checks missing enforcement, install/update/rollback coverage, verification, documentation drift, and live-gated operation (`skills/etrnl-dev-review/SKILL.md:15-21`).
- It routes companion passes for domain-sensitive work, simplification, duplicate logic, Brooks health, and conditional advanced TypeScript work (`skills/etrnl-dev-review/SKILL.md:22-28`).
- It has a Hybrid Deep Stack contract: CEO, engineering, DX, adversarial, specialist, reuse, simplifier, convergence; no high/blocker findings open without Victor acceptance; completion audit; source-manifest sanitization (`skills/etrnl-dev-review/SKILL.md:41-50`).
- It states the TDD limitation directly: stop-hook evidence can prove completion-time evidence, but not red-before-green ordering (`skills/etrnl-dev-review/SKILL.md:62-72`).

Deterministic versus advisory:

- Deterministic: review-log validation exists, artifact validation can reject high/open findings when recorded, and stop hooks can require a second pass for broad/risky changes.
- Advisory/model-discipline: reviewers still judge red-before-green ordering and deep review quality from notes rather than a first-class red/green evidence artifact.

### `etrnl-dev-execute`

Current enforcement:

- Execution treats `Execution scope: all_phases` as a hard contract and forbids silently choosing a subset (`skills/etrnl-dev-execute/SKILL.md:10-12`, `skills/etrnl-dev-execute/SKILL.md:44-46`).
- Startup requires `plan-readiness-check.mjs` and deep-stack validation before editing when the plan references deep-stack artifacts (`skills/etrnl-dev-execute/SKILL.md:16-23`).
- Ledger use is explicit: init, task statuses, phase statuses, UAT, required artifacts, and check evidence are listed (`skills/etrnl-dev-execute/SKILL.md:23-29`).
- Parallel work is wave-based, with overlap checks and structured subagent packets required for write-capable parallel-safe waves (`skills/etrnl-dev-execute/SKILL.md:47-63`).
- TDD is required for source changes, including red evidence or a recorded reason when a test cannot be written first (`skills/etrnl-dev-execute/SKILL.md:95-100`).
- Completion requires simplification/dedupe/domain review, final preflight, required artifact validation, ledger stop check, and packet-bound write evidence for multi-source-file executions (`skills/etrnl-dev-execute/SKILL.md:194-209`).

Deterministic versus advisory:

- Deterministic: task packet shape, disjoint write scopes, reviewer requirements for parallel/deep-stack packets, ledger completion, reviewer ordering after implementation evidence, UAT closure, required artifacts, and fresh verification are checked (`scripts/agent-task-packet-check.mjs:149-370`; `scripts/execution-ledger.mjs:185-264`; `hooks/cc-stop-verifier.sh:291-590`).
- Advisory/model-discipline: red-before-green evidence, actual simplifier quality, actual domain-skill quality, and "all plan items mapped to diff evidence" are not yet first-class required ledger rows for every non-trivial execution.

### Installed and live gates

Installed/tested gates in source:

- `plan-readiness-check.mjs` rejects thin plans and missing deep-stack artifacts.
- `deep-stack-check.mjs` creates and validates deep-stack bundles (`scripts/deep-stack-check.mjs:93-130`).
- `agent-task-packet-check.mjs` validates structured read-only/write task packets and deep-stack fields (`scripts/agent-task-packet-check.mjs:149-370`).
- `execution-ledger.mjs` validates tasks, phases, checks, artifacts, UAT, and bound implementation/review evidence (`scripts/execution-ledger.mjs:111-264`, `scripts/execution-ledger.mjs:311-360`).
- `execute-evidence-check.mjs` catches source edits after `/etrnl-dev-execute` without bound `etrnl-executor`, `etrnl-spec-reviewer`, and `etrnl-quality-reviewer` evidence (`scripts/execute-evidence-check.mjs:43-118`).
- `cc-stop-verifier.sh` blocks completion claims without verification evidence, stale checks, missing tests, missing broad/risky review, incomplete ledgers, and several domain-specific conditions (`hooks/cc-stop-verifier.sh:291-590`).
- `cc-pretooluse-guard.sh` fails closed when `jq` is missing unless an explicit bypass is set, records degraded state init, and blocks risky behavior at PreToolUse time (`hooks/cc-pretooluse-guard.sh:68-83`).
- `tests/test-workflow-tools.sh` covers RTK rewriting, broad `.codex` scan blocking, ledger required artifacts, plan-phase requirements, bound write evidence, review ordering, UAT closure, deep-stack syntax, skill contract checks, skill behavior smoke, and research validation (`tests/test-workflow-tools.sh:45-158`, `tests/test-workflow-tools.sh:331-444`).

Live observation:

- A broad search over `.codex` was blocked by the PreToolUse guard during this audit. This confirms at least part of the unsafe-search guardrail is active in the current runtime.

Where the stack still depends on model discipline:

- Review phase execution quality.
- Red-before-green proof.
- Completion audit row generation and plan-item mapping.
- Whether all required companion skills were actually invoked or precisely dispositioned.
- Whether new helper creation has reuse evidence in every path, especially parent/direct edits.
- Whether `code-simplifier` ran after sequential direct edits where no subagent packet required `simplifierReviewRequired`.
- Whether advanced TypeScript review was triggered for public/exported contracts when the plan/artifact fails to name the trigger.

## 2. Comparison Matrix

| Capability | ETRNL current | GSD | Superpowers | GStack | Best target |
| --- | --- | --- | --- | --- | --- |
| Brainstorm quality | `etrnl-dev-brainstorm` requires spec before plan, but not a deep visual/product review by default | Roadmap/phase-driven, less conversational | Strong spec-first flow and approval handoff | Strong product/ambition posture through CEO review | Superpowers spec gate plus GStack CEO challenge plus ETRNL saved artifact |
| Plan quality | Strong required headings and deterministic readiness | Strong phase PLAN artifacts and checker loop | Extremely concrete bite-sized steps with code/test commands | Deep review gauntlet | ETRNL headings plus Superpowers concrete steps plus GStack/GSD review loops |
| Artifact requirements | Deep-stack bundle validates source, skills, reuse, findings, completion, risk | `.planning` artifacts, PLAN/SUMMARY/CONTEXT/REVIEWS | Plan/spec files and task checkboxes | Review logs/timeline/local state | ETRNL bundle as canonical source, with GSD-style contract rows |
| TDD discipline | Required in skill text; stop hook verifies tests after edits, not red order | TDD mode and task type support | Strongest explicit red-green rules | Review-driven, less deterministic | First-class red/green evidence ledger |
| Subagent execution | Structured packets and ledger-bound executor/reviewer evidence | Wave-based phase orchestration and exact agent types | Fresh subagent per task plus spec and quality review | Specialist reviews, less packet-bound | ETRNL packets plus GSD wave contracts plus Superpowers two-stage review |
| Reviewer agents | Repo-owned spec, quality, adversary, design, DX, scout, browser QA | Many role-specific agents and completion markers | Spec reviewer and code quality reviewer prompts | CEO/design/eng/DX reviews | ETRNL agent set with GSD-style evidence markers and artifact rows |
| Code simplification | Required in skill text and deep-stack phases | Not central | Quality review can catch complexity | Review can catch quality issues | Mandatory simplifier evidence for non-trivial source work |
| Reuse-before-create | Required by plan and deep-stack reuse inventory | Pattern mapper exists | Plan file structure asks to follow established patterns | Engineering review considers architecture/reuse | Reuse artifact required before new file/helper/script/docs surface |
| Adversarial review | Required in Hybrid contract | Auditor/checker roles exist | Final code reviewer exists | Strong plan/adversarial review posture | Separate adversarial finding rows with disposition |
| CEO/founder review | Required by autoplan/review text | Not central | Not central | Strongest | Keep GStack-derived CEO lane in ETRNL artifacts |
| Engineering review | Required | Plan checker/verifier | Spec/quality review | Strong plan-eng-review | Merge into mandatory review-phase artifact |
| DX review | Required when developer-facing | Config/docs workflows | Not central | Strongest DX review | Keep conditional DX artifact for CLI/API/docs/install work |
| Specialist/domain review | Skill matrix supports required/missing/blocker rows | Agent-specific | Not broad | Specialist review paths | Deterministic skill-matrix detector plus explicit not-applicable rows |
| Install/rollback safety | Tier 3 requires staged install and rollback fields | Worktree/drift/phase gates | Not central | Some guard/update behavior | ETRNL Tier 3 source -> staged -> live gate with rollback proof |
| Token efficiency | Prompt budget checker and large-plan index gate | Context window thinning | Bite-sized but verbose plans | Heavy preamble/reviews | Compact artifacts plus scripts, deep reviews loaded on demand |
| Operator simplicity | Simple `/etrnl-*` command surface | Many phase commands | Clear skill sequence | One autoplan command | One simple surface, deep internal artifact pipeline |
| Deterministic enforcement | Strongest current source validators among compared stacks | Strong workflow gates | Strong rules, weak machine enforcement | Strong review quality, weak deterministic enforcement | ETRNL should remain enforcement hub |
| Failure recovery | Ledger, blocker states, rollback docs | Gate taxonomy and checkpoints | Blocked statuses and re-dispatch | Review modes and questions | GSD gate taxonomy encoded into ETRNL ledger and artifacts |
| Completion audit | Artifact supports DONE/PARTIAL/NOT_DONE/CHANGED | SUMMARY and verifier | Plan checklist and verification | Review conclusions | Mandatory plan-item completion audit before done |

## 3. Gap Analysis

### P0 gaps

1. Red-before-green proof is still mostly advisory.
   - Evidence: ETRNL requires TDD in execution text (`skills/etrnl-dev-execute/SKILL.md:95-100`), and review explicitly says stop-hook evidence does not prove red-before-green ordering (`skills/etrnl-dev-review/SKILL.md:62-72`). Superpowers treats failing-first as an iron law (`test-driven-development/SKILL.md:31-45`) and requires watching RED fail (`test-driven-development/SKILL.md:113-129`).
   - Why it matters: agents can write source first, add a passing test later, and satisfy current completion evidence.
   - Failure permitted: false regression tests, tests that only validate already-working or mocked behavior.
   - Prevent with: a `tddEvidence` ledger/artifact row per source task, with red command, expected failure, green command, and optional impossible-to-test-first rationale.
   - Fix surface: script, ledger, hook, tests, skill text.

2. Simplifier and specialist passes are not uniformly ledger-bound for non-trivial direct edits.
   - Evidence: `etrnl-dev-execute` instructs simplifier/domain passes (`skills/etrnl-dev-execute/SKILL.md:198-208`), and deep-stack packet validation requires `simplifierReviewRequired` only when `deepStackExecution === true` (`scripts/agent-task-packet-check.mjs:323-356`). Stop hook only looks for broad second-pass review terms for risky changes, not simplifier/domain evidence (`hooks/cc-stop-verifier.sh:569-588`).
   - Why it matters: the stack can claim deep review while skipping final simplification or domain-specific review on direct/sequential edits.
   - Failure permitted: bloated code, duplicated helpers, missed domain risks in auth/money/i18n/API/type-boundary work.
   - Prevent with: ledger required artifacts and hook checker for `code-simplifier`, domain rows, and advanced TypeScript rows when triggers are present.
   - Fix surface: ledger, stop hook, `deep-stack-artifacts`, fixtures, skill text.

3. Plan-item completion audit is structurally validated but not generated or reconciled from diff/test evidence.
   - Evidence: `completionAudit` validates classifications and blocks high-impact partial/not-done items without Victor acceptance (`scripts/lib/deep-stack-artifacts.mjs:271-288`), but the validator does not compare plan items to actual diff/check evidence.
   - Why it matters: an agent can leave `completionAudit: []` or write weak rows and still satisfy schema.
   - Failure permitted: skipped plan items, "all phases" claims without evidence-by-item mapping.
   - Prevent with: a completion-audit generator/checker that extracts plan tasks and requires each to be DONE, CHANGED, accepted, or blocked with evidence.
   - Fix surface: new or extended script, ledger, tests, `etrnl-dev-execute`.

### P1 gaps

1. Deep review phase quality is not machine-auditable enough.
   - Evidence: artifact validation checks only `deepReview.status` and required phase names (`scripts/lib/deep-stack-artifacts.mjs:314-320`), while `etrnl-dev-autoplan` lists CEO/eng/DX/adversarial/specialist phases in prose (`skills/etrnl-dev-autoplan/SKILL.md:15-38`).
   - Why it matters: low/mid-intelligence agents can mark phases passed without producing review conclusions.
   - Failure permitted: shallow review gauntlets that look complete.
   - Prevent with: per-phase review records requiring reviewer role, inputs checked, findings count, open high count, and disposition.
   - Fix surface: artifact schema, tests, plan/autoplan/review text.

2. Reuse-before-create enforcement does not yet bind every new surface to searched paths and analogs.
   - Evidence: reuse inventory validates required fields and new-surface justifications inside the artifact (`scripts/lib/deep-stack-artifacts.mjs:225-249`), but task packets only require reuse fields indirectly through plan/artifact instructions.
   - Why it matters: helpers/scripts/docs can be created without proving existing components were searched.
   - Failure permitted: duplicated validators, overlapping hooks, docs drift.
   - Prevent with: packet validator fields for `createsNewSurface`, `reuseArtifact`, and `newSurfaceJustification`; stop-hook check against new source files after plan execution.
   - Fix surface: task packet checker, execute evidence checker, fixtures.

3. Advanced TypeScript trigger detection is artifact-driven, not source/diff-driven.
   - Evidence: advanced TypeScript policy validates rows if present (`scripts/lib/deep-stack-artifacts.mjs:324-343`), and `etrnl-dev-plan` names triggers (`skills/etrnl-dev-plan/SKILL.md:132-135`), but no source analyzer detects exported/public contracts from planned or changed files.
   - Why it matters: agents can set `not_applicable` incorrectly.
   - Failure permitted: public type/API/runtime-validation changes without type architecture review.
   - Prevent with: source/diff scanner for exported types, schemas, generated type paths, DTO/domain boundaries, state machines, discriminated unions, and branded IDs.
   - Fix surface: helper script, artifact validator, tests.

4. Source/staged/live install gates are Tier 3 artifact fields, but not a full install workflow proof.
   - Evidence: Tier 3 requires `stagedInstall.status === passed` and `rollbackVerification.status === passed` (`scripts/lib/deep-stack-artifacts.mjs:304-309`), while project docs require `tests/test-hooks.sh` and `scripts/doctor.sh` before health claims.
   - Why it matters: control-plane changes can pass source tests but drift in installed home.
   - Failure permitted: broken live hooks, stale installed scripts, missing rollback proof.
   - Prevent with: Tier 3 install artifact schema for source gate, staged install root, staged doctor/canary, live install decision, rollback rehearsal, and post-upgrade canary.
   - Fix surface: deep-stack artifact schema, install docs, doctor, tests.

### P2 gaps

1. Token strategy exists as checks, but artifacts need a stable compact digest convention.
   - Evidence: `plan-readiness-check.mjs` rejects very large final plans without `Execution Digest` or `Plan Index` (`scripts/plan-readiness-check.mjs:162-176`), and GSD thins prompts by context window while preserving core logic (`execute-phase.md:108-117`).
   - Why it matters: adding deeper review can bloat default context.
   - Failure permitted: oversized plans and prompts that reduce agent reliability.
   - Prevent with: standard `Execution Digest`, `Evidence Index`, and `Review Artifact Index` sections.
   - Fix surface: skills, docs, plan-readiness fixtures.

2. GSD-style gate taxonomy is not named consistently in ETRNL artifacts.
   - Evidence: GSD defines pre-flight, revision, escalation, and abort gates with behavior and recovery (`references/gates.md:7-70`). ETRNL has gate behavior but not the same typed taxonomy in plans/artifacts.
   - Why it matters: failure recovery is less explicit for low/mid-intelligence agents.
   - Failure permitted: retry loops without caps, human-gate confusion, continuing through abort conditions.
   - Prevent with: `gateType` and `failureBehavior` fields in verification/risk/completion artifacts.
   - Fix surface: plan template, artifact schema, docs.

3. Agent completion contracts are less explicit than GSD marker contracts.
   - Evidence: GSD documents agent markers and handoff fields (`references/agent-contracts.md:9-79`). ETRNL binds packet hashes and ledger rows but agent final-output marker expectations are mostly role prose.
   - Why it matters: task result parsing can degrade when agents return vague output.
   - Failure permitted: coordinator trusts ambiguous worker summaries.
   - Prevent with: ETRNL agent completion markers and required JSON/section summary schema.
   - Fix surface: agents, packet validator, ledger, tests.

## 4. Target Architecture

Command surface:

- `/etrnl-dev-brainstorm`: only for ambiguous ideas; outputs approved design/spec artifact.
- `/etrnl-dev-plan` and `/etrnl-dev-autoplan`: produce one final plan with `Execution scope: all_phases`, deep-stack artifact bundle, review records, reuse inventory, TDD plan, and gate taxonomy.
- `/etrnl-dev-execute`: executes every in-scope item; requires plan readiness, deep-stack artifact validation, ledger, TDD evidence, reviewer evidence, simplifier evidence, completion audit, and final preflight.
- `/etrnl-dev-review`: findings-first review of plans, diffs, runtime/install state, and completion claims.

Internal flow:

1. Evidence inventory: repo files, existing helpers, tests, docs, installed/live hooks when relevant, sanitized competitor/workflow snapshots.
2. Reuse inventory: searched paths, analogs, decisions, and new-surface justifications.
3. Deep planning: Superpowers-style concrete tasks and red/green commands, ETRNL plan shape, GSD gate taxonomy.
4. Review gauntlet: CEO, engineering, DX, design when relevant, adversarial, specialist/domain, simplifier, convergence.
5. Execution readiness: machine validation of plan headings, artifact schema, review phase records, source manifest, skill matrix, reuse, findings, risk tier.
6. Execution: risk-tiered only after deep review; wave-based subagents when safe; direct parent edits only with explicit degraded reason.
7. Completion: plan-item audit, TDD evidence audit, simplifier/domain/type review audit, verification, install/canary proof when Tier 3.

Mandatory TDD:

- Every source task must have `tddEvidence`.
- Valid states: `red_green_verified`, `not_test_first_possible_with_reason`, or `not_applicable`.
- `not_test_first_possible_with_reason` is allowed only for explicitly named categories such as generated code, pure config with no executable behavior, or docs-only work.

Subagent-driven implementation:

- Parallel-safe source waves use `etrnl-executor` with structured packets.
- Each write task gets post-implementation `etrnl-spec-reviewer` and `etrnl-quality-reviewer` records.
- The parent agent integrates, verifies, and resolves blockers; it does not duplicate subagent-owned work.

Reviewer convergence:

- Non-trivial work requires no open high/blocker review finding without explicit Victor acceptance.
- Review records must include input artifacts checked, role, status, findings count, open-high count, and disposition.

Advanced TypeScript:

- Always record normal TypeScript verification when TypeScript is present.
- Require advanced TypeScript review only for exported/public types, API contracts, runtime validation, generated schema types, state machines, discriminated unions, branded IDs, reusable type utilities, or DTO/domain boundaries.
- Detect the trigger from plan file maps and changed source files, not only from model-written artifact rows.

Control-plane install gates:

- Tier 3 requires source gate, staged install gate, staged doctor/canary, rollback rehearsal, explicit live install decision, live doctor/canary, and rollback path.
- No install side effects during planning.

Completion audit:

- Every plan task and requested outcome must be classified `DONE`, `CHANGED`, `PARTIAL`, `NOT_DONE`, or `BLOCKED`.
- `PARTIAL` and `NOT_DONE` with high impact block completion without explicit Victor acceptance.
- `CHANGED` requires the reason and replacement proof.

## 5. Token Strategy

Use compact artifacts:

- `deep-stack-artifacts.json`: source manifest, skill matrix, reuse inventory, review phase records, TDD evidence summary, findings, completion audit, risk tier.
- `execution-ledger.json`: task/phase/check/review/artifact evidence.
- `review-log.jsonl`: durable findings only.
- `browser-qa-report.json`: matrix evidence for UI/browser work.

Summarize:

- Long source snapshots into source IDs, versions, hashes, required files, and refresh commands.
- Review outputs into findings/dispositions and short rationale.
- Execution handoff into task packets and digest indexes.

Enforce by scripts:

- Required headings and placeholder scans.
- Deep-stack artifact schema.
- Review phase records.
- TDD evidence ordering.
- New-surface reuse evidence.
- Advanced TypeScript triggers.
- Completion audit reconciliation.
- Tier 3 install/rollback proof.

Optional only for trivial work:

- CEO/DX/adversarial/specialist review can be recorded `not_applicable` for docs-only/tiny Tier 0 work with a one-line reason.
- Subagents can be skipped for a single local task or overlapping sequential wave with explicit degraded reason.

Never skip for non-trivial work:

- Deep review.
- Reuse inventory.
- Test-first plan and TDD evidence.
- Spec and quality review for multi-file/source work.
- Simplifier pass.
- Completion audit.
- Final verification.

Avoid prompt bloat:

- Keep skill startup files short.
- Move rubrics to references.
- Use `Execution Digest` and `Plan Index`.
- Load external companion skills only when the skill matrix triggers them.
- Prefer machine-readable artifacts over copying long review text into plans.

## 6. Implementation Plan

Saved separately: `docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md`.

Execution scope: all_phases.

The plan orders phases by dependency:

1. Artifact schema and fixtures for review records, TDD evidence, completion reconciliation, reuse binding, TypeScript triggers, and Tier 3 install proof.
2. Script/checker updates.
3. Skill/agent contract updates.
4. Hook integration.
5. Docs/changelog/health updates.
6. Source validation and staged/live install proof when implementation is later approved.

## 7. Test Plan

Fixtures and negative controls required:

- Plan without deep artifacts: existing readiness negative stays required.
- Plan with incomplete deep artifacts: add missing review-phase rows, missing TDD evidence, missing install proof, and stale review record fixtures.
- Skipped TDD: source task with no `tddEvidence` must fail.
- Missing subagent packet: existing packet negative stays required; add deep-stack packet missing reuse/TDD/simplifier fields.
- Source change without reviewer: existing bound write evidence tests stay required.
- Source change without simplifier pass: new stop/ledger fixture must fail for non-trivial source work.
- New helper without reuse inventory: packet and artifact fixture must fail.
- TypeScript public contract without advanced type review: add source/diff-trigger fixture.
- Completion audit with partial/not-done work: existing high-impact fixture stays required; add generated audit reconciliation fixture.
- Stale or missing install/canary proof: existing Tier 3 missing install fixture stays required; add staged/live split fixture.

Minimum validation commands for the future implementation:

```bash
node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
node scripts/plan-readiness-check.mjs docs/plans/2026-06-02-etrnl-top-level-gap-closure-plan.md
tests/test-workflow-tools.sh
tests/test-hooks.sh
scripts/doctor.sh
git diff --check
```

## Conclusion

ETRNL is already the best deterministic base among the compared stacks. The current repo has real validators, live hooks, ledgers, packet contracts, research fixtures, and deep-stack artifacts. The remaining work is not to import more prose. It is to bind the most failure-prone deep-review promises to machine-checkable evidence: red/green TDD, actual review phase records, simplifier/domain evidence, reuse evidence for new surfaces, source/diff-driven TypeScript triggers, and plan-item completion reconciliation.
