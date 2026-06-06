# Workflow

- Use hooks for enforcement, skills for repeatable procedures, and startup files only for routing.
- Use `etrnl-dev-brainstorm` when requirements are still fuzzy.
- Use `etrnl-dev-plan` for multi-step implementation plans; write to disk, review, improve, and finalize.
- Use `etrnl-dev-autoplan` to draft execution-ready plans with task groups, dependencies, verification gates, subagent candidates, gauntlet-lite review, and completeness 10/10 defaults.
- Use `etrnl-dev-execute` only when the user explicitly asks to execute a written plan; once approved, continue through mechanical phases without asking between them.
- During execution, use dependency waves, file-overlap checks, required artifacts, heartbeat checkpoints, and final ledger validation.
- Use structured task packets for every subagent: goal, context, scope, read set, write scope or read-only, forbidden files, expected output, verification, model tier, timeout, retry policy, no-revert instruction, and WebSearch guidance.
- Use `etrnl-dev-review` or `etrnl-dev-stress-test` for gap reviews, risks, and final passes.
- Use `etrnl-audit-code` for whole-codebase health, no-skips audits, dead code, repo rot, docs health, and PR gates.
- Use `etrnl-audit-browser`, `etrnl-ops-context-save`, and `etrnl-ops-context-restore` when browser proof or resumable workflow state is part of the job.
- Keep chat summaries short when the durable artifact is a file.
