# Health Stack

Use this stack when running `etrnl-code-health` in this repo.

## Required Gates

```bash
node scripts/code-health-inventory.mjs --json
tests/test-hooks.sh
scripts/doctor.sh
bash -n hooks/*.sh scripts/*.sh tests/test-hooks.sh
node --check scripts/merge-settings.mjs scripts/code-health-inventory.mjs hooks/lib/complexity-check.mjs
jq empty templates/settings.json templates/settings.strict.json hooks/fixtures/events/*.json
git diff --check  # use `rtk git diff --check` when local hooks require RTK
```

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
