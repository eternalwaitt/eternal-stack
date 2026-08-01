/**
 * Human-readable recovery hints for spawn-guard reason codes.
 */

import { BATCH_TASK_GROUP_THRESHOLD } from "./spawn-guard.mjs";

const EXPLAIN = {
  "missing-task-name": {
    exactFix: "Pass --task-name with the spawn task identifier.",
    exampleCommand: 'node scripts/execution-ledger.mjs check-spawn --task-name "p01a_writer" --wave "wave-1"',
  },
  "missing-wave": {
    exactFix: "Pass --wave with the current wave or phase id.",
    exampleCommand: 'node scripts/execution-ledger.mjs check-spawn --task-name "p01a_writer" --wave "wave-1"',
  },
  "concurrent-lane-cap": {
    exactFix: "Wait for in-flight subagents to finish, or raise maxConcurrentLanes only when the plan's Parallelization strategy justifies it.",
    exampleCommand: "node scripts/execution-ledger.mjs history --gates --plan <plan-path>",
  },
  "review-round-cap": {
    exactFix: "Record residuals and close the stream with proceed-with-residuals per bounded-review.md instead of spawning another reviewer alias.",
    exampleCommand: 'node scripts/execution-ledger.mjs record-review --task <id> --cap-decision proceed-with-residuals',
  },
  "per-patch-review-on-wave-2-plus": {
    exactFix: "Dispatch merged wave reviewers over the combined diff instead of per-patch names.",
    exampleCommand: 'node scripts/execution-ledger.mjs check-spawn --task-name "wave-2_spec_review" --wave "wave-2"',
  },
  "per-patch-review-budget": {
    exactFix: "One spec + quality + simplifier pass per patch on wave 1 is the maximum; reopen via record-review caps, not new spawn names.",
    exampleCommand: "See references/bounded-review.md fix-round caps.",
  },
  "batch-execution-required": {
    exactFix: "Record batch-execution-adopted before more reviewer spawns on Large or multi-group plans.",
    exampleCommand: 'node scripts/execution-ledger.mjs record-decision --topic batch-execution-adopted --decision "Surface-grouped waves with one merged review per wave." --reason "Scope triage Large"',
  },
  "large-scope-batch-required": {
    exactFix: `Large scope or ${BATCH_TASK_GROUP_THRESHOLD}+ task groups require batch-execution-adopted before the first reviewer spawn.`,
    exampleCommand: 'node scripts/execution-ledger.mjs record-decision --topic batch-execution-adopted --decision "Surface-grouped waves with one merged review per wave." --reason "Scope triage Large"',
  },
  "parallel-lane-batch-required": {
    exactFix: "Opening a third concurrent lane requires batch-execution-adopted on batch-eligible plans.",
    exampleCommand: 'node scripts/execution-ledger.mjs record-decision --topic batch-execution-adopted --decision "Surface-grouped waves with one merged review per wave." --reason "Third parallel lane"',
  },
  "spawn-budget-exhausted": {
    exactFix: "Stop spawning reviewers; close open streams with proceed-with-residuals or park blockers.",
    exampleCommand: 'node scripts/execution-ledger.mjs record-review --task <id> --cap-decision proceed-with-residuals',
  },
  "spawn-name-not-registered": {
    exactFix: "Use a task id from the plan execution scope or a merged wave reviewer name (wave-N_spec_review).",
    exampleCommand: 'node scripts/execution-ledger.mjs record-spawn-registry --plan <plan-path>',
  },
  "review-scope-exceeded": {
    exactFix: "Diff size and tier allow fewer reviewer lenses; dispatch only the permitted scope mode.",
    exampleCommand: 'node scripts/review-scope.mjs classify --wave <id> --json',
  },
  ok: {
    exactFix: "Spawn permitted.",
    exampleCommand: "",
  },
};

export function explainSpawnVerdict(verdict) {
  const code = String(verdict?.reasonCode || "ok");
  const template = EXPLAIN[code] || {
    exactFix: verdict?.reason || "See spawn-guard.mjs and references/batch-execution.md.",
    exampleCommand: 'node scripts/execution-ledger.mjs check-spawn --explain --task-name "<name>" --wave "<wave>"',
  };
  return {
    reasonCode: code,
    allowed: Boolean(verdict?.allowed),
    reason: verdict?.reason || "",
    exactFix: template.exactFix,
    exampleCommand: template.exampleCommand,
    classified: verdict?.classified ?? null,
  };
}
