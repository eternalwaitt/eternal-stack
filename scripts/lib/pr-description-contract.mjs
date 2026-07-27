/** Dual-audience PR description contract used by etrnl-dev-pr / pr-preflight.mjs */

import {
  classifyReleaseRisk,
  isShippingSensitive,
  validateReleaseSections,
} from "./release-controls.mjs";

export const PR_BODY_TEMPLATE = `## TL;DR
<One sentence: what gets better for whom once this merges.>

## Why this matters
<2–4 sentences. Who benefits, what pain goes away, what risk is reduced, what becomes possible. No file names or stack jargon.>

**Before:** <how it works or fails today>
**After:** <what users/operators can do now>

## What changes
### Adding
- <capability, behavior, or coverage we gain>

### Changing
- <existing behavior, workflow, or expectation that moves>

### Removing
- <capability, step, or burden we drop — say why that is safe or intentional>
<!-- or: Nothing -->

## Impact
- **Users / customers:** <visible effect, or "none — internal only">
- **Operators / support:** <runbooks, alerts, rollout, rollback>
- **Risk:** <residual risk in plain language, or "low — covered by …">

## Out of scope
- <What this PR does not address; follow-up PR or issue #N>

## Technical notes
- **Approach:** <key design choice and why this over the obvious alternative>
- **Touch points:** <modules, flags, env vars — bullets, not a file dump>
- **Compatibility:** <backward compat, defaults, version skew>
- **Observability:** <metrics, logs, doctor gates affected>

## Rollout & rollback
- **Rollout:** <feature flag, phased deploy, env var, who enables>
- **Rollback:** <revert steps, flag off, data impact — or "git revert; no migration">
- **Breaking changes:** <none | list with migration steps>

## Changelog
<!-- Delete when not user-facing -->
- <Customer-readable release note>

## Verification / test plan
**Commands run on \`<branch>\` @ \`<short-sha>\`:**
\`\`\`bash
<exact command>
\`\`\`
- Result: \`<pass/fail summary or key output line>\`

## Review guide
<!-- Large PRs only -->
- Start at \`<path>\` — core logic

## Links
<Only real issue, plan, or doc links. Omit when none.>

## Demo
<!-- UI or docs changes only -->
| Before | After |
| --- | --- |
| … | … |
`;

const REQUIRED_HEADINGS = [
  { id: "tldr", patterns: [/^##\s+TL;DR\s*$/im], label: "## TL;DR" },
  { id: "why", patterns: [/^##\s+Why this matters\s*$/im], label: "## Why this matters" },
  { id: "what", patterns: [/^##\s+What changes\s*$/im], label: "## What changes" },
  { id: "impact", patterns: [/^##\s+Impact\s*$/im], label: "## Impact" },
  {
    id: "verification",
    patterns: [/^##\s+Verification(?:\s+\/\s+test plan)?\s*$/im],
    label: "## Verification / test plan",
  },
];

const OPTIONAL_HEADINGS = [
  { id: "outOfScope", patterns: [/^##\s+Out of scope\s*$/im], label: "## Out of scope" },
  {
    id: "rollout",
    patterns: [/^##\s+Rollout(?:\s+&\s+rollback|\s+and\s+rollback)?\s*$/im],
    label: "## Rollout & rollback",
  },
];

const WEAK_TITLE_PATTERNS = [
  { pattern: /^update\s+/i, message: "title opens with 'Update' — name the outcome instead" },
  { pattern: /^refactor\s+/i, message: "title opens with 'Refactor' — name the outcome instead" },
  { pattern: /^fix\s+stuff/i, message: "title is too vague — name the broken workflow or outcome" },
  { pattern: /^wip\b/i, message: "title looks like a draft (WIP)" },
  { pattern: /\.(ts|tsx|js|jsx|sh|md)$/i, message: "title looks like a filename — name the outcome instead" },
];

function hasHeading(body, patterns) {
  return patterns.some((pattern) => pattern.test(body));
}

function sectionContent(body, headingPatterns) {
  const lines = String(body || "").split(/\r?\n/);
  let capture = false;
  const chunks = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capture) break;
      if (headingPatterns.some((pattern) => pattern.test(line))) capture = true;
      continue;
    }
    if (capture) chunks.push(line);
  }
  return chunks.join("\n").trim();
}

function isLargePr(changedFiles) {
  return Array.isArray(changedFiles) && changedFiles.length > 8;
}

export function validatePrDescription({ title = "", body = "", changedFiles = [] } = {}, options = {}) {
  const strict = options.strict === true;
  const blockers = [];
  const warnings = [];

  const normalizedTitle = String(title || "").trim();
  const normalizedBody = String(body || "").trim();

  if (!normalizedTitle) blockers.push("title missing");
  if (normalizedTitle.length > 100) warnings.push("title exceeds 100 characters");
  if (!normalizedBody) blockers.push("body missing");

  for (const { label, patterns } of REQUIRED_HEADINGS) {
    if (!hasHeading(normalizedBody, patterns)) {
      blockers.push(`missing required section: ${label}`);
    }
  }

  const whatContent = sectionContent(normalizedBody, [/^##\s+What changes\s*$/im]);
  if (whatContent && whatContent.length < 8) {
    blockers.push("## What changes section is too thin — describe add/change/remove");
  }

  const impactContent = sectionContent(normalizedBody, [/^##\s+Impact\s*$/im]);
  if (impactContent && !/\*\*Users/i.test(impactContent)) {
    warnings.push("Impact section should name **Users / customers:** explicitly");
  }

  const verificationContent = sectionContent(normalizedBody, [
    /^##\s+Verification(?:\s+\/\s+test plan)?\s*$/im,
  ]);
  if (verificationContent) {
    const hasCheckboxOnly =
      /-\s*\[\s*[ xX]?\s*\]/.test(verificationContent) && !/```/.test(verificationContent);
    if (hasCheckboxOnly) {
      warnings.push("Verification has checkboxes but no pasted command block — add ```bash commands and results");
    }
    if (verificationContent.length < 12) {
      blockers.push("## Verification / test plan section is too thin — paste commands and results");
    }
  }

  if (!hasHeading(normalizedBody, OPTIONAL_HEADINGS[0].patterns)) {
    const msg = "missing ## Out of scope — add one line on deliberate non-goals";
    if (strict || isLargePr(changedFiles)) blockers.push(msg);
    else warnings.push(msg);
  }

  const releaseClass = classifyReleaseRisk({ changedFiles });
  const technicalNotes = sectionContent(normalizedBody, [/^##\s+Technical notes\s*$/im]);
  const releaseValidation = validateReleaseSections({
    releaseClass,
    body: normalizedBody,
    technicalNotes,
  });

  if (releaseClass !== "routine") {
    if (!hasHeading(normalizedBody, OPTIONAL_HEADINGS[1].patterns)) {
      blockers.push(
        `release class ${releaseClass} — add ## Rollout & rollback (rollout, rollback, breaking changes)`,
      );
    }
    for (const blocker of releaseValidation.blockers) {
      blockers.push(blocker);
    }
    for (const warning of releaseValidation.warnings) {
      warnings.push(warning);
    }
  }

  for (const { pattern, message } of WEAK_TITLE_PATTERNS) {
    if (pattern.test(normalizedTitle)) warnings.push(message);
  }

  if (/^##\s+(src|scripts|hooks|skills)\//im.test(normalizedBody)) {
    warnings.push("body opens with a path heading — lead with TL;DR and business narrative");
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    releaseClass,
    shippingSensitive: releaseClass !== "routine",
    largePr: isLargePr(changedFiles),
  };
}

export { classifyReleaseRisk, isShippingSensitive };
