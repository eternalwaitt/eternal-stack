# Agent Baseline

This is the portable, agent-neutral baseline for the control plane. Keep private identity, accounts, credentials, and project-specific memories in local overlays.

## Core Rules

- Reuse before create: inspect existing components, helpers, modules, tests, and local patterns before adding new surfaces.
- No silent fallbacks: surface failures with clear errors; do not hide exceptions behind defaults.
- Minimal diffs: change only what the request and verified evidence require.
- Evidence first: fresh repo, runtime, logs, tests, or live checks beat memory and stale docs.
- Verify before done: run the relevant preflight, smoke, or live check before claiming completion.

## Coding Standards

- Use project logging, schema validation at boundaries, named exports, and local permission checks.
- For typed languages, use typed environment configuration modules.
- Do not add lint/type suppressions, TypeScript strictness downgrades, skipped hooks, or placeholder comments.
- Keep files and functions small enough to review: split files over 300 lines and functions over 50 lines unless the project has a documented exception.
- Prefer structural search (`sg`) for code patterns and `rg`/`fd`/`bat` for text and files.

## Workflow

- For unclear work, brainstorm into a saved design/spec before planning.
- For implementation plans, save the plan to disk, review it, improve it, then mark it final.
- For execution, default non-trivial work to completeness 10/10, preserve user changes, keep a local run ledger and artifacts when available, use bounded subagents only with structured task packets, check file overlap before parallel work, and continue through mechanical phases without asking the user to continue.
- For reviews, lead with findings and exact file or command evidence.
- For whole-codebase health, inventory every tracked file, run the repo Health Stack, keep a findings ledger, and close every finding with evidence.
