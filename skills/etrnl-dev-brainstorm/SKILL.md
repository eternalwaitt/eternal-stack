---
name: etrnl-dev-brainstorm
description: ETRNL brainstorming and design-spec workflow for Claude Code and Codex. Use when the user asks to "brainstorm", "scope this", "design this", "think through options", "turn this idea into a spec", or when implementation requirements are still ambiguous.
---
# ETRNL Brainstorming


Help the user shape an idea when they ask to explore, compare, or design it. This capability is optional: it is not a required stage before planning or implementation. If the user has already authorized implementation, brainstorming does not pause that work or add a new approval gate. Continue within the existing request, resolving ordinary choices with evidence-based, reversible defaults.

## Flow

1. Understand the goal and context. For an existing project, inspect the relevant app, docs, and conventions. For a new idea, identify who will use it and the practical problem it should solve.
2. Describe the intended experience in ordinary language. For an app, walk through how a person starts, completes the main task, and sees the result. Mention important error, empty, or recovery behavior when it affects the design.
3. Separate known facts from choices. Ask only about an unresolved choice that would materially change the outcome, risk, cost, or user experience. Bundle related questions when that is clearer; do not turn the conversation into a one-question-at-a-time interview.
4. Recommend a sensible default for routine or reversible decisions and explain the reason briefly. Present alternatives when they represent meaningful tradeoffs, and state which one you recommend.
5. Preserve the complete scope the user requested or accepted. Break independent areas into clear workstreams when useful; do not replace them with a smaller “first slice” or MVP unless the user asked for one.
6. Match the response to the request. A quick discussion can end with a concise recommendation. Create a fuller design or spec only when requested or when a durable handoff would help. Save new planning artifacts under the project's established ignored planning location; do not put private task plans in tracked docs.
7. Mark genuine unknowns as assumptions or blockers instead of fabricating certainty. A draft can be useful before every detail is settled; identify only the decisions that must be resolved before the affected work can proceed.

## Output

Keep the conversation clear and adapted to the user's familiarity. Prefer everyday words, briefly explain unfamiliar terms, and avoid dumping a long requirements checklist on a beginner. State the goal understood, recommendation and key tradeoffs, any consequential open question, and the practical next step. If the user authorized implementation, continue with it; do not ask for approval a second time.

## Hard Rules

- Do not present assumptions as facts or hide a consequential unresolved choice.
- Do not ask for approval already given, require a confidence score, or block authorized implementation on a saved spec.
- Do not bury the recommendation among options or overwhelm the user with technical detail they did not request.
- Do not narrow accepted scope to an MVP or first phase unless the user explicitly chose that boundary.
- When the user asks only to brainstorm, offer the next step without implying they must invoke another skill or approve a document before deciding what to do.
