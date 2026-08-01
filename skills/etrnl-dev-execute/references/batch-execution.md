# Batch Execution for Many Similar Findings

Use during `etrnl-dev-execute` when the plan enumerates many similar per-item findings — board cards, checklist rows, per-screen or per-route fixes — **or** when `Scope triage: Large` covers **three or more task groups / Trello cards / patches** in the same phase. Per-item ceremony is the dominant cost in these runs: an expensive harness plus a review chain plus a commit for every item turns minutes of implementation into an hour of process. Batch the ceremony; keep the rigor.

## Mandatory adoption signal

When batching applies, record it once before the **first reviewer spawn** (or before opening a third concurrent lane), whichever comes first:

```bash
node scripts/execution-ledger.mjs record-decision \
  --topic batch-execution-adopted \
  --decision "Surface-grouped waves with one merged review per wave; expensive gates once per wave." \
  --reason "Scope triage Large / multi-card plan"
```

The spawn guard blocks reviewer spawns on Large or multi-group plans until this decision exists, and again when 20+ spawns exceed 55% reviewers.

## Wave shaping

1. Group items by shared surface: same route, screen family, data domain, or fixture set (for example, all findings on `/finances` tabs form one wave). Keep waves within the plan's write-scope ownership.
2. Size waves at 3–6 items. Split a wave when items need conflicting fixture states; merge singletons into an adjacent wave on the same surface.
3. Split an item that reveals a systemic defect (shared query, schema, ledger rule) into its own wave; log the split with `record-decision`.

## Gate economics

1. Classify gates once at wave start:
   - **Cheap (per item):** targeted unit/component tests, focused typecheck, lint on touched files. Run after every item fix and every review fix.
   - **Expensive (per wave):** production builds, migration replays, owned database/browser canaries, full test suites, full typecheck. Run once when the wave's items are all cheap-green, and once more only if a post-review fix touched the harness, a migration, or a shared surface.
2. Accumulate browser specs across items and execute them in one canary run per wave; do not rebuild the environment per item.
3. A review finding fixed with a source-only change re-verifies with the targeted gate for its lens, not the full harness (see `bounded-review.md` step 4).
4. As the regression suite grows across waves, earlier items' specs run in the wave canary — never as separate per-item replays.

## Mid-loop verification

1. Between fixes inside a wave, run affected-only tests (`vitest --changed`, focused suites, or the plan's targeted gate). Do not replay the full suite after every nit.
2. Run the full suite at wave close and immediately before push only.
3. Warm environment rules: compose volumes persist across waves — never run `down -v` mid-run; keep Testcontainers reuse on; replay migrations only on schema change; reserve production builds for wave close.
4. Record the env URL and migration version in run notes at wave start and after any schema change.

## Human-verify batching (tier ≤ 2 default)

1. Tier 0–2 default: defer every mid-wave human-verify pause to the wave or phase boundary. Collect the deferred items into one batched verification list and present that list once, at wave close or phase close.
2. A mid-wave pause at tier 0–2 runs in exactly two cases: the plan names that pause as a gate, or a blocker stops the wave outright.
3. Tier 3 keeps explicit UAT gates where the plan places them. The deferral is a tier 0–2 default and never relocates a tier-3 gate to a phase boundary.
4. A batched pause keeps per-item attribution: every item names its own evidence and disposition, so one pause never merges two items' outcomes.
5. Record the outcome one row per item — `node scripts/execution-ledger.mjs record-check` for tier 0–2 verification, `node scripts/execution-ledger.mjs record-uat` for a tier-3 UAT gate.

## Review and commit batching

1. One merged review pass per wave over the combined diff (see `bounded-review.md`). Tier-3 surfaces keep tier-3 lenses and reopen caps on the wave diff — per-item review chains are for genuinely independent risk, not items sharing one surface. Batching applies at every tier; tier 3 keeps stricter gates, not a batching exemption.
2. **Wave 2+ hard rule (dual-host):** after wave 1 (or phase P2 on phase-oriented plans), never spawn per-patch reviewers such as `p108c2_spec_review` or `p108c2_r9_quality_review`. Spawn only merged wave reviewers (`wave-3_spec_review`, `wave-3_quality_review`, `wave-3_simplifier_review`) over the combined diff. Enforce with `execution-ledger.mjs check-spawn` before every subagent dispatch on Claude and Codex.
3. One commit and one push per wave, listing the items it closes. Per-item evidence (dispositions, capture hashes, ledger rows) still gets recorded individually.
4. Build evidence packets on a shared wave-level base (environment, provenance, harness description) with per-item rows, instead of duplicating the full packet per item.

## Stop conditions

- A wave gate failure blocks the wave, not the whole run: bisect to the offending item, park it with a recorded blocker, and close the rest of the wave.
- Do not let batching hide attribution: every closed item still names its own verification evidence and disposition.
