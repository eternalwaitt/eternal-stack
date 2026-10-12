---
name: abacatepay-integration
description: "AbacatePay payment integration: version-aware PIX, checkout, subscriptions, webhook authentication, idempotency and reconciliation"
version: 1.0.0
source: unknown
category: payments
---
# AbacatePay integration

Use the target project's installed SDK and API version. Do not mix legacy `pixQrCode`/`billing` examples with v2 checkout, transparent-payment and subscription APIs, or upgrade an existing integration implicitly. The [official SDK guide](https://docs.abacatepay.com/pages/sdks/sdks) distinguishes current and legacy integrations. SDKs and API credentials belong on the server.

## Establish the integration contract

1. Inspect the package lockfile, SDK initialization, configured API version/environment, order schema, auth boundary, existing webhook and retry handling. Never print credential values.
2. Select the requested product: hosted checkout, embedded PIX, or recurring subscription. Read its matching official API reference before implementing payloads; do not invent SDK imports, event names or response fields.
3. Use the application's trusted order/catalog to determine payable amounts, currency, customer ownership and allowed products. A browser-supplied amount or customer ID is not authorization.
4. Store exact minor units with explicit currency and validate integer range/scale at boundaries. Use the project's established money representation; do not perform currency arithmetic with binary floating point.
5. Keep merchant fees out of reusable code guidance. Check the current merchant agreement and [official fees](https://docs.abacatepay.com/pages/concepts/taxas) when pricing matters.

## Create and display a payment

For v2, the [official API index](https://docs.abacatepay.com/llms.txt) maps hosted checkout, transparent PIX, subscription products, status queries and simulation endpoints. Responses use an envelope; inspect both the transport result and the provider's success/error fields before using `data`. Resolve the current QR-code fields from the exact endpoint documentation.

Implement the full product flow: authenticated order lookup, server-derived price, provider request, durable provider/order association, pending state, QR/link display, expiry, payment confirmation, and recovery after reload. A successful creation response is pending payment, not fulfillment. Status endpoints must authorize access to the local order before revealing provider state.

Bound polling and network requests with cancellation, backoff and a deadline. Stop polling when the UI closes or the payment reaches a terminal state. On a create timeout, reconcile the ambiguous provider outcome before retrying; use a documented provider idempotency mechanism when available and retain the same local operation identity. Do not assume `externalId` alone guarantees provider deduplication.

## Webhook authentication

The [official security contract](https://docs.abacatepay.com/pages/webhooks/security), checked 2026-10-11, uses both the configured secret in `webhookSecret` and `X-Webhook-Signature`. Its HMAC-SHA256 covers the raw body and uses the provider's published key with base64 output. A public HMAC key is not sufficient to authenticate a sender; do not omit the private URL secret. Confirm the contract for the API version in use.

Validate both before interpreting business fields. Preserve raw bytes, reject missing/malformed credentials, and use a timing-safe comparison with a length check. Do not substitute the URL secret for the published HMAC key or use the old `x-abacatepay-signature`/hex example. Redact query secrets at proxies, access logs, tracing and error boundaries; avoid logging full payment payloads or tax identifiers.

Validate the event fields the application consumes while tolerating unknown additive fields. Compare environment, provider payment/order identity, currency and paid amount against the trusted local record before transitioning state. Unknown event kinds must not grant access.

## Durable processing and reconciliation

[Webhook delivery documentation](https://docs.abacatepay.com/pages/webhooks) describes repeated deliveries and the event identifier. Delivery deduplication alone is insufficient for a business operation: manual resend can have a new event ID, and distinct events can refer to the same payment.

Use the project's database transaction and durable job mechanisms:

- Enforce a unique provider/environment/event key at storage level; a read-then-insert sequence races under concurrent delivery.
- Guard the payment transition using the provider payment identity and current state. Fulfillment must happen once even across different event IDs for the same paid operation.
- Atomically commit the state transition, receipt and outbox/job intent, or roll them back together. A placeholder helper that returns without persisting is not a successful handler.
- Perform outbound effects from a durable worker with its own idempotency key and retry/dead-letter policy. An in-memory task after returning success can be lost.
- Return success only after processing or a durable accepted-work record is committed. Surface temporary storage failure with a retryable result matching the provider contract; do not swallow it and return success.
- Reconcile pending/ambiguous payments against provider status using a bounded job. Preserve refund, dispute, cancellation and renewal semantics; avoid overwriting a terminal state with an older event.

For subscriptions, model customer entitlement separately from individual invoice/payment status. Confirm supported cycles, cancellation timing, plan changes, failed renewal and refund behavior in the installed API's documentation. Do not infer an active subscription from a generic billing event.

## Verification

Use isolated fixtures before any separately authorized provider sandbox test. Cover:

- Unauthorized order/customer access and client-modified amounts.
- Missing/wrong URL secret, wrong HMAC, altered raw body, malformed JSON and unknown additive fields.
- Provider transport errors, failure envelopes, create timeout and reconciliation without duplicate charges.
- Concurrent duplicate events, different event IDs for the same payment, out-of-order delivery and worker retry.
- Database failure before commit, crash after commit before response, and outbox recovery.
- Wrong environment, currency, amount or provider identity; expiry, refund and renewal failures.
- UI pending/error/expired/confirmed states and state retained after reload.

Retain exact test results and distinguish mocked provider behavior from real sandbox evidence. No live charge, refund, message or credential installation is authorized by this skill.

## Official references

Read only the endpoint needed for the task:

- [Hosted checkout](https://docs.abacatepay.com/pages/payment/reference)
- [Transparent payments](https://docs.abacatepay.com/pages/transparents/reference)
- [Subscriptions](https://docs.abacatepay.com/pages/subscriptions/reference)
- [Webhook security](https://docs.abacatepay.com/pages/webhooks/security)
- [SDK versions](https://docs.abacatepay.com/pages/sdks/sdks)

Attribution metadata remains unchanged; Eternal Stack maintains these integration corrections without claiming original authorship of the inherited skill.
