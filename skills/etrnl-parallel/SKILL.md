---
name: etrnl-parallel
description: ETRNL control-plane parallel-agent workflow for Claude Code. Use only when the user explicitly asks for parallel agents; hidden from model auto-invocation because it delegates work.
disable-model-invocation: true
---
# Parallel Fan-Out

1. Split work by disjoint file ownership.
2. Assign explicit model, cwd, scope, write boundaries, and expected output.
3. Tell agents not to revert user changes.
4. Integrate changes sequentially; if conflicts appear:
   - do not revert user changes
   - assign one authoritative conflict owner per file
   - prefer user edits, then the agent with the narrowest matching scope
   - run available tests and linters before and after resolving conflicts
   - document resolution decisions in commit or PR notes
5. Run final verification after integration.
