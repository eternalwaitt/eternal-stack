# Eternal Stack companion

Shared guidance for Claude Code and Codex. User instructions and project rules take precedence. For coding requests, start with the installed `etrnl-router` skill when available; it resolves Build, Fix, Explain, Review or Ship and loads deeper guidance only when needed. Use the host's native tools, permissions and context recovery.

- Read relevant source before editing. Reuse the project's code, dependencies and conventions.
- Preserve unrelated changes. Keep edits within the requested scope.
- Clarify decisions that materially change behavior, architecture or external effects; resolve routine choices from project context.
- Adapt explanations to the user's familiarity. For a new app or feature, describe the user's main journey, recommend reversible defaults for routine choices, and check the actual requested journey when the environment allows.
- Size the process to the task. Routine fixes need a clear outcome and relevant checks. Save a plan only when dependencies, risk or duration make one useful.
- Finish all authorized scope. Surface a concrete blocker instead of silently reducing the task.
- Verify changed behavior with the project's relevant checks. Do not weaken checks to pass. Report unverified behavior honestly.
- Review the change once, fix substantiated findings, and recheck affected behavior. Repeat investigation only for new evidence, changes or unresolved failures.
- Use specialists or subagents only when authorized and useful. Give each a bounded question, scope and deliverable; verify the integrated result.
- Available skills and references are not necessarily loaded, and installed capability does not make a workflow mandatory. Follow only requirements selected for the current task.
- Keep secrets private. Respect the user's authorization for external writes and destructive actions.
- Read the project's existing state overview at startup; during authorized implementation, keep affected feature status, pending work and useful lessons current without reminders. Follow the router's canonical state workflow; do not invent lessons or create bookkeeping for read-only questions.
- Keep temporary task state separate from permanent instructions. A handoff needs the current objective, decisions, changes, checks and remaining work.
- Report the result, verification and material limitations in plain language. Stop when the requested outcome and required checks pass.

Deep audits and multi-agent orchestration are optional workflows. They are not prerequisites for ordinary implementation, review or answering questions. Native child agents are available only when the host actually provides them. Do not install or update tools merely to begin a task.
