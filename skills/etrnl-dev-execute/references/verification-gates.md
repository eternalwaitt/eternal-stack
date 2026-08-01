# Verification gates (Browser-QA and react-doctor)

Load this module when the execution ledger or plan triggers Browser-QA v2 or react-doctor gates.

Helper paths: `node scripts/browser-qa-report.mjs` in a source checkout, `node ~/.claude/scripts/browser-qa-report.mjs` after install. Commands below show the installed form; substitute the resolved prefix.

## Browser-QA v2 completion gate

1. Capture `<worktree-hash>` before writing the report file (so an in-repo artifact path cannot mutate the hash mid-run). Create with:

```bash
node ~/.claude/scripts/browser-qa-report.mjs create --schema-version 2 --status complete \
  --tree-hash <worktree-hash> ...
```

Each complete matrix row needs `provenance.tool`, fresh `provenance.capturedAt`, screenshot + hash, and the route/viewport coverage the plan names.

2. Before claiming completion, run:

```bash
node ~/.claude/scripts/browser-qa-report.mjs validate <report-path> \
  --artifact-root <artifact-root> \
  --require-complete \
  --tree-hash <worktree-hash>
```

3. Require exit 0. `--require-complete` rejects `status: draft` and requires `--tree-hash`. `--tree-hash` binds `provenance.treeHash` to the worktree captured at create time.

## React-doctor gate (React/Next UI scope)

When ledger task-changed files include React/Next UI (`.tsx`/`.jsx`, or `app/`/`src/` under Next):

1. Run when installed (no project positional):

```bash
npx --no-install react-doctor --scope changed --base <ledger-base-commit> --blocking error
```

2. Map each reported file to ledger task-changed files:
   - **In-scope finding:** triage to resolution or `record-check --status failed` before completion.
   - **Out-of-scope finding:** working-note only; never blocks.
   - **Clean in-scope run:** `record-check --status passed`.
3. Missing react-doctor or genuinely N/A scope: `record-decision` with rationale — never invent `record-check` statuses for those paths.
