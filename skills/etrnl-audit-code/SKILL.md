---
name: etrnl-audit-code
description: ETRNL master code-health router. Use when the user asks for "code health", "audit the whole codebase", "no skips", "repo rot", "dead code", "architecture health", "docs health", "PR gate", or a full codebase audit with no loose ends.
disable-model-invocation: true
---
# ETRNL Code Health

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-code`; on update, ask update/snooze/continue.

Run code health as a closed-loop audit, not as a vague lint pass. Route to deterministic tools first, then companion skills, then fixes only when explicitly requested.

## Modes

- `snapshot`: read-only dashboard of current health.
- `rot`: dead code, unused deps/exports, duplicate logic, god files, stale TODOs, confidence levels.
- `architecture`: Brooks-style module/layering/dependency graph review.
- `docs`: TSDoc/TypeDoc/API Extractor, markdownlint, CSpell, Vale, docs freshness.
- `pr-gate`: changed-files plus required repo gates; use for pre-merge confidence, not whole-repo certification.
- `fix`: apply fixes only after audit evidence exists or the user explicitly asks to fix all valid findings.
- `no-skips`: every tracked file is inventoried and every finding is dispositioned.

## TDD Enforcement (skill_process)

When the audit triggers fixes, apply red-green-refactor discipline:

1. For each finding that maps to a regression or missing test: identify the test file or command that would catch it.
2. Confirm the test currently fails (red) before applying a fix. If no test exists, write the minimal test first.
3. Apply the fix (green). Confirm the test passes.
4. Rerun the canonical health gate - `tests/test-hooks.sh` and `scripts/doctor.sh` - not just the changed paths, and require both to pass before marking the finding `fixed`.

Do not mark a finding `fixed` based on inspection alone. Require a passing gate run as evidence.

## Required Flow

1. Inventory the repo:
   - Use `node ~/.claude/scripts/code-health-inventory.mjs --json` when installed.
   - If not installed, use `node scripts/code-health-inventory.mjs --json` inside the repository being audited.
   - Use `--json` for any programmatic parsing; plain `git ls-files` is only a last-resort list and must be converted into the coverage ledger before reporting coverage.
   - Preserve inventory `riskHotspots` rows emitted by the helper. Treat them as deterministic prioritization inputs for review order, not as findings by themselves.
   - Classify every tracked file by source, test, docs, config, script, migration, fixture/generated, or asset.
   - List vendor, dependency, build output, cache, generated, fixture, local agent state, worktree, log, and audit-artifact paths as explicit exclusions with reasons. Do not audit them as source, docs, config, or action items.
   - Run external tools with ignore/exclude settings for the same exclusions before trusting their finding counts.
2. Load the repo health stack:
   - Use `docs/health-stack.md` when it exists.
   - Otherwise search for a `## Health Stack` block in `AGENTS.md`, `CLAUDE.md`, `README.md`, or project docs.
   - If no stack exists, detect commands from package/build config and record the missing Health Stack as a finding.
3. Run deterministic gates before AI review:
   - Typecheck, lint/format check, test, build.
   - Dead code/unused deps: Knip first for JS/TS when available; Fallow as a trial tool, not assumed law.
   - Duplication: jscpd for syntactic clones.
   - Dependency graph: dependency-cruiser or madge.
   - Docs/prose: TSDoc/TypeDoc/API Extractor, markdownlint-cli2, CSpell, Vale.
   - Security/static rules: OpenGrep, Semgrep Community, or CodeQL when configured.
4. Run companion reviews:
   - `etrnl-code-review-excellence` for architecture/module decay (Brooks modules).
   - `finding-duplicate-functions` for semantic duplicates after syntactic clone checks.
   - `code-simplifier` after implementation or when AI bloat is suspected.
   - `eternal-best-practices` for auth, tenant, money, payments, i18n, Prisma, permissions, and soft-delete surfaces.
   - `ast-grep` for structural naming/import/API-pattern sweeps.
5. Create a findings ledger.
6. Fix in batches only when the mode allows edits.
7. Rerun the canonical health gate (`tests/test-hooks.sh` and `scripts/doctor.sh`), not changed-files-only, before declaring whole-codebase health.

## No-Skips Contract

For an entire-codebase audit, refuse to say done unless:

- every tracked file appears in the inventory;
- every exclusion is listed with a reason;
- every tool failure blocks completion or has an explicit accepted-risk disposition;
- every finding is `fixed`, `false-positive`, `accepted-risk`, or `blocked`;
- final verification reruns the full repo health stack cleanly.

## Findings Ledger

Use this schema:

```markdown
| ID | File | Line | Category | Severity | Evidence | Fix | Status | Verification |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
```

Valid statuses:

- `fixed`
- `false-positive`
- `accepted-risk`
- `blocked`

Do not use `later`, `TODO`, `follow-up`, or blank status.

## Tool Defaults

For JS/TS repos, standardize on:

- Knip for unused files, exports, and dependencies.
- Existing ESLint/Oxlint/Biome rather than blind migration.
- Fallow is non-canonical experimental evidence: run it only when already configured or explicitly requested, and never use it as the sole health verdict.
- dependency-cruiser plus boundary lint rules for architecture.
- jscpd plus `finding-duplicate-functions` for duplicate coverage.
- TSDoc/TypeDoc/API Extractor for public APIs.
- Vale, markdownlint-cli2, and CSpell for prose.
- OpenGrep/Semgrep/CodeQL only where configured and useful.
- Serena, Repomix, or Code2Prompt for AI context and symbol-aware navigation.

Fail-open React/Next pass: when the changed set includes React/Next files (`.tsx`/`.jsx`, or `app/`/`src/` under Next), run `npx --no-install react-doctor --diff` (use `react-doctor --diff` when the binary is on PATH). Run it diff-only so legacy code produces no noise, and fold its findings into the ledger. This pass is fail-open: when react-doctor is not installed, record it as an unavailable check and continue the audit. Never block the audit on react-doctor's absence.

## Output

For `snapshot` and `no-skips`, return:

- coverage map summary;
- explicit exclusions;
- commands run and results;
- findings by status;
- unresolved blockers;
- final gate status.

## Common Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The lint pass was green, so the codebase is healthy." | Green lint proves style, not coverage. Run the inventory and disposition every tracked file before you claim health. |
| "This directory is obviously dead, skip inventorying it." | Inventory it and mark it `accepted-risk` or delete it with evidence. Unlisted files are silent gaps, not exclusions. |
| "Knip flagged 40 unused exports; too many to triage now." | Triage all 40 in the ledger. Every finding gets `fixed`, `false-positive`, `accepted-risk`, or `blocked` before done. |
| "I only touched three files, so audit only those." | That is `pr-gate`, not whole-repo health. Whole-codebase health inventories every tracked file, not the diff. |
| "The dead-code tool crashed on this repo, move on." | A tool failure blocks completion or gets an explicit accepted-risk disposition. Do not drop it silently. |

## Red Flags

- A tracked file returned by `code-health-inventory.mjs` that has no ledger row and no exclusion reason (unaccounted file).
- A findings-ledger row whose Status is empty, `later`, `TODO`, or `follow-up` (non-terminal disposition banned by the no-skips contract).
- An `accepted-risk` ledger row with no named owner or risk-acceptance evidence in the Evidence column.
- A completion claim where `tests/test-hooks.sh` or `scripts/doctor.sh` ran only against changed files, not the full repo gate.
- An external tool (Knip, jscpd, dependency-cruiser, Semgrep) run without the inventory exclusion set, so vendor and generated paths inflate finding counts.
- A "docs health" or "dead code" verdict sourced from Fallow alone, treated as canonical instead of trial evidence.

## When NOT to use

- Deep security-vulnerability hunting on auth, tenancy, or payment surfaces: hand off to etrnl-audit-security.
- Reviewing a single pull request or diff for correctness before merge: use etrnl-quality-reviewer.
- Documentation-only health passes (TSDoc, README, ADR freshness) as the primary goal: use etrnl-audit-docs.
- Runtime latency, bundle size, or query-plan profiling: use etrnl-audit-performance.

## Verification

PASS/FAIL checklist (any FAIL marks the run incomplete):

- [ ] Inventory ran and every tracked file lands in the coverage map.
- [ ] Every excluded path carries a reason.
- [ ] Every findings-ledger row holds a terminal status (`fixed`, `false-positive`, `accepted-risk`, or `blocked`).
- [ ] Every tool failure blocks completion or holds an explicit accepted-risk disposition.
- [ ] Final verification reran the full repo gate, not changed-files-only.

Red-capable gate (fails when the repo cannot be fully inventoried):

```bash
node scripts/code-health-inventory.mjs --json --quiet
```

Exit code 0 means every tracked file was classified into the coverage map. A non-zero exit (git failure, unknown option, or unreadable root) fails the inventory step and blocks a health verdict.

No-skips ledger gate (fails when any finding carries a non-terminal disposition):

```bash
printf '%s' "$CODE_HEALTH_STATE_JSON" | node scripts/code-health-ledger-check.mjs
```

Empty stdout means the ledger passed. Any status token on stdout (`open-findings`, `open-action-items`, `accepted-risk-missing-owner`, `missing-inventory`, `missing-coverage-map`) names the exact defect and fails the run. A non-zero exit code (2) means the input JSON was malformed and also fails the run.
