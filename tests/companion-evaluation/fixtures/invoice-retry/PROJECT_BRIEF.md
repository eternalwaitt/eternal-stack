# Invoice retry behavior

The relevant path crosses `packages/billing`, `packages/queue`, `packages/persistence`, and `packages/provider`. A provider timeout is ambiguous: the provider may have accepted the payment before the response was lost.

Required behavior:

- Retry for the same invoice uses one stable provider idempotency key across attempts; retries must not create a second charge.
- Persist the attempt/idempotency identity before making the provider call so a restart can reuse it.
- Amounts are integer minor units. Preserve `amountMinor` and `currency` exactly; never multiply or round money on retry.
- A timeout is `unknown`/pending, not a definitive payment failure. A later retry can resolve it using the same key.
- On success, persist the provider payment reference and mark the invoice paid.

There is no live payment provider here. Tests use a local fake that deduplicates requests by idempotency key.

Keep the fixture-facing interfaces stable so the evaluator can test the behavior across a store restart: `createAttemptStore(filePath)` returns synchronous `get(invoiceId)` and `put(attempt)` methods; `createInvoiceWorker({ store, provider }).handle(invoice)` routes queue work through billing. You may change the internal implementation and add modules.
