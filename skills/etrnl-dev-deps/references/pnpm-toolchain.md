# pnpm Toolchain and Taze

Read for JavaScript workspaces, catalogs or manager/runtime upgrades. Check exact current/target versions. These notes were checked on 2026-10-22; consult versioned official docs before applying them to later releases.

## Discovery

Prefer configured local tools and native outdated/audit commands. Use the selected manager for audits; do not treat a pnpm lockfile as npm lock state. Capture nonzero exits and distinguish findings from tool/network failure.

[Taze's maintained skill](https://github.com/antfu-collective/taze/blob/main/skills/taze/SKILL.md) supports recursive discovery, catalogs, actions and Node pin files. If installed, invoke through the repo manager (`pnpm exec taze`, for example). Otherwise use native discovery or the environment's approved ephemeral-tool route with a verified/pinned Taze version. Do not add permanent dependencies or install globally merely to inspect versions. Inspect executable repository tool config before loading it.

Example arguments after the chosen executable:

```sh
taze major -r --json --all -l
```

`major` exposes cross-major candidates, `-r` scans workspaces, `--all` includes current entries, and `-l` includes fixed versions. Fixed versions are constraints to evaluate, not permission to omit them from a whole-toolset report. Do not use `-w`, installs, updates or codemods in read-only modes; avoid interactive `-I`. This still needs lockfile/transitive and non-JavaScript discovery.

For authorized implementation, `-w` edits declarations/catalogs/workflows; constrain candidates with include/exclude filters and review the diff before installing. Verify options against the selected Taze version. Taze supplies candidates, not compatibility or behavioral guarantees.

## pnpm 10 to 11/12

Sources: [migration from v10](https://pnpm.io/migration), [pnpm 12 release](https://pnpm.io/blog/releases/12.0), [catalogs](https://pnpm.io/catalogs). Review the full relevant release range. Verify the exact stable target and installation route; do not assume the registry's `latest` tag selects the requested major.

Map changes to actual files before running a codemod:

| Area | Check affected usage |
| --- | --- |
| Config location | v11/12 stop reading `package.json#pnpm`; `.npmrc` retains auth/registry while other settings move to camelCase workspace config. Preserve scoped registries/auth and nested project config. |
| Build trust | Old built/ignored lists consolidate into `allowBuilds`. Preserve denials and version-scoped approvals; review new native binaries/scripts. |
| Manager enforcement | Old strict/version-management settings become `pmOnFail`; check developer, CI and container behavior. |
| Environment/runtime | `npm_config_*` becomes `pnpm_config_*`; runtime pin conventions move toward `devEngines.runtime`. Reconcile `packageManager`, engines, CI setup, Docker, developer pins and actual executable separately. |
| Removed/renamed settings | Review patch failure policy, `allowUnusedPatches`, CVE-to-GHSA ignore conversion and removed per-package runtime settings. Preserve security exception rationale. |
| CLI resolution | pnpm 12 rejects separate boolean arguments to frozen-lockfile flags; use supported positive/negative flags. Scripts can shadow built-ins in v11/12; distinguish repository deploy scripts from native `pnpm deploy` and inspect `pnpm pm` routing. Never execute deployment to test command resolution. |
| Docker/CI | Copy workspace config before install; inspect filtered/pruned deployment inputs, native build permissions and clean/frozen target-manager builds. Preserve OS ABI and repository packaging mode. |
| Resolver/lock state | Generate with the target manager; check peers, patches/extensions, platform binaries and unknown-setting warnings. Do not weaken peer or supply-chain checks to pass. |

The official `pnpm-v10-to-v11` codemod handles mechanical config migration from 10 to either 11 or 12. It writes files: review its exact version, source and diff, then complete manual follow-ups. Its name does not require an intermediate v11 install.

## Catalog policy

Inspect catalogs and consumers together with overrides/extensions. Check target-version support before choosing settings:

- `catalogMode` controls catalog use during `pnpm add` (`manual`, `prefer`, `strict`). Strict changes contributor behavior; select it only when repository policy calls for enforcement.
- `catalogPrune` removes unused entries on install; v11.22 introduced it as replacement for `cleanupUnusedCatalogs` (available since v10.15). Check staged consumers before enabling pruning; an intentional staged entry may look unused.
- pnpm 12.2 adds `workspace:` catalog entries; 12.6 adds `file:`/`link:`. Catalog paths are relative to the workspace file; moving project-relative paths can change meaning. Preserve internal-dependency conventions unless migration has a concrete benefit and tests.

Verify supported catalog references, all consumers, install output and generated lock state. Compare duplicate versions under equivalent platform/install conditions. Do not promise install-speed or bundle gains without measurements.
