---
status: accepted
date: 2026-07-15
---

# ADR 0004: Lean CodeRabbit Preemption

## Context

Every plan we execute ends in a cycle of CodeRabbit reviews. The goal is to catch most CodeRabbit-class findings at planning and pre-push time so the review round-trips shrink. A prior Codex multi-agent run chased that same goal but drifted: over 40+ hours across three swarms it built a cryptographic-receipt subsystem — hashed evidence traces, an execution ledger, tamper-proof provenance — around what should have been a checklist and a small guard. The cathedral never landed on `main`; it stayed on a Codex shelf branch.

Two failure modes produced the drift:
- **Altitude drift.** The right goal (mine CodeRabbit findings, preempt them) grew the wrong infrastructure (receipts, ledgers, integrity hashing) because "capture every finding, even nits" was read as "build durable infrastructure per finding" instead of "catalog each finding as one line."
- **Amplification.** Codex sub-agents fork the full parent transcript, so each swarm multiplied the drifting scope (~19x) rather than converging it.

The reusable value in that shelf was almost entirely **data** — a review taxonomy, classification rules, and a recurrence corpus — tangled together with the receipt machinery in the `.mjs` files (`review-rules.mjs` imported the execution ledger; the CodeRabbit parser imported receipt helpers from a 1000+ line evidence-trace module).

## Decision

Build the lean version off `main` on a fresh branch, and adopt one salvage rule and one anti-drift rule.

### 1. Extract data, re-express code, leave the cathedral

Salvage only the clean JSON data (review taxonomy, classification rules, quality-N/A rules, rule-template examples, fixtures). Re-express the small amount of needed logic clean, with no import path back into the receipt/ledger/hash subsystem. Never salvage a `.mjs` file that pulls in the cathedral. The Codex branch remains an untouched shelf; nothing is deleted, nothing is merged.

### 2. Three-tier preemption, no infrastructure per finding

A CodeRabbit finding class earns at most one of three controls, in this order of preference for the cheapest that works:
- **Tier A — deterministic guard.** Only when the class is literal/AST-matchable. `scripts/review-rules.mjs` runs ast-grep and literal rules pre-push; `review-rules.json` ships proven rules (`no-expect-any`, `no-focused-tests`). Block mode fails the gate; warn mode reports.
- **Tier B — planning/spec checklist.** `etrnl-dev-autoplan/references/coderabbit-preemption.md` — the 10 review lenses plus the SaaS domain pack — turns each recurring class into a plan-time checklist line and a spec-review item. No code, no runtime.
- **Tier C — review lens.** Emergent classes a linter cannot catch (nullable propagation, effect/query races, serialization safety, stateful-regex bugs) become a bounded review pass in `etrnl-dev-execute` and `etrnl-quality-reviewer`, not a subsystem.

A finding that needs more than a guard or a checklist line is a review lens and stops there. No receipts, no ledger of evidence hashes, no provenance store.

### 3. Fully automatic, warn-first learning loop

`scripts/review-learn.mjs` classifies the findings each PR's review surfaces (`scripts/lib/coderabbit-classifier.mjs`, keyword maps lifted from the mined parser without the receipt machinery), tracks recurrence in `review-learnings.json`, and at three recurrences auto-promotes with no approval gate: a template-matching class becomes a `review-rules.json` guard in **warn** mode, auto-escalating to **block** after two clean runs; everything else becomes a tracked checklist candidate for autoplan. Warn-first plus escalate-after-two-clean bounds the blast radius of a noisy auto-promotion.

### 4. Risk-tiered bounded convergence

Execution review reopens are bounded so review never loops forever. Tier 0-2 changes stop after two reopen rounds and mark remaining findings non-blocking. Tier 3 changes (auth, money, migrations, tenancy, security) reopen until clean, capped at four rounds. Reopen only when code changed.

### 5. Scope freeze is a planning gate

`etrnl-dev-autoplan` carries a scope-freeze step: restate the goal in one sentence, require every task group to trace to it, read a review/audit backlog as a catalog rather than a mandate to build infrastructure, and reject integrity/tamper/receipt/provenance scope unless the one-sentence goal names it. Each task group commits independently so a drifting task group reverts alone.

## Consequences

- The lean stack is additive on `main`: no hook surgery, no migration. Installed hosts reinstall from the lean branch to pick it up.
- The receipt/ledger subsystem is not maintained here; if durable evidence provenance is ever a real requirement, it needs its own ADR and explicit user ask, not a silent regrowth.
- The learning loop can promote a wrong guard; warn-mode-first plus the two-clean-run escalation gate, plus the ability to revert a single `review-rules.json` entry, contain that risk.
- Auditability of "why did this guard exist" now lives in `review-learnings.json` recurrence counts, not in a cryptographic receipt chain. That is a deliberate trade of tamper-evidence for leanness.
