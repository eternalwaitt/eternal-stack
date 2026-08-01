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

1. Default `maxConcurrentLanes` to `2` when the plan omits an explicit cap. When the plan's `## Parallelization strategy` declares `maxConcurrentLanes=N`, honor **N** (1–6) via spawn guard — the plan cap overrides this profile floor.
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

## Spawn guard (mandatory before every subagent)

Before **every** `spawn_agent` / native child-agent call on the Codex host:

- When `~/.codex/hooks/spawn-guard-pre-tool-use.sh` is registered in `config.toml`, the hook is the **sole spawn recorder** — do not call `check-spawn` without `--dry-run` from the skill layer.
- When the hook is absent or spawn guard mode is `off`, run `check-spawn` without `--dry-run` before dispatch.

```bash
node scripts/execution-ledger.mjs check-spawn \
  --session "${CODEX_SESSION_ID:-${CLAUDE_SESSION_ID:-default}}" \
  --task-name "<spawn task_name>" \
  --wave "<current wave or phase id>"
```

- Exit 0 permits dispatch (hook records when active). Exit 1 is a hard stop — do not spawn, do not rename the task to bypass the guard.
- `--dry-run` checks without recording (skill-layer debugging only when the hook is active).
- `--explain` prints structured recovery: `reasonCode`, `exactFix`, `exampleCommand`.
- `--override-spawn-cap "<reason>"` is only for a recorded P0/P1 blocker that survived investigator review; cosmetic reopen loops are not valid overrides.

The guard enforces:

1. **`maxConcurrentLanes`** — default 2 on Codex when the plan omits a cap; plan-declared `maxConcurrentLanes=N` (1–6) overrides the floor. No more than that many spawns in any rolling 60s window.
2. **Wave 2+ merged review only** — blocks per-patch reviewers (`p108c2_spec_review`, `p108c2_r9_quality_review`, …) on wave/phase ≥ 2. Use `wave-N_spec_review` / `wave-N_quality_review` / `wave-N_simplifier_review` on the combined diff instead.
3. **Review round cap** — blocks `_r3_` and higher spawn names; tier 0–2 fix rounds cap at 2, tier 3 reopen cap at 4. Further work uses `record-review` + `capDecision`, not new spawn aliases.
4. **Per-patch reviewer budget** — at most one spec + quality + simplifier trio per patch on wave 1.
5. **Batch adoption** — `planScope=large` or ≥3 task groups require `batch-execution-adopted` before the first reviewer spawn; opening another concurrent lane on batch-eligible plans requires the same decision; backstop at 20+ spawns with >55% reviewers.
6. **Review scope (tier 0–2)** — `review-scope.mjs` integrated into `check-spawn`; tier ≥3 always `full_lenses`. See `references/bounded-review.md`.

Read-only scout lanes must still pass through `check-spawn` so burst accounting stays accurate.

## Batch adoption (unified triggers)

Record `batch-execution-adopted` **before the first reviewer spawn** or **before opening another concurrent lane** when any of these apply:

| Trigger | Condition |
| --- | --- |
| Scope | `planScope=large` OR ≥3 task groups in the plan |
| Parallel | third concurrent lane on Codex (default cap 2) |
| Backstop | 20+ total spawns AND >55% reviewers |

See `references/batch-execution.md` for wave shaping and gate economics.

## Full fan-out waves (tier 3)

When the plan names a wave that must keep the per-write-task spec → quality → simplifier chain on wave 2+, record it once before dispatching per-patch reviewers on that wave:

```bash
node scripts/execution-ledger.mjs record-decision \
  --topic full-fan-out-wave \
  --decision "<wave-id>" \
  --reason "Plan requires per-task review chain on this wave"
```

`check-spawn` allows per-patch reviewer names on the named wave only; all other wave 2+ reviewers stay merged.

## Subagent lifecycle (Codex)

When a native child agent or `spawn_agent` lane completes:

1. Call `close_agent` (or the host equivalent) so the harness releases the lane.
2. Record closure in the ledger so lane caps stay accurate:

```bash
printf '{"session_id":"%s","task_id":"<task>","agent_id":"<id>","last_assistant_message":"<subagent output with ETRNL_CONTRACT>"}\n' \
  "${CODEX_SESSION_ID:-${CLAUDE_SESSION_ID:-default}}" \
  | node scripts/execution-ledger.mjs record-subagent
```

`record-subagent` writes `endedAt` / `completedAt` on the agent row when the lane closes. Do not rely on spawn timestamps alone — burst accounting uses spawn rows in the ledger; close every lane explicitly after `close_agent`.
