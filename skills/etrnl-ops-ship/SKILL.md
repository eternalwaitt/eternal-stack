---
name: etrnl-ops-ship
description: ETRNL ship and launch-discipline workflow for Claude Code. Use when the user asks to ship, launch, roll out, cut over, release to production, or promote a change to users behind staged rollout, rollback readiness, and observability instrumentation.
disable-model-invocation: true
---
# Ship

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-ship`; on update, never stop to ask — continue the work; local updates auto-apply when enabled and safe.

This is the proactive ship workflow: staged rollout, rollback readiness, and observability instrumentation for a change going to users. Run this BEFORE the change reaches full traffic. The retrospective readiness audit is `etrnl-audit-production` (see the [skills catalog](../../docs/skills.md)) — run that as the pre-ship gate and do not restate its checklist here.

Ship one change through one lifecycle stage: instrument it, gate it behind staged rollout, arm a tested rollback, record the go/no-go, then promote by signal. A change that reaches full traffic without instrumentation, without an armed rollback, and without a recorded go/no-go decision did not ship — it leaked.

## 1. Staged rollout — no big-bang

Define the stages before any traffic reaches the change. Promote by a named signal, never by clock or vibe.

- `canary`: route the change to a single instance, one internal tenant, or a fixed low-percentage slice. Promotion signal: error rate and the new-path metric hold at baseline across a named observation window with real traffic on the canary.
- `percentage`: expand to a named traffic percentage (for example 10 percent, then 50 percent). Promotion signal: the new-path metric, error rate, and the critical-path latency span hold at baseline at each percentage step before the next expansion.
- `full`: route 100 percent of traffic. Entry signal: every prior stage held its promotion signal and the rollback trigger never fired.

Record the flag, environment variable, or router key that gates each stage and the exact command that advances one stage. Do not collapse stages. Do not advance a stage while its promotion signal is unmet — hold or roll back.

## 2. Rollback readiness — armed BEFORE ship

Arm rollback before the canary takes traffic, not after an incident starts.

- Name the exact rollback command or path: revert the flag, redeploy the prior build tag, disable the router key, or run the down-migration. Write the literal command, not a description of one.
- Rehearse it before ship: execute the rollback in staging or against the canary, confirm the change reverts, and record the timestamped result. An unrehearsed rollback is not armed.
- Name the trigger metric and its threshold: the exact metric, the numeric threshold, and the observation window that fire the rollback (for example error rate above 2 percent over 5 minutes, or p99 latency above the named ceiling). When the threshold is crossed, get the named owner's explicit confirmation, then run the rollback command — do not debate the decision once the owner confirms. The only exception: an approved automated rollback policy recorded before launch executes the rollback without waiting for confirmation.
- For schema and data changes, confirm the rollback path is forward-compatible: the prior build reads the new schema, or the down-migration is tested and non-destructive. Do not ship a one-way migration behind a rollback claim.

## 3. Observability instrumentation — wired BEFORE ship

Instrument the change before it takes traffic. If it is not instrumented, it did not ship. Add all four at the new boundary, in the same change that ships the code:

- Structured logs at the new boundary: emit structured records (not free text) at each new entry and exit point, keyed with the request or trace identifier and the stage or flag state.
- A metric per new code path: every new branch, endpoint, job, or consumer emits a counter or histogram. A new path with no metric is invisible and blocks ship.
- An alert threshold: wire at least one alert on the new-path metric and on the error rate for the change, with the numeric threshold that pages the owner. The rollback trigger threshold and an alert threshold are wired to the same signal.
- A trace or span for the critical path: the highest-value user flow through the change carries a span so latency and failures are attributable end to end.

Do not defer instrumentation to a follow-up. Instrumentation lands in the shipping change or the change does not ship.

## 4. Go/no-go gate

Ship only after a recorded go/no-go decision. All four hold or the answer is no-go:

- Named owner: one person owns this ship and owns the rollback decision. Record the name, not a team. Executing a production rollback requires this owner's explicit confirmation, unless an approved automated rollback policy was recorded before launch — a threshold breach alone does not auto-authorize a destructive production, migration, or data change.
- Pre-ship audit green: `etrnl-audit-production` ran against this change and reports green. A red or unrun audit is an automatic no-go.
- Rollback rehearsed: the rollback command executed in rehearsal with a recorded timestamped result.
- Instrumentation live: logs, per-path metrics, the alert, and the critical-path span are emitting before traffic.

Record the decision — go or no-go — with the owner, the timestamp, and the four states. A ship with no recorded go/no-go decision is an unauthorized ship.

## Common Rationalizations

- "It is a small change, skip the canary." Small changes cause outages. Run the canary stage.
- "Instrument it after we confirm it works." Without instrumentation there is no way to confirm it works. Instrument first.
- "Rollback is just redeploy, no need to rehearse." Unrehearsed rollbacks fail during the incident that needs them. Rehearse it.
- "The migration is one-way, we will fix forward." Fix-forward is not a rollback. Arm a real rollback or hold the ship.
- "Everyone is confident, no need to write down go/no-go." Undocumented go/no-go has no owner at 3 a.m. Record it.

## Red Flags — stop and do not ship

- No named metric or window for a stage promotion signal.
- Rollback command is described but not written literally, or never rehearsed.
- A new code path with no metric, or a new boundary with no structured log.
- The rollback trigger has no numeric threshold or no observation window.
- `etrnl-audit-production` was not run against this exact change, or came back red.
- No named human owner for the ship and the rollback decision.
- Plan to add logs, metrics, alerts, or the span in a later change.

## When NOT to use

- Retrospective production-readiness scoring of an existing deployed system: use `etrnl-audit-production`.
- Local-only experiments and throwaway branches that never reach users or shared environments.
- Pure documentation, config-comment, or non-runtime changes with no user-facing traffic and no new code path.

## Verification

Every item resolves to yes with named evidence, or ship is blocked. Count them.

Staged rollout:
- [ ] Stages named: canary, percentage, full — each with its gating flag/env/router key and its stage-advance command.
- [ ] Each stage has a named promotion signal (metric, error rate, latency span) and observation window.

Rollback readiness:
- [ ] Rollback command written literally and named.
- [ ] Rollback rehearsed with a recorded timestamped result.
- [ ] Trigger metric, numeric threshold, and observation window named.

Observability per new path:
- [ ] Each new code path has a structured log at its boundary.
- [ ] Each new code path has a metric (counter or histogram).
- [ ] Each new code path (or the change error rate) has an alert with a numeric threshold.
- [ ] The critical path carries a trace or span.

Go/no-go:
- [ ] `etrnl-audit-production` ran against this change and reports green.
- [ ] Named human owner recorded for ship and rollback.
- [ ] Go/no-go decision recorded with owner, timestamp, and the four states.
