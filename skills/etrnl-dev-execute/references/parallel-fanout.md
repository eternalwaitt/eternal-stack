# Parallel Fan-Out

Use only during `etrnl-dev-execute` when parallel-safe work needs bounded fanout. Execute owns plan execution, ledger updates, review, integration, and final verification.

1. Split work by disjoint file ownership.
2. Construct the full ETRNL task packet as specified in `etrnl-dev-execute`, including task id, lineage id, scope, verification, reviewer, reuse, TDD, deep-stack, risk, and completion fields.
   - For parallel or multi-file writes, set `criticalPath`, `stopCondition`, `waveId`, `waveSize`, `maxConcurrentLanes`, `nativeChildAgents`, `parentChildDrain`, `completionReceiptRequired`, and `completionReceipt`.
   - `maxConcurrentLanes` is capped at `6`, and `waveSize` cannot exceed it.
   - `nativeChildAgents` is `forbidden`, `modeled`, or `not_applicable`. `modeled` requires `parentChildDrain`, the child-agent drain and merge protocol before parent integration continues.
   - Completion receipts name changed files, verification commands, result status, blockers, and follow-up ownership.
   - Validate every packet with `node ~/.claude/scripts/agent-task-packet-check.mjs` before dispatch.
3. Use `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `etrnl-investigator` by role.
4. Integrate changes sequentially; if conflicts appear:
   - do not revert user changes
   - assign one authoritative conflict owner per file
   - preserve user edits first, then keep the agent output with the narrowest matching scope
   - run available tests and linters before and after resolving conflicts
   - document resolution decisions in commit or PR notes
5. Run final verification after integration.
