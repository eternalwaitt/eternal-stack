---
name: etrnl-audit-tooling
description: ETRNL deep-audit category skill for tooling ecosystem and developer experience. Use when the user asks for tooling audit, developer experience audit, toolchain audit, scripts audit, formatter or lint gates, local setup, CI parity, update paths, or rollback paths.
---
# ETRNL Tooling Ecosystem Audit

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-audit-tooling`; on update, ask update/snooze/continue.

Run the `tooling-ecosystem` deep-audit category against scripts, manifests, lint and format gates, tests, CI, bootstrap, update, and rollback paths. This category is read-only unless the user explicitly asks for fixes.

## Startup

1. Load `references/audit-checks.md`.
2. Use the shared deep-audit report envelope from `etrnl-audit` when it exists.
3. For direct category invocation, create the same report envelope with `requestedCategories: ["tooling-ecosystem"]`, or route the run through `etrnl-audit --category tooling-ecosystem`.
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
