---
name: etrnl-dev-autoplan
description: Turn a product or engineering request into an evidence-backed implementation plan for Claude Code or Codex. Do not implement the plan.
---
# Autoplan

Produce one practical plan grounded in the repository. Do not implement it or imply that planning authorizes execution.

## Decide the needed depth

1. Restate the user outcome, constraints, and non-goals from their request. Do not challenge explicit direction by silently replacing it.
2. Inspect relevant code, docs, tests, current changes, existing plans, and reusable helpers. Record only evidence that changes the plan.
3. Resolve `intent`, `scope`, and `risk` explicitly with the canonical workflow contract. The returned contract alone determines whether task records, plan phases, packets, test-first evidence, independent review, or work budgets apply. Scope is impact footprint, not file count. Do not use old tier tables, lexical classifiers, or fixed reviewer gauntlets.
4. Use optional design, DX, security, architecture, outside-source, or specialist review when it answers a material question or the contract requires independent review. Record unavailable tools honestly. Do not create mandatory capability passes just because a skill is bundled.
5. Propose the smallest complete set of changes that meets the requested outcome. Group work by dependency and ownership; include exact acceptance checks, failure cases, rollback, and external side effects when applicable.
6. Save the plan in the repository's established ignored planning location, review it for omissions and unsupported assumptions, and run relevant readiness checks. Report the plan path and any unresolved blocker.

## Question policy

Continue through routine analysis and planning choices using repository evidence. Ask only when a missing answer would materially change the user's outcome, scope, authority, or an external effect. Do not pause for each phase or repeatedly request larger budgets. If a budget is insufficient, report the bounded plan and what requires a new instruction.

## Output

Use `etrnl-dev-plan`'s compact plan shape. Set `Execution scope: all_phases` by default; use a narrower scope only when the user explicitly asked for partial work. Include a `Workflow contract:` reference to the resolved JSON. If the contract requires program mode, include explicit phases and a task record structure. Include packets only when the contract requires them and there is genuinely independent work. Include a test-first plan only when required or useful to prove a risky behavior change. Avoid unsupported market, performance, or security claims; cite primary evidence for claims that depend on external products.

For helpers, use `node {{ETRNL_COMPANION}} run scripts/<helper>.mjs -- <arguments>`. In a source checkout use `node scripts/companion.mjs run --host <claude|codex> scripts/<helper>.mjs -- <arguments>`; this supplies a host context and does not install the stack.
