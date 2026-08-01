---
name: etrnl-dev-brainstorm
description: ETRNL brainstorming and design-spec workflow for Claude Code. Use when the user asks to "brainstorm", "scope this", "design this", "think through options", "turn this idea into a spec", or when implementation requirements are still ambiguous.
---
# ETRNL Brainstorming

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-brainstorm`; on update, run the reported update command before continuing; only skip if the user explicitly declines.

Turn an idea into an approved design/spec before implementation planning.

## Hard Gate

Do not implement, scaffold, or write an implementation plan until the design is approved or the user explicitly skips brainstorming.

## Flow

1. Explore current context:
   - Read relevant docs, files, recent changes, and existing patterns.
   - State what is verified and what is still unknown.
2. Check scope:
   - If the idea spans independent subsystems, decompose it and pick the first coherent slice.
3. Ask focused questions:
   - Ask one question at a time.
   - Use multiple-choice when it reduces friction.
   - Clarify purpose, constraints, success criteria, users, risk, and non-goals.
4. Propose options:
   - Present 2-3 approaches with trade-offs.
   - Select one and say why.
5. Present the design:
   - Cover architecture, user flow, data flow, error handling, verification, rollout, and rollback.
   - Scale detail to complexity.
6. Save the approved design:
   - Use ignored local planning paths for new design/spec artifacts.
   - If the repo already has a stronger local convention, use it. Otherwise use `.claude/plans/<yyyy-mm-dd>-<slug>-plan.md`.
   - Do not store brainstorming plans or artifacts in tracked repository docs.
7. Self-review the design for placeholders, contradictions, ambiguity, and scope creep.
8. Run the spec self-review:
   - No `TODO`, `TBD`, placeholder, fake decision, or unresolved assumption is left unmarked.
   - The selected approach and rejected alternatives are explicit.
   - The scope is small enough for one implementation plan, or the decomposition is written down.
   - Risks, verification, rollout, rollback, and owner/user impact are named.
9. Ask the user to approve the saved spec before moving to `etrnl-dev-plan`.

## Interview to confidence

Before a fuzzy request graduates to a saved design/spec, run a bounded interview that resolves the unknowns and assigns a confidence score. A low-confidence spec is a re-work risk.

1. List the open questions that would change the design. Ask them. Do not assume an answer.
2. Assign a confidence level of low, medium, or high. Record the concrete evidence backing that level: the file, doc, runtime check, or user answer that settles each unknown.
3. Gate: do not advance to `etrnl-dev-plan` or `etrnl-dev-autoplan` until confidence is high on scope, constraints, and acceptance. Do not ship a spec that is low or medium confidence on any of these three axes into the plan step.
4. Record the resolved unknowns and their confidence in the saved design so the plan step inherits them.

## Output

Keep chat conversational during discovery. Once approved, reply with the spec path, decisions made, unresolved questions, and the next required skill.

## Hard Rules

- Do not pretend unclear requirements are settled.
- Do not ask batches of unrelated questions.
- Do not bury the selected approach.
- This skill creates design/spec files; `etrnl-dev-plan` creates implementation plans.
- Do not create an implementation plan until the design is approved or the user explicitly asks to skip the design gate.
