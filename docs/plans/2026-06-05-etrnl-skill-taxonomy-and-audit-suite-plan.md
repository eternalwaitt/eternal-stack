# ETRNL Skill Taxonomy And Audit Suite Implementation Plan

Status: Final

Execution scope: all_phases
Goal: Rename and expand the ETRNL skill surface into a mechanically enforced taxonomy while turning the seven audit prompts into first-class improved audit skills where they are not already covered.
Non-goals: No live install into Claude or Codex homes during planning; no fallback command names or wrapper commands; no wholesale import of SkillsMP skills; no target-application audits or downstream app remediation.
Evidence: AGENTS.md; docs/skills.md; docs/research/2026-06-04-etrnl-skillsmp-comparison.md; scripts/lib/skill-lists.sh; hooks/lib/skill-hints.sh; hooks/cc-userprompt-router.sh; scripts/skill-contract-check.mjs; scripts/skill-behavior-smoke.mjs; scripts/prompt-budget-check.mjs; scripts/deep-audit-artifact-check.mjs; scripts/lib/deep-audit-categories.mjs; tests/fixtures/skill-triggering/cases.json; tests/test-hooks.sh; tests/test-install.sh; tests/test-workflow-tools.sh; current user request for `etrnl-audit-<audit-type>` and `etrnl-dev-plan`-style naming; current SkillsMP API search results from 2026-06-05; prior SkillsMP comparison report from 2026-06-04.
Deep stack artifacts: artifacts/2026-06-05-etrnl-skill-taxonomy-and-audit-suite/deep-stack-artifacts.json

## What already exists

- `docs/skills.md` documents a flat `etrnl-*` command list and states every repo-owned skill uses the `etrnl-` prefix.
- `scripts/lib/skill-lists.sh` is the authoritative owned-skill inventory for install, docs, smoke, and hook hint alignment.
- `scripts/skill-contract-check.mjs` already validates owned-skill drift, installed skill copies, helper references, prompt-budget-sensitive skill text, and core plan/execute contracts.
- `hooks/lib/skill-hints.sh` consumes `OWNED_SKILLS`, so a taxonomy change must update source-of-truth arrays instead of adding a second list.
- `tests/fixtures/skill-triggering/cases.json` and `scripts/skill-behavior-smoke.mjs` provide routing regression coverage for every owned skill.
- `scripts/install.sh`, `tests/test-install.sh`, and `scripts/doctor.sh` already prove source and installed Claude/Codex homes can be kept in sync.
- `etrnl-deep-audit`, `etrnl-production-readiness`, `etrnl-performance-audit`, and `etrnl-security-audit` already implement registered deep-audit categories.
- `etrnl-code-health`, `etrnl-documentation-health`, and `etrnl-qa-browser` cover related audit or QA workflows, but their names do not make family/category boundaries obvious.
- `docs/research/2026-06-04-etrnl-skillsmp-comparison.md` already concluded no wholesale SkillsMP import is warranted and lists useful candidate ideas by skill.

## NOT in scope

- No fallback command names, wrappers, or old-name routing. The migration is a clean rename once implemented.
- No model or effort frontmatter changes. Skill invocation must inherit the active context entitlement.
- No automatic commit, push, PR, merge, email send, live install, or external marketplace install.
- No large pasted third-party skill bodies. SkillsMP material is source evidence for concise rewritten references only.
- No conversion of every companion skill into repo-owned ETRNL. External/personal companions stay outside the repo-owned namespace unless Victor explicitly asks to vendor one.

## Naming Scheme

Use `etrnl-<family>-<capability>` for canonical repo-owned skills.

Families:

- `etrnl-dev-*`: development workflow skills that create, plan, execute, review, test, debug, PR, commit, or maintain source work.
- `etrnl-audit-*`: evidence-led audits, QA checks, and health categories. A single orchestrator is `etrnl-audit`; individual audit types are `etrnl-audit-<type>`.
- `etrnl-ops-*`: local operator/control-plane maintenance, context, install/update, disk, settings, and agent-file workflows.
- `etrnl-comm-*`: communication-quality workflows that are not normal software delivery, currently VIVAZ email reply quality.

Rules:

- Canonical names must include exactly one family after `etrnl`.
- Audit names must not end in `-audit` unless the family would otherwise be ambiguous. Prefer `etrnl-audit-performance`, not `etrnl-performance-audit`.
- Dev-flow names should read as commands: `etrnl-dev-plan`, `etrnl-dev-execute`, `etrnl-dev-review`, `etrnl-dev-test`.
- Old command names are removed from source, docs, router fixtures, and installed homes during the implementation. Tests must fail if an old repo-owned command remains available after the migration.

Proposed canonical mapping:

| Current skill | Canonical skill | Family | Notes |
| --- | --- | --- | --- |
| `etrnl-agent-files` | `etrnl-ops-agent-files` | ops | AI context and agent instruction maintenance. |
| `etrnl-autoplan` | `etrnl-dev-autoplan` | dev | Keep separate from manual plan until behavior can merge safely. |
| `etrnl-brainstorm` | `etrnl-dev-brainstorm` | dev | Spec/discovery before planning. |
| `etrnl-ci-cd` | `etrnl-dev-ci` | dev | CI/CD design and repair. |
| `etrnl-code-health` | `etrnl-audit-code` | audit | Whole-repo code health router. |
| `etrnl-commit` | `etrnl-dev-commit` | dev | Commit workflow. |
| `etrnl-context-restore` | `etrnl-ops-context-restore` | ops | Local workflow-state restore. |
| `etrnl-context-save` | `etrnl-ops-context-save` | ops | Local workflow-state save. |
| `etrnl-deep-audit` | `etrnl-audit` | audit | Thin audit orchestrator for registered categories. |
| `etrnl-deps` | `etrnl-dev-deps` | dev | Dependency maintenance and bot PR triage. |
| `etrnl-ops-disk-cleanup` | `etrnl-ops-disk-cleanup` | ops | Local disk cleanup. |
| `etrnl-documentation-health` | `etrnl-audit-docs` | audit | Documentation health category/specialist. |
| `etrnl-email-reply-quality` | `etrnl-comm-email-reply-quality` | comm | VIVAZ outgoing email quality. |
| `etrnl-execute` | `etrnl-dev-execute` | dev | Plan execution. |
| `etrnl-systematic-debugging` | `etrnl-dev-debug` | dev | Root-cause debugging. |
| `etrnl-parallel` | `etrnl-dev-parallel` | dev | Explicit parallel fanout helper. |
| `etrnl-performance-audit` | `etrnl-audit-performance` | audit | Registered performance category. |
| `etrnl-dev-plan` | `etrnl-dev-plan` | dev | File-backed plan writing. |
| `etrnl-production-readiness` | `etrnl-audit-production` | audit | Registered production-readiness category. |
| `etrnl-pr` | `etrnl-dev-pr` | dev | PR preparation/update. |
| `etrnl-qa-browser` | `etrnl-audit-browser` | audit | Browser QA evidence workflow. |
| `etrnl-dev-review` | `etrnl-dev-review` | dev | Review workflow. |
| `etrnl-security-audit` | `etrnl-audit-security` | audit | Registered security category. |
| `etrnl-stress-test` | `etrnl-dev-stress-test` | dev | Assumption/stress review; future load testing can become `etrnl-audit-load`. |
| `etrnl-test` | `etrnl-dev-test` | dev | Test/preflight workflow. |

New audit skills to add from the seven prompts:

| Audit prompt | Canonical skill | Source basis |
| --- | --- | --- |
| `01_CODE_EXCELLENCE.md` | `etrnl-audit-excellence` | User prompt plus `etrnl-audit-code`; keep this as a stricter excellence/category skill only if it differs materially from code health. |
| `02_UI_UX_PRODUCT_v6.md` | `etrnl-audit-ux` | User prompt plus SkillsMP `hiteshbandhu/ui-ux`, `nholder88/ui-ux-review`, and Anthropic `design-system` ideas. |
| `03_PRODUCTION_READINESS.md` | `etrnl-audit-production` | Rename existing category and fold in useful SRE PRR rows already partially covered by `prod-18-operability-prr`. |
| `04_PERFORMANCE.md` | `etrnl-audit-performance` | Rename existing category; keep route matrix, cold/warm timing, lane receipts, and baseline artifacts. |
| `05_SHARED_REUSE.md` | `etrnl-audit-reuse` | User prompt plus SkillsMP `reuse-first`; also wire reuse checks into `etrnl-dev-plan` and task packets. |
| `06_REPO_HYGIENE.md` | `etrnl-audit-repo` | User prompt plus existing `etrnl-audit-code` and `etrnl-audit-docs`; add repo/community/hygiene checks only where not duplicated. |
| `07_TOOLING_ECOSYSTEM.md` | `etrnl-audit-tooling` | User prompt plus SkillsMP `developer-experience-audit` and `dev-tooling-audit`; keep live version/release research mandatory. |

## File map

- `docs/plans/2026-06-05-etrnl-skill-taxonomy-and-audit-suite-plan.md`: this plan.
- `docs/plans/artifacts/2026-06-05-etrnl-skill-taxonomy-and-audit-suite/deep-stack-artifacts.json`: readiness artifact bundle for this plan.
- `docs/skills.md`: reorganize command docs by family, document canonical names, removed old names, and audit coverage semantics.
- `docs/health-stack.md`: add taxonomy, old-name-removal, and audit-suite validators to the required control-plane gates.
- `CHANGELOG.md`: record the clean taxonomy migration and new audit categories.
- `scripts/lib/skill-lists.sh`: replace the flat owned-skill list with canonical family skill arrays or a canonical map.
- `scripts/skill-contract-check.mjs`: validate canonical taxonomy, old-name removal, docs sync, registry sync, prompt budgets, and installed-home parity.
- `scripts/skill-behavior-smoke.mjs`: assert canonical trigger coverage and old-name non-routing.
- `hooks/lib/skill-hints.sh`: emit canonical names only.
- `hooks/cc-userprompt-router.sh`: route canonical names only and reject old repo-owned skill names with a clear canonical-name hint.
- `scripts/install.sh`: install canonical skills and command shims only, and remove repo-owned old command shims from managed install locations.
- `scripts/update-check.mjs` and `scripts/skill-update-prompt.mjs`: report canonical skill names only and flag old installed repo-owned names as drift.
- `scripts/lib/deep-audit-categories.mjs`: rename category skill names to canonical `etrnl-audit-*` names and add missing categories.
- `scripts/deep-audit-artifact-check.mjs`: validate canonical category ids and reject old category skill names.
- `tests/fixtures/skill-triggering/cases.json`: add canonical-name trigger fixtures and old-name rejection fixtures.
- `tests/fixtures/deep-audit/**`: update category skill names and add fixtures for UX, reuse, repo hygiene, tooling, and optional excellence.
- `tests/test-hooks.sh`, `tests/test-install.sh`, `tests/test-workflow-tools.sh`: update expected skill lists, old-name rejection/removal, registry validation, and install sync.
- `skills/etrnl-dev-plan/**`, `skills/etrnl-dev-execute/**`, `skills/etrnl-audit/**`, and other canonical skill directories: new canonical skill directories moved from existing skill bodies.
- Old `skills/etrnl-*` directories whose names are replaced by canonical family names: removed from the repo after their canonical replacement exists and tests cover the new name.
- `skills/etrnl-audit-ux/**`, `skills/etrnl-audit-reuse/**`, `skills/etrnl-audit-repo/**`, `skills/etrnl-audit-tooling/**`, and possibly `skills/etrnl-audit-excellence/**`: new improved audit categories built from the seven prompts plus vetted SkillsMP ideas.

## Task groups

### Group A - Taxonomy Contract

Owner: one integration owner.
Dependencies: current skill list, docs, router, install scripts, and smoke tests.
Acceptance criteria: canonical family names, old-name removal policy, and name validation are documented and machine-checkable; no skill can be added with an unclassified flat name and no old repo-owned command can remain after migration.
Verification: `node scripts/skill-contract-check.mjs` fails on a fixture or synthetic skill with a non-canonical name and passes on current canonical names.

### Group B - Clean Rename And Install Sync

Owner: install/update owner.
Dependencies: Group A taxonomy.
Acceptance criteria: canonical skill directories install into Claude and Codex homes; managed old slash command shims and old installed repo-owned skill directories are removed; rollback restores the previous managed backup without removing unrelated local files.
Verification: `tests/test-install.sh`, `scripts/doctor.sh`, and `node scripts/skill-contract-check.mjs --installed --claude-home /Users/victorpenter/.claude` plus the Codex-home equivalent.

### Group C - Dev Flow Rename

Owner: dev-workflow skill owner.
Dependencies: Groups A and B.
Acceptance criteria: plan, execute, review, test, debug, PR, commit, CI, deps, brainstorm, autoplan, parallel, and stress-test skills exist under `etrnl-dev-*`; old names do not route; references inside skill bodies and docs point to canonical names.
Verification: `node scripts/skill-behavior-smoke.mjs`, `node scripts/prompt-budget-check.mjs --owned-only`, and targeted trigger fixtures for `etrnl-dev-plan`, old `etrnl-plan` rejection, `etrnl-dev-execute`, and old `etrnl-execute` rejection.

### Group D - Audit Family Rename

Owner: audit registry owner.
Dependencies: Groups A and B.
Acceptance criteria: `etrnl-audit` is the orchestrator; registered categories use `etrnl-audit-<type>` skill names; existing production, performance, security, docs, code, and browser QA flows retain behavior under canonical names.
Verification: `node scripts/deep-audit-artifact-check.mjs validate-registry --root .`, `node scripts/deep-audit-artifact-check.mjs validate-fixtures`, and `tests/test-workflow-tools.sh`.

### Group E - New Audit Categories From Seven Prompts

Owner: audit category writers, split by category after registry shape is stable.
Dependencies: Group D and vetted source prompts.
Acceptance criteria: missing audit categories are created as compact skills with rewritten references, registered checks, applicability gates, no-sampling worklists, source-limited blockers, `CONFIRMED_CLEAN` rows, skipped-check reasons, and artifact fixtures.
Verification: each new category has at least one valid fixture, one expected-fail fixture, trigger coverage, prompt-budget pass, and registry validation.

### Group F - SkillsMP Scaffold Integration

Owner: research/reuse owner.
Dependencies: Groups D and E.
Acceptance criteria: useful SkillsMP ideas are cited in docs/research or category references as source evidence, rewritten into ETRNL directive language, and rejected ideas are recorded to prevent future wholesale imports.
Verification: `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json` when refreshed, or an explicit source-limited blocker if the evidence files are stale.

### Group G - Final Documentation And Gates

Owner: final integration owner.
Dependencies: Groups A through F.
Acceptance criteria: docs, changelog, tests, install surfaces, helper scripts, skill docs, and installed-home checks all agree on canonical names; no old repo-owned names remain in docs, router fixtures, source skill directories, or managed installed homes.
Verification: full gate list in `## Verification gates`.

## Task sizing and slices

- Slice 1: taxonomy validator and docs only. This touches docs plus `skill-contract-check.mjs` and should produce a failing/passing taxonomy check before any rename.
- Slice 2: clean rename and install removal. This touches `scripts/lib/skill-lists.sh`, install/update scripts, and install tests.
- Slice 3: dev-flow canonical directories and old-directory removal. Split into planning/execution, review/test/debug, and PR/commit/CI/deps sub-slices if more than 8 skill files change in one patch.
- Slice 4: audit-family canonical directories and deep-audit registry. Keep this separate from new category creation.
- Slice 5: new audit categories. Implement UX, reuse, repo, and tooling as independent category slices; treat excellence as a decision slice because it may duplicate code health.
- Slice 6: final docs, router fixtures, installed-home parity, and full verification.

## Phases

### Phase 0 - Baseline And Rename Decision

Confirm current dirty worktree state and isolate this migration from unrelated local changes. Read current source and installed skill lists. Decide whether `etrnl-audit-excellence` is a real category or an alias/mode inside `etrnl-audit-code`.

### Phase 1 - Taxonomy Enforcement

Add the canonical family contract, old-name removal policy, and taxonomy validation before moving files. The contract must reject unclassified new repo-owned skill names.

### Phase 2 - Clean Rename Infrastructure

Teach source lists, installer, update prompts, and smoke tests about canonical names and old-name removal. Old names must stop routing after the rename lands.

### Phase 3 - Rename Existing Skills

Move existing skill bodies into canonical directories in controlled batches. Update internal references to canonical names and delete the old repo-owned skill directories once tests cover the replacement.

### Phase 4 - Rename And Expand Audit Registry

Change deep-audit registry skill names to `etrnl-audit-*`, preserve category ids where possible, and update fixtures. Add missing registered categories in a separate category expansion wave.

### Phase 5 - Build Missing Audit Categories

Create `etrnl-audit-ux`, `etrnl-audit-reuse`, `etrnl-audit-repo`, and `etrnl-audit-tooling`. Create `etrnl-audit-excellence` only if its checks are not already better owned by `etrnl-audit-code`.

### Phase 6 - Documentation, Install Sync, And Release Hygiene

Update docs, changelog, health-stack docs, install tests, and doctor output. Run source gates, staged install gates, rollback verification, and installed-home parity checks.

## Skill/tool routing

- Use `etrnl-dev-plan` for file-backed planning.
- Use `etrnl-dev-execute` for plan execution.
- Use `etrnl-audit` for all registered audit categories.
- Use `etrnl-audit-<type>` for direct audit category invocation.
- Use `etrnl-ops-*` for local control-plane operations and context state.
- Use `etrnl-comm-*` for email or communication quality workflows.
- Use companion skills only when installed and relevant: `code-simplifier`, `finding-duplicate-functions`, `brooks-audit`, and domain skills.

## Test plan

- Taxonomy tests: invalid flat names fail; canonical names pass; old repo-owned names fail after migration.
- Router tests: canonical prompts route to the expected skill; old repo-owned names produce rejection/canonical-name hints and do not trigger skills.
- Install tests: canonical skill directories install into both Claude and Codex homes; managed old command shims and old managed skill directories are absent.
- Deep-audit tests: category registry validates canonical skill names, known unimplemented domains, category fixtures, and old category-name rejection.
- Prompt-budget tests: new canonical skill bodies and references stay under existing prompt budget limits.
- Docs tests: docs mention canonical names, removed old names, validation commands, and no compatibility window.
- Rollback tests: local rollback restores previous installed state and does not delete unrelated local skills, plugins, or settings.

## Test-first execution plan

- Red: add a taxonomy fixture or synthetic skill name such as `etrnl-dev-plan-v2` and confirm `node scripts/skill-contract-check.mjs` rejects it before implementing canonical validation.
- Red: add an old-name rejection fixture for `etrnl-dev-plan` and confirm install/smoke checks fail before old-name removal exists.
- Red: add trigger cases for `etrnl-dev-plan`, `etrnl-audit-ux`, and `etrnl-audit-tooling` before canonical skill directories exist.
- Green: implement taxonomy arrays, canonical skill directories, old-directory removal, and router updates until skill-contract, smoke, install, and workflow-tool tests pass.
- Green: add category fixtures for new audit categories and pass deep-audit artifact validation.

## Failure modes

- Command breakage: users invoke `etrnl-dev-plan` after the clean rename. Router and docs should return a clear canonical-name error instead of silently invoking old behavior.
- Double routing: an old name and canonical name both activate skills. Router fixtures assert old names do not route and canonical names route once.
- Install drift: source canonical names work but installed Claude/Codex homes retain old bodies. Installed skill-contract checks and install tests cover both homes.
- Audit overclaim: `etrnl-audit` says all audits ran while UX/reuse/repo/tooling are missing or source-limited. Registry and artifact validation require coverage statements and known missing/source-limited rows.
- Prompt bloat: copied SkillsMP or user prompt text makes skills too large. Details move into references and prompt-budget checks block oversized bodies.
- Naming churn without value: old names are changed but behavior stays scattered. The plan requires family docs, validators, old-name rejection tests, and direct category fixtures before completion.
- Category duplication: `etrnl-audit-excellence`, `etrnl-audit-code`, and `etrnl-audit-repo` report overlapping findings. Registry ownership boundaries and category references must state which category owns each concern.
- Private data leak: downloaded prompt paths, local home paths, account names, or transcript details enter tracked artifacts. Validators and review pass must reject private paths and secrets.
- Dirty worktree collision: unrelated current changes are staged or reverted. Execution must isolate this plan's file set and never revert user changes.

## Parallelization strategy

Phase 0 through Phase 2 are sequential because the taxonomy and clean-rename model define every downstream file move. Phase 3 can split by family after old-name removal infrastructure exists. Phase 5 can split by audit category because the new category directories should be disjoint. Final docs, install, and registry integration stay sequential.

```text
taxonomy contract
  |
  +-- clean rename infrastructure
        |
        +-- dev-flow rename lanes
        +-- audit-family rename lane
        +-- ops/comm rename lane
              |
              +-- new audit category lanes
                    |
                    v
              final docs/install/gates
```

## Verification gates

- `node scripts/skill-contract-check.mjs`
- `node scripts/skill-contract-check.mjs --installed --claude-home /Users/victorpenter/.claude`
- `node scripts/skill-contract-check.mjs --installed --claude-home /Users/victorpenter/.codex`
- `node scripts/prompt-budget-check.mjs --owned-only`
- `node scripts/skill-behavior-smoke.mjs`
- `node scripts/deep-audit-artifact-check.mjs validate-registry --root .`
- `node scripts/deep-audit-artifact-check.mjs validate-fixtures`
- `tests/test-workflow-tools.sh`
- `tests/test-hooks.sh`
- `tests/test-install.sh`
- `node scripts/replay-hook-fixtures.mjs`
- `node scripts/settings-audit.mjs templates/settings.json`
- `node scripts/settings-audit.mjs templates/settings.strict.json`
- `node scripts/update-check.mjs --fingerprint-source .`
- `scripts/doctor.sh`
- `git diff --check`
- `node scripts/plan-readiness-check.mjs docs/plans/2026-06-05-etrnl-skill-taxonomy-and-audit-suite-plan.md`

## Rollback

Rollback source changes by reverting only the canonical skill directories, old-directory removals, taxonomy docs, registry entries, router fixtures, install/update changes, and tests created by this plan. For installed-home rollback after an explicit later install, use `scripts/rollback-local.sh`, then verify with `scripts/doctor.sh`, `scripts/post-upgrade-canary.sh`, and installed skill-contract checks for both Claude and Codex homes. Do not delete unrelated local skills, plugins, settings, memories, or private overlays.

## Execution handoff

Use `etrnl-dev-execute` after the rename infrastructure exists, or the current execution skill only before implementing the rename. Because `Execution scope: all_phases`, implementation must complete the taxonomy, clean rename, old-name removal, missing audit categories, docs, tests, and verification gates or stop with a concrete blocker. Parallel agents can work only after Phase 2, with disjoint family/category file scopes.

## Plan Readiness Report

- Scope Challenge: The plan handles both requested concerns: better names and improved audit skills. It is now a clean rename with no fallback command names or wrappers, and keeps SkillsMP material as source evidence instead of wholesale imports.
- Architecture Review: Canonical family names live in one source-of-truth list; old names are removed rather than preserved; audit categories stay registry-backed; install and update scripts must sync both Claude and Codex homes.
- Code Quality Review: The migration is validator-first, uses compact canonical skill bodies, pushes long audit details into references, and requires old-name removal to be mechanically checked.
- Test Review: The plan includes red taxonomy checks, canonical router fixtures, old-name rejection fixtures, installed-home removal checks, deep-audit category fixtures, prompt-budget gates, install tests, rollback checks, and doctor.
- Performance Review: The change adds static docs, skills, fixtures, and validators. No hook-time broad scans should be added; any new validation must run in explicit gates.
- Failure modes: Main risks are command breakage, double routing, install drift, audit overclaim, prompt bloat, category overlap, private data leakage, and dirty-worktree collision. Each has a gate or process control.
- Parallelization: Sequential through clean rename infrastructure; family/category lanes can split after the contract is stable; final docs/install verification is sequential.
- Unresolved questions: research_flow: auto-generated from current SkillsMP API search and committed comparison report. Decision needed during Phase 0: whether `01_CODE_EXCELLENCE.md` becomes `etrnl-audit-excellence` or is folded into `etrnl-audit-code` as a strict mode.
- Verdict: Ready for execution; plan readiness and deep-stack artifact validation passed.

## Verdict

Ready for execution.
