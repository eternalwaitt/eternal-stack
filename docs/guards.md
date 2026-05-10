# Claude Control Plane Hooks

The control plane keeps mechanical enforcement in hooks and keeps prose short.

## Guards

- `cc-pretooluse-guard.sh`: blocks unsafe Bash, blind source edits, new source files without reuse search, repeated commands, local dev servers without explicit checked ports, risky email/GWS writes, stale WebSearch, policy/complexity violations, test weakening, safety-removal edits, large changes, file-creation sprawl, ownership-deflection language, and underspecified subagents. Policy, complexity, and task-packet failures are aggregated so the agent fixes every detected issue in one pass.
- `cc-posttooluse-quality.sh`: checks the final edited file for full-file complexity and test-quality regressions after writes land.
- `cc-posttoolbatch-observer.sh`: records reads, searches, commands, skills, edits, real quality/test/browser/review checks, repeated edits, and project bug-memory notes.
- `cc-posttoolusefailure-diagnose.sh`: records repeated failures and forces a diagnostic pivot.
- `cc-userprompt-router.sh`: records requested skills and injects short routing reminders.
- `cc-stop-verifier.sh`: blocks completion claims without real quality/test verification after source edits, requested-skill evidence, complete execution-ledger evidence, required artifacts such as review logs, browser QA reports, and context saves, deflection language that labels failures as pre-existing/out-of-scope, or second-pass review evidence for broad/risky edits.
- `cc-subagentstop-record.sh`: records subagent completion into the active ledger and blocks malformed subagent output when a ledger is active.
- compact/session hooks save and restore concise state.

Strict mode registers `PreToolUse`, `Stop`, and `SubagentStop` blockers. Default mode keeps observer hooks active while leaving hard blockers opt-in.

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

Port checking is active when both `node` and `~/.claude/scripts/port-guard.mjs` are available. If either is missing, `command_passes_port_guard` fails open with a warning such as `claude-guard warning: port-guard helper is unavailable; skipping port availability check`. Install Node and rerun `scripts/install.sh` to restore strict checking.
