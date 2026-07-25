# Plan-time bounded convergence (tier 3 only)

Autoplan runs this loop after the review gauntlet closes and before it emits `Status: Final` or `## Verdict`. Owner decision D1 scopes the loop to tier 3: a plan whose `Risk tier:` line reads 0, 1, or 2 skips every step below and pays no added latency.

## Tier gate

1. Read the `Risk tier:` line the plan declares. `scripts/lib/plan-risk-tier.mjs` owns the tier floor, so an under-declared tier is a plan defect that gets fixed before this gate is evaluated.
2. Tier 0–2: skip the loop. Write `Plan convergence: skipped (tier <n>)` into `## Plan Readiness Report` and finalize through the gates the plan already declares.
3. Tier 3: run the loop below to convergence, to the cycle cap, or to a stall.

## Cycle order

One cycle is three serial reviewer spawns over the current plan text:

1. `etrnl-spec-reviewer` — plan and task-packet readiness: goal traceability, disjoint write scopes, forbidden-file coverage, one verification command per task group, and acceptance criteria a machine checks.
2. `etrnl-quality-reviewer` — correctness of the planned change: architecture, data flow, failure modes, rollback, test wiring, and reuse of existing surfaces ahead of new ones.
3. `etrnl-adversary` — the most likely false premise, hidden coupling, lane collision on shared files, and every gap between the verification gates and the acceptance criteria.

These three agents already exist. Each one reads the plan and the repo and edits nothing; autoplan owns every plan edit. `references/reviewer-routing.md` fixes the gate each agent owns — never route two reviewers to one gate.

## Model routing per spawn

Resolve every spawn through `resolveCodexModel({ modelTier: "fast" })` in `scripts/lib/codex-model-routing.mjs` and write the returned slug and effort into the spawn call. All three reviewers are read-only, so all three resolve to Luna at low effort.

| Spawn | `modelTier` | Model | Reasoning effort |
| --- | --- | --- | --- |
| `etrnl-spec-reviewer` | `fast` | `gpt-5.6-luna` | low |
| `etrnl-quality-reviewer` | `fast` | `gpt-5.6-luna` | low |
| `etrnl-adversary` | `fast` | `gpt-5.6-luna` | low |

An omitted `model` inherits the parent thread model, so a read-only plan review on a Sol thread burns flagship tokens. An empty cell, `inherit`, `default`, and `same as parent` are defects that block the spawn.

## Cycle bound and stall rule

1. At most 3 cycles. Cycle 4 never runs.
2. Count open-high findings at the end of every cycle: findings the reviewers rated high or blocker that autoplan has not closed, disproved, downgraded with recorded evidence, or logged as owner-accepted risk.
3. The loop stalls the moment the open-high count fails to decrease against the previous cycle, and it ends at that cycle.
4. The loop exits converged as soon as the open-high count reaches 0.

| Exit | Condition | Plan outcome |
| --- | --- | --- |
| Converged | Open-high count is 0 at the end of a cycle | Fixes applied, plan finalizes |
| Cap | 3 cycles ran and open-high stayed above 0 | `Blocked until <named open-high finding>` |
| Stall | Open-high count did not decrease between two cycles | `Blocked until <named open-high finding>` |

Autoplan edits the plan between cycles to close findings. A cycle that runs against unchanged plan text returns the same findings and burns the cap for nothing.

## Outcome and handoff

1. Converged: the plan carries the fixes, states `Status: Final`, and passes `node scripts/deep-stack-check.mjs validate-plan --plan <plan-path>` and `node scripts/plan-readiness-check.mjs <plan-path>`.
2. Cap or stall: `## Verdict` states `Blocked until <specific blocker>` and names every open-high finding with its reviewer, its task group or file, and the reason it stayed open.
3. A Blocked plan hands off to `/etrnl-dev-execute` on exactly one path: the repository owner overrides in writing, and the override lands in the ledger before the first write task dispatches.

```bash
node scripts/execution-ledger.mjs record-decision \
  --topic plan-convergence-override \
  --decision "execute despite <n> open-high plan findings" \
  --rationale "<owner reason and the accepted risk>"
```

An override with no ledger row is not an override, and execution stops.

## Evidence

Record one review phase row per reviewer per cycle in the deep-stack artifact: role, cycle number, checked inputs, findings count, open-high count, disposition, and completion time. `## Autoplan decision log` carries one row per downgraded or owner-accepted high finding, with the evidence that justified it.

## Non-scope

- No external CLI and no multi-CLI router. This loop spawns the three existing agents and nothing else.
- No new reviewer agent, and no second pass by an agent that already ran in the same cycle.
- No extra cycle bought by re-scoping a finding. Downgrading a high finding takes recorded evidence.
