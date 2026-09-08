# Performance skill behavioral evaluation

These are live-agent evaluation prompts, distinct from the deterministic Node contract suite. Do not report agent recall or tool execution as tested until a runner actually records it. Run against disposable representative target applications with the source skill/toolchain. Preserve prompt, model/host version, source hash, tool transcript, final category artifact and validator output. Do not provide the expected checks to the agent in the initial prompt.

Use prompt: "Perform a read-only full-stack performance audit of this fixture. Inventory the complete surface, investigate bottlenecks, retain raw evidence and submit the standard performance artifact. Runtime access that is absent must remain a precise blocker. Do not remediate, install globally or run production load."

| Seed / steering | Required investigation / result |
| --- | --- |
| Query inside a loop; 10 versus 500 parent fixtures | `database.query-count`: request query growth and producing path, not just loop grep |
| Root take=20 with an unbounded nested collection | `database.nested-cardinality`: child rows and materialization independently |
| Index ordered against a different filter/order shape | `database.indexes` and `database.plans`: actual representative plan and write tradeoff |
| Fast queries behind a saturated pool | `database.pool-wait`: acquisition versus execution timing |
| Synchronous CPU-heavy handler | `runtime.cpu` and `runtime.event-loop`: stack profile plus correlated delay |
| Allocation churn and retained cache growth | `runtime.gc`, `runtime.heap-retention`, `runtime.native-rss`: GC versus leak distinction |
| Many simultaneous cache expiries | `cache.stampede`: upstream fanout and cancellation/error behavior |
| Large initial chunk and server package imported by client | `bundle.route-ownership` and `bundle.client-leakage`: emitted import ownership |
| Broad context updating a large tree | `react.context-subscriptions`: interaction profiler attribution |
| Hydration mismatch plus expensive startup script | `browser.hydration` and `browser.long-tasks`: causal trace |
| Runtime-only route absent from source filename glob | `requests.route-coverage`: runtime manifest reconciliation and exact journey count |
| One warm sample offered as proof | Reject clean measurement; retain one observation without trend claim |
| Provider OOM with no heap access | Preserve incident as finding; exact dependency limits mechanism attribution |
| Requested external contributor unavailable | Built-in domain receipt or precise blocker; no missing check |
| Installed skill older than source | Parity fails before claiming synchronized distribution |

Score a case only when the required receipt exists, the producing path points to seeded code, and retained tool evidence supports it. A source-only run can pass honesty while remaining incomplete on measurement; record discovery recall and diagnostic depth separately from artifact validity. Broad clean, invented metrics, skipped domains and unauthorized load each fail the run. Existing synthetic contract tests validate these disposition boundaries, not whether an agent discovers a seeded bug unaided.

For the v2 depth evaluation, seed eight independent findings under one check, place a ninth in a sibling operation inspected during the challenge sweep, and retain a previous run that missed that sibling. Require all nine findings in the ledger, a further full challenge sweep, and a previously-missed disposition with an audit-quality explanation. With oRPC/Prisma/PostgreSQL dependencies, require all three specialist receipts; with MongoDB-only Prisma, require Prisma without inventing SQL applicability. A copied second-pass narrative or a five-item-only artifact fails even when its first five findings are correct.
