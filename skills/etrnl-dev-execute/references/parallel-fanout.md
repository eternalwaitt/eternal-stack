# Optional parallel work

Parallelize only when it shortens the task without obscuring ownership or correctness. The canonical workflow contract controls whether workers and packets are allowed and sets their budget.

- Use independent, bounded tasks with explicit read/write scope, expected result, and validation when packets are required.
- Keep overlapping writes sequential. Integrate each result, inspect the diff, and run shared checks after integration.
- Use host-native dispatch and required native model fields; do not hard-code a Claude or Codex lane cap in shared workflow guidance.
- Do not delegate for ceremony. If no independent task exists, work directly.
- Stop when the worker budget is exhausted; do not relabel tasks to bypass it.

## Shared verification and process ownership

Before workers start, name one owner for each expensive suite, build, browser session, watcher or development server. Other workers use focused checks or consume the owner's evidence; they do not independently launch the same broad check. Reuse a server only after confirming its project, configuration and reachable address match. Keep separate browser contexts only when isolation is needed for the tested behavior.

Pass workers the objective, disjoint files, acceptance result, dependencies, existing check receipts and remaining contract budget. Give paths and relevant excerpts instead of the entire conversation or every skill. Nested delegation consumes the same task budget and needs the same authorization as its parent.

The owner records start/stop handles for task-created processes and cleans them up on completion, failure or cancellation. Stop only owned processes; do not kill unrelated servers by executable name or port. The finite command runner does not manage host-native browsers or persistent servers. Shared verification must finish against the integrated source; stale or differently configured results cannot satisfy a required gate.
