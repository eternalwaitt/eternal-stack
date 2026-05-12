# Health Stack

Use this stack when running `etrnl-code-health` in this repo.

## Required Gates

```bash
node scripts/code-health-inventory.mjs --json --include-untracked
# Research checks are split so each stage fails with clear scope:
# validate-manifest (structure), validate-evidence (evidence rows), validate-scorecard (skills/evidence parity).
node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json
node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json
node scripts/research-competitor-intel.mjs validate-scorecard --scorecard docs/research/parity-scorecard.json --skills-file scripts/lib/skill-lists.sh --evidence docs/research/capability-evidence.json
tests/test-hooks.sh
tests/test-workflow-tools.sh
tests/test-install.sh
node scripts/replay-hook-fixtures.mjs  # executes replay fixtures; doctor.sh below only syntax-checks it
scripts/doctor.sh
fd -t f -e sh . hooks scripts tests -x bash -n
fd -t f -e sh . hooks scripts tests -X shellcheck -x
node --check \
  scripts/merge-settings.mjs \
  scripts/code-health-inventory.mjs \
  scripts/research-competitor-intel.mjs \
  scripts/lib/research-intel-core.mjs \
  scripts/lib/research-intel-render.mjs \
  scripts/lib/research-intel-validators.mjs \
  scripts/plan-readiness-check.mjs \
  scripts/agent-task-packet-check.mjs \
  scripts/guard-override-token.mjs \
  scripts/replay-hook-fixtures.mjs \
  scripts/execution-ledger.mjs \
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
node scripts/prompt-budget-check.mjs .
node scripts/prompt-budget-check.mjs ~/.claude --owned-only
node scripts/review-log.mjs summary
node scripts/project-buglog.mjs validate
node scripts/browser-qa-report.mjs summary
node scripts/context-state.mjs list
```

`scripts/workflow-health.mjs` reads run ledgers in parallel with `ETRNL_LEDGER_READ_CONCURRENCY` (default `8`, capped at `12` for constrained systems).

Doctor reports installed hooks and agents, strict/observer mode, ledger and artifact directories, stale runs, unresolved review findings, browser/context artifact counts, prompt-budget drift, and optional Codex/Gemini/browser/design tool availability. Missing optional tools are reported as `not installed`; they are not hard failures unless a plan explicitly requires them.
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
- `markdownlint-cli2`, `cspell`, and `vale` for docs/prose quality.
- `typedoc` and API Extractor for public package APIs.
- `opengrep`, Semgrep Community, or CodeQL for static security checks.
- Repomix or Code2Prompt for AI-ready context packs with ignore and secret scanning.

If an optional tool is missing, record it as `not installed` in the findings ledger. Do not fail the audit unless the repo's own health stack marks it required.
