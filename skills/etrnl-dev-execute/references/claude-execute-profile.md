# Claude execute profile

Load this file from `etrnl-dev-execute` when the run resolves to the Claude Code host, and whenever a Task/Agent dispatch, lane cap, or progress line needs its exact contract.

## Host selection

- `ETRNL_EXECUTE_HOST=claude` runs this profile explicitly.
- Unset on Claude Code (Task/Agent tools, `~/.claude/skills/`): run this profile.
- `ETRNL_EXECUTE_HOST=codex` loads `references/codex-execute-profile.md` instead.

State the resolved profile and the signal that selected it in the first status line of the run.

## Claude profile defaults

1. Default `maxConcurrentLanes` to `3`. Raise it only when the plan's `## Parallelization strategy` justifies a higher cap in one explicit line.
2. Tier 0–2 waves: one merged quality review per wave over the combined wave diff, plus one whole-branch adversarial pass at plan end.
3. Tier 3 waves keep the full spec → quality → simplifier chain per write task on wave 1. Wave 2 onward runs those three roles as one merged review per wave over the wave diff, except on a wave recorded with `full-fan-out-wave`.
4. Run `node scripts/review-rules.mjs check --changed-only` before spawning any LLM reviewer whenever the tree has source changes.

## Spawn guard (hook authoritative)

Claude registers `cc-spawn-guard.sh` on `Task|Agent|TaskCreate` in the default settings template. The hook calls `execution-ledger.mjs check-spawn` **without** `--dry-run` and is the sole spawn recorder.

Before dispatching subagents from the skill layer when the hook is active, use `--dry-run` only to debug packet shape:

```bash
node scripts/execution-ledger.mjs check-spawn \
  --session "$CLAUDE_SESSION_ID" \
  --task-name "<spawn task name>" \
  --wave "<current wave or phase id>" \
  --dry-run
```

When the hook is bypassed (`ETRNL_SKIP_HOOKS=cc-spawn-guard`) or spawn guard mode is `off`, run `check-spawn` without `--dry-run` before every dispatch so economics stay enforced.

Recovery diagnostics:

```bash
node scripts/execution-ledger.mjs check-spawn --explain --task-name "<name>" --wave "<wave>"
```

## Model contract (Claude packets)

Claude Task/Agent packets carry `modelTier` (`fast`, `standard`, `top`) on read-only and write lanes. The host maps tiers to Claude model selection through the packet — do not paste raw model slugs into spawn calls.

| Lane role | Packet `modelTier` | Notes |
| --- | --- | --- |
| Scout / read-only review / consumer trace | `fast` | Default for read-only lanes |
| Write implementation | `standard` | Default for write lanes |
| Tier-3 money/migration/security review | `top` | Requires justification on read-only overrides |

Codex model resolution lives in `references/codex-execute-profile.md` via `codex-model-routing.mjs`.

## Progress reporting

Rolling hour ETAs are prohibited. User-facing status is ledger position plus named gates from:

```bash
node scripts/execution-ledger.mjs history --gates --plan <plan-path>
```

## Batch adoption (unified triggers)

Record `batch-execution-adopted` **before the first reviewer spawn** or **before opening a third concurrent lane** when any of these apply:

| Trigger | Condition |
| --- | --- |
| Scope | `planScope=large` OR ≥3 task groups in the plan |
| Parallel | third concurrent lane on Claude (default cap 3) |
| Backstop | 20+ total spawns AND >55% reviewers |

See `references/batch-execution.md` for wave shaping and gate economics.

## Subagent lifecycle (Claude)

When a Task/Agent subagent completes:

1. Close the subagent through the host harness so the lane releases.
2. Record closure in the ledger so lane caps stay accurate:

```bash
printf '{"session_id":"%s","task_id":"<task>","agent_id":"<id>","last_assistant_message":"<subagent output with ETRNL_CONTRACT>"}\n' \
  "$CLAUDE_SESSION_ID" \
  | node scripts/execution-ledger.mjs record-subagent
```

`record-subagent` writes `endedAt` / `completedAt` on the agent row when the lane closes. Burst accounting uses spawn rows in the ledger — close every lane explicitly after the harness reports completion.

## Review scope (tier 0–2)

`check-spawn` calls `review-scope.mjs` before reviewer-class spawns. Tier ≥3 always uses `full_lenses`. Tier 0–2 gates by diff size (`ETRNL_REVIEW_SCOPE_SMALL_MAX` / `ETRNL_REVIEW_SCOPE_MEDIUM_MAX`): `deterministic_only`, `merged_quality`, or `full_lenses`. See `references/bounded-review.md` for the matrix and `review-scope-exceeded` recovery.
