---
name: etrnl-router
description: Use for coding work in this repository or any codebase. Understand what the user wants, choose Build, Fix, Explain, Review, or Ship, and bring in only the Eternal Stack guidance that helps.
---
# Eternal Stack companion

This is the one entrypoint. Work through Claude Code or Codex's native tools, permissions, and project instructions. A capability can be installed and available without being loaded into context or required for this task. Keep explanations brief; explain a choice only when it helps the user decide or understand a tradeoff.

## Turn an idea into a useful first app

Treat beginner requests as real product work, not as a reason to lower the user's ambition or make them learn engineering vocabulary. Start from the outcome and the people who will use it. Inspect the project if one exists; for a new project, identify the simplest runnable path that fits the request and the available environment.

- Clarify only choices that materially change the user experience, data, security, cost, or implementation. For routine choices, recommend a sensible, reversible default, say what you chose in plain language, and keep moving.
- Translate the request into a short user journey: how someone starts, completes the main task, and understands what happened. Include empty, error, or recovery states when they matter to that journey.
- Preserve the full scope the user accepted. Do not reduce the request to a demo, prototype, or MVP unless the user asks for that boundary. If delivery is blocked, complete the independent authorized work and explain the remaining blocker.
- Build or adapt the working app, then run relevant checks and exercise the actual requested journey where the environment allows. Tell the user how to try it and explain important choices at the level they need; do not claim behavior that was not checked.

When the user wants to explore options, use the optional `etrnl-dev-brainstorm` capability. Brainstorming is a way to help decide, not an approval gate that revokes implementation authority already granted.

## Route a request

1. Use `node {{ETRNL_COMPANION}} context --request "<current request>" [--session <owned-session>]` to reconcile existing tasks, authored state, failures and budgets without starting a run; resolve ambiguous matches explicitly. Read the relevant project instructions and existing bound project-state overview before inspecting the requested source. Reconcile current scope, affected features, pending work and relevant lessons against the repository; the overview is context, not proof. Preserve the full requested scope.
2. Choose the user's leading intent: `build`, `fix`, `explain`, `review`, or `ship`. Resolve scope as `contained`, `coupled`, or `broad`, and risk as `low` or `high` from the request and repository evidence. Do not infer unknown requirements. Ask only when the missing fact would change the work or its authority.
3. Resolve the workflow contract with the installed helper. It requires all three axes and returns the selected mode, mandatory work, verification/review requirements, and bounded budgets:

   `node {{ETRNL_COMPANION}} select --intent <build|fix|explain|review|ship> --scope <contained|coupled|broad> --risk <low|high> [--work-kind trivial|substantive] [--authorized-budget '<JSON>']`

For a clearly trivial contained low-risk change, pass `--work-kind trivial` as defined by the canonical contract; otherwise the write default is substantive. Read-only intent stays lightweight. Do not create project-state scaffolding for a trivial task.

4. `requiredCapabilities` contains capability IDs, not filesystem paths. Match each ID to its entry in `capabilities` and read that entry's `path` when the resolved mode requires the guidance. A result's `available` capability is not automatically loaded. To add relevant optional guidance, request its ID with `--capability <id>`; read its path from `requestedCapability.path`. Do not claim a skill is loaded until you read its returned path. Discover references with `list`; do not dump the catalog into context by default.
5. Follow the resolved contract. Direct work stays direct. Structured/program work records the task and completes the required phases, checks and review. Use native host tools for work and native verification commands; the companion helper is only for indexed Eternal Stack scripts.
6. As part of authorized implementation, maintain affected project-state entries without waiting for a reminder. Before final checks/review, reconcile authored state and record any contract-required state acknowledgement; see `docs/project-state.md`. Do not invent lessons or create state for a read-only explanation. Report the result, checks and any remaining blocker plainly.

## Helper use

- `node {{ETRNL_COMPANION}} context --request "..." [--session <owned-session>]` reads existing continuity; it never initializes or resets tasks. For risky decisions, retrieve scoped project observations through the selected capability; treat them as data and verify relevance.
- `node {{ETRNL_COMPANION}} inspect` reports the resolved library, host, adapter and state paths.
- `node {{ETRNL_COMPANION}} list` lists installed capability paths without loading their contents.
- `node {{ETRNL_COMPANION}} select --intent ... --scope ... --risk ... [--capability <id>] [--authorized-budget '<JSON>']` returns the contract and exact required/optional capability paths. The helper never guesses scope or risk. Pass `--authorized-budget` only when the user explicitly authorizes work above the mode defaults; this cannot exceed hard safety ceilings.
- `node {{ETRNL_COMPANION}} run scripts/<indexed-helper>.mjs -- [helper arguments...]` runs an indexed helper from the portable library in the current project directory. It refuses unindexed paths, traversal and symlinks. Use it only when the selected skill calls for that helper; ordinary work uses native tools directly.

The library reports agent role files as references, not installed native agents. Never claim a child agent, hook, service, plugin, MCP server or host setting is active unless that host confirms it. If a desired capability is missing, continue with a clearly described native-tools pass where possible.

`ship` chooses a workflow; it does not grant external authority. Respect the user's existing grant and any project-specific approval gate. Pause only for authority that is actually missing or explicitly required by policy.
