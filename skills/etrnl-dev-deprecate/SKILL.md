---
name: etrnl-dev-deprecate
description: Deprecation and migration workflow for removing dead surfaces, retiring live code paths, and driving replacements to zero remaining callers. Use when the user asks to deprecate, delete, retire, sunset, remove, or migrate off an existing API, module, flag, endpoint, or symbol.
disable-model-invocation: true
---
# Deprecate

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-deprecate`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Code is a liability. The best code is deleted code. Every retained line costs review, load, and blast radius forever. Bias toward removal: delete the dead surface rather than wrap it, rename it, or leave it behind a flag. A deprecation that never removes the code is debt that compounds.

Do not turn a deprecation into a broad refactor. Change only the surface named in the request and the callers that block its removal.

## Modes

- `remove`: the surface is dead. Prove zero callers, then delete it and its tests, types, docs, and exports in one change.
- `migrate`: the surface is still live. Ship the replacement, move every caller, then delete the old path. Never leave two live paths.
- `plan`: read-only. Enumerate callers, name the migration target, set owner and removal date, and produce the removal checklist with no edits.

## Workflow

### 1. Audit callers before touching anything

Enumerate every reference to the target symbol, file, route, flag, or export. Do not trust memory or the import graph alone.

1. Run structural search for the symbol and every alias, re-export, and wrapper: `sg run -p '<symbol>($$$)'` and `sg run -p '<symbol>'` for the language in scope.
2. Run text search for string references the AST misses — dynamic dispatch, string keys, config, feature flags, docs, and generated clients: `rg -n '<symbol>' --hidden -g '!node_modules'`.
3. Search re-export barrels, index files, and public entry points so a caller reaching the surface through a facade is counted.
4. Check runtime callers that never appear in source: HTTP routes, queue consumers, cron entries, webhooks, and external API contracts. A zero-caller grep does not prove an external endpoint is unused.

Record the caller count and every file path. Do not proceed to removal until the surface is proven dead or every caller has a migration target.

### 2. Removal-first bias

When the audit proves zero callers, delete the surface. Do not wrap it, comment it out, mark it deprecated, or hide it behind a flag "for later". Deleted code has zero cost; retained dead code has permanent cost.

Delete the full footprint in one change: the symbol, its tests, its types and Zod schemas, its exports and barrel entries, its docs, and its dependency imports that no other surface needs. A partial delete that leaves orphaned tests or dangling exports is not done.

### 3. Migration path for a live surface

When the audit proves the surface is still used, never delete first. Sequence the retirement so no caller breaks:

1. Ship the replacement surface with its own tests, types, and docs. Prove the replacement passes the project verification gates before touching any caller.
2. Migrate every caller from the old surface to the replacement. For internally-controlled callers, move them in one pass; do not stop with a partial migration that leaves the codebase reading from both paths.
3. Delete the old surface only after the caller count reaches zero. Re-run the step 1 audit to confirm zero remaining callers before the delete.

For internally-controlled callers, never leave two live paths for the same behavior: two paths double the surface, split the tests, and let callers drift back to the retired one. If the internal replacement cannot fully cover a caller, the migration is blocked — record the blocker and the caller instead of shipping both paths.

Externally-consumed surfaces that cannot migrate atomically — public APIs, HTTP endpoints, webhooks, and independently deployed consumers — run a time-bounded compatibility window instead of a one-pass cutover. Keep both paths live only for such a surface, and only when the compat path defines all four: telemetry that reports old-path usage, a single accountable owner, a hard removal deadline, and an explicit removal gate (old-path usage reaches zero or the deadline forces the cutover). Record the four in the deprecation notes. A compat window without all four is two permanent live paths, not a migration.

### 4. Removal deadline and owner

A deprecation with no removal date is not done — it is a permanent second path.

- For a surface deleted now, the removal date is today and the record is the merge.
- For a surface that cannot be removed in this change, open a named migration ticket, set an explicit removal date, and set a single accountable owner. Record the ticket id, date, and owner in the deprecation notes.
- Do not close the task as complete while a live retired path exists without a ticket, date, and owner. "Deprecated" without a removal commitment is an open finding, not a finished task.

### 5. Safety fence — never delete a guard to simplify

Never delete a guard, invariant, or test to make a surface easier to remove. These exist to prevent a bad state, and removing one to "simplify" trades a small diff for a production incident. Do not delete any of the following as part of a deprecation:

- Tenant-isolation filters (`tenantId`, `locationId` scoping) and tenant-safe repository calls.
- Money value-object handling, `Decimal` precision, and currency-constant use.
- Auth, permission, session, and access-control checks.
- Schema, boundary, and input validation, including Zod schemas at API boundaries.
- Accessibility affordances — labels, roles, focus handling, and semantics that satisfy WCAG.
- Data-loss fences — soft-delete filters, cascade protections, migration reversibility, and backup or confirmation steps.
- Tests that assert any surface above. A failing test blocking a delete is a signal the surface is still load-bearing, not friction to remove.

When a guard or its test sits on the removal path, stop. Move the guard to the replacement surface intact and prove it still fires before deleting the old copy. If the guard cannot move, the removal is blocked.

## Verification

Do not ship until every item below is true and recorded:

1. Caller audit is complete: `sg` structural search and `rg` text search both ran over the target symbol and its aliases, with the caller count and file paths recorded.
2. Every deprecated symbol has zero remaining callers, OR each remaining caller is covered by a named migration ticket with an explicit removal date and a single owner. Count of live callers without a ticket: 0.
3. No internally-controlled migration has two live paths. Count of internally-controlled behaviors served by both an old and a replacement path: 0. A compliant external compatibility window is exempt from this zero-overlap rule; for each such window, verify all four controls are recorded and enforced: old-path telemetry, a single accountable owner, a hard removal deadline, and an explicit removal gate. Count of external compat windows missing any of the four controls: 0.
4. Every deleted surface is fully removed: symbol, tests, types, schemas, exports, barrel entries, docs, and now-unused imports. Count of orphaned tests or dangling exports: 0.
5. The safety fence held: count of tenant/Money/auth/validation/a11y/data-loss guards or their tests deleted to simplify: 0. Every guard on the removal path was moved intact to the replacement and re-verified.
6. Project verification gates pass after the change: typecheck, lint, tests, and build. Runtime or browser smoke ran when the retired surface was user-facing.

## Output

- Mode, target surface, and caller count before and after.
- Files deleted, callers migrated, and the replacement surface path.
- For any live retired path: migration ticket id, removal date, and owner.
- Guards moved to the replacement and the evidence they still fire.
- Verification gate results and residual removal risk.
