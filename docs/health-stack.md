# Health Stack

Use this stack when running `etrnl-audit-code` in this repo.

## Deep-Audit Skills

- `etrnl-deep-audit` bundled `repo-hygiene` category: organization, generated artifacts, dead files, and public-boundary drift; see `skills/etrnl-deep-audit/references/categories/repo-hygiene.md` and `scripts/lib/deep-audit-categories.mjs`.
- `etrnl-deep-audit-ux`: standalone `ui-ux-product` deep-audit category (excluded from `all_registered`), enumerated by `scripts/ux-inventory.mjs` and gated by `scripts/ux-audit-check.mjs coverage`; see `skills/etrnl-deep-audit-ux/references/audit-checks.md`.
- `etrnl-audit-tooling`: tooling-ecosystem audit for `tool-01` through `tool-05`, covering local setup, formatter/lint/test gates, CI parity, hook/tool drift, and developer workflow reliability; see `docs/skills.md` and `scripts/lib/deep-audit-categories.mjs`.

## Required Gates

```bash
node scripts/code-health-inventory.mjs --json --quiet --include-untracked
node scripts/documentation-comment-health.mjs --root . --json --include-untracked
node scripts/deep-audit-artifact-check.mjs validate-fixtures
node scripts/deep-audit-artifact-check.mjs validate-registry --root .
node scripts/deep-audit-artifact-check.mjs validate-synthetic-fixtures --fixture tests/fixtures/deep-audit/synthetic-target --templates tests/fixtures/deep-audit/templates
node scripts/tool-effectiveness.mjs validate-fixtures --fixtures tests/fixtures/tool-effectiveness
node scripts/tool-effectiveness.mjs summarize --fixtures tests/fixtures/tool-effectiveness --json
node scripts/etrnl-state.mjs validate --fixtures tests/fixtures/etrnl-state
node scripts/etrnl-state.mjs doctor --compact --explain
node scripts/tool-stack-check.mjs --json
node scripts/live-hook-noise-report.mjs --since-days 3 --json
node scripts/session-deep-dive.mjs --since-days 10 --json
node scripts/session-audit.mjs --since-days 3 --json
node scripts/stack-profile-check.mjs templates/stack-profile.core.json --json
node scripts/stack-profile-check.mjs templates/stack-profile.full.json --json
node scripts/prompt-budget-check.mjs . --owned-only
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
tests/test-install-smoke.sh
tests/test-read-stdin.sh
node scripts/replay-hook-fixtures.mjs
node scripts/changelog-release-check.mjs --strict-unreleased --allow-clean-history-changelog
node scripts/release.mjs check
scripts/doctor.sh [--jobs N]  # parallel syntax + heavy suites; default jobs=min(8, nproc), override with DOCTOR_JOBS
ETRNL_DOCTOR_FULL_INSTALL=1 scripts/doctor.sh  # release/install validation runs full test-install.sh
node scripts/settings-audit.mjs templates/settings.json --strict-conflicts
node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts
scripts/canary-hindsight.sh --json
node scripts/canary-codex-hindsight.mjs --json
node scripts/update-check.mjs --fingerprint-source .
fd -t f -e sh . hooks scripts tests -x bash -n
fd -t f -e sh . hooks scripts tests -X shellcheck -x
node --check \
  scripts/merge-settings.mjs \
  scripts/settings-audit.mjs \
  scripts/update-check.mjs \
  scripts/code-health-inventory.mjs \
  scripts/code-health-ledger-check.mjs \
  scripts/documentation-comment-health.mjs \
  scripts/documentation-health-ledger-check.mjs \
  scripts/lib/audit-exclusions.mjs \
  scripts/deep-audit-artifact-check.mjs \
  scripts/deep-stack-check.mjs \
  scripts/lib/deep-audit-categories.mjs \
  scripts/lib/deep-stack-artifacts.mjs \
  scripts/plan-readiness-check.mjs \
  scripts/agent-task-packet-check.mjs \
  scripts/lib/evidence-trace.mjs \
  scripts/guard-override-token.mjs \
  scripts/replay-hook-fixtures.mjs \
  scripts/execution-ledger.mjs \
  scripts/execute-evidence-check.mjs \
  scripts/execution-wave-check.mjs \
  scripts/review-log.mjs \
  scripts/project-buglog.mjs \
  scripts/browser-qa-report.mjs \
  scripts/context-state.mjs \
  scripts/canary-codex-hindsight.mjs \
  scripts/live-hook-noise-report.mjs \
  scripts/session-deep-dive.mjs \
  scripts/session-audit.mjs \
  scripts/disk-cleanup-manifest.mjs \
  scripts/performance-baseline.mjs \
  scripts/ux-inventory.mjs \
  scripts/ux-audit-check.mjs \
  scripts/codex-rollout-baseline.mjs \
  scripts/pr-preflight.mjs \
  scripts/workflow-health.mjs \
  scripts/tool-effectiveness.mjs \
  scripts/etrnl-state.mjs \
  scripts/lib/etrnl-state-core.mjs \
  scripts/tool-stack-check.mjs \
  scripts/stack-profile-check.mjs \
  scripts/prompt-budget-check.mjs \
  scripts/changelog-release-check.mjs \
  scripts/release.mjs \
  scripts/port-guard.mjs \
  scripts/lib/read-stdin.mjs \
  scripts/skill-contract-check.mjs \
  scripts/skill-behavior-smoke.mjs \
  scripts/skill-update-prompt.mjs \
  hooks/lib/complexity-check.mjs
jq empty templates/settings.json templates/settings.strict.json templates/settings.local.example.json templates/stack-profile.core.json templates/stack-profile.full.json templates/hindsight/claude-code.local-daemon.json templates/hindsight/claude-code.external.example.json hooks/fixtures/events/*.json hooks/fixtures/events/replay/*.json
git diff --check  # use `rtk git diff --check` when local hooks require RTK
```

Workflow health:

```bash
node scripts/workflow-health.mjs
node scripts/workflow-health.mjs status
node scripts/workflow-health.mjs status --json
node scripts/workflow-health.mjs status --markdown
node scripts/workflow-health.mjs status --markdown --write .etrnl/workflow-health-status.md
node scripts/workflow-health.mjs status --markdown --exit-code
node scripts/workflow-health.mjs doctor --json --all
node scripts/workflow-health.mjs doctor --json --all --strict
node scripts/workflow-health.mjs summary
node scripts/workflow-health.mjs summary --json
tests/test-workflow-health-perf.sh
node scripts/workflow-health.mjs prune --older-than-days 30 --dry-run --all
node scripts/tool-effectiveness.mjs summarize --since-days 7 --all --projects-config "$HOME/.claude/etrnl/tool-effectiveness/projects.json" --json
node scripts/tool-effectiveness.mjs doctor --json
node scripts/live-hook-noise-report.mjs --since-days 3 --json
node scripts/session-deep-dive.mjs --since-days 10 --json
node scripts/session-audit.mjs --since-days 3 --json
node scripts/etrnl-state.mjs compact-handoff --latest --json
node scripts/etrnl-state.mjs doctor --compact --explain
node scripts/tool-stack-check.mjs --explain --project "$PWD"
scripts/bootstrap-tools.sh check --project "$PWD"
node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>
node scripts/deep-stack-check.mjs create --plan <plan-path> --out <artifact-dir>
node scripts/deep-stack-check.mjs validate-review-phases --artifact <artifact-path>
node scripts/deep-stack-check.mjs validate-tdd --artifact <artifact-path>
node scripts/deep-stack-check.mjs validate-completion-reconciliation --artifact <artifact-path>
node scripts/deep-stack-check.mjs validate-reuse-bindings --artifact <artifact-path>
node scripts/deep-stack-check.mjs validate-type-triggers --artifact <artifact-path>
node scripts/deep-stack-check.mjs validate-install-proof --artifact <artifact-path>
node scripts/prompt-budget-check.mjs .
node scripts/prompt-budget-check.mjs ~/.claude --owned-only
node scripts/review-log.mjs summary
node scripts/review-rules.mjs check --changed-only
node scripts/review-rules.mjs check --changed-only --report-only
node scripts/review-merge.mjs skip-plan
node scripts/review-merge.mjs merge --scoped --fix-base-sha <sha> --fix-head-sha <sha> --finding-ids <fp,...> --file <findings.json>
node scripts/diff-triviality.mjs classify --git --json
node scripts/diff-triviality.mjs classify-plan --plan <plan-path> --json
node scripts/execution-ledger.mjs history --gates --plan <plan-path> --json
node scripts/execution-ledger.mjs reconcile
node scripts/codex-rollout-baseline.mjs --rollout <rollout.jsonl> --json
node scripts/codex-rollout-baseline.mjs baseline --rollout <rollout.jsonl>
node scripts/codex-rollout-baseline.mjs trend --before <baseline.json> --after <baseline.json>
node scripts/changelog-scaffold.mjs detect --json
node scripts/project-buglog.mjs validate
node scripts/project-buglog.mjs suggest --file <path> --json
node scripts/project-buglog.mjs suggest-project --json
node scripts/browser-qa-report.mjs summary
node scripts/context-state.mjs list
node scripts/pr-preflight.mjs status --json
node scripts/pr-preflight.mjs template
printf '%s' '{"title":"...","body":"...","changedFiles":[]}' | node scripts/pr-preflight.mjs validate-body --json
node scripts/update-check.mjs --explain
scripts/post-upgrade-canary.sh
```

- `scripts/workflow-health.mjs` reads run ledgers in parallel with `ETRNL_LEDGER_READ_CONCURRENCY` (default `8`, capped at `12` for constrained systems). `workflow-health.mjs status` is the concise text surface used by SessionStart hints; `status --json` is the machine-readable surface for active run id, unfinished work, missing artifacts, browser/context freshness, phase/UAT state, stale run count, and the next deterministic action. `status --markdown [--write <path>]` emits a per-project handoff (≤60 lines) with recent sessions, median `tasksPerHour`, compaction counts, stale-verification resets, gate-repeat counts, and top recurring failures; add `--exit-code` to fail when median `tasksPerHour` across the last five sessions drops below `ETRNL_STATUS_MIN_TASKS_PER_HOUR` (default `1`) or median compactions/session exceeds `ETRNL_STATUS_MAX_COMPACTIONS_MEDIAN` (default `10`). `workflow-health.mjs summary` (and `summary --json`) adds per-session performance rows when derivable from ledgers and the state log: `gateMaxRepeatsAtTreeHash`, `compactCount`, `compactsWithUnchangedTree`, `compactStaleEvents`, `tasksCompletedPerHour`, and `waitCallRatio` (rows are omitted when not derivable; legacy ledgers stay safe). `workflow-health.mjs doctor` warns when a session exceeds `ETRNL_PERF_MAX_GATE_REPEATS` (default `3`), `ETRNL_PERF_MAX_COMPACT_STALE` (default `5`), or `ETRNL_PERF_MAX_WAIT_RATIO` (default `0.5`); non-zero exit only under `--strict`. Use `workflow-health.mjs doctor --strict` or `ETRNL_WORKFLOW_HEALTH_STRICT=1` when live runtime findings must fail closed instead of remaining diagnostic.
- `execution-ledger.mjs reconcile` reports duplicate pointers aimed at one ledger, pointers whose ledger is gone, ledgers whose `sessionId` differs from the bucket in their `runId`, and ledgers carrying events written from a worktree other than their own (`foreign-writer`). `--apply` retires stale pointers into `runs/retired-pointers/` rather than deleting them and records a `ledger.reconciled` event; re-running preserves a standing divergence without restamping it. `init` and `reconcile` are excluded from the foreign-writer count, since both legitimately act on a ledger from outside its worktree.

### Wave-2 acceptance metrics

Wave-2 stack overhaul acceptance is measured monthly from local run telemetry, not from a one-time audit:

- **Target:** median `tasksPerHour` doubles and median compactions/session halves versus the pre-wave-2 baseline window.
- **Command:** `node scripts/workflow-health.mjs status --markdown [--write <path>]` — the markdown handoff is the artifact to archive and compare month over month. Use `--exit-code` in CI or scheduled checks when thresholds must fail closed.
- **Scope:** run against the project's ledger filter (`--cwd <repo>`) so multi-repo installs do not blend unrelated sessions.
- `tool-effectiveness.mjs` summarizes sanitized local tool events into deterministic `keep`, `enforce`, `repo-specific`, `remove-watch`, or `insufficient-data` verdicts. It reads hook tool-signal state, optional local event artifacts, and explicit Codex imports; it rejects raw prompts, transcript text, secrets, private transcript paths, and tracked private project names. Its `quickWins` output flags missing metadata, low CodeGraph-before-edit coverage, dormant Beads posture, and noisy events before a tool is promoted to strict enforcement. Use the seven-day `summarize` command above to revisit CodeGraph, Beads, and hook patterns without manual log reading.
- `session-deep-dive.mjs` scans recent Claude and Codex local session JSON/JSONL without echoing private text. Use it for 10-day usage reviews: it reports scanned file/row counts, code-eligible sessions, read/search/edit volume, CodeGraph/Beads/Hindsight signal counts, CodeGraph-before-first-edit coverage, high-work sessions without CodeGraph, Stop block categories, and immediate follow-up type.
- `etrnl-state.mjs` is the canonical local state helper for compact lifecycle and small workflow events. It writes append-only JSONL under `~/.claude/etrnl/state`, rebuilds compact handoff views, rejects raw prompts/transcripts/private paths/secrets before append, and exposes `compact-handoff`, `stop-status`, `doctor`, `bead-link`, and `bead-prime-audit`. Hook hot paths may use bounded state appends and queries only.
- `tool-stack-check.mjs` is the installed health surface for CodeGraph, Beads, and Hindsight plugin posture. Project checks include `.codegraph` health, `.beads` health, and Beads issue-count posture (`dormant-empty`, `active`, or `unknown`) from `bd -C <project> status --json`. Hindsight install detection prefers `claude plugin list` when the CLI is on PATH, then falls back to versioned directories under `~/.claude/plugins/cache/` so SessionStart and skill-update hooks do not false-positive when hook PATH lacks nvm-managed `claude`. It reports Codex Hindsight separately as `configured-unverified`, `installed-only`, or `unproven`; do not claim Hindsight works in Codex from Claude plugin health alone. `canary-codex-hindsight.mjs` is the matching truth canary and reports `runtimeProven:false` until a real Codex recall path exists. `update-check.mjs` includes missing/update signals, and `cc-userprompt-router.sh` uses that combined update signal to inject an update directive before requested `etrnl-*` skill invocations when CodeGraph, Beads, or repo-owned skills are stale — auto-applying local updates when safe, then requiring the agent to run any remaining update commands before proceeding unless the user explicitly declines.
- `stack-profile-check.mjs` validates the public `core` and `full` stack manifests so installer dry-runs, staged installs, and doctor runs cannot silently omit Hindsight, Beads, or CodeGraph from the full profile.
- `settings-audit.mjs` reports repo-owned hooks, outside-settings plugin hook manifests, memory-affecting plugin hooks, unsupported top-level settings such as `autoCompactWindow` and `skipAutoPermissionPrompt`, and enabled memory plugin config posture.
- `cc-precompact-save.sh` records bounded `compact_pre` events, `cc-postcompact-record.sh` records Claude compact summaries as `compact_post` with stale-verification state, and synchronous `cc-sessionstart-restore.sh` injects only the bounded `compact-handoff` packet on `source=compact`.
- `browser-qa-report.mjs` supports schema v1 plus schema v2 matrix reports; a completed v2 report must include route/viewport rows, numeric `consoleErrors` and `failedRequests`, fresh screenshot captures, matching `screenshotSha256`, and provenance with tool, target URL, command, and capture time.
- `pr-preflight.mjs` reports branch, upstream, dirty state, existing PR, GitHub auth, PR checks, and local gate hints before PR creation or readiness claims. `template` emits the dual-audience PR skeleton; `validate-body --json` checks title/body structure (required sections, verification depth, rollout for shipping-sensitive paths). Use `--strict` for install/hooks/doctor/migration-sized work.
- `review-rules.mjs` is the pre-push CodeRabbit-preemption guard (Tier A). It runs the ast-grep and literal rules in `review-rules.json` over changed files (`check --changed-only`); block-mode matches exit non-zero and fail the local gate, warn-mode matches report without failing. It shares no code with the receipt/ledger subsystem. `review-learn.mjs` closes the loop: it classifies each PR's review findings with `lib/coderabbit-classifier.mjs`, tracks recurrence in `review-learnings.json`, and at three recurrences auto-promotes a template-matching class to a warn-mode `review-rules.json` guard (auto-escalating to block after two clean runs) or records a checklist candidate for `etrnl-dev-autoplan`. Tiers B (plan checklist `skills/etrnl-dev-autoplan/references/coderabbit-preemption.md`) and C (bounded execute/quality review lens) carry the classes a linter cannot catch. See [ADR 0004](adr/0004-coderabbit-preemption-lean.md). `check --report-only` reports the same findings with status `report-only` and exits 0, so an advisory pass never turns a warn-mode match into a block.
- `review-merge.mjs` also owns the review economy that keeps reviewer loops bounded. Every merged report carries `capDecision`, the mechanical answer to a loop that ended: `proceed-with-residuals` closes the stream with residuals recorded, and `owner-decision` — a P0/P1 still open after the last round — is the only value that interrupts a person, and it stops that stream rather than the plan. `merge --scoped --fix-base-sha <sha> --fix-head-sha <sha> --finding-ids <fp,...>` narrows fix-round re-review to named finding fingerprints and records `scopedFixRound` metadata on the merged report. Park thresholds are named constants with env overrides — `ETRNL_REVIEW_RECURRING_FINDING_LIMIT` (3), `ETRNL_REVIEW_STREAM_ALTERNATION_LIMIT` (4), `ETRNL_REVIEW_ROUNDS_SINCE_PROGRESS_LIMIT` (2) — and they read the per-wave counters written by `execution-ledger.mjs record-trajectory --wave <id>`. `skip-plan` proposes skipping a reviewer after `ETRNL_REVIEW_ADAPTIVE_SKIP_STREAK` (default 5) consecutive zero-finding dispatches, persisting counts in an additive `reviewerDispatches` key inside the same `review-learnings.json` that `review-learn.mjs` writes. Security lenses, tenancy lenses, and every deep-audit lane always dispatch; the lane exemption is read live from the deep-audit registry, and a registry that fails to load yields `skipEvaluation: unavailable` so nothing skips. Every skip records a machine-readable `reasonCode`. Both writers of `review-learnings.json` serialize on one lock from `lib/json-file-store.mjs` and replace the file through `rename()`, so parallel reviewer lanes cannot drop each other's rows and a crash mid-write cannot truncate the store. That store is tracked deliberately: recurrence counts are the signal that promotes a class to a guard, and they only reach three across PRs if the file is shared, so `etrnl-dev-pr` commits it with the PR. Both writers merge additively into their own top-level keys — `recurrences` from `review-learn.mjs`, `reviewerDispatches` from `review-merge.mjs` — so a run never rewrites the other's rows. Resolve a merge conflict field by field:

  | Field | Shape | Merge rule | Why |
  | --- | --- | --- | --- |
  | `schemaVersion` | number | Values must match. If they differ, do not hand-merge — take one side and re-run the loop. | A differing version means the two sides disagree about the store shape. |
  | `recurrences` | `{ classKey: count }` | Union the keys; for keys on both sides keep the **higher** count. | Promotion signal. Dropping a key or count discards recurrence evidence and forces the class to be re-found. |
  | `promoted` | `{ classKey: { type, control/ruleId, ... } }` | Union the keys; resolve each key shape-aware (below). Resolve together with `review-rules.json`. | One class key can hold a guard, a precision-blocked checklist candidate, or a plain checklist candidate depending on corpus and measured precision — the shapes are not interchangeable. Arbitrary picks downgrade a guard to checklist (losing `ruleId`/`mode` and restarting `cleanRuns`) or install a guard a precision measurement refused. A `type: "guard"` entry pairs with a rule in `review-rules.json`; resolving this map alone leaves an orphaned guard entry or an orphaned rule. |
  | `cleanRuns` | `{ ruleId: count }` | Union the keys; for keys on both sides keep the **lower** count. | Opposite of `recurrences`. `review-learn.mjs` flips a guard from warn to block at `cleanRuns >= 2`. Keeping the higher count escalates a guard to blocking on clean runs neither branch observed; keeping the lower count only delays an escalation the next clean run re-earns. |
  | `processedReviews` | `array[reviewId]` | Concatenate both arrays and de-duplicate, preserving order. | Idempotence guard: `review-learn.mjs` skips a review id it has already seen (`processedReviews.includes(...)`). Dropping an id lets that review be counted again, inflating `recurrences` and promoting a class early. |
  | `reviewerDispatches` | `{ reviewer: row }` | Union the keys; per-reviewer rows are independent. | Written by `review-merge.mjs` for adaptive reviewer-skip accounting. |

  **`promoted` shape-aware merge:**

  - Same `type` on both sides: keep the entry with the larger field set. Extra fields (`sourcePrCount`, `precision`) are additive evidence, not competing values.
  - Types differ, one side is `checklist_candidate` with `blockedBy: "precision"`: keep the `checklist_candidate`. Keeping the guard side installs a rule the precision gate refused; a stray checklist item costs one reviewer note, a noisy block-mode guard costs every developer on every push.
  - Types differ with no `blockedBy` marker: take one side and re-run the learning loop so the precision gate recomputes; do not hand-merge.
  - Resolve `promoted` together with `review-rules.json`. `review-learn.mjs` writes a `type: "guard"` entry only after the matching rule is durably in `review-rules.json`; the two files must agree.

- `execution-ledger.mjs history --gates [--plan <path>] [--json]` is the progress surface that replaces time estimates. It reports `tasks=<done>/<total>`, `phase`, `phaseStatus`, `workstream`, `uatGate`, and `uatOpenFindings`, then `planStatus`, `nextGate`, and `nextGatePhase`. Without `--plan` it reports `planStatus=not-provided` and exits 0 with task counts intact, so a missing plan file degrades the output rather than the command.
- `diff-triviality.mjs` classifies a changed-path set against `schemas/review-classification-rules-v1.json` and reports whether every path is non-runtime (documentation, asset, generated, vendor, metadata). `cc-stop-verifier.sh` calls it as a fast-path: when the whole changed set — the recorded edits unioned with the git working tree — is provably non-runtime, the stale-verification, zero-verification, and second-pass-code-review gates are skipped (nothing in the diff executes), while ledger, schema/migration, requested-skill, evidence-discipline, and audit-report gates still apply. It is fail-safe: any source, schema, script, test, CI, migration, data/config, or unclassified path — or a missing schema — keeps every gate in force.
- `changelog-scaffold.mjs` gives every project — not just this repo — changelog and version maintenance. `detect --json` reports `hasChangelog`, `hasVersion`, `hasUnreleased`, `hasReleaseSection`, `latestTag`, and `isReleaseManaged`; `scaffold` writes a Keep a Changelog `CHANGELOG.md` and seeds `VERSION` (from the latest `v` tag, else `0.1.0`) only when absent, never overwriting existing files. It pairs with `changelog-release-check.mjs --active-dev`, which tolerates a populated `## Unreleased` and pre-first-release repos so day-to-day work is not gated on cutting a tagged release; `--strict-unreleased` remains the release-commit gate.
- `performance-baseline.mjs` validates repeatable performance baseline artifacts with measurements, thresholds, and `nextRun.command`; use `trend` to compare before/after baselines.
- `codex-rollout-baseline.mjs` is the outcome gate for Codex efficiency measurement. It aggregates a parent Codex rollout JSONL plus every spawned subagent rollout in the same directory, deduplicates repeated `last_token_usage` events, and reports parent vs subagent billed tokens (input, cached input, output, reasoning), compaction count, `spawn_agent` count, explicit vs inherited spawn models, and turn-model distribution. Use `--rollout <file> [--json]` for a one-off report; `baseline --rollout <file>` captures metrics under `${ETRNL_ARTIFACTS_DIR}/codex-baselines/` (same artifact-dir and permission conventions as `ux-audit-check.mjs`); `trend --before <file> --after <file>` compares captured baselines so efficiency-plan savings stay falsifiable.
- `prompt-budget-check.mjs` is a hard doctor gate, not a report. Doctor runs `prompt-budget-check.mjs <root> --owned-only` in the `skills` group and fails when any repo-owned `skills/*/SKILL.md` exceeds 18 000 bytes or any agent exceeds 14 000. `SKILL.md` files load into context every session, so bytes added there are a permanent per-session cost. The remedy is to move conditional depth into an on-demand `references/` module and leave a named pointer behind; raising a limit in the `limits` table hides the regression instead of fixing it. Neither `skill-contract-check.mjs` nor `skill-behavior-smoke.mjs` reports byte size, so run this check at every phase gate rather than assuming a green contract check covers it.
- `disk-cleanup-manifest.mjs` validates cleanup manifests before mutation, requiring absolute paths, safe commands, risk tiers, and explicit approval fields for tier 2 or tier 3 rows.
- `project-buglog.mjs suggest --json` emits redacted local suggestions with severity, fingerprint, last-seen, and suggested guard; `suggest-project --json` aggregates repeated lessons across files, gives cross-session project hints without returning the raw cwd, and includes up to 5 most recent affected files for generic repeat-edit patterns. Hooks debounce these hints and honor `ETRNL_LEARNING_HINTS=0`. Because these notes are surfaced back into model context by `cc-pretooluse-guard.sh`, every persisted summary passes through `redactText` → `neutralizeInjection`: secrets are redacted and prompt-injection control phrases (chat-template markers like `<|im_start|>`/`[INST]`, instruction-override phrases, fake role turns) are defanged at write time, while genuine bug text ("user: null crashes", "revert the previous migration") is preserved.
- `agent-task-packet-check.mjs --template write` includes `taskId`, `lineageId`, reviewer contracts, reuse/TDD/simplifier fields, lifecycle receipt fields, and a stable packet hash; parallel or multi-file write scopes fail without lane limits, child-agent policy, completion receipt, spec reviewer, and quality reviewer requirements, and deep-stack/new-surface writes fail without their evidence fields.
- `deep-stack-check.mjs` is the single operator-facing deep-stack artifact gate. Final plans require `Deep stack artifacts:` by default and fail closed on missing source manifests, skill matrices, review phase records, TDD evidence, reuse inventories/bindings, high/blocker findings, completion gaps/reconciliation, TypeScript trigger mistakes, install-proof gaps, or Hybrid execution risk-tier violations. Historical plans can use the explicit transition flag only when they are not newly generated final plans. Install-proof stages accept `passed`, `planned`, `not_applicable`, or `blocked`; every `planned` stage carries the gate command in `command`; tier 3 takes `planned` at plan time, `not_applicable` when the plan changes no install surface, and never `blocked`. Because `validate-install-proof --artifact` and `validate-risk-tier --artifact` see no plan text, they assume an install surface and stay strict — run `validate-plan --plan` for the install-surface-aware verdict.
- `deep-audit-artifact-check.mjs` is the source gate for registered deep-audit category artifacts. It validates category registry alignment, all registered check ids, lane receipts, consumed worklist hashes, private-string redaction, coverage statements, and problem/cause/fix diagnostics before any deep-audit result is treated as complete.
- `execution-ledger.mjs` writes schema v2 ledgers with cwd/project id, events, phases, reviews, atomic updates, bound write evidence checks (`record-agent`, `record-review`, `check-bound-execute`), `check-spawn` spawn-guard enforcement (lane cap, wave 2+ merged review, review round cap, batch adoption, `review-scope.mjs` tier 0–2 gating, `--explain`, `record-spawn-registry`), content-addressed `treeHash` on `record-check`, atomic `record-task-bundle`, tier-scaled reopen caps on `record-review`, `record-decision`, `history --progress` (with `--renegotiation-check`), and task-bound `record-tdd`, `record-simplifier`, `record-specialist`, `record-completion-audit`, and `record-install-proof` rows.
- `etrnl-audit-docs` is the documentation-specialist health workflow. Use it when docs, ADRs, runbooks, API/runtime docs, AI context, or TSDoc/JSDoc are the target; it still inherits this repo's contract gates after repo-owned skill or docs changes.
- `docs/adr/` is the durable decision log. Keep implementation plans in ignored local planning paths such as `.claude/plans/` or `.planning/`; use ADRs for architecture, install topology, hook model, documentation-system, workflow-contract, or security-boundary decisions that future changes must preserve.
- `etrnl-comm-email-reply-quality` is the private outgoing-reply quality workflow. It pairs a local runtime draft-check gate with `humanizer-ptbr` cleanup for draft typography, Brazilian Portuguese, AI-tell issues, assistant meta text, stiff boilerplate, and fake deal commitments. Vale and LanguageTool are the next deterministic prose-lint layers to prototype before broadening runtime dependencies.
- `etrnl-ops-disk-cleanup` is the operations (host maintenance) storage-recovery workflow, not a dev execute skill. It requires host/filesystem evidence, a dry-run manifest, approved transient path classes, `trash` deletion, and before/after free-space verification so cleanup requests do not fight the generic dangerous-filesystem guard. See [hooks.md](hooks.md) for how pretool guards pair with this skill.
- `etrnl-audit-security` is the registered deep-audit security category. Findings must prove source, sink, missing control, exploit, reachability, confidence, impact, and remediation; clean rows must record explicit non-findings.
- `etrnl-dev-debug` is the root-cause debugging workflow. It classifies issues before edits, proves reproduction, traces bad values to the producer, limits speculative fix attempts, and verifies the original failing command or runtime symptom.
- `etrnl-dev-deps` is the dependency-maintenance workflow. It keeps dependency work compatibility-first, consolidates repeated workspace versions through existing catalogs or central version surfaces, records rollback commands, and reports audit, bot-PR, catalog, lockfile, and verification evidence.
- `skill-contract-check.mjs` rejects soft directive language and `model:`/`effort:` routing frontmatter in repo-owned skills and their reference docs. Workflow instructions use mandatory defaults plus explicit unavailable, not-applicable, or blocker paths, while skills inherit the active Claude model/context. `scripts/install.sh` replaces repo-owned skill directories in both `${CLAUDE_HOME:-$HOME/.claude}/skills` and `${CODEX_HOME:-$HOME/.codex}/skills`; rollback removes or restores those same repo-owned Codex copies without touching unrelated skills.
- `scripts/lib/audit-exclusions.mjs` is the shared exclusion policy for code-health inventory and documentation comment inventory. Vendor, build output, caches, local agent state, worktrees, generated folders, fixtures, logs, and `.audit` artifacts are listed or skipped with reasons; they are not audited as source/docs action items.
- `documentation-comment-health.mjs` is mandatory for documentation-health runs against JS/TS repos. Reports must include TSDOC/JSDOC and COMMENT_TARGET counters, or an explicit `COMMENT_HEALTH_NOT_APPLICABLE:` line with evidence.
- Documentation-health reports must also include AI-context counters as numeric lines: `AI_CONTEXT_FILES_REVIEWED: <n>`, `AI_CONTEXT_DRIFT_FINDINGS: <n>`, `AI_CONTEXT_DUPLICATE_RULE_OWNERS: <n>`, and `AI_CONTEXT_HOT_PATH_LEAKS: <n>`, or an explicit `AI_CONTEXT_NOT_APPLICABLE:` line with evidence.
- Documentation-health reports must include freshness/drift counters for recent commits reviewed, recent GitHub PRs reviewed or skipped with reason, recent-change docs-impact checks, checked doc claims, source-truth mappings, stale-reference searches, remaining outdated/stale/misleading docs, and active plan/work-queue stale docs; `100/100` is invalid while any docs in scope are unreviewed or any remaining-drift counter is nonzero.

Doctor reports installed hooks and agents, strict/observer mode, ledger and artifact directories, stale runs, unresolved review findings, browser/context artifact counts, prompt-budget drift, settings-audit external hook inventory, and optional Codex/Gemini/browser/design tool availability. Missing optional tools are reported as `not installed`; they are not hard failures unless a plan explicitly requires them.
Doctor runs `tests/test-read-stdin.sh` and executes `scripts/replay-hook-fixtures.mjs` in the heavy async batch (not syntax-only). Full doctor defaults to `tests/test-install-smoke.sh` with `RUN_INSTALL_SMOKE_MODE=fast` (~sub-second); set `ETRNL_DOCTOR_FULL_INSTALL=1` or `DOCTOR_INSTALL_SUITE=full` before release or install-path changes to run `tests/test-install.sh`. Schema JSON, settings audits, script fixture checks, and skill checks run in parallel; doctor reaps heavy async jobs on SIGINT/TERM. Guard/packet fixture matrices in `tests/test-hooks.sh` run in parallel via `tests/lib/parallel-run.sh` with per-worker guard state dirs.
When a check fails, doctor prints the failure message followed by an indented tail of the check's output and keeps the full log under `${TMPDIR:-/tmp}/etrnl-doctor-fail-logs.<pid>/<slot>.log` (named in the `fail:` line); failure logs are never truncated to a single line.

Opt-in incremental mode: `scripts/doctor.sh --changed` maps changed paths to twelve gate groups (`deps`, `syntax`, `hooks`, `skills`, `scripts`, `docs`, `rules`, `schemas`, `settings`, `install`, `security`, `optional`) and runs only the affected groups. Release files such as `VERSION` map to `docs` + `security`; `templates/*` map to `settings` + `install`; unmapped paths still fall open to a full doctor run. `--print-groups` lists the active group set; `--dry-run` resolves groups without executing gates. On green, doctor records a `doctor_green` event keyed by worktree hash so an unchanged tree can reuse the cached green result. Release and install paths must still run full doctor with `ETRNL_DOCTOR_FULL_INSTALL=1` (never pass `--changed` there). `tests/test-doctor-changed.sh` covers cache hits, fall-open, and group introspection.
`execution-wave-check.mjs` JSON output includes `schemaVersion`, `waves`, and `drift`. `drift` reports added/removed plans, wave changes, and order-insensitive file membership changes. With `--strict`, the command fails when any wave has `parallelSafe === false` or when `drift.length > 0`.
It also enforces changelog release hygiene via `changelog-release-check.mjs --strict-unreleased` and `release.mjs check`: `## Unreleased` must stay empty on release commits, each shipped section uses Keep a Changelog categories, `VERSION` matches the top release, and git tags align with shipped versions. Maintainer workflow: `docs/RELEASING.md`.
## Live Canaries

```bash
scripts/canary-websearch.sh
scripts/canary-hindsight.sh --json
node scripts/canary-codex-hindsight.mjs --json
```

## Optional Repo-Health Tools

Run when installed and relevant to the target repo:

- `knip` for unused files, exports, and dependencies.
- `fallow` as an experimental all-in-one JS/TS health scanner.
- `jscpd` for syntactic duplication.
- `dependency-cruiser` or `madge` for dependency graphs, cycles, and boundaries.
- CodeGraph MCP for local code graph queries when the repo already has MCP-capable tooling.
- React Doctor for React performance and compiler-health scans.
- Brooks-Lint as a companion critique pass for naming, clarity, duplication, and executable-review pressure.
- `markdownlint-cli2`, `cspell`, and `vale` for docs/prose quality.
- `typedoc` and API Extractor for public package APIs.
- `opengrep`, Semgrep Community, or CodeQL for static security checks.
- Repomix or Code2Prompt for AI-ready context packs with ignore and secret scanning.

If an optional tool is missing, record it as `not installed` in the findings ledger. Do not fail the audit unless the repo's own health stack marks it required.
