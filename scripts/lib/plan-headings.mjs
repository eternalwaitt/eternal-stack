/**
 * REQUIRED_PLAN_HEADINGS mixes two entry types:
 * - labeled single-line requirements (for example `Status: Final`, `Goal:`),
 * - markdown section headings (for example `## What already exists`).
 *
 * Consumers use this ordered list for validation and structure checks in plan
 * tooling. Ordering is significant because downstream checks assume this flow
 * from metadata headers to execution-readiness sections.
 */
export const REQUIRED_PLAN_HEADINGS = [
  "Status: Final",
  "Goal:",
  "Evidence:",
  "Non-goals:",
  "## What already exists",
  "## NOT in scope",
  "## File map",
  "## Task groups",
  "## Phases",
  "## Skill/tool routing",
  "## Test plan",
  "## Test-first execution plan",
  "## Failure modes",
  "## Parallelization strategy",
  "## Verification gates",
  "## Rollback",
  "## Execution handoff",
  "## Plan Readiness Report",
  "## Verdict",
];
