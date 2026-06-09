---
name: etrnl-dev-stress-test
description: ETRNL etrnl adversarial review workflow for Claude Code. Use when stress-testing architecture, rollout plans, migrations, automation, hooks, permissions, or safety assumptions.
disable-model-invocation: true
---
# Stress Test

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-stress-test`; on update, ask update/snooze/continue.

Stress-test the proposal:

1. Identify the assumption most likely to be false.
2. Find irreversible steps and require rollback.
3. Look for hidden coupling, stale docs, and untested runtime boundaries.
4. Check whether enforcement belongs in a hook, repeatable process belongs in a skill, and durable preference belongs in memory.
5. Look for shareable-repo leaks: private identity, credentials, transcripts, local permissions, or memory dumps.
6. Convert vague risks into concrete gates or tests.
7. Keep the critique actionable.

This skill is adversarial review by default. Actual load, stress, spike, soak, or breakpoint testing requires:

- target host and environment;
- explicit approval for non-local traffic;
- load profile, thresholds, abort criteria, and cleanup path;
- result artifact with command, duration, concurrency, failure rate, latency, and exit status;
- rollback or mitigation owner for any failed threshold.

Route code/runtime performance measurement through `etrnl-audit-performance` when the user asks for measured latency, bundle, route, database, or infrastructure performance.
