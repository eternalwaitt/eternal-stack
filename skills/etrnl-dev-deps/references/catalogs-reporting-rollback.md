# Catalogs, Reporting and Rollback

Read for central version changes, multi-component plans and upgrade execution.

## Catalog decisions

Use the existing catalog or central version surface. For pnpm, both default `catalog` and named `catalogs` are valid; do not rename a working default to satisfy a style preference. Named catalogs help when they express a real version policy or staged compatibility boundary.

Before consolidating, compare declared/resolved versions, dependency sections, consumer runtime/peer constraints and package role. Preserve published-library peer support ranges, intentional multi-major tests, adapter constraints and staged migrations. Keep existing `workspace:` conventions; new features alone do not justify rewriting internal dependencies.

When consolidation is authorized:

1. Reuse compatible entries and replace duplicate literals with `catalog:` or `catalog:<name>`.
2. Without a central surface, introduce the smallest useful catalog only for a pnpm workspace with repeated versions and appropriate scope. Do not expand a narrow security patch into catalog migration.
3. Check all workspace and optional/peer consumers before pruning an entry. Use configured Knip/equivalent plus source/runtime evidence; a warning alone does not authorize deleting a package.
4. Reconcile overrides, resolutions, patches and package extensions with the target graph. Record remaining workarounds' reasons, advisories/constraints and exit conditions. Prefer direct dependency fixes over lockfile-only refreshes, then justified overrides; remove workarounds only after covering their original failure.
5. Preserve version-specific lifecycle-script approvals. Review new native/build versions; do not replace scoped approval with blanket allowance to make installation pass.
6. Regenerate lockfiles with the selected native manager; inspect peer contexts, duplicates and unexpected transitive changes. Deduplication must preserve peer/runtime compatibility.

For other ecosystems, reuse Yarn constraints, Cargo workspace dependencies, Gradle catalogs/BOMs, Maven dependency management, Python constraints or the established equivalent. Do not switch managers to obtain catalogs. Discover each ecosystem independently in polyglot repos.

Optimization means justified reduction of repeated/conflicting declarations, unused entries or obsolete overrides; it does not guarantee a smaller installed graph or bundle. Separate measured counts from predicted benefits. See [pnpm settings](pnpm-toolchain.md) for version-dependent enforcement/pruning.

## Compatibility batches

Build a constraint graph from target engines, runtimes, peers, companions and migration prerequisites. Resolve cycles as coherent batches. Security urgency changes priority, not prerequisites. Semver class is a research hint, not proof a patch/minor is safe.

Check coupled families without automatically bumping every member:

- React, DOM renderer, framework integrations, renderer tests and types.
- Compiler, parser, lint plugins/config, bundler and test transforms.
- ORM, generated client, adapter, migration CLI and DB server support.
- Auth/payment SDK, verifier, adapters and webhook behavior.
- Container runtime, OS, native modules and build/final-stage ABI.
- Infrastructure providers, resource schemas, CRDs/operators and servers.

Independent components may share a small batch when failures remain attributable. Cross-ecosystem components can be coupled by generated clients, schemas or images. Follow the graph rather than universal "patches, minors, majors, runtimes last" waves.

## Report contract

Scale presentation to scope: a targeted patch needs a short record; a full-toolset plan needs complete inventory and impact mapping. Persist reports only when requested or required; never commit private dependency/tenant data, credentials or authenticated logs.

### Inventory and decisions

| Component / owner | Declared / resolved | Target / channel / source date | Runtime / peer constraints | Decision and reason |
| --- | --- | --- | --- | --- |
| Package, tool, image, action or server | Separate ranges from lock state | Exact verified version and official URL | Platform and coupled family | Upgrade, retain, blocked or unknown |

Include manager/runtime versions, inspected boundaries/files, source revision and dirty-state qualification. Account for all in-scope items, including current and intentionally pinned components; absence from outdated output does not mean reviewed.

### Predicted issues

| Transition / change | Classification | Repository evidence | Expected symptom and remediation | Prerequisite / verification |
| --- | --- | --- | --- | --- |
| Versioned official migration link | Required, likely, not applicable or unknown | Exact path and symbol/config key | Old → new behavior; observation versus inference | Coupled change and exact check/journey |

Record meaningful non-applicable changes and group repetitive non-findings. Missing release notes, unresolved transitive effects or unavailable platform checks remain unknowns.

### Execution and handoff

- Ordered batches, prerequisites and source/config/generated/test/CI/container changes with paths.
- Advisories/severity, affected/fixed ranges and exposure evidence; preserve unavailable scans and existing waivers.
- Catalog decisions, before/after declaration/resolved-version counts, retained overrides and exceptions. Include removals/replacements only with authority and evidence.
- Bot PR identity/head, grouping rationale, accepted/rejected proposals and actual CI outcomes. Queued, skipped and zero-step checks are not passes.
- Changed manifests/lockfiles, migration instructions, and verification commands with source/environment, status and exit codes; separate existing failures from regressions.
- Tested restoration or explicitly untested rollback plan, unfinished requested components and residual risks.

## Restore the actual baseline

Record dirty, staged and untracked files/hunks before edits. For overlapping user edits, use an isolated checkout or verified private snapshot of actual pre-edit files **and index state**. A diff can omit untracked/binary content and is not always a recovery bundle. Keep snapshots outside tracked source and protect secrets.

Record concrete commands for the actual batch; never present placeholders as executed evidence. Do not default to `git restore -- <dependency-files>`: it restores from the index and can discard pre-existing unstaged work. Restoring HEAD can also discard staged work. Broad reset/checkout is forbidden.

For an isolated batch commit without dependent later changes, a scoped revert can work. Otherwise restore only batch-owned changes from the captured baseline or apply a reviewed inverse patch. Restore full files only with verified pre-edit state and ownership; preserve unrelated changes made since the snapshot. Regenerate shared lockfiles through the native manager when accepted independent batches must remain.

After rollback, compare touched files **and index/untracked state** with baseline, run the correctly pinned manager's install/restore and previously failing gate, and report mismatches. For manager migrations, restore old configuration/pins before reinstalling with the old manager. Continue only with independent batches. Restoration requires evidence, not just a successful command.
