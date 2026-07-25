# Tier assessment and Codex model routing

Load this file from `etrnl-dev-autoplan` when a tier ≥ 2 plan emits `## Tier assessment`, resolves `Scope triage:`, or routes a packet to a model. Tier 0–1 plans skip both.

Tier ≥ 2 plans state what the declared tier costs before the task groups, and route every planned packet to an explicit model. Tier 0–1 plans skip both.

## `## Tier assessment` (tier ≥ 2, non-blocking)

Emit a `## Tier assessment` section in the plan, placed before `## What already exists`. It carries five lines:

1. Declared `Risk tier` and the exact trigger that set it — the auto-escalation path pattern, the >8-path file map, or the product-safety surface. `scripts/lib/plan-risk-tier.mjs` (`requiresTier3Escalation`, `requiresTier2Escalation`) owns the floor, so a lower tier is not selectable by taste.
2. What the tier costs this plan: review lanes to run, artifacts to produce, and the gates that block `Status: Final`. Tier 3 adds staged install proof and rollback verification.
3. Execution cost shape: task-group count, distinct write scopes, and the concurrent-lane cap the `## Parallelization strategy` table sets.
4. Model cost shape: the packet count at each `modelTier`, so the owner reads the spend profile before approving.
5. Scope triage: `Trivial`, `Small`, or `Large`, written as `Scope triage: <value>`. `/etrnl-dev-execute` reads this line to select its execution shape.

This section informs the owner. It never blocks `Status: Final`, and `node scripts/plan-readiness-check.mjs <plan-path>` does not gate on it. A wrong `Risk tier:` line is still a plan defect; a terse tier assessment is not.

## Scope triage

Resolve the triage with `node scripts/diff-triviality.mjs classify-plan --plan <plan-path> --json` (after install, `node ~/.claude/scripts/diff-triviality.mjs classify-plan --plan <plan-path> --json`). It reads the `Risk tier:` line and the `## File map` rows and returns `scope`, `fileCount`, `behavioralPaths`, and `reason`. Copy the returned `scope` into the `Scope triage:` line verbatim. A hand-picked scope that contradicts the classifier is a plan defect: fix the file map or the tier, then re-run the command.

| Scope | Condition | Execution shape |
| --- | --- | --- |
| Trivial | Tier 2, at most 3 file-map paths, and zero rows carrying a behavioral, API, or schema change | Mini-packet per task, no reviewer fan-out, no phase scaffolding |
| Small | Tier 2, at most 8 file-map paths, outside the Trivial condition | Mini-packet per sequential task plus one merged quality review per wave |
| Large | Tier 3, more than 8 file-map paths, a tier-3 surface in the file map, or an unparseable file map | Full packets, full reviewer fan-out, every declared gate |

Both Trivial conditions hold together. A two-path plan that changes behavior is Small, and a documentation-only plan with nine paths is Large.

Tier 3 is Large at every file count. A three-path change to auth, payments, tenancy, migrations, hooks, or the installer keeps full packets and full gates. `classify-plan` fences those surfaces by path as well, so an under-declared `Risk tier:` line returns `large` with `reason=tier-3-surface-under-declared` instead of a lighter shape.

A file-map row states its change nature in the `Change` column. A runtime path counts as behavioral unless its row states `no behavioral change`, `comment only`, `typo fix`, or `docs only`; an empty note resolves to behavioral. Tier 0–1 plans return `not-applicable` and run the quick-dev lane with no triage line.

## Codex model map

Resolve every model decision through `resolveCodexModel({ modelTier, codexModel, codexReasoningEffort, modelTierJustification })` in `scripts/lib/codex-model-routing.mjs`. Never hand-write a slug the resolver did not produce.

| Lane role | Codex model | Reasoning effort | Packet `modelTier` |
| --- | --- | --- | --- |
| Parent orchestrator thread | `gpt-5.6-sol` | high | none — thread-level, set by the operator outside the plan |
| Implementer with a write scope | `gpt-5.6-terra` | medium, or high for schema/auth/money/install work | `standard`, or `top` |
| Read-only review, docs, and test-only lane | `gpt-5.6-luna` | low | `fast` |

A child packet resolves to `gpt-5.6-sol` only when its `modelTierJustification` names an integration-owner or adversarial escalation; `resolveCodexModel` throws on every other Sol request. `scripts/agent-task-packet-check.mjs` errors when a write packet omits `codexModel`.

**Inherit is the pathology, not a fallback.** A Codex `spawn_agent` call that omits `model` inherits the parent thread model, so on a Sol thread every unrouted child burns flagship tokens. The measured Bling rollout recorded 95.2% of billed tokens in subagents and 74.9% of subagent turns on Sol, with 55% of spawns carrying no explicit model. Write the resolved slug and effort into every packet: `inherit`, `default`, `same as parent`, and an empty cell are packet defects that block the plan, not shorthand for the tier default.

## `## Parallelization strategy` table

The `## Parallelization strategy` section carries one row per planned packet with these exact columns:

```markdown
| Phase | Packet | Agent/model/effort | Scope |
| --- | --- | --- | --- |
| P0 | TG-00 | Terra / high | `codex-model-routing.mjs`, `agent-task-packet-check.mjs`, tests |
| P1 | TG-02 | Luna / low | autoplan skill + preemption reference |
```

Fill `Agent/model/effort` with the resolver output rendered as `<Sol|Terra|Luna> / <low|medium|high>`. Every row states both halves. A row whose cell reads `inherit`, is blank, or names a model the resolver rejects is a plan defect: fix the row before `Status: Final`.

Close the section with the spawn contract in prose — parent orchestrator on the Sol-equivalent thread, `gpt-5.6-terra` as the default implementer, `gpt-5.6-luna` for read-only and test lanes, every spawn setting explicit `model` and reasoning effort — plus the `maxConcurrentLanes` cap for Codex execute.
