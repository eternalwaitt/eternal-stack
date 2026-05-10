---
name: etrnl-code-health
description: ETRNL control-plane master code-health router. Use when the user asks for "code health", "audit the whole codebase", "no skips", "repo rot", "dead code", "architecture health", "docs health", "PR gate", or a full codebase audit with no loose ends.
model: opus
effort: high
---
# ETRNL Code Health

Run code health as a closed-loop audit, not as a vague lint pass. Route to deterministic tools first, then companion skills, then fixes only when explicitly requested.

## Modes

- `snapshot`: read-only dashboard of current health.
- `rot`: dead code, unused deps/exports, duplicate logic, god files, stale TODOs, confidence levels.
- `architecture`: Brooks-style module/layering/dependency graph review.
- `docs`: TSDoc/TypeDoc/API Extractor, markdownlint, CSpell, Vale, docs freshness.
- `pr-gate`: changed-files plus required repo gates; use for pre-merge confidence, not whole-repo certification.
- `fix`: apply fixes only after audit evidence exists or the user explicitly asks to fix all valid findings.
- `no-skips`: every tracked file is inventoried and every finding is dispositioned.

## Required Flow

1. Inventory the repo:
   - Prefer `node ~/.claude/scripts/code-health-inventory.mjs --json`.
   - If not installed, use `node scripts/code-health-inventory.mjs --json` inside the repository being audited.
   - Use `--json` for any programmatic parsing; plain `git ls-files` is only a last-resort list and must be converted into the coverage ledger before reporting coverage.
   - Classify every tracked file by source, test, docs, config, script, migration, fixture/generated, or asset.
2. Load the repo health stack:
   - Prefer `docs/health-stack.md`.
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
   - `brooks-audit` for architecture/module decay.
   - `finding-duplicate-functions` for semantic duplicates after syntactic clone checks.
   - `code-simplifier` after implementation or when AI bloat is suspected.
   - `eternal-best-practices` for auth, tenant, money, payments, i18n, Prisma, permissions, and soft-delete surfaces.
   - `ast-grep` for structural naming/import/API-pattern sweeps.
5. Create a findings ledger.
6. Fix in batches only when the mode allows edits.
7. Rerun the full required gate, not changed-files-only, before declaring whole-codebase health.

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
- Fallow is optional/experimental: pilot it as an all-in-one health scanner, but do not require it for normal execution.
- dependency-cruiser plus boundary lint rules for architecture.
- jscpd plus `finding-duplicate-functions` for duplicate coverage.
- TSDoc/TypeDoc/API Extractor for public APIs.
- Vale, markdownlint-cli2, and CSpell for prose.
- OpenGrep/Semgrep/CodeQL only where configured and useful.
- Serena, Repomix, or Code2Prompt for AI context and symbol-aware navigation.

## Output

For `snapshot` and `no-skips`, return:

- coverage map summary;
- explicit exclusions;
- commands run and results;
- findings by status;
- unresolved blockers;
- final gate status.
