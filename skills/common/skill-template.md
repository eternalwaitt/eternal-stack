# Skill House Style (etrnl)

Every `etrnl-audit-*` SKILL.md carries these four fixed sections (enforced by
`scripts/skill-contract-check.mjs`). Reviewer/dev skills SHOULD adopt them too.
Keep SKILL.md under 500 lines; move depth into `references/` (SKILL.md **or**
references, never duplicate the same content in both).

## Common Rationalizations

A two-column excuse → rebuttal list. Each row is a reason a run gets skipped or
cut short, and the one-line directive that overrides it. Example row:

- "The diff is small, a full audit is overkill." → Size is not risk. Run the
  scoped inventory; a one-line change to a Money/tenant path is Tier 3.

## Red Flags

Concrete anti-patterns this skill exists to catch — phrased so each one can seed
a deterministic `review-rules.mjs` entry later. Not vibes; nameable patterns
(e.g. "a `_count` on a PgBouncer create/update", "a test asserting only that a
call did not throw").

## When NOT to use

The explicit non-scope. When another skill/agent owns the job, name it. Stops the
skill from being run reflexively where it adds friction, not signal.

## Verification

A countable checklist — every item is PASS/FAIL, any FAIL ⇒ the run is incomplete.
The section MUST name a specific, already-run command with its pasted invocation,
output, and exit code, and that command MUST be **red-capable**: it asserts the
exact symptom (fails when the defect is present), not merely "runs without error".
No red-capable command, no completion. Example:

```
node scripts/code-health-inventory.mjs --json --quiet   # exit 0, 0 uncovered files
```
