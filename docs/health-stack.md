# Health Stack

Use this stack when running `etrnl-code-health` in this repo.

## Required Gates

```bash
node scripts/code-health-inventory.mjs --json --quiet --include-untracked
node scripts/documentation-comment-health.mjs --root . --json --include-untracked
# Research checks are split so each stage fails with clear scope:
# validate-manifest (structure), validate-evidence (evidence rows), validate-scorecard (skills/evidence parity).
node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json
node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json
node scripts/research-competitor-intel.mjs validate-scorecard --scorecard docs/research/parity-scorecard.json --skills-file scripts/lib/skill-lists.sh --evidence docs/research/capability-evidence.json
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
node scripts/replay-hook-fixtures.mjs  # executes replay fixtures; doctor.sh below only syntax-checks it
node scripts/settings-audit.mjs templates/settings.json
node scripts/settings-audit.mjs templates/settings.strict.json
node scripts/update-check.mjs --fingerprint-source .
scripts/doctor.sh
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
  scripts/research-competitor-intel.mjs \
  scripts/deep-stack-check.mjs \
  scripts/lib/deep-stack-artifacts.mjs \
  scripts/lib/research-intel-core.mjs \
  scripts/lib/research-intel-render.mjs \
  scripts/lib/research-intel-validators.mjs \
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
  scripts/workflow-health.mjs \
  scripts/prompt-budget-check.mjs \
  scripts/changelog-release-check.mjs \
  scripts/port-guard.mjs \
  hooks/lib/complexity-check.mjs
jq empty templates/settings.json templates/settings.strict.json hooks/fixtures/events/*.json hooks/fixtures/events/replay/*.json
git diff --check  # use `rtk git diff --check` when local hooks require RTK
```

Workflow health:

```bash
node scripts/workflow-health.mjs
node scripts/workflow-health.mjs status
node scripts/workflow-health.mjs status --json
node scripts/workflow-health.mjs doctor --json --all
node scripts/workflow-health.mjs prune --older-than-days 30 --dry-run --all
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
node scripts/update-check.mjs --explain
scripts/post-upgrade-canary.sh
```

- `scripts/workflow-health.mjs` reads run ledgers in parallel with `ETRNL_LEDGER_READ_CONCURRENCY` (default `8`, capped at `12` for constrained systems). `workflow-health.mjs status` is the concise text surface used by SessionStart hints; `status --json` is the machine-readable surface for active run id, unfinished work, missing artifacts, browser/context freshness, phase/UAT state, stale run count, and the next deterministic action.
- `cc-postcompact-record.sh` records compact timestamp/count metadata, and `cc-sessionstart-restore.sh` includes compact recovery plus workflow status when unfinished/stale work or UAT findings exist.
- `browser-qa-report.mjs` supports schema v1 plus schema v2 matrix reports; a completed v2 report must include route/viewport rows, numeric `consoleErrors` and `failedRequests`, fresh screenshot captures, matching `screenshotSha256`, and provenance with tool, target URL, command, and capture time.
- `project-buglog.mjs suggest --json` emits redacted local suggestions with severity, fingerprint, last-seen, and suggested guard; `suggest-project --json` aggregates repeated lessons across files, gives cross-session project hints without returning the raw cwd, and includes recent affected files for generic repeat-edit patterns. Hooks debounce these hints and honor `CLAUDE_CONTROL_PLANE_LEARNING_HINTS=0`.
- `agent-task-packet-check.mjs --template write` includes `taskId`, `lineageId`, reviewer contracts, reuse/TDD/simplifier fields, lifecycle receipt fields, and a stable packet hash; parallel or multi-file write scopes fail without lane limits, child-agent policy, completion receipt, spec reviewer, and quality reviewer requirements, and deep-stack/new-surface writes fail without their evidence fields.
- `deep-stack-check.mjs` is the single operator-facing deep-stack artifact gate. Final plans require `Deep stack artifacts:` by default and fail closed on missing source manifests, skill matrices, review phase records, TDD evidence, reuse inventories/bindings, high/blocker findings, completion gaps/reconciliation, TypeScript trigger mistakes, install-proof gaps, or Hybrid execution risk-tier violations. Historical plans can use the explicit transition flag only when they are not newly generated final plans.
- `execution-ledger.mjs` writes schema v2 ledgers with cwd/project id, events, phases, reviews, atomic updates, bound write evidence checks (`record-agent`, `record-review`, `check-bound-execute`), and task-bound `record-tdd`, `record-simplifier`, `record-specialist`, `record-completion-audit`, and `record-install-proof` rows.
- `etrnl-documentation-health` is the documentation-specialist health workflow. Use it when docs, ADRs, runbooks, API/runtime docs, AI context, or TSDoc/JSDoc are the target; it still inherits this repo's contract gates after repo-owned skill or docs changes.
- `docs/adr/` is the durable decision log. Keep implementation plans in `docs/plans/`; use ADRs for architecture, install topology, hook model, documentation-system, workflow-contract, or security-boundary decisions that future changes must preserve.
- `etrnl-email-reply-quality` is the VIVAZ outgoing-reply quality workflow. It pairs the runtime `vivaz-email drafts check` gate with `humanizer-ptbr` cleanup for draft typography, Brazilian Portuguese, AI-tell issues, assistant meta text, stiff boilerplate, and fake deal commitments. Vale and LanguageTool are the next deterministic prose-lint layers to prototype before broadening runtime dependencies.
- `etrnl-disk-cleanup` is the local storage-recovery workflow. It requires host/filesystem evidence, a dry-run manifest, approved transient path classes, `trash` deletion, and before/after free-space verification so cleanup requests do not fight the generic dangerous-filesystem guard.
- `skill-contract-check.mjs` rejects soft directive language in repo-owned skills and their reference docs. Workflow instructions use mandatory defaults plus explicit unavailable, not-applicable, or blocker paths.
- `scripts/lib/audit-exclusions.mjs` is the shared exclusion policy for code-health inventory and documentation comment inventory. Vendor, build output, caches, local agent state, worktrees, generated folders, fixtures, logs, and `.audit` artifacts are listed or skipped with reasons; they are not audited as source/docs action items.
- `documentation-comment-health.mjs` is mandatory for documentation-health runs against JS/TS repos. Reports must include TSDOC/JSDOC and COMMENT_TARGET counters, or an explicit `COMMENT_HEALTH_NOT_APPLICABLE:` line with evidence.

Doctor reports installed hooks and agents, strict/observer mode, ledger and artifact directories, stale runs, unresolved review findings, browser/context artifact counts, prompt-budget drift, settings-audit external hook inventory, and optional Codex/Gemini/browser/design tool availability. Missing optional tools are reported as `not installed`; they are not hard failures unless a plan explicitly requires them.
It also enforces changelog release hygiene: on `main`, `## Unreleased` must be empty, and post-tag commits require the first dated release section to advance beyond the latest git tag.
Research artifacts record real extraction timestamps (`generatedAt`, `lastValidated`, `nextScan`) so staleness checks and refresh cadence remain auditable and current.
`docs/research/top10-lock.json` is a committed reproducibility snapshot (includes `schemaVersion`) and is regenerated intentionally using `node scripts/research-competitor-intel.mjs extract --manifest docs/research/top10-lock.json --repos-root <repos-dir> --out docs/research/capability-evidence.json --write-manifest` when refreshing the competitor lock set.
`docs/research/parity-scorecard.schema.json` (`scorecards.minItems`) is coupled to `scripts/lib/skill-lists.sh` `OWNED_SKILLS`; when skills change, update both surfaces in the same release and rerun `tests/test-workflow-tools.sh`.

## Live Canaries

```bash
scripts/canary-websearch.sh
scripts/canary-hindsight.sh
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
