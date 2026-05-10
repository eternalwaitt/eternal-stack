# Claude Control Plane Hooks

The control plane keeps mechanical enforcement in hooks and keeps prose short.

## Guards

- `cc-pretooluse-guard.sh`: blocks unsafe Bash, blind source edits, new source files without reuse search, repeated commands, risky email/GWS writes, stale WebSearch, policy/complexity violations, and underspecified subagents. Policy, complexity, and task-packet failures are aggregated so the agent fixes every detected issue in one pass.
- `cc-posttoolbatch-observer.sh`: records reads, searches, commands, skills, edits, and verification evidence.
- `cc-posttoolusefailure-diagnose.sh`: records repeated failures and forces a diagnostic pivot.
- `cc-userprompt-router.sh`: records requested skills and injects short routing reminders.
- `cc-stop-verifier.sh`: blocks completion claims without verification, requested-skill evidence, complete execution-ledger evidence, or required artifacts such as review logs, browser QA reports, and context saves.
- `cc-subagentstop-record.sh`: records subagent completion into the active ledger and blocks malformed subagent output when a ledger is active.
- compact/session hooks save and restore concise state.

Strict mode registers `PreToolUse`, `Stop`, and `SubagentStop` blockers. Default mode keeps observer hooks active while leaving hard blockers opt-in.

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Use bypass only to repair broken hook configuration.
