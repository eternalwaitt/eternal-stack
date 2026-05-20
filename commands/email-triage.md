---
description: Run VIVAZ email Inbox Zero triage for one account, then open the action queue.
argument-hint: <account-id>
allowed-tools: Bash
---

Account argument from the slash command: `$ARGUMENTS`

Treat the argument as the account id. If it is empty, ask Victor for the account id and stop.

Do not handwrite Gmail commands. Do not send email. Do not mutate Gmail outside the VIVAZ email runtime.
Do not run `vivaz-email triage run` for this slash command. That is a dry classification path and does not clear INBOX.

Phase 1 is Inbox Zero. Triage every email in INBOX, archive known bad-quality emails, label action/waiting/manual-review items, remove them from INBOX, and provider-verify INBOX is zero:

```bash
vivaz-email triage guarded-run --account <account-id> --max-inbox 500 --apply --require-insights
```

Verify the queue run before opening any queue:

```bash
vivaz-email triage verify --latest --account <account-id>
```

If verification does not show `inbox_zero_verified: true`, `inbox_count: 0`, and either `gmail_mutated: true` or `queue_ready_without_mutation: true`, do not show queue items. Continue Inbox Zero triage first or paste the runtime blocker.

Phase 2 starts only after Inbox Zero is verified. Use the queue run id emitted by the runtime, then show exactly one action/reply queue item:

```bash
vivaz-email triage queue --run-id <run-id> --mode reply --format markdown --next
```

The queue item is the user-facing output for phase 2. Do not summarize it away. If the runtime blocks, paste the blocker and the exact next fix or command needed.
