---
name: etrnl-dev-parallel
description: ETRNL control-plane parallel-agent workflow for Claude Code. Use only when the user explicitly asks for parallel agents; hidden from model auto-invocation because it delegates work.
disable-model-invocation: true
---
# Parallel Fan-Out

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-parallel`; on update, ask update/snooze/continue.

Use this only as an explicit fanout helper. `/etrnl-dev-execute` is the main orchestrator and owns plan execution, ledger updates, review, integration, and final verification.

1. Split work by disjoint file ownership.
2. Assign the full ETRNL task packet: goal, context summary, exact scope, cwd/project context, read set, write scope or read-only, forbidden files, expected output, verification command, model tier, timeout, retry policy, no-revert instruction, and WebSearch policy.
   - Parallel or multi-file write packets include `criticalPath`, `stopCondition`, `waveId`, `waveSize`, `maxConcurrentLanes`, `nativeChildAgents`, `completionReceiptRequired`, and `completionReceipt`.
   - `criticalPath` is a boolean or lane-id list that marks priority lanes for earlier scheduling; `stopCondition` is a named condition or threshold object that halts later waves when the packet checker or orchestrator reports it satisfied.
   - `maxConcurrentLanes` is capped at `6`; `waveSize` cannot exceed it.
   - `nativeChildAgents` is `forbidden`, `modeled`, or `not_applicable`. `modeled` requires `parentChildDrain`.
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
