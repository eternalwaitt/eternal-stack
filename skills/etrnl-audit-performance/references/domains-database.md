# Database investigation

Activate for relational, document, ORM, raw SQL, driver and stored-procedure paths. Unknown persistence remains pending until manifests, dependency injection, runtime spans and schema ownership reconcile. Never limit discovery to Prisma or TypeScript patterns.

Close each `database.*` receipt independently. Map journey -> handler -> operation -> query fingerprint and retain commands, plans, fixture cardinalities and correlation ids. Query logs must be sanitized.

| Subcheck | Investigation and measurement | Remediation experiment and regression guard |
| --- | --- | --- |
| query-count | Count all queries per request at small and representative maximum cardinality; inspect loops, lazy relations and batched fanout. | Batch only semantically independent reads; assert request-level query budget at two cardinalities. |
| root-cardinality | Trace pagination, limits, exports and aggregation including raw driver calls. Measure returned and materialized rows. | Cursor pagination or streaming with bounded buffering; test maximum valid input. |
| nested-cardinality | Bound every nested relation separately, including enrichment and serializers. Capture fanout product. | Separate bounded relation queries; test a bounded parent with very large children. |
| projection | Record selected columns, transferred bytes and objects materialized before serialization. | Narrow projection without removing authorized response fields; payload and correctness checks. |
| plans | Representative data: actual versus estimated rows, loops, scans, sorts, spills and buffers. Retain engine/version, statistics age and parameter values or sanitized shapes. | Correct statistics, rewrite causal access path; replay same parameters/data distribution. |
| indexes | Match predicates, ordering, selectivity and composite column order to actual plan usage. Include write amplification and storage cost. Sequential scans can be optimal. | Compare read and write workloads; do not propose an index solely because a column is filtered. |
| pool-wait | Separate connection acquisition, execution and network time; correlate active/idle connections and queue depth at concurrency. | Bound fanout or tune pool against database capacity; test overload and recovery. |
| locks-transactions | Measure transaction age, lock waits, deadlocks and concurrency; distinguish blocked time from CPU. | Shorten transaction scope without weakening atomicity; verify concurrent correctness. |

`EXPLAIN ANALYZE` executes statements: use an authorized disposable representative database; even reads can invoke side effects. No production mutations or costly plans by default. If representative data, DB credentials or plan privileges are unavailable, name that dependency and retain static hypotheses. A toy-data plan cannot prove production clean.

Primary references: [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), [multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html), [Prisma optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance). Resolve engine/version-specific documentation before applying it.
