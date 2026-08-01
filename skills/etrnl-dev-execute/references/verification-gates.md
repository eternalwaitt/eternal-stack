# Verification gates (Browser-QA and react-doctor)

Load this module when the execution ledger or plan triggers Browser-QA v2 or react-doctor gates.

## Browser-QA v2 completion gate

1. Create with `browser-qa-report.mjs create --schema-version 2 --status complete --tree-hash <worktree-hash>` (pass the current worktree hash from `execution-ledger.mjs record-check` evidence or derive with the same hash function the ledger uses). Each complete matrix row needs `provenance.tool`, fresh `provenance.capturedAt`, screenshot + hash, and the route/viewport coverage the plan names.
2. Before claiming completion, run:

```bash
node ~/.claude/scripts/browser-qa-report.mjs validate <report-path> \
  --artifact-root <artifact-root> \
  --require-complete \
  --tree-hash <worktree-hash>
```

3. Require exit 0. `--require-complete` rejects `status: draft`. `--tree-hash` binds `provenance.treeHash` to the current worktree. Do not treat a draft-valid report as completion evidence.

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
