# Health Stack

Use this stack when running `etrnl-audit-code` in this repo.

## Deep-Audit Skills

- `etrnl-deep-audit` bundled `repo-hygiene` category: organization, generated artifacts, dead files, and public-boundary drift; see `skills/etrnl-deep-audit/references/categories/repo-hygiene.md` and `scripts/lib/deep-audit-categories.mjs`.
- `etrnl-deep-audit-ux`: standalone `ui-ux-product` deep-audit category (excluded from `all_registered`); see `skills/etrnl-deep-audit-ux/references/audit-checks.md`.
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
node scripts/session-audit.mjs --since-days 3 --json
node scripts/stack-profile-check.mjs templates/stack-profile.core.json --json
node scripts/stack-profile-check.mjs templates/stack-profile.full.json --json
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
tests/test-read-stdin.sh
node scripts/replay-hook-fixtures.mjs
node scripts/changelog-release-check.mjs --strict-unreleased --allow-clean-history-changelog
node scripts/release.mjs check
scripts/doctor.sh [--jobs N]  # parallel syntax + heavy suites; default jobs=4, override with DOCTOR_JOBS
node scripts/settings-audit.mjs templates/settings.json --strict-conflicts
node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts
scripts/canary-hindsight.sh --json
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
  scripts/live-hook-noise-report.mjs \
  scripts/session-audit.mjs \
  scripts/disk-cleanup-manifest.mjs \
  scripts/performance-baseline.mjs \
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
node scripts/workflow-health.mjs doctor --json --all
node scripts/workflow-health.mjs doctor --json --all --strict
node scripts/workflow-health.mjs prune --older-than-days 30 --dry-run --all
node scripts/tool-effectiveness.mjs summarize --since-days 7 --all --projects-config "$HOME/.claude/etrnl/tool-effectiveness/projects.json" --json
node scripts/tool-effectiveness.mjs doctor --json
node scripts/live-hook-noise-report.mjs --since-days 3 --json
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
node scripts/project-buglog.mjs validate
node scripts/project-buglog.mjs suggest --file <path> --json
node scripts/project-buglog.mjs suggest-project --json
node scripts/browser-qa-report.mjs summary
node scripts/context-state.mjs list
node scripts/pr-preflight.mjs status --json
node scripts/update-check.mjs --explain
scripts/post-upgrade-canary.sh
```

- `.github/workflows/health.yml` runs the repository health pipeline in GitHub Actions on every pull request, on pushes to `main`, and on pushes to `release/**` branches. The workflow validates generated rule exports, then runs `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, `tests/test-install.sh`, and `scripts/doctor.sh --jobs 4`.
- The workflow is the hosted counterpart to the Required Gates block above: `sync-rule-exports.mjs --check` covers generated rule drift, the hook/workflow/install suites cover runtime behavior and rollback safety, and `scripts/doctor.sh --jobs 4` replays the aggregated syntax, ShellCheck, manifest, privacy, documentation, and heavy-suite health checks.
- `scripts/workflow-health.mjs` reads run ledgers in parallel with `ETRNL_LEDGER_READ_CONCURRENCY` (default `8`, capped at `12` for constrained systems). `workflow-health.mjs status` is the concise text surface used by SessionStart hints; `status --json` is the machine-readable surface for active run id, unfinished work, missing artifacts, browser/context freshness, phase/UAT state, stale run count, and the next deterministic action. Use `workflow-health.mjs doctor --strict` or `ETRNL_WORKFLOW_HEALTH_STRICT=1` when live runtime findings must fail closed instead of remaining diagnostic.
- `tool-effectiveness.mjs` summarizes sanitized local tool events into deterministic `keep`, `enforce`, `repo-specific`, `remove-watch`, or `insufficient-data` verdicts. It reads hook tool-signal state, optional local event artifacts, and explicit Codex imports; it rejects raw prompts, transcript text, secrets, private transcript paths, and tracked private project names. Use the seven-day `summarize` command above to revisit CodeGraph, Beads, and stolen hook patterns without manual log reading.
- `etrnl-state.mjs` is the canonical local state helper for compact lifecycle and small workflow events. It writes append-only JSONL under `~/.claude/etrnl/state`, rebuilds compact handoff views, rejects raw prompts/transcripts/private paths/secrets before append, and exposes `compact-handoff`, `stop-status`, `doctor`, `bead-link`, and `bead-prime-audit`. Hook hot paths may use bounded state appends and queries only.
- `tool-stack-check.mjs` is the installed health surface for CodeGraph, Beads, and Hindsight plugin posture. Hindsight install detection prefers `claude plugin list` when the CLI is on PATH, then falls back to versioned directories under `~/.claude/plugins/cache/` so SessionStart and skill-update hooks do not false-positive when hook PATH lacks nvm-managed `claude`. `update-check.mjs` includes its missing/update signals, and `cc-userprompt-router.sh` uses that combined update signal to ask before requested `etrnl-*` skill invocations when CodeGraph, Beads, or repo-owned skills are stale.
- `stack-profile-check.mjs` validates the public `core` and `full` stack manifests so installer dry-runs, staged installs, and doctor runs cannot silently omit Hindsight, Beads, or CodeGraph from the full profile.
- `settings-audit.mjs` reports repo-owned hooks, outside-settings plugin hook manifests, memory-affecting plugin hooks, unsupported top-level settings such as `autoCompactWindow` and `skipAutoPermissionPrompt`, and enabled memory plugin config posture.
- `cc-precompact-save.sh` records bounded `compact_pre` events, `cc-postcompact-record.sh` records Claude compact summaries as `compact_post` with stale-verification state, and synchronous `cc-sessionstart-restore.sh` injects only the bounded `compact-handoff` packet on `source=compact`.
- `browser-qa-report.mjs` supports schema v1 plus schema v2 matrix reports; a completed v2 report must include route/viewport rows, numeric `consoleErrors` and `failedRequests`, fresh screenshot captures, matching `screenshotSha256`, and provenance with tool, target URL, command, and capture time.
- `pr-preflight.mjs` reports branch, upstream, dirty state, existing PR, GitHub auth, PR checks, and local gate hints before PR creation or readiness claims.
- `performance-baseline.mjs` validates repeatable performance baseline artifacts with measurements, thresholds, and `nextRun.command`; use `trend` to compare before/after baselines.
- `disk-cleanup-manifest.mjs` validates cleanup manifests before mutation, requiring absolute paths, safe commands, risk tiers, and explicit approval fields for tier 2 or tier 3 rows.
- `project-buglog.mjs suggest --json` emits redacted local suggestions with severity, fingerprint, last-seen, and suggested guard; `suggest-project --json` aggregates repeated lessons across files, gives cross-session project hints without returning the raw cwd, and includes up to 5 most recent affected files for generic repeat-edit patterns. Hooks debounce these hints and honor `ETRNL_LEARNING_HINTS=0`.
- `agent-task-packet-check.mjs --template write` includes `taskId`, `lineageId`, reviewer contracts, reuse/TDD/simplifier fields, lifecycle receipt fields, and a stable packet hash; parallel or multi-file write scopes fail without lane limits, child-agent policy, completion receipt, spec reviewer, and quality reviewer requirements, and deep-stack/new-surface writes fail without their evidence fields.
- `deep-stack-check.mjs` is the single operator-facing deep-stack artifact gate. Final plans require `Deep stack artifacts:` by default and fail closed on missing source manifests, skill matrices, review phase records, TDD evidence, reuse inventories/bindings, high/blocker findings, completion gaps/reconciliation, TypeScript trigger mistakes, install-proof gaps, or Hybrid execution risk-tier violations. Historical plans can use the explicit transition flag only when they are not newly generated final plans.
- `deep-audit-artifact-check.mjs` is the source gate for registered deep-audit category artifacts. It validates category registry alignment, all registered check ids, lane receipts, consumed worklist hashes, private-string redaction, coverage statements, and problem/cause/fix diagnostics before any deep-audit result is treated as complete.
- `execution-ledger.mjs` writes schema v2 ledgers with cwd/project id, events, phases, reviews, atomic updates, bound write evidence checks (`record-agent`, `record-review`, `check-bound-execute`), and task-bound `record-tdd`, `record-simplifier`, `record-specialist`, `record-completion-audit`, and `record-install-proof` rows.
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
Doctor runs `tests/test-read-stdin.sh` and executes `scripts/replay-hook-fixtures.mjs` in the heavy async batch (not syntax-only). Use `scripts/doctor.sh --jobs N` or `DOCTOR_JOBS` to tune parallel syntax and heavy-suite concurrency.
`execution-wave-check.mjs` JSON output includes `schemaVersion`, `waves`, and `drift`. `drift` reports added/removed plans, wave changes, and order-insensitive file membership changes. With `--strict`, the command fails when any wave has `parallelSafe === false` or when `drift.length > 0`.
It also enforces changelog release hygiene via `changelog-release-check.mjs --strict-unreleased` and `release.mjs check`: `## Unreleased` must stay empty on release commits, each shipped section uses Keep a Changelog categories, `VERSION` matches the top release, and git tags align with shipped versions. Maintainer workflow: `docs/RELEASING.md`.
## Live Canaries

```bash
scripts/canary-websearch.sh
scripts/canary-hindsight.sh --json
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
