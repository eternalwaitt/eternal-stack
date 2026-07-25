# Full Deep Stack Review

Load this file from `etrnl-dev-autoplan` before finalizing a tier ≥ 2 plan. It carries the full lane definitions the `## Autoplan Depth Contract` names.

Run the review gauntlet required by the plan's `Risk tier` before finalizing. Tier 0–1 use one merged quality review lane only — no task packets, no multi-reviewer fan-out, no deep-stack bundle. Tier 2 requires engineering plus adversarial lanes. A tier 3 plan requires every applicable lane — CEO/founder, engineering, adversarial, reuse, simplifier, and specialist convergence unconditionally, plus design when UI scope exists and DX when developer-facing scope exists — together with outside-voice routing and a validated `Deep stack artifacts:` bundle before execution. The two scoped lanes are exempt when their scope is absent; a plan that touches no UI does not owe a design lane.

1. CEO/founder review:
   - Validate the premise, user value, scope, 6-month regret, and better alternatives.
   - Record quick wins, rejected expansions, premise challenges, and user-direction conflicts.
2. Engineering review:
   - Validate architecture, data flow, failure modes, rollback, tests, parallelization, reuse, latency, install risk, and type boundaries.
   - Reuse `references/review-contract.md` instead of duplicating a long prompt.
   - Run `references/coderabbit-preemption.md` so plan tasks pre-empt the preemptable CodeRabbit finding classes before code exists: Tier A (deterministic guards) and Tier B (spec checklist). Tier C is emergent — it only exists once code is written — so pin its categories (review lenses) for the post-edit review pass instead of requiring them up front.
3. Design review, when UI scope exists:
   - Load `etrnl-frontend-patterns`; check for repo `DESIGN.md` (authoritative when present; when design-heavy and absent, propose creating one via the design-md workflow).
   - Check information hierarchy, interaction states, responsive behavior, accessibility, and existing design-system reuse.
   - Add a design/mock artifact slot when visuals would materially reduce ambiguity.
4. DX review, when developer-facing scope exists:
   - Check install, commands, docs, structured errors, staged install, upgrade path, rollback, cache/latency budgets, and time-to-first-success.
5. Adversarial review:
   - Reuse `/etrnl-dev-stress-test` posture.
   - Challenge the most likely false assumption, hidden coupling, verification gaps, and shareable-repo leakage.
6. Outside voices — subagent routing for the lanes above, not a separate lane:
   - Use `etrnl-scout`, `etrnl-adversary`, `etrnl-design-reviewer`, and `etrnl-dx-reviewer` as read-only subagent candidates when scope is large enough.
   - Load `references/reviewer-routing.md` to assign each reviewer agent its disjoint gate; never route two agents to the same gate.
   - Load `references/reversible-compression.md` for every read-only subagent packet so each agent writes full evidence to a content-addressed artifact and returns only the receipt.
   - If Codex, Gemini, Octopus, gstack design, or GPT image/mock tooling is installed, mark it as an applicable escalation path; report missing tools instead of silently skipping them.
7. Reuse lane:
   - Run or explicitly disposition the reuse pass over existing files, helpers, hooks, scripts, tests, and docs the plan extends.
   - Record the outcome in the deep-stack `reuseInventory` and plan `## What already exists`.
8. Simplifier lane:
   - Run or explicitly disposition `code-simplifier` over the planned surfaces.
9. Specialist convergence:
   - Run or explicitly disposition code-review-excellence, advanced TypeScript, and domain-specific companion lanes.
   - Close, disprove, or explicitly user-accept every high/blocker finding before finalization.
