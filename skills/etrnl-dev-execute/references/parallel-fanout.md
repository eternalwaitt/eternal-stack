# Parallel Fan-Out

Use only during `etrnl-dev-execute` when parallel-safe work needs bounded fanout. Execute owns plan execution, ledger updates, review, integration, and final verification.

1. Split work by disjoint file ownership.
2. Construct the full ETRNL task packet as specified in `etrnl-dev-execute`, including task id, lineage id, scope, verification, reviewer, reuse, TDD, deep-stack, risk, and completion fields.
   - For parallel or multi-file writes, set `criticalPath`, `stopCondition`, `waveId`, `waveSize`, `maxConcurrentLanes`, `nativeChildAgents`, `parentChildDrain`, `completionReceiptRequired`, and `completionReceipt`.
   - Default `maxConcurrentLanes` to `3`, or to `2` under the Codex execute profile. Raise it only when the plan's `## Parallelization strategy` includes one explicit justification line for the higher lane count.
   - Set `modelTier`, `codexModel`, and `codexReasoningEffort` on every packet, resolved through `resolveCodexModel` in `scripts/lib/codex-model-routing.mjs`: `standard` (`gpt-5.6-terra`/medium) for write lanes, `top` (`gpt-5.6-terra`/high) for schema/auth/money/install work, `fast` (`gpt-5.6-luna`/low) for read-only lanes. The parent orchestrator thread stays Sol-equivalent; no child packet copies that thread setting.
   - `waveSize` cannot exceed `maxConcurrentLanes`.
   - `nativeChildAgents` is `forbidden`, `modeled`, or `not_applicable`. `modeled` requires `parentChildDrain`, the child-agent drain and merge protocol before parent integration continues.
   - Completion receipts name changed files, verification commands, result status, blockers, and follow-up ownership.
   - Validate every packet with `node ~/.claude/scripts/agent-task-packet-check.mjs` before dispatch.
3. Every `spawn_agent` call and every native child agent call sets `model` and reasoning effort explicitly from the resolved packet fields. An omitted `model` inherits the parent thread model and burns flagship tokens on the child: treat an unset `model`, `inherit`, `default`, or `same as parent` as a packet defect, fix the packet, and re-dispatch. `node ~/.claude/scripts/agent-task-packet-check.mjs` errors when a write packet omits `codexModel`.
4. Report lane progress as ledger position plus named gates from `node scripts/execution-ledger.mjs history --gates --plan <plan-path>` (after install, `node ~/.claude/scripts/execution-ledger.mjs history --gates --plan <plan-path>`). Rolling hour ETAs for a wave or a lane are prohibited.
5. **Wait sizing (Codex/native child hosts):** first wait on a child equals the packet `timeoutSec` estimate (minimum 300 seconds / 5 minutes). Every subsequent wait is at least 120 seconds / 2 minutes. Never use fixed 30–60 second polling loops. On each wake-up, drain **all** completed children before waiting again. Use completion notifications or blocking waits when the host supports them; otherwise use the timed waits above (never 30–60 second polling loops).
6. Use `etrnl-executor`, `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `etrnl-investigator` by role.
7. Integrate changes sequentially; if conflicts appear:
   - do not revert user changes
   - assign one authoritative conflict owner per file
   - preserve user edits first, then keep the agent output with the narrowest matching scope
   - run available tests and linters before and after resolving conflicts
   - document resolution decisions in commit or PR notes
8. Run final verification after integration.
