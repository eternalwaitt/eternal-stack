# Optional review handling

Use this guidance only when review is selected by the workflow contract, requested by the user, or needed to resolve a specific risk. It does not set a universal review chain or round count; the stored contract supplies the allowed review budget.

1. Review the changed surface against acceptance criteria and identify findings with concrete evidence, impact, and a proposed correction.
2. Merge overlapping findings, keep distinct failure modes separate, and distinguish verified defects from questions or preferences.
3. Apply straightforward repository-local fixes that remain in scope. Re-run the relevant checks after fixes.
4. At the contract's review limit, stop. Summarize remaining findings and their impact; do not rename reviewers, reset counters, or ask repeatedly for a larger budget.
5. A review finding never authorizes a destructive or external action. Follow the user's standing authorization and ask only where a material decision remains outside it.

## Independent-review evidence

When the workflow contract requires independent review, obtain an actual result from a distinct reviewer invocation against current source. Never self-review under another name. Caller-authored review artifacts cannot grant verified status; manual `record-workflow-review` is for honest `blocked` or `skipped` outcomes.

For supported Codex hosts, the author first saves a concise checkpoint and registers it from the original Codex session:

```sh
node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- request-review --checkpoint <checkpoint-path> [--session <ledger-session-bucket>]
```

The actual author session comes from the host's `CODEX_THREAD_ID`; do not invent or override that identity. Then use the companion's explicit outer-host handoff:

```sh
node {{ETRNL_COMPANION}} review-and-resume --host codex --ledger <active-ledger-path>
```

The command derives the checkpoint and original author session from the pending request; optional checkpoint/session arguments must match it. Each request permits one review/resume cycle. The command launches a fresh read-only reviewer, captures its provider output, and resumes the original implementation session with the result. It uses the stored contract's remaining allowance; it does not create a fresh budget. Keep the checkpoint/evidence outside tracked source or in an ignored project-local directory so routine evidence updates do not invalidate the reviewed source. Keep the registered checkpoint unchanged until review capture finishes; the controller retains an immutable snapshot for the receipt. After any source fix, earlier review evidence is stale: save an updated checkpoint, register a new request, and use the remaining review allowance for another pass.

If approved source is unchanged but the author continuation was interrupted, use the same outer command with `--resume-existing`. It revalidates the captured approval and spends a remaining retry before resuming the same author; it does not launch another reviewer. Changed source or failed review cannot use this shortcut; address the findings and request fresh review within the remaining allowance. Exhaustion leaves the work incomplete, never authorizing a fabricated receipt or reset budget. See the capability guide for recovery boundaries.

Before the final review request, refresh required checks made stale by implementation changes. During finalization, preserve accepted task identity/title/scope and update status only (`set-task --task <id> --status verified`); replacing the title can invalidate an otherwise current review. A deliberate scope change needs fresh review.

This is an explicit host-side operation, not automatic Core interception. If a nested sandbox denies starting the host CLI, retain the checkpoint and report the exact command for the authorized outer host; do not disable the sandbox or substitute an evaluator-only action. An unavailable host/reviewer leaves the requirement unsatisfied. During resumed work, finish required task/check evidence and yield with controller finalization pending. The captured review remains pending until that resumed host turn finishes successfully; do not repeatedly run a completion check that is waiting for the controller or fabricate a verified row. The outer controller then performs the final completion check. Do not claim completion merely because a command exited successfully: inspect the captured findings and controller result. Claude support and host behavior must be established separately. See `docs/skills.md#capturing-independent-review` for the interface and `docs/companion-evaluation.md#review-output-evidence` for measured evidence and limitations.

A read-only reviewer may inspect current-source captured mechanical-check evidence when its own sandbox cannot run a disk-writing test. A sandbox denial is a verification limitation, not by itself a source defect; it also does not compel approval when evidence is insufficient. Keep that limitation in the result.

The captured lifecycle and source binding establish a separate invocation within the supported local-controller boundary. They do not guarantee review quality or defend against a malicious user rewriting controller state. Stay within the stored review budget.

For deterministic rule checks, use the helper through `node {{ETRNL_COMPANION}} run scripts/review-rules.mjs -- <arguments>`. Review helpers support the work; they do not replace a command-run verification result when the contract requires mechanical verification.
