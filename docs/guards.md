# Claude Control Plane Hooks

The control plane keeps mechanical enforcement in hooks and keeps prose short.

## Default Hooks

- `cc-rate-limiter.sh`: replaces the legacy temp-file rate limiter with a locked, debounced advisory hook for tool-call spirals and repeated failures.
- `cc-posttoolbatch-observer.sh`: records reads, searches, commands, skills, edits, real quality/test/browser/review checks, repeated edits, project bug-memory notes, and debounced warning fingerprints.
- `cc-userprompt-router.sh`: records requested skills, reinjects global/project `CLAUDE.md` context once per session in Claude startup order, recursively expands in-root markdown imports, and injects short routing reminders.
- `cc-userprompt-expansion.sh`: keeps prompt expansion behavior separate from the routing hook.
- `cc-sessionstart-restore.sh`: restores compact state and reports installed source drift through `update-check.mjs`.
- compact/session hooks save and restore concise state.

## Strict Hooks

- `cc-pretooluse-guard.sh`: blocks unsafe Bash, shell output-limiter pipes, unbounded `code-health-inventory.mjs --json` and `workflow-health.mjs --json` dumps, broad `.codex` memory scans, unscoped Serena `search_for_pattern` calls, directory `Read` calls, blind source edits, new source files without reuse search, repeated commands, local dev servers without explicit checked ports, risky email/GWS writes, stale WebSearch, policy/complexity violations, test weakening, safety-removal edits, large changes, ownership-deflection language, and underspecified subagents; `/etrnl-ops-disk-cleanup` narrows filesystem cleanup to dry-run manifests and `trash` on approved transient paths. The file-sprawl check is default-off and becomes active only with `CLAUDE_GUARD_FILE_SPRAWL=1`, where 3+ new source files in one session are blocked unless `cc_write_scope_allows_new_source` finds explicit planned write-scope coverage. Enable it for CI, refactors, or broad feature work, for example: `CLAUDE_GUARD_FILE_SPRAWL=1 claude`.
- `cc-posttooluse-quality.sh`: checks the final edited file for full-file complexity and test-quality regressions after writes land.
- `cc-posttoolusefailure-diagnose.sh`: records failures, gives context on the first failure, includes email-triage ML-disagreement recovery commands, and blocks only repeated identical failures to force a diagnostic pivot.
- `cc-stop-verifier.sh`: blocks completion claims without real quality/test verification after source edits, requested-skill evidence, complete execution-ledger evidence, dated source evidence for advice/search answers, required artifacts such as review logs, browser QA reports, and context saves, deflection language that labels failures as pre-existing/out-of-scope, or second-pass review evidence for broad/risky edits. It allows explicit non-final status updates, such as paused production handoffs awaiting approval, without treating partial step words like `done` or `green` as a completion claim.
- `cc-subagentstop-record.sh`: records subagent completion into the active ledger and blocks malformed subagent output when a ledger is active.

Policy, complexity, and task-packet failures are aggregated where possible so the agent can fix every detected issue in one pass.

Strict mode registers `PreToolUse`, post-write quality, `PostToolUseFailure`, `Stop`, `SubagentStop`, and compact recovery hooks. Default mode keeps observer hooks and the advisory rate limiter active while leaving hard blockers opt-in.

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Use bypass only to repair broken hook configuration.

For local dev servers, pick a free port before running the project command:

```bash
port=$(node ~/.claude/scripts/port-guard.mjs pick --start 3100)
pnpm dev -- --port "$port"
```

Port checking is active for dev-server commands in strict mode. If `node` or `~/.claude/scripts/port-guard.mjs` is missing, the guard denies the dev-server command until the helper/runtime is restored. Install Node and rerun `scripts/install.sh` to restore strict checking.
