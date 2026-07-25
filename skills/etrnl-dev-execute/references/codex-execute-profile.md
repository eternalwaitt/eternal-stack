# Codex execute profile

Load this file from `etrnl-dev-execute` when the run resolves to the Codex host, and whenever a spawn call, lane cap, or progress line needs its exact contract.

## Host selection

`ETRNL_EXECUTE_HOST` selects the process profile at startup:

- `ETRNL_EXECUTE_HOST=codex` runs the Codex profile in this file.
- `ETRNL_EXECUTE_HOST=claude` runs the Claude path in the skill with no change.
- Unset: run the Codex profile when the session runs under the Codex CLI — the harness exposes `spawn_agent` or native child agents, `CODEX_HOME` is set, or the active skill copy resolves under `~/.codex/skills/`. When none of those hold, run the Claude path unchanged.
- Any other value is a configuration defect: report the value, then resolve the host by the detection rule above.

State the resolved profile and the signal that selected it in the first status line of the run.

## Codex profile defaults

1. Default `maxConcurrentLanes` to `2`. Raise it only when the plan's `## Parallelization strategy` justifies a higher cap in one explicit line.
2. Tier 0–2 waves: one merged quality review per wave over the combined wave diff, plus the whole-branch adversarial pass at plan end. No per-task spec → quality chain.
3. Tier 3 waves keep all three reviewer roles — `etrnl-spec-reviewer`, `etrnl-quality-reviewer`, and the simplifier lens. Wave 1 runs the per-write-task chain in `references/bounded-review.md`. Wave 2 onward runs those three roles as one merged review per wave over the wave diff, except on a wave the plan names for full fan-out, which runs the per-task chain.
4. Tier 3 gates hold at full strength on every wave: staged install proof, rollback proof, reopen-until-clean caps, consumer-trace on shared contracts, and the auth/money/tenancy/migration lenses. The lighter profile changes review cadence only; it never downgrades a plan's declared risk tier.
5. Run `node scripts/review-rules.mjs check --changed-only` (after install, `node ~/.claude/scripts/review-rules.mjs check --changed-only`) before spawning any LLM reviewer whenever the tree has source changes. Fix every block-mode match first and keep those findings out of reviewer scope.

## Spawn contract

Every `spawn_agent` call and every native child agent call sets `model` and reasoning effort explicitly. Resolve both through `resolveCodexModel({ modelTier, codexModel, codexReasoningEffort, modelTierJustification })` in `scripts/lib/codex-model-routing.mjs`:

| Lane role | Packet `modelTier` | Model | Reasoning effort |
| --- | --- | --- | --- |
| Parent orchestrator thread | none — thread-level setting held by the operator | Sol-equivalent | high |
| Implementer with a write scope | `standard`, or `top` for schema/auth/money/install work | `gpt-5.6-terra` | medium, or high at `top` |
| Read-only scout, reviewer, consumer-trace, or test lane | `fast` | `gpt-5.6-luna` | low |

- The orchestrator stays Sol-equivalent at thread level. That is an operator thread setting, not a packet field, and no child packet copies it.
- A child packet resolves to `gpt-5.6-sol` only when `modelTierJustification` names an integration-owner or adversarial escalation. `resolveCodexModel` throws on every other Sol request.
- A spawn call that omits `model` inherits the parent thread model and burns flagship tokens on the child. An unset `model`, `inherit`, `default`, or `same as parent` is a packet defect: fix the packet and re-dispatch that task. Inherit is never a fallback, and a rejected packet is never a sequential-degraded blocker.
- `node scripts/agent-task-packet-check.mjs` errors when a write packet omits `codexModel`. Validate every packet before dispatch and carry `codexReasoningEffort` beside `codexModel`.

## Progress reporting

Rolling hour ETAs are prohibited. Never state remaining hours, a wall-clock finish time, or a completion percentage derived from elapsed time — on any host, under either profile.

User-facing status is ledger position plus named gates, read from one command:

- `node scripts/execution-ledger.mjs history --gates --plan <plan-path>` (after install, `node ~/.claude/scripts/execution-ledger.mjs history --gates --plan <plan-path>`; add `--json` for machine reads).
- Line one carries `tasks=<done>/<total>`, `phase`, `phaseStatus`, `workstream`, `uatGate`, and `uatOpenFindings`.
- Line two carries `planStatus`, `nextGate`, and `nextGatePhase`.
- With `--plan` omitted the command reports `planStatus=not-provided` and still exits 0 with task counts intact. Never assume the plan file is present.
- Quote those field values verbatim. When `planStatus` is `not-provided` or `missing`, report the task counts and mark the named gate unavailable.
