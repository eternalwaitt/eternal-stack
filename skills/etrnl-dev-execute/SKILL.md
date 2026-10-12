---
name: etrnl-dev-execute
description: Execute an implementation request or approved plan end to end for Claude Code or Codex. Use only when the user authorizes implementation; never treat a plan, ship workflow, or review gate as authority for external effects.
disable-model-invocation: true
---
# Execute work

Complete the user's requested repository work within the stated scope, preserving unrelated changes. For an approved plan, complete every item in its `Execution scope`; stop with a concrete blocker if completion is impossible. Do not silently substitute an MVP or first phase.

## Establish the workflow

1. Read the request or full plan, current repository guidance, the existing bound project-state overview, relevant files, and `git status`. Separate existing user changes from task changes.
2. Read the router's resolved workflow contract. If working without the router, resolve the axes explicitly and pipe the JSON directly into ledger initialization:

   ```sh
   node {{ETRNL_COMPANION}} run scripts/workflow-contract.mjs -- resolve --intent <build|fix|explain|review|ship> --scope <contained|coupled|broad> --risk <low|high> | node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- init --workflow-contract - --session <host-session-id>
   ```

   Scope describes the impact footprint, not a file count. Ask only if an axis materially changes the workflow and cannot be established from the request and repository evidence. Do not infer axes lexically or raise scope to justify ceremony. `ship` names a workflow; it does not authorize publishing, deployment, merging, or other external effects.
3. Follow the returned contract as the sole source for task records, plan phases, packets, independent review, test-first evidence, and bounded work. A bundled skill being present does not make it loaded or mandatory. Load only the capability needed for the actual work.
4. For structured/program work, initialize the ledger with the resolved contract JSON on stdin. A plan path is optional in structured mode and may be supplied in program mode when the plan already exists:

   ```sh
   node {{ETRNL_COMPANION}} run scripts/workflow-contract.mjs -- resolve --intent <...> --scope <...> --risk <...> | node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- init --workflow-contract - [--plan <plan-path>] --session <host-session-id>
   ```

   The ledger persists run state under the companion-provided `ETRNL_RUNS_DIR`. Direct work does not require a plan, phases, packets, or ledger. Read-only explanation and review do not require a ledger. When a ledger is active, derive requirements and budget from its stored contract; do not substitute a second local policy.

## Work and verify

Maintain the bound project-state overview as part of the task, without user reminders. Reconcile affected features, pending work and meaningful lessons before final checks/review; when the contract requires it, run `record-state --outcome "<actual task result>" --pending "<remaining work or none>" --learning updated|none` through the ledger helper. `none` means no new lesson, not permission to leave stale feature status. Generated ledger evidence is automatic; authored facts still need judgment. Follow `docs/project-state.md` and the canonical contract, without copying their policy into the plan.

- Continue through mechanical steps without repeated approval prompts. Pause only for destructive or separately authorized external effects, missing credentials, a material expansion beyond the request, conflicting user edits, an unresolved premise, or a genuine blocker. Standing authorization applies within its stated scope. When a budget is exhausted, stop, preserve the work, and report what remains; do not ask repeatedly for a larger budget.
- For source fixes with contract-required TDD evidence, run a focused failing test or executable probe before changing production code; then implement and show it passing. If test-first is not feasible, record the concrete reason and compensating verification.
- Run relevant repository checks. For ledger-backed structured/program work, capture required mechanical evidence with the command runner, for example `node {{ETRNL_COMPANION}} run scripts/execution-ledger.mjs -- run-check --name focused-test -- npm test -- --runInBand`. A self-reported check row does not replace a command-run result. Direct work has no ledger requirement; run the command natively and report its actual result. Preserve failures and distinguish pre-existing failures from regressions. The runner reserves its own attempts/retries; never pre-charge them with manual budget commands. Keep the same logical check name across red/green retries; see `references/verification-gates.md`.
- Use native host delegation only when the contract permits it and work is genuinely independent. Keep write scopes disjoint, respect the resolved worker/review budgets, and inspect all returned work before integration. Before dispatch, assign expensive checks and long-lived processes to one owner; use `references/parallel-fanout.md` when coordinating shared resources. Host adapters describe mechanics only; they do not change the contract.
- When the contract requires independent review, use the companion's captured reviewer execution; a caller-written artifact or a renamed self-review cannot satisfy it. Save a checkpoint and register `request-review` from the original session first. On supported Codex hosts, the outer-host `review-and-resume` command launches a separate read-only reviewer and resumes the original session; see `references/bounded-review.md` and the capability guide. A nested sandbox may prohibit starting that host process: preserve the checkpoint and report the exact host handoff, without bypassing the sandbox or claiming completion. Manual review records may report `blocked` or `skipped`, never manufacture `verified`. Respect the stored review budget.
- Load optional review, security, domain, design, or performance capabilities when their subject applies or the contract requires review. Review findings should be evidence-backed, deduplicated, and resolved or reported with their remaining impact.
- Keep project data, secrets, and private identity out of tracked artifacts. Repository writes do not imply permission to install Eternal Stack, access live services, publish, merge, or deploy.

Before a required review, interruption or execution deadline, write a concise project-local checkpoint with current source, accepted scope, completed and remaining work, evidence paths, active task/session identity and remaining budget. Save it before registering review; keep it unchanged until review capture finishes, then write a new checkpoint/request after source fixes. During controller-managed resume, finish task/check evidence and yield for controller finalization; the outer controller performs the final completion check. Resume the same task; do not reset its allowance.

## Completion

Reconcile every requested outcome. Report changed paths, checks actually run and their results, remaining blockers, and any authorized action that still needs a separate step. Leave the work recoverable if a contract budget or material blocker stops completion.

For helper commands, use the portable companion runner: `node {{ETRNL_COMPANION}} run scripts/<helper>.mjs -- <helper arguments>`. It runs in the current project directory and supplies the installed host/library paths; never hard-code `~/.claude` for shared workflows. In a source checkout, use `node scripts/companion.mjs run --host <claude|codex> scripts/<helper>.mjs -- <helper arguments>`; this targets only the supplied host fixture/home and does not install anything.
