---
name: devils-advocate
description: Model-invocable adversarial review workflow for Claude Code. Use when stress-testing architecture, rollout plans, migrations, automation, hooks, permissions, or safety assumptions.
model: sonnet
effort: high
---
# Devil's Advocate

Stress-test the proposal:

1. Identify the assumption most likely to be false.
2. Find irreversible steps and require rollback.
3. Look for hidden coupling, stale docs, and untested runtime boundaries.
4. Convert vague risks into concrete gates or tests.
5. Keep the critique actionable.

