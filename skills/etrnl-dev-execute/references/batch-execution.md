# Optional batching technique

When many similar items share the same implementation surface, batch the repeated setup and verification while retaining per-item acceptance evidence. This is a technique, not a requirement imposed by item count or a separate scope classifier.

- Group only items with compatible dependencies and write ownership.
- Separate any item that reveals a distinct failure mode or requires a different verification path.
- Run shared expensive checks once per coherent batch where they genuinely cover the batch; retain individual outcomes and exceptions.
- Preserve user-requested checkpoints and external approval gates. Batching must not move or remove them.
- Respect the active workflow contract's task, review, retry, and verification budgets. When exhausted, stop and report the unfinished items.
