# Claude Control Plane Hooks

The control plane keeps mechanical enforcement in hooks and keeps prose short.

## Guards

- `cc-pretooluse-guard.sh`: blocks unsafe Bash, blind source edits, new source files without reuse search, repeated commands, risky email/GWS writes, stale WebSearch, and underspecified subagents.
- `cc-posttoolbatch-observer.sh`: records reads, searches, commands, skills, edits, and verification evidence.
- `cc-posttoolusefailure-diagnose.sh`: records repeated failures and forces a diagnostic pivot.
- `cc-userprompt-router.sh`: records requested skills and injects short routing reminders.
- `cc-stop-verifier.sh`: blocks completion claims without verification or requested-skill evidence.
- compact/session hooks save and restore concise state.

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Use bypass only to repair broken hook configuration.

