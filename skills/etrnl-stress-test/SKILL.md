---
name: etrnl-stress-test
description: ETRNL control-plane adversarial review workflow for Claude Code. Use when stress-testing architecture, rollout plans, migrations, automation, hooks, permissions, or safety assumptions.
model: sonnet
effort: high
disable-model-invocation: true
---
# Stress Test

Stress-test the proposal:

1. Identify the assumption most likely to be false.
2. Find irreversible steps and require rollback.
3. Look for hidden coupling, stale docs, and untested runtime boundaries.
4. Check whether enforcement belongs in a hook, repeatable process belongs in a skill, and durable preference belongs in memory.
5. Look for shareable-repo leaks: private identity, credentials, transcripts, local permissions, or memory dumps.
6. Convert vague risks into concrete gates or tests.
7. Keep the critique actionable.
