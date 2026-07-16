# Bounded CodeRabbit-lens review (risk-tiered)

Run one targeted CodeRabbit-preemption pass after the final edit of a task or wave, not an open-ended review loop.

1. Run `node scripts/review-rules.mjs check --changed-only` first and fix every block-mode match. Do not spend review budget on the deterministic tail a guard already covers.
2. Run `etrnl-quality-reviewer` over the diff using the `coderabbit-preemption.md` checklist lenses (installed with etrnl-dev-autoplan), scoped by the risk router (`schemas/review-classification-rules-v1.json`) to the changed surfaces. Suppress non-applicable lenses via `schemas/quality-na-rules.json`.
3. When the diff changes a shared contract — a field made nullable, a soft-delete/`tenantId` filter, an enum, or a Money/format helper — dispatch `etrnl-consumer-tracer` and require its consumer matrix. A per-diff reviewer cannot see callers outside the diff; fix every stale consumer it reports before the wave closes. This is the corpus's most severe recurring class (change applied to some but not all consumers).
4. After fixes, re-verify only the changed lenses. Do not rebuild a full matrix.
5. Reopen caps keep the pass thorough without looping:
   - Tier 0-2: at most 2 reopen rounds, then record remaining findings as non-blocking notes and proceed.
   - Tier 3 (auth, money, migrations, tenancy, security): reopen until clean, capped at 4 rounds; a still-open blocker at the cap stops the wave for a repository-owner decision.
   - Reopen only when code changed; never reopen on finding-churn alone.
