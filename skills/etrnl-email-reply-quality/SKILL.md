---
name: etrnl-email-reply-quality
description: ETRNL VIVAZ email reply quality workflow. Use when the user asks for "email reply quality", "Brazilian Portuguese email draft", "bad Portuguese in replies", "em dash in email", "humanize email reply", "draft checker", or VIVAZ outgoing email style checks.
---
# ETRNL Email Reply Quality

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-email-reply-quality`; on update, ask update/snooze/continue.

Protect VIVAZ outgoing replies before Victor sees or sends them. Treat every proposed reply as untrusted until it passes deterministic draft checks plus a humanizer pass.

## Required Checks

Run the runtime checker before asking Victor to approve a reply:

```bash
vivaz-email drafts check --draft-id <draft-id>
```

For unsaved text, run:

```bash
vivaz-email drafts check --body "<draft text>" --language pt-BR
```

A clean result has `"ok": true` and an empty `issues` array. Any issue blocks send/approval until rewritten and checked again.

## Hard Blocks

Reject these in outgoing VIVAZ email:

- Em dash or en dash characters.
- Portugal-style Portuguese in `pt-BR` drafts, including `teu`, `teus`, `tua`, `indica-nos`, `envia-nos`, `equipa`, `cumprimentos`, `gostarias`, `poderias`, `consegues`, `tens`, and similar forms.
- Generic AI/corporate closers such as `Espero que isso ajude`, `caso tenha alguma dúvida`, `fico à disposição para quaisquer esclarecimentos`, `Atenciosamente`, or assistant meta text like `Or do you want a different number?`.
- Template-like phrasing such as `Considerando todo o escopo`, `principalmente a parte`, `Se fizer sentido`, `É importante ressaltar`, `marco significativo`, or `não se trata apenas`.
- Stiff formal boilerplate such as `Prezado(a)`, `Venho por meio deste`, `Sem mais para o momento`, `Cordialmente`, or `Subscrevo-me`.
- English AI/business-email filler such as `I hope this message finds you well`, `Thank you for reaching out`, `happy to discuss further`, `please let me know if you have any questions`, or over-polished option lists when they add no commercial substance. Commercial substance means at least one concrete metric, deliverable, deadline, owner, next step, cost, usage-rights term, or ROI constraint.
- Placeholders, fake certainty, invented deal terms, acceptance of terms, guarantees, approvals, availability promises, or creator signatures.

## Rewrite Standard

Language selection: default to English for internal replies and workflow notes. Use pt-BR for external Portuguese-language contexts, Portuguese incoming messages, or when Victor explicitly requests Portuguese.

Use Brazilian Portuguese that sounds like Victor handling VIVAZ partnerships:

- Direct and warm, not formal Portugal Portuguese.
- `você`/direct wording, not `tu` forms.
- `me manda`, `consegue me mandar`, `te retorno`, `a gente`, `por aqui` when the context fits.
- Plain punctuation. Use a period, comma, colon, or plain hyphen instead of em/en dashes.
- Concrete commercial answer when the sender asks for price, scope, timeline, usage rights, or deliverables.
- No budget dodge when the sender directly asks for rates.

## Humanizer Pass

After the deterministic checker passes, run a short visible humanizer audit:

1. Detect AI/business-email tells, stiff corporate phrasing, wrong locale, and fake helpfulness.
2. Rewrite with VIVAZ voice while preserving commercial substance, numbers, caveats, and next step.
3. Self-check the rewritten draft against the hard blocks above.
4. Run `vivaz-email drafts check` again after rewriting.

When the local `humanizer-ptbr` skill is available, use it for Portuguese naturalness after the deterministic check. Keep its output subject to the VIVAZ checker because the checker is the authority for send safety.

## External Tool Direction

SkillsMP and GitHub research points to this layered quality stack:

- `vivaz-email drafts check`: required runtime gate with stable VIVAZ rule IDs.
- `humanizer-ptbr`: natural Brazilian Portuguese rewrite pass.
- Vale: next deterministic style layer for configurable VIVAZ business-email rules.
- LanguageTool: next grammar and spelling layer for pt-BR drafts.
- promptfoo: regression suite for malicious senders, wrong-language drafts, fake commitments, and quality regressions.

Do not replace the owned checker with a generic email-manager skill. Generic skills are useful for rule ideas, but outgoing email safety belongs in deterministic local tooling.

## Queue Workflow

For `/email-triage <account>` and reply queue work:

1. Open one queue item only.
2. If the queue item has a `draft_id`, run `vivaz-email drafts check --draft-id <draft-id>`.
3. If the checker fails, rewrite the draft first. Do not ask Victor to approve or send a failed draft.
4. Show Victor the exact rewritten draft body only after the checker passes.
5. Never send email until Victor explicitly approves the full visible draft text.

## Example Fix

Bad:

```text
Indica-nos os teus valores para esta campanha.

Cumprimentos,
Victor
```

Better:

```text
Consegue me mandar o escopo, período da ação e os formatos que vocês têm em mente?

Com isso eu vejo aqui e te retorno.

Abraço,
Victor
```

Bad:

```text
We can support strategy, content, or a full campaign.
```

Better:

```text
We can do a 3-video package, a 30-day content sprint, or a full campaign with usage rights. Send the deadline and budget range, and Juan will confirm the best option.
```
