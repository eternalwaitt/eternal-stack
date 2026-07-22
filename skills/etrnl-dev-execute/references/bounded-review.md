# Bounded CodeRabbit-lens review (risk-tiered)

Run parallel reviewers after the final edit of a task or wave, merge findings once, fix in at most two rounds, and reopen only on P0/P1 blockers.

## Deterministic-first

1. Run `node scripts/review-rules.mjs check --changed-only` and fix every block-mode match before any LLM reviewer runs.
2. Exclude findings that match a `review-rules.mjs` or linter rule ID from LLM review scope — fix them mechanically and record the rule ID.

## Parallel review and synthesis

1. Dispatch reviewers in parallel. Each reviewer emits findings JSON with `reviewer`, `severity` (P0–P3), `confidence` (0–1), `file`, `line`, `fingerprint`, `summary`, and `autofix_class` (`safe_auto`, `gated_auto`, `manual`).
2. Pipe the combined array through `node scripts/review-merge.mjs` (or `--file`) to produce the single merged review artifact (JSON; add `--markdown` for human scan).
3. Fix every `safe_auto` finding immediately.
4. Record `residual` (`gated_auto`/`manual`) findings as non-blocking todos — do not reopen the wave for them alone.
5. Reopen and fix only when the merged artifact has `blocking` (P0/P1) entries. After code changes, re-run only the reviewers whose lenses cover the changed surfaces.

## Fix rounds and reopen caps

1. Maximum two fix rounds per wave. After round two, record remaining non-P0/P1 findings as non-blocking and proceed.
2. A review loop whose merged finding count did not decrease between rounds is stalled: park it, record a blocker, and continue other work.
3. Reopen caps are enforced by `execution-ledger.mjs record-review`:
   - Tier 0–2: at most 2 reopen rounds per task+reviewer+lineageId, then record remaining findings as non-blocking notes and proceed.
   - Tier 3 (auth, money, migrations, tenancy, security): reopen until clean, capped at 4 rounds; a still-open blocker at the cap stops the wave for a repository-owner decision (`--override-owner-approved`).
   - Reopen only when code changed for a P0/P1 blocker; never reopen on finding-churn alone.
   - Counting rule matches the ledger error text: the first verified/completed review for a task+reviewer+lineageId is the initial pass; each later verified/completed row for the same triple is one reopen round.

## Review depth by tier

- **Tier ≤ 2:** one merged reviewer pass per wave over the combined diff, plus one whole-branch adversarial pass at plan end. This replaces the spec→quality chain for tier ≤ 2 waves.
- **Tier 3:** keep the full spec → quality → simplifier chain per write task, but review the wave diff and re-verify only changed lenses after each fix round.

## Shared contracts

When the diff changes a shared contract — a field made nullable, a soft-delete/`tenantId` filter, an enum, or a Money/format helper — dispatch `etrnl-consumer-tracer` and require its consumer matrix. Fix every stale consumer it reports before the wave closes.

## Wave closure

Close a task or wave only when acceptance criteria are met AND the merged review artifact has no `blocking` entries.
