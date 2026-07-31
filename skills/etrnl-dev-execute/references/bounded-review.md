# Bounded CodeRabbit-lens review (risk-tiered)

Run parallel reviewers after the final edit of a task or wave, merge findings once, fix in at most two rounds, and reopen only on P0/P1 blockers.

Helper paths: resolve once from the **target repository root**, then use that prefix for every command below.

```bash
if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  printf 'bounded-review error: not inside a Git repository\n' >&2
  exit 1
fi
REPO_KEY="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:16])' "$REPO_ROOT" 2>/dev/null || true)"
if [[ -z "$REPO_KEY" ]]; then
  printf 'bounded-review error: failed to derive repository key for %s\n' "$REPO_ROOT" >&2
  exit 1
fi
if [[ -n "${ETRNL_STACK:-}" ]]; then
  _etrnl_stack_ready=true
  for _etrnl_required_helper in \
    review-rules.mjs \
    review-merge.mjs \
    review-learn.mjs \
    lib/deep-audit-categories.mjs; do
    if [[ ! -f "${ETRNL_STACK}/scripts/${_etrnl_required_helper}" ]]; then
      _etrnl_stack_ready=false
      break
    fi
  done
  if [[ "$_etrnl_stack_ready" == true ]]; then
    ETRNL_STACK_CANON="$(cd -- "${ETRNL_STACK}" && pwd -P)"
    REPO_ROOT_CANON="$(cd -- "${REPO_ROOT}" && pwd -P 2>/dev/null || printf '%s' "$REPO_ROOT")"
    if [[ "$REPO_ROOT_CANON" == "$ETRNL_STACK_CANON" ]]; then
      ETRNL_NODE=(node)
      ETRNL_SCRIPT_ROOT="${ETRNL_STACK}/scripts"
    else
      ETRNL_NODE=(node)
      ETRNL_SCRIPT_ROOT="${HOME}/.claude/scripts"
    fi
  else
    printf 'bounded-review warning: ETRNL_STACK is missing required review helpers; using installed script root\n' >&2
    ETRNL_NODE=(node)
    ETRNL_SCRIPT_ROOT="${HOME}/.claude/scripts"
  fi
else
  ETRNL_NODE=(node)
  ETRNL_SCRIPT_ROOT="${HOME}/.claude/scripts"
fi
REVIEW_LEARNINGS="${HOME}/.claude/review-learnings/${REPO_KEY}/review-learnings.json"
DEEP_AUDIT_REGISTRY="$ETRNL_SCRIPT_ROOT/lib/deep-audit-categories.mjs"
```

Run every helper with `--root "$REPO_ROOT"`. Never pass a repository-local `--learnings` or `--ledger` path; review memory lives only under `~/.claude/review-learnings/`.

## Deterministic-first

1. Run `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-rules.mjs" check --changed-only --root "$REPO_ROOT"` and fix every block-mode match before any LLM reviewer runs.
2. Exclude findings that match a `review-rules.mjs` or linter rule ID from LLM review scope — fix them mechanically and record the rule ID.
3. `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-rules.mjs" check --changed-only --report-only --root "$REPO_ROOT"` returns the same findings and exits 0 with no escalation to block. Read the deterministic tail with it mid-wave without stopping the wave. It rewrites no rule mode and touches no warn-to-block promotion state, so the blocking run in step 1 still gates LLM review and push.

## Parallel review and synthesis

1. Dispatch reviewers in parallel. Each reviewer emits findings JSON with `reviewer`, `severity` (P0–P3), `confidence` (0–1), `file`, `line`, `fingerprint`, `summary`, and `autofix_class` (`safe_auto`, `gated_auto`, `manual`).
2. Pipe the combined array through `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-merge.mjs" --root "$REPO_ROOT"` (or `--file`) to produce the single merged review artifact (JSON; add `--markdown` for human scan).
3. Fix every `safe_auto` finding immediately.
4. Record `residual` (`gated_auto`/`manual`) findings as non-blocking todos — do not reopen the wave for them alone.
5. Reopen and fix only when the merged artifact has `blocking` (P0/P1) entries. After code changes, re-run only the reviewers whose lenses cover the changed surfaces.

## Fix rounds and reopen caps

1. Maximum two fix rounds per wave. After round two, record remaining non-P0/P1 findings as non-blocking and proceed.
2. A review loop whose merged finding count did not decrease between rounds is stalled: park it, record a blocker, and continue other work.
3. Reopen caps are enforced by `execution-ledger.mjs record-review`:
   - Tier 0–2: at most 2 reopen rounds per task+reviewer+lineageId, then record remaining findings as non-blocking notes and proceed.
   - Tier 3 (auth, money, migrations, tenancy, security): reopen until clean, capped at 4 rounds.
   - Reopen only when code changed for a P0/P1 blocker; never reopen on finding-churn alone.
   - Counting rule matches the ledger error text: the first verified/completed review for a task+reviewer+lineageId is the initial pass; each later verified/completed row for the same triple is one reopen round.
   - What happens at the cap is decided by `## Loop end disposition`, not by asking the user.

## Loop end disposition

A spent reopen cap and a tripped park counter both end the loop. Severity decides what happens next, and the merged artifact already computes it: read `capDecision` and run the branch it names. Never derive this decision by hand, and never open a user prompt to obtain it.

| `capDecision.decision` | Meaning | Run this |
| --- | --- | --- |
| `close` | No blocking findings, loop still open | Close the task or wave. |
| `reopen` | P0/P1 open, rounds remain | Fix, then re-run only the covering lenses. |
| `proceed-with-residuals` | Loop ended, no P0/P1 open | Record every residual as a non-blocking note, close the stream, continue. |
| `owner-decision` | Loop ended, P0/P1 still open | Escalate per the rules below. |

1. `proceed-with-residuals` is autonomous on every tier, tier 3 included. A finding that is not P0/P1 at the cap is a residual by definition — cosmetic, misleading, or incomplete output is a residual, not a blocker — so record it, keep the fingerprint, and move on. Asking the user to authorize another round here is a workflow defect, not caution.
2. Before an `owner-decision` escalation, dispatch `etrnl-investigator` once on the open blocker and re-merge. Escalate only when the blocker survives that pass.
3. An `owner-decision` stops the named task or stream only. Independent task groups keep running; a plan does not halt because one stream is parked. Park the stream per rule 6 below and continue the rest of the plan before reporting.
4. When escalation is genuinely required, report the `capDecision.blockingFingerprints`, the fix attempted in each round, and the exact `record-review --override-owner-approved "<reason>"` command. Do not ask the user to judge severity, choose a path, or approve "one more cycle" in free text — the owner is confirming an override, not doing the triage.

## Trajectory park thresholds

Reopen caps bound the worst case. Trajectory counters end a loop that stopped converging before the cap runs out.

1. Record the counters on the wave row after every review round with `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/execution-ledger.mjs" record-trajectory --root "$REPO_ROOT" --wave <id> --recurring-finding-count <n> --stream-alternation-count <n> --rounds-since-progress <n>`. Each flag sets an absolute value, and a partial update keeps the counters it omits.
   - `recurringFindingCount` — rounds in which the same fingerprint stayed open.
   - `streamAlternationCount` — hand-offs between review streams on one task.
   - `roundsSinceProgress` — rounds since the merged finding count last fell.
2. Read them back with `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/execution-ledger.mjs" history --gates --json --root "$REPO_ROOT"`, which emits `.waves[]` rows carrying `waveId` and the three counters.
3. Evaluate the park decision inside synthesis: `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-merge.mjs" --file <findings.json> --trajectory <gates.json> --wave <id> --reopen-round <used> --reopen-cap <cap> --root "$REPO_ROOT"`. The merged report carries a `park` object and the `capDecision` that acts on it. Pass `--reopen-round` and `--reopen-cap` on every synthesis run at tier 3 — without them the merge cannot see a spent cap and reports `close` where the loop actually ended.
4. Park the stream when `park.parked` is true. Each limit is a named constant with an env override:

   | Counter | Limit | Env override | Reason code |
   | --- | --- | --- | --- |
   | `recurringFindingCount` | 3 | `ETRNL_REVIEW_RECURRING_FINDING_LIMIT` | `recurring-finding-limit` |
   | `streamAlternationCount` | 4 | `ETRNL_REVIEW_STREAM_ALTERNATION_LIMIT` | `stream-alternation-limit` |
   | `roundsSinceProgress` | 2 | `ETRNL_REVIEW_ROUNDS_SINCE_PROGRESS_LIMIT` | `rounds-since-progress-limit` |

5. Any single tripped counter parks the stream while reopen rounds remain: `park.reopenCapExhausted` reports `false` in that case and the loop stops anyway.
6. On a park, record a blocker naming every `park.reasons[].reasonCode`. Downgrade only non-P0/P1 residuals to non-blocking notes; unresolved P0/P1 findings stay blocking and follow the investigator/owner-decision path. `capDecision` decides what follows: `proceed-with-residuals` closes that stream with the residuals recorded, and only `owner-decision` requires a decision logged with `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/execution-ledger.mjs" record-decision --root "$REPO_ROOT"`.

## Adaptive reviewer skip

A reviewer that returns nothing on five consecutive dispatches stops earning its turn cost.

1. Record each dispatch outcome during synthesis: `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-merge.mjs" --file <findings.json> --dispatched <reviewer-ids> --learnings "$REVIEW_LEARNINGS" --root "$REPO_ROOT"`. Counters persist under `reviewerDispatches` in the private overlay ledger; each writer rewrites the whole object and keeps the other's keys.
2. Plan the next dispatch with `"${ETRNL_NODE[@]}" "$ETRNL_SCRIPT_ROOT/review-merge.mjs" skip-plan --reviewers <ids> --learnings "$REVIEW_LEARNINGS" --json --root "$REPO_ROOT"`. Dispatch every id in `dispatch` and skip every row in `skips`.
3. The limit is five consecutive zero-finding dispatches, overridable with `ETRNL_REVIEW_ADAPTIVE_SKIP_STREAK`. One finding resets the streak to 0.
4. Exemptions always dispatch and never accrue a skip: security lenses, tenancy lenses, and every deep-audit lane registered in `"$DEEP_AUDIT_REGISTRY"`. A deep-audit lane reporting zero findings states coverage, not redundancy, and skipping it reintroduces the sampling those lanes exist to remove.
5. Each skip row carries `reasonCode`, `reason`, and the `zeroFindingStreak` behind it, following the `coverageExceptions` precedent in `"$ETRNL_SCRIPT_ROOT/ux-audit-check.mjs"`. Copy the rows into the wave's review artifact so a review that never ran stays distinguishable from a review that found nothing.
6. When the lane registry fails to load, `skipEvaluation` reports `unavailable` and every named reviewer dispatches.

## Review depth by tier

- **Tier ≤ 2:** one merged reviewer pass per wave over the combined diff, plus one whole-branch adversarial pass at plan end. This replaces the spec→quality chain for tier ≤ 2 waves.
- **Tier 3:** keep the full spec → quality → simplifier chain per write task, review the wave diff, and re-verify only changed lenses after each fix round. **Codex-profile carve-out:** when the run resolves the Codex execute profile (`ETRNL_EXECUTE_HOST=codex`, or a detected Codex session), wave 1 runs that per-write-task chain and wave 2 onward runs the same three roles as one merged review per wave over the wave diff, except on a wave the plan names for full fan-out, which keeps the per-task chain. The carve-out moves review cadence only. Tier 3 gates hold at full strength on every wave — staged install proof, rollback proof, reopen-until-clean caps, consumer-trace on shared contracts, and the auth/money/tenancy/migration lenses — and no carve-out downgrades a plan's declared risk tier.

## Shared contracts

When the diff changes a shared contract — a field made nullable, a soft-delete/`tenantId` filter, an enum, or a Money/format helper — dispatch `etrnl-consumer-tracer` and require its consumer matrix. Fix every stale consumer it reports before the wave closes.

## Wave closure

Close a task or wave only when acceptance criteria are met AND the merged review artifact has no `blocking` entries.
