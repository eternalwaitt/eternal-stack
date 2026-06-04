---
name: etrnl-brainstorm
description: ETRNL control-plane brainstorming and design-spec workflow for Claude Code. Use when the user asks to "brainstorm", "scope this", "design this", "think through options", "turn this idea into a spec", or when implementation requirements are still ambiguous.
---
# ETRNL Brainstorming

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
   - Use `docs/plans/` for new design/spec artifacts.
   - If the repo already has a stronger convention, use this fallback order: `docs/specs/`, then `plans/`, then `.claude/plans/`.
   - Otherwise create `docs/plans/<yyyy-mm-dd>-<slug>-design.md`.
7. Self-review the design for placeholders, contradictions, ambiguity, and scope creep.
8. Ask the user to approve the saved spec before moving to `etrnl-plan`.

## Output

Keep chat conversational during discovery. Once approved, reply with the spec path, decisions made, unresolved questions, and the next required skill.

## Hard Rules

- Do not pretend unclear requirements are settled.
- Do not ask batches of unrelated questions.
- Do not bury the selected approach.
- This skill creates design/spec files; `etrnl-plan` creates implementation plans.
- Do not create an implementation plan until the design is approved or the user explicitly asks to skip the design gate.
