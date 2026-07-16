# CodeRabbit Preemption Checklist

Catch — at **plan/spec time** and **pre-push** — the issues CodeRabbit reliably flags in review, so plan→execute cycles need fewer CodeRabbit rounds. Grounded in 196 mined PRs (1,383 deduplicated findings) across the SaaS and stack repos.

**Method.** Three tiers, split by *where each class is cheapest to catch*. Use the path→risk router (`schemas/review-classification-rules-v1.json`) to decide which lenses and checklist items apply to the changed files, and `schemas/quality-na-rules.json` to suppress lenses that do not apply (e.g. concurrency on a docs-only change). Do not run every item on every change.

**Honest ceiling.** Tier A + Tier B are preemptable before code exists. Tier C findings are *emergent* — they only exist once code is written — so they are hunted in a single targeted review pass, not preempted by a checklist.

## The 10 review lenses (the spine)

For each changed area, confirm which lenses apply and note the risk:

1. `correctness_state` — state transitions, invariants, absent-baseline propagation to every consumer.
2. `validation_fail_closed` — validate/allowlist untrusted input; no silent fallback or default that hides failure.
3. `transactions_concurrency` — races, effect-vs-query ordering, lost updates, idempotency.
4. `money_time_locale` — minor-unit scale + rounding, currency, timezones, i18n.
5. `types_schema_contracts` — Zod↔Prisma nullability parity, enum/schema/migration parity, API contract drift.
6. `test_delta` — a regression test for every behavior change; fixtures respect domain semantics.
7. `security_privacy_tenancy` — auth/tenant scoping, no PII in logs/support payloads, secret hygiene.
8. `reuse_maintainability` — reuse existing helpers; no duplicated logic; no dead/stale comments.
9. `performance` — N+1, unbounded work, redundant fetches.
10. `ui_accessibility_i18n` — a11y labels, hardcoded strings, responsive/RTL.

## Tier A — Deterministic (pre-push guard; never let these reach CodeRabbit)

Run `node scripts/review-rules.mjs check --changed-only` before push (engines: ast-grep + literal; block/warn modes; rules in `review-rules.json`). These are the "quick win" tail CodeRabbit posts every PR:

- Markdown fenced code block missing a language specifier (`.md`, `.mdc`).
- `as <PascalCaseEnum>` cast applied to `searchParams.get(...)`, `process.env`, or other untrusted input without an adjacent allowlist/validation check.
- Hardcoded user-facing string literals in `.tsx`/`.ts` outside `t()` / messages.
- Direct display of `error.message` or a raw oRPC error key instead of `getErrorMessage(error, t)`.
- Broken relative doc/file references in `.md` / `.mdc`.
- Shell `${VAR}` used under `set -u` without a `:-` default or guard.
- Focused tests: `.only(` in test files.
- `as any` / unsafe type escapes.

## Tier B — Plan/spec checklist (shape the code before it is written)

Bake the applicable items into the plan's task acceptance and the spec. These preempt the **Critical/Major** Data-Integrity and Security findings a linter cannot see. Apply per the risk router; the SaaS pack below is the default overlay for `agency-tbd` / `eternal-saas`.

**SaaS domain pack** (from the repo's own gotchas — CodeRabbit mostly enforces these back at you):
- oRPC procedures carry the full mandatory middleware stack (auth + tenant); use the required versioned path.
- Every Prisma schema/enum change ships a paired forward migration (`db:migrate`), never `db:push`.
- Every query filters `tenantId` (and `locationId` for multi-location); use tenant-safe repositories.
- Soft-delete semantics preserved in queries **and** test-fixture cleanup.
- Money arithmetic normalized to the currency minor-unit scale with half-away-from-zero rounding; use the Money VO, never raw numbers; `DEFAULT_CURRENCY`, never hardcoded `"BRL"`.
- No `include: { _count }` on `create`/`update` (PgBouncer 500); hardcode zero on create, split read on update.
- Zod output schema nullability matches Prisma — a Prisma `String?` requires `z.string().nullable()`, never `z.string()` alone; a mismatch causes silent `errors.internal`.
- `next-intl` v4 non-string params use the documented double-cast.
- No PII (tokens, emails, raw URLs, full query inputs) in logs or support payloads.
- `requireLimit` sentinel: `-1` means unlimited — never simplify to a bare `>=`.

**Stack pack** (for `eternal-stack` itself): fenced-block languages, valid doc/file cross-references, shell `set -u` safety, flags documented must actually control behavior, cross-host integrity covers `.cursor`/Codex files, no rule-content duplication.

## Tier C — Needs semantic review (flag for the reviewer; no rule catches these)

Mark these categories in the plan so the reviewer reasons about them explicitly — they are emergent and reviewer-only:
- Nullable / absent-baseline value that propagates to some but not all downstream consumers.
- Effect-based resets racing an async query — use a synchronous during-render reset and guard `isPlaceholderData` accumulation.
- Serialization cycle / bigint safety in error/telemetry/toast paths (WeakSet cycle guard).
- Stateful shared regex `lastIndex` bugs; first-match-only extraction where all matches are intended.

## Map to CodeRabbit's own bands (for coverage parity)

CodeRabbit tags findings `Functional Correctness | Security & Privacy | Stability & Availability | Data Integrity & Integration | Maintainability`. Structure preemption output against these so plan review can claim, with evidence, "the Data-Integrity and Security bands are addressed." Weight effort by *frequency* (i18n/error-key leakage and unchecked casts recur on nearly every SaaS PR; fenced-block/broken-ref dominate doc changes), not by severity band alone. Pure duplication/wording nitpicks (CodeRabbit marks them 💤/🔵 itself) stay out of a lean pass; do not spend planning budget on them.

## Convergence (risk-tiered — thorough without looping)

The targeted Tier-C review pass runs **once** over the diff, then re-verifies only changed lenses after fixes:
- Normal work: max **2** reopen rounds, then remaining findings are recorded as **non-blocking** notes.
- Tier 3 (auth / money / migrations / tenancy): reopen until clean, capped at **4** rounds.

Never reopen on finding-churn alone; reopen only when code changed.
