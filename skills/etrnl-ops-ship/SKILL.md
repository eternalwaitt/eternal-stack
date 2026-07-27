---
name: etrnl-ops-ship
description: ETRNL ship and launch-discipline workflow for Claude Code. Use when the user asks for staged rollout, cut over, go/no-go, rollback readiness, or to promote a change to production by signal — not for routine PR or merge requests.
disable-model-invocation: true
---
# Ship

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-ship`; on update, never stop to ask; local updates auto-apply when enabled and safe.

Ship verifies release readiness that plan and PR already recorded, then promotes by signal. Ship does not originate requirements. If plan or PR work is missing, route back to that stage — never propose a follow-up release-controls PR as the remedy.

## Startup

1. Classify release risk from changed files and plan tier: `routine`, `guarded`, or `migration`.
2. Release controls bootstrap automatically — `pr-preflight` and `plan-readiness-check` call `ensureReleaseControls` for guarded/migration classes in deployable app repos. Do not ask the user to run setup scripts. When bootstrap just ran, include the scaffold files in the same PR/commit.
3. Read the plan `## Rollback` section and the PR `## Rollout & rollback` section. Run `node ~/.claude/scripts/pr-preflight.mjs validate-body --json` — a failed PR gate blocks ship; remedy is `etrnl-dev-pr`, not another PR.
4. Load `.etrnl/release.json` from the project and verify each required artifact has named evidence in plan, PR, or execution output.

## Release classes

- `routine`: revert path documented. Promote when PR gate is green.
- `guarded`: literal rollback command, structured log and metric per new traffic path, stage gate when manifest declares a flag provider else deploy-and-watch window. Promote when promotion signal holds.
- `migration`: everything in `guarded`, plus forward-compatibility proof, rehearsed rollback with timestamp, named owner, recorded go/no-go, and `etrnl-audit-production` green for this change only.

`etrnl-audit-production` is required only for `migration` class ships.

## Verify, then promote

1. Confirm PR gate passed (`pr-preflight validate-body` exit 0).
2. Confirm instrumentation is live on new boundaries before traffic (logs/metrics from the shipping change, not a follow-up).
3. For `guarded`/`migration`: advance stages by named signal — canary, percentage, full — using the manifest flag/env when declared; otherwise deploy and watch the named observation window.
4. For `migration` only: confirm rollback rehearsal timestamp and go/no-go record before full traffic.

When a rollback trigger fires, run the literal rollback command from the manifest or PR body. Do not debate once the named owner confirms (unless an approved automated rollback policy was recorded before launch).

## Hard rules

- Ship blocked when PR gate was skipped — run `etrnl-dev-pr` and fix blockers.
- Do not ask the user to run `release-controls-init` manually — gates bootstrap automatically.
- Do not defer instrumentation, rollback commands, or observability to a follow-up change.
- Do not require `etrnl-audit-production` for `routine` or `guarded` class changes.

## Common Rationalizations

- "Write a follow-up release-controls PR." Plan, bootstrap, execute, and PR already own those requirements. Fix the failing gate, do not defer.
- "Ask the user to run init." Bootstrap is automatic via `pr-preflight` and `plan-readiness-check`.
- "Skip canary — small change." `guarded` and `migration` still need a promotion signal; use env gate or deploy-and-watch per manifest.
- "Instrument after deploy." Instrumentation must be in the shipping change.

## Red Flags — stop and do not ship

- PR `validate-body` not run or not green.
- Bootstrap ran but scaffold files were not included in the PR/commit.
- Rollback command described but not written literally.
- New traffic path with no metric or structured log.
- `migration` class without forward-compat statement, rehearsal timestamp, or audit green.

## When NOT to use

- Opening or updating a PR, code review, or merge — use `etrnl-dev-pr`.
- Retrospective production-readiness scoring — use `etrnl-audit-production`.
- Local-only experiments that never reach users.
- Pure documentation changes with no traffic-serving path.

## Verification

Resolve each item with named evidence or ship is blocked.

All classes:
- [ ] Release class recorded (`routine`, `guarded`, or `migration`).
- [ ] Release controls present (auto-bootstrapped or already committed).
- [ ] PR gate green (`pr-preflight validate-body`).

`guarded` and `migration`:
- [ ] Literal rollback command matches plan/PR/manifest.
- [ ] Each new traffic path has structured log and metric evidence.
- [ ] Promotion signal and observation window named; stage gate or deploy-and-watch per manifest.

`migration` only:
- [ ] Forward-compatibility or tested down-migration stated.
- [ ] Rollback rehearsed with timestamp.
- [ ] `etrnl-audit-production` green for this change.
- [ ] Named owner and go/no-go recorded.
