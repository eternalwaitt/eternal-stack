---
name: etrnl-comm-email-reply-quality
description: ETRNL email draft quality workflow. Use for reply review, natural language, sender voice, locale, commitment checks, and optional configured draft checkers.
---
# Email reply quality

Review the exact draft against the incoming request, sender's voice, known facts and granted authority. A draft review does not authorize sending or installing tools.

## Review

1. Match the user's requested language and the conversation. For Portuguese, preserve the sender's regional register; `tu`, `teu`, formal greetings and punctuation are not universal errors. Apply explicit sender/project style preferences when present.
2. Answer the real question plainly. Preserve numbers, scope, caveats, timing, usage rights and the next action. Do not replace a direct rate question with a request for information already supplied.
3. Flag placeholders, invented terms, false certainty, unintended acceptance, guarantees, availability promises and signatures. Resolve material uncertainty before the affected commitment.
4. Remove empty repetition or unnatural boilerplate only when it improves this sender's draft. No mandatory visible lesson, questionnaire or rewrite ceremony.

## Optional tools

Use a private draft checker only when it is already configured or its installation is explicitly authorized. It is not part of the public Eternal install. Inspect its actual CLI help and configured rules before relying on a result; do not assume every checker returns the same schema. Prefer a draft ID or supported file/stdin argument to placing private text in shell arguments.

A configured project send gate remains required by that project. Otherwise, checker failure or absence is evidence to report, not a new approval requirement. Separate a real content/authority defect from a stylistic preference or tool outage. A passing checker cannot verify commercial facts or grant permission.

When a relevant language skill is available, use its focused guidance if it helps. Do not launch a second full review or install Vale, LanguageTool or another service solely because tools could improve writing. Recheck changed passages and required configured gates within the active workflow budget; preserve failures without endless rewriting to satisfy a preference.

## Draft and send boundary

For queue work, inspect the assigned item and exact draft. If edits are authorized, fix confirmed issues and preserve unrelated drafts. Show the draft and meaningful unresolved issues when review is requested.

Send only within the user's explicit authorization and actual project rules. Previously granted approval persists for its stated recipient/content/action. Ask only when a consequential ambiguity or missing authority prevents that action; this skill adds no blanket owner reapproval step. Report the actual send result when sending was separately authorized, without treating draft readiness as delivery.
