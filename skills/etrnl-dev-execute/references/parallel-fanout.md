# Parallel Fan-Out

Use only during `etrnl-dev-execute` when parallel-safe work needs bounded fanout. Execute owns plan execution, ledger updates, review, integration, and final verification.

1. Split work by disjoint file ownership.
2. Construct the full ETRNL task packet as specified in `etrnl-dev-execute`, including task id, lineage id, scope, verification, reviewer, reuse, TDD, deep-stack, risk, and completion fields.
   - For parallel or multi-file writes, set `criticalPath`, `stopCondition`, `waveId`, `waveSize`, `maxConcurrentLanes`, `nativeChildAgents`, `parentChildDrain`, `completionReceiptRequired`, and `completionReceipt`.
   - Default `maxConcurrentLanes` to `3`. Raise it only when the plan's `## Parallelization strategy` includes one explicit justification line for the higher lane count.
   - `waveSize` cannot exceed `maxConcurrentLanes`.
   - `nativeChildAgents` is `forbidden`, `modeled`, or `not_applicable`. `modeled` requires `parentChildDrain`, the child-agent drain and merge protocol before parent integration continues.
   - Completion receipts name changed files, verification commands, result status, blockers, and follow-up ownership.
   - Validate every packet with `node ~/.claude/scripts/agent-task-packet-check.mjs` before dispatch.
3. **Wait sizing (Codex/native child hosts):** first wait on a child equals the packet `timeoutSec` estimate (minimum 300 seconds / 5 minutes). Every subsequent wait is at least 120 seconds / 2 minutes. Never use fixed 30–60 second polling loops. On each wake-up, drain **all** completed children before waiting again. Use completion notifications or blocking waits when the host supports them; otherwise use the timed waits above (never 30–60 second polling loops).
4. Use `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `etrnl-investigator` by role.
5. Integrate changes sequentially; if conflicts appear:
   - do not revert user changes
   - assign one authoritative conflict owner per file
   - preserve user edits first, then keep the agent output with the narrowest matching scope
   - run available tests and linters before and after resolving conflicts
   - document resolution decisions in commit or PR notes
6. Run final verification after integration.
