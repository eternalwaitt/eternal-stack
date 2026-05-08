---
name: writing-plans
description: Model-invocable planning workflow for Claude Code. Use when writing or reviewing implementation plans, especially plans that must include setup, implementation, docs, rollout, verification, repo extraction, and completion criteria.
model: sonnet
effort: medium
---
# Writing Plans

Write implementation plans as executable phases:

1. State the goal and non-goals.
2. Ground the plan in live repo/runtime evidence.
3. Define setup, implementation, tests, docs, rollout, rollback, and success criteria.
4. Put irreversible or risky actions behind explicit verify gates.
5. Make repo/shareable/versioning boundaries explicit when portability matters.

