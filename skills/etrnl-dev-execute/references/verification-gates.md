# Verification gates (Browser-QA and react-doctor)

Load this module when the execution ledger or plan triggers Browser-QA v2 or react-doctor gates.

Helper paths: `node scripts/browser-qa-report.mjs` in a source checkout, `node ~/.claude/scripts/browser-qa-report.mjs` after install. Commands below show the installed form; substitute the resolved prefix.

## Browser-QA v2 completion gate

**Capture hash and create.** Capture `<worktree-hash>` before writing the report file (so an in-repo artifact path cannot mutate the hash mid-run):

```bash
node ~/.claude/scripts/browser-qa-report.mjs create --schema-version 2 --status complete \
  --tree-hash <worktree-hash> ...
```

Each complete non-skipped matrix row needs a valid `status`, numeric `consoleErrors` and `failedRequests`, fresh row-level `capturedAt`, `provenance.tool`, fresh `provenance.capturedAt`, screenshot + hash, and the route/viewport coverage the plan names.

Complete reports also need report-level `provenance.treeHash`, `provenance.tool`, `provenance.targetUrl`, `provenance.command`, and fresh `provenance.capturedAt`.

**Validate before completion:**

```bash
node ~/.claude/scripts/browser-qa-report.mjs validate <report-path> \
  --artifact-root <artifact-root> \
  --require-complete \
  --tree-hash <worktree-hash>
```

**Require exit 0.** `--require-complete` rejects `status: draft` and requires `--tree-hash`. `--tree-hash` binds `provenance.treeHash` to the worktree captured at create time.

## React-doctor gate (React/Next UI scope)

When ledger task-changed files include React/Next UI (`.tsx`/`.jsx`, or `app/`/`src/` under Next):

**Run when installed** (no project positional):

```bash
npx --no-install react-doctor --scope changed --base <ledger-base-commit> --blocking error
```

**Map each reported file** to ledger task-changed files:

- **In-scope finding:** triage to resolution or `record-check --status failed` before completion.
- **Out-of-scope finding:** working-note only; never blocks.
- **Clean in-scope run:** `record-check --status passed`.

**Missing react-doctor:** block completion or require an owner-approved exception with compensating verification — do not treat unavailability as pass.

**Genuinely N/A scope:** `record-decision` with rationale; do not invent `record-check` statuses for those paths.
