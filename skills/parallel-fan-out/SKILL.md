---
name: parallel-fan-out
description: User-invoked parallel-agent workflow for Claude Code. Use only when Victor explicitly asks for parallel agents; hidden from model auto-invocation because it delegates work.
disable-model-invocation: true
---
# Parallel Fan-Out

1. Split work by disjoint file ownership.
2. Assign explicit model, cwd, scope, write boundaries, and expected output.
3. Tell agents not to revert user changes.
4. Run final verification after integration.

