---
name: etrnl-router
description: ETRNL request router and decision tree for Claude Code. Use when the user asks "which etrnl skill", "which agent", "route this", "where do I start", or when a task spans dev, audit, ops, or review families and the correct etrnl-* surface is not obvious.
disable-model-invocation: true
---
# ETRNL Router

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-router`; on update, ask update/snooze/continue.

Route each request to exactly one `etrnl-*` skill or agent. Match the trigger, invoke the named surface, and hand off. Do not reimplement a family's workflow inline; open the matched skill and follow it.

## Operating behaviors (always on)

These apply before, during, and after every route. They bind every downstream skill and agent.

- Evidence first: fresh repo, runtime, logs, tests, and live checks override memory and stale docs. Read the target files before you claim state.
- Minimal diffs: change only what the request and verified evidence require. Minimal diffs constrain how each item lands; they never license dropping a phase or shrinking scope.
- Verify before done: run the matched skill's verification gate, or the smallest project preflight that proves the behavior, before reporting completion.
- Reuse before create: inspect existing skills, hooks, scripts, docs, and helpers before adding a new surface. Route to an existing family before you build anything new.
- No silent fallbacks: surface failures with clear errors. When a matched skill or companion is unavailable, state that fact and route to the closest manual pass; do not hide the gap.

## Family routing

Read the request, match the first trigger that fires top to bottom, invoke the named surface.

### dev-* family (build a change)

| Trigger condition | Route to |
| --- | --- |
| Requirements are fuzzy, the idea needs scoping, options need weighing, or the ask is "turn this into a spec" | `etrnl-dev-brainstorm` |
| Multi-step implementation needs a file-backed plan written, reviewed, improved, and finalized | `etrnl-dev-plan` |
| The plan needs task groups, dependency waves, subagent candidates, verification gates, and a readiness report | `etrnl-dev-autoplan` |
| The user explicitly asks to execute an approved written plan | `etrnl-dev-execute` |
| The user explicitly asks to test, verify, or run checks with red-green-refactor discipline | `etrnl-dev-test` |
| A failing command, wrong output, or defect needs systematic root-cause debugging | `etrnl-dev-debug` |
| The user explicitly asks to open or update a pull request | `etrnl-dev-pr` |
| The user explicitly asks to commit staged or working changes | `etrnl-dev-commit` |
| CI/CD pipelines, release gates, or workflow hardening are in scope | `etrnl-dev-ci` |
| Dependency updates, audits, bot-PR triage, or security-patch bumps are the job | `etrnl-dev-deps` |
| An architecture, plan, diff, or completion claim needs an adversarial stress pass | `etrnl-dev-stress-test` |

### audit-* family (assess health)

| Trigger condition | Route to |
| --- | --- |
| Whole-codebase health, no-skips inventory, dead code, repo rot, architecture health, or a PR gate | `etrnl-audit-code` |
| Security vulnerability hunting on auth, tenancy, payments, secrets, or OWASP surfaces | `etrnl-audit-security` |
| Latency, bundle size, query plans, rendering cost, or throughput profiling | `etrnl-audit-performance` |
| Documentation health: README, ADR, runbook, API-doc, TSDoc/JSDoc freshness and drift | `etrnl-audit-docs` |
| Production readiness: rollout, observability, resilience, and operational safety | `etrnl-audit-production` |
| Tooling ecosystem and developer-experience health of the repo toolchain | `etrnl-audit-tooling` |
| Real browser QA evidence: routes, responsive layouts, console/network errors, screenshots | `etrnl-audit-browser` |

### ops-* family (workflow state)

| Trigger condition | Route to |
| --- | --- |
| Save progress, checkpoint working context, or prepare a resumable handoff before a break | `etrnl-ops-context-save` |
| Resume prior work, restore a saved checkpoint, or rebuild working context | `etrnl-ops-context-restore` |

### Design and build companions

| Trigger condition | Route to |
| --- | --- |
| Server-side API, data-layer, auth, resilience, or service-architecture design | `etrnl-backend-patterns` |
| Structural or excellence code review, module decay, Brooks-style review | `etrnl-code-review-excellence` |

## Reviewer and worker agents

Invoke these read-only or bounded agents during planning and execution. Match the trigger, hand the agent a structured task packet (goal, context, scope, read set, write scope or read-only, forbidden files, expected output, verification, model tier, timeout, retry policy, no-revert instruction).

| Trigger condition | Route to |
| --- | --- |
| A plan or task packet needs read-only spec review before implementation starts | `etrnl-spec-reviewer` (agent) |
| Completed implementation output needs read-only quality review before final verification, including test-decay lenses T1-T6 (Coverage Illusion, Mock Abuse, Brittleness, Obscurity, Skip/Focus, Tautology) | `etrnl-quality-reviewer` (agent) |
| A plan, diff, or completion claim needs a read-only adversarial challenge | `etrnl-adversary` (agent) |
| Read-only repository discovery is required before planning or editing | `etrnl-scout` (agent) |
| An execution run is blocked by a failing command, ambiguous root cause, or a repeated issue | `etrnl-investigator` (agent) |
| An approved task packet assigns bounded implementation work | `etrnl-executor` (agent) |
| A change touches a shared value, field, filter, or helper and only some call sites are updated | `etrnl-consumer-tracer` (agent) |
| A plan carries UI, visual, interaction, responsive, or accessibility scope | `etrnl-design-reviewer` (agent) |
| A plan changes developer-facing APIs, CLI commands, docs, errors, install, upgrade, or onboarding | `etrnl-dx-reviewer` (agent) |
| Read-only browser QA evidence is needed for routes, layouts, console/network errors, or accessibility | `etrnl-browser-qa` (agent) |
| A diff / changed-file set needs a read-only check that changed behavior carries the required test wiring | `etrnl-test-wiring-auditor` (agent) |

`etrnl-quality-reviewer` owns test-decay lenses T1-T6 (Coverage Illusion, Mock Abuse, Brittleness, Obscurity, Skip/Focus, Tautology). `etrnl-test-wiring-auditor` owns behavioral-coverage mapping and emits `required_tests[]` for changed behavior that lacks test wiring. Route decay lenses to the quality reviewer and coverage mapping to the test-wiring auditor; keep the two gates disjoint.

## Domain-sensitive surfaces

When the change touches auth, tenancy, billing, payments, money values, i18n, Prisma or schema, permissions, or soft deletes, invoke `eternal-best-practices` plus the matching domain skill before editing. When a bundled domain skill is missing from the host, state that fact and run the closest manual review pass. Do not skip the domain gate silently.

## Multi-family requests

When one request spans families, route in this order: discovery and scoping first, then planning, then execution, then verification and review.

1. Scope or discover: `etrnl-dev-brainstorm` or `etrnl-scout`.
2. Plan: `etrnl-dev-plan` or `etrnl-dev-autoplan`.
3. Execute: `etrnl-dev-execute` with `etrnl-executor` agents under task packets.
4. Verify and review: `etrnl-dev-test`, then `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and `etrnl-adversary` for the pass the scope demands.

Route to one surface per step. When no trigger fires, return to the operating behaviors, re-read the request against the tables, and name the closest family instead of guessing.

## Verification

PASS/FAIL checklist (any FAIL marks the route incomplete):

- [ ] Exactly one skill or agent matched the request's leading trigger.
- [ ] The operating behaviors were stated as binding on the downstream surface.
- [ ] Every unavailable skill or agent was surfaced as an explicit gap, not hidden behind a fallback.
- [ ] Domain-sensitive surfaces routed through `eternal-best-practices` plus the matching domain skill before any edit.
