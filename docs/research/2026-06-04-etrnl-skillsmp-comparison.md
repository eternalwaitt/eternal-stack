# ETRNL SkillsMP Comparison

Date: 2026-06-04

Scope: compare every repo-owned `etrnl-*` skill in `scripts/lib/skill-lists.sh` and `docs/skills.md` against SkillsMP skills with source inspection. SkillsMP discovery used `GET /api/v1/skills/search` plus SkillsMP pages and GitHub source links. The SkillsMP API documents keyword search for anonymous callers; semantic search/API-key features were not available in this session.

Repo sources inspected: `AGENTS.md`, `docs/skills.md`, `scripts/lib/skill-lists.sh`, every `skills/etrnl-*/SKILL.md`, every `skills/etrnl-*/references/*.md`, `hooks/cc-userprompt-router.sh`, `scripts/skill-contract-check.mjs`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, and `tests/test-install.sh`.

Installed state checked:

- `node scripts/skill-contract-check.mjs --installed --claude-home "$HOME/.claude"`
- `node scripts/skill-contract-check.mjs --installed --claude-home "$HOME/.codex"`
- `diff -qr skills "$HOME/.claude/skills"`
- `diff -qr skills "$HOME/.codex/skills"`
- Hash checks for `skill-update-prompt.mjs`, `update-check.mjs`, `tool-stack-check.mjs`, and `bootstrap-tools.sh`

Result: source, Claude-home, and Codex-home ETRNL skills match right now.

## Comparison Matrix

| ETRNL skill | Category | Best comparable SkillsMP skills | SkillsMP does better | ETRNL already does better | Quick win | Deeper improvement | Bloat/noise risk | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `etrnl-ops-agent-files` | Agent files/startup context | `mblode/agents-md`, `mryll/agentmd`, `bsene/writing-a-good-claude-md` | Strong litmus tests: every line must prevent a real agent mistake; avoid copying repo prose as instructions. | Load-chain inventory, public/private boundary, byte/line bloat ledger, installed drift handling. | Add compact scorecard and untrusted-repo-text rule. | Add deterministic dead import/glob/duplicate-rule counters. | Too much scoring inside startup docs. | implement now |
| `etrnl-dev-autoplan` | Automated planning | `addyosmani/planning-and-task-breakdown`, `sickn33/planning-with-files`, `trungtnm/planning` | Simple task sizing, vertical slicing, explicit checkpoints. | Deep-stack artifacts, research parity, outside-voice lanes, readiness gates, all-phases scope contract. | Add task sizing and vertical-slice guard. | Add validated planning metrics only if used by `plan-readiness-check`. | Already heavy; avoid new artifact family. | implement now |
| `etrnl-dev-brainstorm` | Brainstorm/design spec | `obra/brainstorming`, `terisuke/brainstorming` | Stronger spec self-review and visual companion gate. | Scoped to ambiguous work; avoids forcing design gate for tiny changes. | Add placeholder/contradiction/scope/ambiguity self-review. | Add optional visual artifact slot for UI-heavy specs. | Obra's mandatory-everything gate is too much. | implement now |
| `etrnl-dev-ci` | CI/CD | `alirezarezvani/ci-cd-pipeline-builder`, `EliasOulkadi/ci-cd`, `vibeeval/ci-cd-pipeline` | Some have runner decisions, before/after/why review format, rollback examples. | Strong lane model, security rules, deploy contract, required gate order, real-run evidence. | Add review format and self-hosted runner decision. | Optional deterministic PR/CI status helper. | YAML scaffold catalogs would duplicate project logic. | implement now |
| `etrnl-audit-code` | Whole-repo health | `repowise/code-health`, `chromium/code-health-hub`, `addyosmani/code-review-and-quality` | Per-file biomarkers, trend snapshots, tiny review lenses. | No-skips inventory, exclusions, terminal findings ledger, deterministic closure. | Add optional risk-hotspots output language only. | Deterministic scoring helper tied to inventory evidence. | Scoring without measurements becomes theater. | plan later |
| `etrnl-dev-commit` | Commit | `GitHub/git-commit`, `tnez/git-commit`, `NeverSight/code-review-and-commit` | Atomic split criteria, style detection, exclusion checklist, post-commit proof. | Relevant-file staging, preflight, no hook bypass culture. | Add atomic grouping, exclusions, post-commit verification. | Optional commit preflight helper. | External skills often use `git add -A`; reject. | implement now |
| `etrnl-ops-context-restore` | Context restore | `FlashQuery/context-manager`, `memory-kit`, `memory-management` | Rich restore prompt and memory taxonomy. | Local-only state, no transcript storage, stale branch/status check. | Add typed context taxonomy to save/restore wording. | Add duplicate/noise checks to `context-state.mjs`. | Broad memory engines conflict with public repo boundary. | implement now |
| `etrnl-ops-context-save` | Context save | `FlashQuery/context-manager`, `memory-management`, `memory-kit` | Decision/pattern/preference/fact/solution taxonomy and skip rules. | Local-only, concise, no credentials/transcripts. | Add taxonomy and skip rules. | Optional `--kind` support in `context-state.mjs`. | Automatic learned-skill writes are out of scope. | implement now |
| `etrnl-audit` | Deep audit orchestration | `brycewang-stanford/deep-audit`, `sickn33/security-audit` | False-alarm triage and remediation loop caps. | Registry-backed categories, shared worklists, exact check rows, lane receipts, validator. | Add false-alarm/max-loop language. | Register security as a new category with exploitability rubric. | Large security catalogs will create false positives. | plan later |
| `etrnl-dev-deps` | Dependencies | `sickn33/dependency-upgrade`, `VdustR/deps-upgrade`, `lasswellt/dep-health` | Modes, bot PR handling, current docs/changelog/source diff, related package detection. | Compatibility-first targeted upgrades, catalog awareness, audit/Knip/test gates. | Add modes, bot PR, major-confirmation, related packages. | Move confidence-index details to a reference file. | Inline package-manager encyclopedia. | implement now |
| `etrnl-ops-disk-cleanup` | Disk cleanup | `Ynakatsuka/my-disk-cleanup`, `juancavallotti/disk-cleanup-report`, `YangsonHung/mac-software-storage-cleanup` | Risk tiers, owner cleanup commands, richer report fields. | Trash-only, approved path classes, guard-enforced recursive-rm block. | Add manifest fields, tiers, owner cleanup commands, no full Trash empty. | Deterministic manifest helper. | One-shot cleanup scripts use `rm -rf`; reject. | implement now |
| `etrnl-audit-docs` | Docs health | `mthines/documentation`, `NickCrew/doc-health-audit` | Placement resolver, drift detection, phased gates. | Inventory, comment health, terminal dispositions, scorecard, stop-hook checker. | Add dead import/glob/hot-path leakage/duplicate surface checks to reference. | Add AI-context counters to ledger checker. | Duplicating a whole docs framework. | implement now |
| `etrnl-comm-email-reply-quality` | Email quality | `content-humanizer`, `anti-ai-prose`, `email-drafter`, `email-manager` | Detect-first rewrite flow, English AI-tell lists. | Private runtime checker, pt-BR hard blocks, no-send approval rule. | Add English anti-AI tells and detect/rewrite/self-check wording. | Vale/LanguageTool/promptfoo behind the local checker. | Generic inbox/email-manager features are unrelated. | implement now |
| `etrnl-dev-execute` | Plan execution | `imbue-ai/execute-implementation-plan`, `tailcallhq/execute-plan`, `FlorianBruniaux/plan-pipeline-execute` | Simple ordered task index, drift detection after execution layers. | Readiness gate, ledger, packet-bound subagents, TDD, review evidence, all-phases contract. | Keep current budget intact. | Automated wave/task extraction and drift helper. | Auto-commit/push/merge flows are unsafe; prompt budget is already tight. | plan later |
| `etrnl-dev-debug` | Systematic debugging | `obra/superpowers/systematic-debugging`, `pytorch/dev-debug`, `remix-run/dev-debug`, `microsoft/vscode/fix-errors`, `microsoft/vscode/fix-ci-failures` | Four-phase root-cause process, red-flag interrupts, data-flow tracing, instrumentation boundaries, failed-fix architecture stop, eligibility taxonomy, untrusted issue guard, CI log triage. | Repo-safe remote-state boundaries, source-owned routing/tests, and install sync across Claude/Codex. | Rename from dev-debug and fold in compact root-cause phases. | Add deterministic debug ledger/helper in P1. | Avoid vendoring long Superpowers examples into default prompt. | implement now |
| `etrnl-dev-parallel` | Parallel agents | `plimeor/subagent-delegation`, `truongnat/parallel-agents-pro`, `sickn33/parallel-agents` | Critical-path analysis, coordination record, stop condition, weak-report handling. | Packet validator, max-6 cap, no-revert, disjoint ownership, ledger integration. | Add optional critical path/aggregation/failure/stop fields to wording. | Enforce fields conditionally in packet checker. | Making every fanout too ceremonious. | plan later |
| `etrnl-audit-performance` | Performance | `me2resh/performance-audit`, `grafana/k6`, `microsoft/playwright-trace` | Persisted trend baseline and k6 thresholds/scenarios. | Route matrix, cold/warm separation, lane receipts, source-limited blockers. | Add next-run baseline language. | Persisted trend artifact helper. | Lighthouse/k6 as universal answer. | plan later |
| `etrnl-dev-plan` | Planning | `addyosmani/planning-and-task-breakdown`, `sickn33/planning-with-files` | Task sizing, vertical slices, checkpoint frequency. | Readiness gate, deep-stack artifact bundle, execution scope, research parity. | Add sizing/slicing guard. | Validator-backed size thresholds. | More plan ceremony without validator support. | implement now |
| `etrnl-dev-pr` | PR | `alvarosanchez/create-pr`, `biome/pull-request`, `hideki5123/self-pr-review` | Branch/auth/upstream/reuse preflight, CI status loop, terminal success conditions. | Verification evidence and residual-risk culture, but skeletal. | Add PR preflight, CI evidence, side-effect bans. | PR helper scripts for preflight/status. | Auto-comments/merge/force-push loops. | implement now |
| `etrnl-audit-production` | Production readiness | `paulpas/production-readiness`, `curiositech/launch-readiness-auditor`, `LerianStudio/production-readiness-audit` | SRE PRR rows: SLOs, runbooks, dashboards, restore drills, on-call, canary/rollback. | Deep code-level app checks for validation/auth/webhooks/tenancy/env/error boundaries. | Document P1 category-extension plan. | Add `prod-18-operability-prr` registry/check. | 44-dimension generic audit bloat. | plan later |
| `etrnl-audit-browser` | Browser QA | `browser-use/browser-use`, `microsoft/playwright-cli`, `c0x12c/browser-qa`, `WaterplanAI/ac-qa-playwright-cli` | Tool resolution, snapshot/state before click, named sessions, trace/video failure evidence. | V2 artifact schema with route x viewport rows, hashes, console/network counts. | Add tool chain, state/snapshot, named sessions, cleanup. | Extend artifact schema and smoke to pageErrors/loadMs/trace. | Browser cloud/signup/payment content. | implement now |
| `etrnl-dev-review` | Review | `openai/code-review`, `openai/code-review-testing`, `google-gemini/code-reviewer`, `addyosmani/code-review-and-quality` | Tiny sibling lenses, tests-first review, change-size gates, dependency discipline. | Original request vs plan vs diff vs installed/runtime truth; durable review log; deep-stack validation. | Add tests-first, dependency, change-size block. | Split review lenses into separate repo-owned skills only if triggers demand it. | Too many subagent lenses by default. | implement now |
| `etrnl-dev-stress-test` | Adversarial review/load stress boundary | `grafana/k6`, `sickn33/security-audit`, `curiositech/launch-readiness-auditor` | k6 has thresholds/scenarios/artifact summary; launch readiness has blocker matrix. | Good adversarial assumption/rollback/privacy posture. | Clarify actual load tests require target, thresholds, abort criteria, artifact. | Separate load-test skill/category. | Running load against prod without approval. | implement now |
| `etrnl-dev-test` | Testing | `darrenhinde/test-generation`, `openai/code-review-testing`, `MODSetter/playwright-testing` | Behavior inventory, positive/negative cases, AAA, deterministic mocks, locator/flakiness rules. | Red-green protocol, full-suite final gate, hook-enforced verification after edits. | Add behavior inventory and deterministic test acceptance. | Dedicated test-generation reference. | Test-style encyclopedia. | implement now |

## Loose Ends

- Stale docs: `docs/skills.md` is aligned on skill list, but it does not expose the richer PR/commit/systematic-debugging/deps contracts because those skills are currently skeletal.
- Validation note: `docs/skills.md` is synchronized with repo-owned skills by `skill-contract-check`. The removed `etrnl-systematic-debugging` name is intentionally absent after the rename to `etrnl-dev-debug`; `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, `etrnl-investigator`, `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer` are agents, not skills.
- Missing tests: trigger fixtures cover every owned skill, but do not cover Dependabot/Renovate/security dependency PRs, PR CI-green requests, or Copilot review-comment handling.
- Missing routing: bot dependency PR language routes through generic dependency patterns only when it contains `dependency`; `Dependabot`, `Renovate`, and `security alert` deserve explicit fixtures before router changes.
- Installed-state drift: none found in this run. Both installed homes match source for `etrnl-*` skills; checked shared scripts also hash-match.
- Repeated wording: every skill has the same Codex update-prompt line. This is intentional but contributes prompt budget; keep it until the updater has a lower-bloat hook path.
- Under-enforced behavior: `etrnl-dev-debug`, `etrnl-dev-pr`, and `etrnl-dev-commit` rely on prose only and lack helper-level preflight; quick wins can strengthen directive text, helper scripts belong in P1.
- Prompt-budget risks: `etrnl-dev-execute`, `etrnl-dev-autoplan`, and `etrnl-dev-plan` are already large. Additions there must stay short; move extended examples to references or validators.
- Category coverage gap: `etrnl-audit` registers only `production-readiness` and `performance`; security, UX/accessibility, API/data, docs, payments, and privacy/compliance remain known-unimplemented.
- Production readiness gap: app-level code checks are strong; operational PRR evidence is not registered as a check.
- Browser QA gap: skill text requires v2 artifacts, but smoke coverage still exercises simpler/legacy behavior.
- Context gap: context save/restore are privacy-safe but lack typed taxonomy and duplicate/noise guidance.

## Prioritized Plan

### P0 quick wins under 1 hour

Edit only source-owned skill/docs/test text:

- `skills/etrnl-dev-debug/SKILL.md`: rename from dev-debug and expand into a compact systematic debugging contract with untrusted issue guard, eligibility stops, root-cause phases, instrumentation, failed-fix escalation, focused tests, review loop, and no remote side effects without approval.
- `skills/etrnl-dev-pr/SKILL.md`: add branch/auth/upstream/existing-PR preflight, CI evidence, terminal conditions, and no merge/force-push/comment side effects unless requested.
- `skills/etrnl-dev-commit/SKILL.md`: add atomic grouping, exclusions, commit-style detection, post-commit verification, and hook-failure handling.
- `skills/etrnl-dev-deps/SKILL.md`: add audit/upgrade/bot-pr modes, major confirmation, current docs/changelog/source-diff, related package detection, and no force-audit-fix/manual lockfile edits.
- `skills/etrnl-dev-brainstorm/SKILL.md`: add spec self-review checklist.
- `skills/etrnl-dev-plan/SKILL.md` and `skills/etrnl-dev-autoplan/SKILL.md`: add compact vertical-slice/task-sizing guard.
- `skills/etrnl-dev-review/SKILL.md`: add tests-first, dependency discipline, and change-size lens.
- `skills/etrnl-dev-test/SKILL.md`: add behavior inventory, positive/negative cases, and deterministic test acceptance.
- `skills/etrnl-audit-browser/SKILL.md`: add tool resolution, snapshot/state before interactions, named sessions, and cleanup.
- `skills/etrnl-dev-stress-test/SKILL.md`: clarify load/stress testing authorization and threshold contract.
- `skills/etrnl-ops-disk-cleanup/SKILL.md`: add manifest schema, risk tiers, owner cleanup commands, and no whole-Trash emptying.
- `skills/etrnl-comm-email-reply-quality/SKILL.md`: add English AI-tell blocks and detect/rewrite/self-check wording.
- `skills/etrnl-ops-agent-files/SKILL.md`: add compact scorecard and untrusted repo text rule.
- `skills/etrnl-ops-context-save/SKILL.md` and `skills/etrnl-ops-context-restore/SKILL.md`: add typed context taxonomy and skip rules.
- `tests/fixtures/skill-triggering/cases.json`: add bot dependency PR, security dependency alert, PR CI, and review-comment fixture prompts.

Verification gates:

- `node scripts/skill-contract-check.mjs`
- `node scripts/prompt-budget-check.mjs --owned-only`
- `tests/test-workflow-tools.sh`
- `tests/test-hooks.sh` because trigger fixtures/routing behavior are touched
- `scripts/doctor.sh`

### P1 high-value upgrades

- DONE: Add PR preflight/status helper scripts and install/test them.
- DONE: Add execution wave drift checks through a helper or validator-backed contract rather than enlarging `etrnl-dev-execute`.
- DONE: Add conditional parallel packet fields to `agent-task-packet-check.mjs`.
- DONE: Add AI-context/doc counters to `documentation-health-ledger-check.mjs`.
- DONE: Add v2 browser QA smoke coverage and optional trace/video/pageError schema.
- DONE: Add `prod-18-operability-prr` to production readiness registry, fixtures, docs, and validators.
- DONE: Add performance next-run baseline/trend artifact.

### P2 larger redesigns

- DONE: Register a security deep-audit category using exploitable-bug evidence: source, sink, missing control, exploit, reachability, confidence, and explicit non-findings.
- DONE: Add deterministic code-health risk-hotspot scoring tied to inventory classification and path measurements.
- REJECTED_FOR_NOW: Split `etrnl-dev-review` into tiny sibling lenses only if prompt routing shows repeated overload or prompt-budget pressure. Current evidence does not show repeated overload, so the single skill keeps a split-lens trigger instead of adding new prompt surfaces.
- DONE: Add a disk cleanup manifest helper with strict validation because manifest consistency is now enforceable without enlarging the skill prompt.

### Rejected Ideas

- No wholesale import of SkillsMP skills.
- No hard `model:` or `effort:` frontmatter in repo-owned skills.
- No automatic commit, push, merge, PR comment, email send, or destructive cleanup loops.
- No broad memory engines, transcript scanning, GitHub backup/sync, or learned-skill writes in this public repo.
- No `rm -rf` cleanup scripts, full Trash emptying, or Docker/system prune without explicit review and approval.
- No large CI YAML catalogs or generated scaffold dumps inside skill prompts.
