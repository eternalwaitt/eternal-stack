# Project state

Keep one project-owned Markdown overview of what exists, what changed, what remains and which mistakes should not be repeated. The default is `PROJECT_STATE.md`. Reuse an explicitly bound existing overview rather than adding a competing document. The file travels with the repository; private execution logs, saved checkpoints and host memory have separate purposes.

## Authored status and lessons

Maintain concise current-scope, feature-status, pending-work and curated-lesson sections. Use stable feature/task IDs, concrete next actions and evidence references. Distinguish implemented source, captured verification, independent review, runtime behavior and deployment. A passing command or an author-reported task status does not establish all of them.

Record a lesson only when there is supporting evidence: the observed mistake, confirmed cause or remaining uncertainty, correction/prevention and scope. A failed-then-passed command is an observation, not proof of an environment remedy or causal lesson. See [project lessons](project-lessons.md) for scoped observations, reviewed lessons and retrieval boundaries. Keep credentials, transcripts and large logs out of the overview.

The generated evidence block is a bounded view of the existing canonical ledger, not another task database. Retain detailed plans, captured outputs and private context in their existing stores; link evidence rather than duplicating queues. Preserve unresolved failures and pending ownership when consolidating old notes into current feature status.

## Maintenance during authorized implementation

Read the overview at startup, reconcile it against source and update affected status before final checks and review without repeated user reminders. Read-only explanations do not initialize state. The canonical [workflow contract](../scripts/lib/workflow-contract.mjs) requires maintenance for substantive repository writes, including direct work. Explicit `--work-kind trivial` is a light path only for clearly contained, low-risk work; read-only work also stays light. Do not use that option to exempt substantive implementation.

Stable tasks can bind `--feature ID`, `--owner ID` and `--aliases '["natural phrase"]'` at `set-task`. These support natural task selection and attributed pending work without copying another feature inventory into host settings.

For helper-managed work, read the current task's state revision, finish authored changes, then acknowledge them using the actual bound session and task:

```sh
node <companion.mjs> run scripts/execution-ledger.mjs -- read-state --session SESSION --task TASK
node <companion.mjs> run scripts/execution-ledger.mjs -- record-state --session SESSION --task TASK --revision REVISION --entry-revision ENTRY_REVISION --owner OWNER --disposition open --outcome "What changed" --pending "Remaining work and next action" --learning none
```

Use revisions returned by `read-state`; do not invent them. Set `--learning updated` only when a meaningful lesson was added, and use the appropriate `open`, `blocked`, `deferred` or `resolved` disposition for pending work. Separate task entries may merge after another entry changes; overlapping updates reject stale revisions. Taking another owner's pending entry requires an explicit `--handover-from PREVIOUS_OWNER` and current entry revision. Prior failures and ownership remain in the authored history.

The helper records attributed current-task outcome/pending notes while preserving curated sections and other tasks. Those notes remain author-reported. The acknowledgement binds task, source and authored content; semantic changes make it stale. `--unchanged-reason` only reuses an existing acknowledgement for unchanged authored content, and cannot substitute for initial task maintenance. Legacy writable contracts gain the substantive requirement through `resume-state` without resetting run/task IDs or budgets.

The helper refreshes a structurally valid generated evidence block. Only that exact marked block is neutral in the source fingerprint; authored declarations, status and notes remain source evidence. Preserve markers and let the helper update them. Malformed markers fail validation, and updates must preserve the latest authored text.

## Existing documents and recovery

Ledger initialization accepts `--state-path <relative-project-markdown>` for an existing overview. The path must stay inside the project, avoid symlinks and protected paths, and be tracked or nonignored. A project identity declaration binds the chosen overview; it is authored source. Discovery recognizes `PROJECT_STATE.md`, `CURRENT_STATE.md`, `docs/PROJECT_STATE.md` and `docs/CURRENT_STATE.md`; ambiguous choices require explicit binding.

Use bounded, read-only continuity lookup for natural requests:

```sh
node <companion.mjs> context --session SESSION --request "Continue billing"
```

It returns authored context, stable task selection, relevant scoped observations, historical checkpoints and separate evidence dimensions. Missing state remains absent. A new session may preview prior unresolved runs in the same project/worktree; multiple matches remain ambiguous. The preview preserves prior failures and budgets and does not adopt ownership or promote saved checks to current evidence. Explicitly select and transfer the prior run when continuing:

```sh
node <companion.mjs> resume --session NEW_SESSION --from-session PRIOR_SESSION --run-id RUN
```

Resume preserves task/run identity and budget usage, invalidates stale acknowledgement and rejects an active review controller or a target session already owning another run. Checkpoints retain decisions, blockers, next work and budgets, with project/worktree/source freshness and age labels. Cross-worktree or stale context is historical, never silently current.

## Enforcement and host boundaries

Shared guidance and the router tell both hosts to maintain state. Helper-managed completion can deterministically reject missing/stale required acknowledgement and missing captured evidence. Instructions alone cannot force every native response or tool invocation to use those helpers.

Core installs no automatic hooks, service or watcher. Optional [native adapters](native-adapters.md) require explicit registration and declared supported host versions. Supported startup/task/tool callbacks retrieve bounded existing context and observations; interruption/compaction callbacks checkpoint existing owned runs. Stop can request bounded repair using the same durable retry budget. A live, strictly bound outer review controller receives a checkpoint-and-yield handoff without an additional repair reservation; the outer controller still validates and finalizes the captured turn.

Registration proves configured entries, not that the host executed them or maintained meaningful state. Hook errors can fail open, some tool paths lack callbacks, compaction output has host-specific limits, and abrupt termination may deliver no event. Native work outside helpers retains guidance and explicit companion lookup/checkpoint/completion as the portable floor. Source gates validate structure, freshness and recorded evidence, not the truth of every authored claim or lesson. This source change activates no live home.
