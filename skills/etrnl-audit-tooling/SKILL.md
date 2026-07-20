---
name: etrnl-audit-tooling
description: ETRNL deep-audit category skill for tooling ecosystem and developer experience. Use when the user asks for tooling audit, developer experience audit, toolchain audit, scripts audit, formatter or lint gates, local setup, CI parity, update paths, or rollback paths.
---
# ETRNL Tooling Ecosystem Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-tooling`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Run the `tooling-ecosystem` deep-audit category against scripts, manifests, lint and format gates, tests, CI, bootstrap, update, and rollback paths. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-deep-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["tooling-ecosystem"]`, or route the run through `etrnl-deep-audit --category tooling-ecosystem`.
4. Refuse final completion until `node scripts/deep-audit-artifact-check.mjs validate --artifact <artifact>` has passed or a concrete blocker is recorded.

## Hard Rules

- Process full script, package-manifest, lint-format, test, CI, and bootstrap worklists.
- Execute registered checks in order from `tool-01-local-setup` through `tool-05-upgrade-rollback`.
- Verify documented commands against real scripts and CI names.
- Compare source-controlled helpers with installed `~/.claude` and `~/.codex` copies when the user asks about live behavior.
- Record `CONFIRMED_CLEAN` for every completed check with zero findings.
- Keep source-limited blockers separate from clean checks.
- Keep local paths, account identifiers, secrets, transcript content, and private memory material out of tracked artifacts.

## Hardening Mode

Use this mode when the user asks to harden tooling, hooks, CI, PR loops, or the local stack.

1. Establish the current baseline with `scripts/doctor.sh`, `node scripts/tool-stack-check.mjs --json`, `node scripts/settings-audit.mjs --live --json`, and `node scripts/session-audit.mjs --since-days 3 --json` when installed state is relevant.
2. Add deterministic enforcement only for a zero-backlog or explicitly accepted backlog class. Do not create fake-green baselines.
3. Use small hook/script gates over documentation-only text for mandatory behavior.
4. Keep hook changes fail-open only for non-required tools and fail-closed for safety, privacy, or execution-scope violations.
5. After source changes, run contract tests and then prove the installed copy is current or state that installation is still pending.

## Output

Return coverage counts, findings by check id and severity, clean rows, skipped rows, not-applicable rows, source-limited blockers, command parity evidence, artifact path or blocker, and validation result.

## Common Rationalizations

- "Lockfile diff is noise from install order." → Regenerate the lockfile from the committed catalog and diff again; a persistent drift means a manifest pins a version the catalog does not carry. Record the offending package.
- "The bootstrap script still runs on my machine." → Run `scripts/bootstrap-tools.sh` in a clean checkout and confirm every referenced tool resolves; a green local shell hides a missing `command -v` guard.
- "package.json and the catalog agree, so versions are fine." → Diff every workspace manifest against the single catalog source, not one manifest; a duplicate pin in a second `package.json` bypasses the catalog.
- "Doctor passed last release, tooling is unchanged." → Rerun `scripts/doctor.sh` on the current tree; a renamed or deleted script breaks the `report_command` invocation that references it by path.
- "CI names match the docs I read." → Verify each documented command string against the real script name and CI job id; a doc that trails a renamed npm script sends contributors to a dead command.

## Red Flags

- A dependency version pinned directly in a workspace `package.json` that the catalog source (`pnpm-workspace.yaml` catalog block) also declares — the pin overrides the catalog and drifts silently.
- A lockfile whose resolved version for a package differs from the catalog-declared version, proving the lockfile was regenerated against an off-catalog manifest.
- A `report_command` or npm script that invokes a script path (`scripts/*.mjs`, `scripts/*.sh`) that no longer exists on disk — a rename left a dangling reference.
- A documented command in `docs/` or `README.md` whose string does not match any real script name, CI job id, or npm script key.
- A tool referenced in `scripts/bootstrap-tools.sh` with no `command -v` presence guard, so a missing binary fails silently instead of erroring.
- A gate script that exits 0 on a defect it names (no `process.exit(1)` / `STATUS=1` on the failure branch), making the check unable to go red.

## When NOT to use

- Runtime dependency vulnerabilities, CVE triage, or supply-chain trust of a package: route to etrnl-audit-security.
- Application-code correctness, function length, and typed-boundary review inside changed source: route to etrnl-quality-reviewer.
- Documentation freshness, TSDoc coverage, and README/ADR drift as a whole: route to etrnl-audit-docs.
- Production readiness, deploy config, and release-gate posture: route to etrnl-audit-production.

## Verification

PASS/FAIL checklist (any FAIL means the run is incomplete):

- [ ] Every workspace manifest version reconciles against the single catalog source; zero off-catalog pins.
- [ ] Lockfile regenerates with no diff against the committed catalog.
- [ ] Every referenced script path (`report_command`, npm scripts, docs) resolves to an existing file.
- [ ] `scripts/bootstrap-tools.sh` passes `bash -n` and guards each tool with a presence check.
- [ ] Every documented command string matches a real script name or CI job id.
- [ ] `scripts/doctor.sh` exits 0 on the current tree.

Red-capable gate (fails when a referenced script is missing or a tooling gate breaks):

```
bash scripts/doctor.sh   # expected exit 0; exit 1 when a script is missing or a gate fails
```
