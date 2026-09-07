---
description: Run VIVAZ email Inbox Zero triage for one account, then open the action queue.
argument-hint: <account-id>
allowed-tools: Bash
---

Account argument from the slash command: `$ARGUMENTS`

Treat the argument as the account id. If it is empty, ask the repository owner for the account id and stop.

Do not handwrite Gmail commands. Do not send email. Do not mutate Gmail outside the VIVAZ email runtime.
Do not run `vivaz-email triage run` for this slash command. That is a dry classification path and does not clear INBOX.
Do not set a Bash tool timeout on `vivaz-email triage guarded-run`. Provider and AI work can take several minutes.

Phase 1 is Inbox Zero. Triage every email in INBOX, archive known bad-quality emails, label action/waiting/manual-review items, remove them from INBOX, and provider-verify INBOX is zero:

```bash
vivaz-email triage guarded-run --account <account-id> --max-inbox 500 --apply --allow-apply-before-enrichment --progress
```

Verify the queue run before opening any queue:

```bash
vivaz-email triage verify --latest --account <account-id>
```

If verification does not show `inbox_zero_verified: true`, `inbox_count: 0`, and either `gmail_mutated: true` or `queue_ready_without_mutation: true`, do not show queue items. Continue Inbox Zero triage first or paste the runtime blocker.

If `guarded-run` exits with `TRIAGE_GUARD_ML_DISAGREED`, do not ask the repository owner whether to continue. Inspect the runtime evidence, patch deterministic triage rules/cache when appropriate, then rerun the guarded command:

```bash
vivaz-email triage guarded-run --account <account-id> --max-inbox 500 --apply --allow-apply-before-enrichment --progress
vivaz-email triage ml-reviews --latest --account <account-id> --limit 20
vivaz-email triage report --latest --account <account-id> --include-failures --format markdown
```

Phase 2 starts only after Inbox Zero is verified. Use the queue run id emitted by the runtime, then show exactly one action/reply queue item:

```bash
vivaz-email triage queue --run-id <run-id> --account <account-id> --mode review --format markdown --next
```

Reply drafts are generated on demand when the queue opens the current item. Do not pre-run bulk reply-draft or insight tasks for the whole backlog.

If the queue item shows a proposed reply with a draft id, run the outgoing reply checker before asking the repository owner to approve or send it:

```bash
vivaz-email drafts check --draft-id <draft-id>
```

If the checker returns any issue, repair the draft locally: fetch thread context, apply the suggested revision or rewrite from the QA reasons, save the corrected body, rerun the checker, and rerender the same queue item. Do not ask the repository owner to approve a failed draft, and do not stop with only the failed check output.

The queue item is the user-facing output for phase 2. Do not summarize it away. If the runtime blocks, paste the blocker and the exact next fix or command needed.
