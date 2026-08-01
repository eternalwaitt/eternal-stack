/**
 * Deterministic spawn guard for etrnl-dev-execute / Codex orchestrators.
 * Prevents per-patch review fan-out on wave 2+, review rounds past the fix cap,
 * and concurrent lane bursts above the execute profile default.
 */

function positiveEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export const BATCH_REVIEWER_HEAVY_MIN_SPAWNS = positiveEnv("ETRNL_BATCH_REVIEWER_HEAVY_MIN_SPAWNS", 20);
export const BATCH_REVIEWER_HEAVY_RATIO = positiveEnv("ETRNL_BATCH_REVIEWER_HEAVY_RATIO", 0.55);
export const BATCH_TASK_GROUP_THRESHOLD = positiveEnv("ETRNL_BATCH_TASK_GROUP_THRESHOLD", 3);
export const HARD_SPAWN_CAP_DEFAULT = positiveEnv("ETRNL_HARD_SPAWN_CAP", 80);
export const SPAWN_BURST_WINDOW_MS = positiveEnv("ETRNL_SPAWN_BURST_WINDOW_MS", 60_000);
export const PER_PATCH_REVIEW_BUDGET = positiveEnv("ETRNL_PER_PATCH_REVIEW_BUDGET", 3);

const REVIEW_LANE_PATTERN = /_(spec|quality|simplifier)(?:_review|_final|_r\d+)?$/i;
const ROUND_PATTERN = /_r(\d+)(?:_|$)/i;
const MERGED_WAVE_REVIEW_PATTERN = /^wave[\w-]*_(spec|quality|simplifier)(?:_review)?$/i;
const SURFACE_WAVE_REVIEW_PATTERN = /^surface-[\w-]+_wave-\d+_(spec|quality|simplifier)(?:_review)?$/i;
const WAVE_NUMBER_PATTERN = /^wave-?(\d+)/i;
const PHASE_NUMBER_PATTERN = /^P(\d+)/i;

const REVIEWER_HINTS = [
  "spec_review",
  "quality_review",
  "simplifier",
  "convergence",
  "adversary",
  "review_",
  "_review",
  "reviewer",
];
const IMPLEMENTER_HINTS = [
  "writer",
  "executor",
  "specialist",
  "migration",
  "server",
  "route_",
  "_server",
];
const SCOUT_HINTS = ["scout", "_lane", "numeric_investigator"];

const REVIEWER_SUBAGENT_PATTERN = /(?:^|[-_])(spec[-_]?review|quality[-_]?review|simplifier|adversary|design[-_]?review|dx[-_]?review|consumer[-_]?trace|browser[-_]?qa|reviewer|review)(?:$|[-_])/i;

export function isReviewerSubagentType(subagentType) {
  const value = String(subagentType || "").trim().toLowerCase();
  if (!value) return false;
  if (value.includes("scout") || value.includes("executor") || value.includes("investigator")) {
    return false;
  }
  return REVIEWER_SUBAGENT_PATTERN.test(value) || value.includes("etrnl-spec") || value.includes("etrnl-quality");
}

export function classifySpawnTaskName(taskName) {
  const name = String(taskName || "").trim();
  const lower = name.toLowerCase();
  let role = "other";
  if (REVIEWER_HINTS.some((hint) => lower.includes(hint))) role = "reviewer";
  else if (IMPLEMENTER_HINTS.some((hint) => lower.includes(hint))) role = "implementer";
  else if (SCOUT_HINTS.some((hint) => lower.includes(hint))) role = "scout";

  const mergedMatch = name.match(MERGED_WAVE_REVIEW_PATTERN)
    || name.match(SURFACE_WAVE_REVIEW_PATTERN);
  const isMergedWaveReview = Boolean(mergedMatch);
  const reviewLane = mergedMatch?.[1]?.toLowerCase()
    || name.match(REVIEW_LANE_PATTERN)?.[1]?.toLowerCase()
    || null;

  let patchId = name;
  patchId = patchId.replace(/^(review_)/i, "");
  patchId = patchId.replace(REVIEW_LANE_PATTERN, "");
  patchId = patchId.replace(/_r\d+_.*$/i, "");
  patchId = patchId.replace(/_(final|retry|audit).*$/i, "");
  if (isMergedWaveReview) patchId = null;

  const roundMatch = name.match(ROUND_PATTERN);
  const reviewRound = roundMatch ? Number.parseInt(roundMatch[1], 10) : 0;

  return {
    taskName: name,
    role,
    patchId: patchId || null,
    reviewLane,
    reviewRound,
    isMergedWaveReview,
  };
}

export function classifySpawnContext({ taskName, subagentType = "", packetMode = "", waveId = "" }) {
  const classified = classifySpawnTaskName(taskName);
  const sub = String(subagentType || "").trim().toLowerCase();
  const mode = String(packetMode || "").trim().toLowerCase();
  const waveNumber = parseWaveNumber(waveId);
  const reviewerSubagent = isReviewerSubagentType(subagentType)
    || (mode === "read-only" && sub.includes("review") && !sub.includes("scout"));
  if (!reviewerSubagent) {
    const writerPatch = String(taskName || "").match(/^(.+)_writer$/i)?.[1] || null;
    if (mode === "read-only" && waveNumber !== null && waveNumber >= 2 && writerPatch) {
      let reviewLane = classified.reviewLane;
      if (!reviewLane) {
        if (sub.includes("spec")) reviewLane = "spec";
        else if (sub.includes("quality")) reviewLane = "quality";
        else if (sub.includes("simplifier")) reviewLane = "simplifier";
      }
      return {
        ...classified,
        role: "reviewer",
        reviewerSubagent: true,
        reviewLane,
        patchId: writerPatch,
      };
    }
    return { ...classified, reviewerSubagent: false };
  }

  const writerPatch = String(taskName || "").match(/^(.+)_writer$/i)?.[1] || null;
  let reviewLane = classified.reviewLane;
  if (!reviewLane) {
    if (sub.includes("spec")) reviewLane = "spec";
    else if (sub.includes("quality")) reviewLane = "quality";
    else if (sub.includes("simplifier")) reviewLane = "simplifier";
  }

  return {
    ...classified,
    role: "reviewer",
    reviewerSubagent: true,
    reviewLane,
    patchId: classified.isMergedWaveReview ? null : (writerPatch || classified.patchId),
  };
}

export function resolveMaxConcurrentLanes(ledger = {}, env = process.env) {
  const fromLedger = ledger.executeProfile?.maxConcurrentLanes;
  if (Number.isInteger(fromLedger) && fromLedger > 0) return fromLedger;
  const explicit = Number(env.ETRNL_MAX_CONCURRENT_LANES);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const fromPlan = ledger.planMaxConcurrentLanes;
  if (Number.isInteger(fromPlan) && fromPlan > 0) return fromPlan;
  const host = String(env.ETRNL_EXECUTE_HOST || "").toLowerCase();
  if (host === "codex") return 2;
  if (host === "claude") return 3;
  if (env.CODEX_HOME) return 2;
  return 3;
}

export function resolveSpawnGuardMode(env = process.env) {
  const mode = String(env.ETRNL_SPAWN_GUARD_MODE || "").trim().toLowerCase();
  if (mode === "off" || mode === "advisory" || mode === "enforce") return mode;
  if (env.ETRNL_SPAWN_GUARD_STRICT === "0") return "advisory";
  return "enforce";
}

export function parseWaveNumber(waveId) {
  const wave = String(waveId || "").trim();
  const waveMatch = wave.match(WAVE_NUMBER_PATTERN);
  if (waveMatch) return Number.parseInt(waveMatch[1], 10);
  const phaseMatch = wave.match(PHASE_NUMBER_PATTERN);
  if (phaseMatch) return Number.parseInt(phaseMatch[1], 10);
  if (/^P\d+-P\d+/i.test(wave)) {
    const start = wave.match(PHASE_NUMBER_PATTERN);
    return start ? Number.parseInt(start[1], 10) : null;
  }
  return null;
}

function spawnsInWindow(spawns, windowMs, nowMs = Date.now()) {
  return (spawns ?? []).filter((spawn) => {
    const at = Date.parse(String(spawn.at || ""));
    return Number.isFinite(at) && nowMs - at <= windowMs;
  });
}

function reviewerSpawnRatio(spawns) {
  const all = spawns ?? [];
  if (all.length === 0) return 0;
  const reviewers = all.filter((spawn) => spawn.role === "reviewer").length;
  return reviewers / all.length;
}

function hasDecision(ledger, topic) {
  return (ledger.decisions ?? []).some((row) => String(row.topic || "") === topic);
}

function hasFullFanOutWave(ledger, waveId) {
  return (ledger.decisions ?? []).some((row) => {
    if (String(row.topic || "") !== "full-fan-out-wave") return false;
    const wave = String(row.waveId || row.decision || row.reason || "");
    return wave === String(waveId || "") || wave.includes(String(waveId || ""));
  });
}

function perPatchReviewCount(spawns, patchId, waveId) {
  return (spawns ?? []).filter((spawn) => spawn.role === "reviewer"
    && spawn.patchId === patchId
    && String(spawn.waveId || "") === String(waveId || "")).length;
}

function batchEligible(ledger) {
  const scope = String(ledger.planScope || "").toLowerCase();
  const groupCount = Number(ledger.taskGroupCount || 0);
  return scope === "large" || groupCount >= BATCH_TASK_GROUP_THRESHOLD;
}

function allowedSpawnNamesSet(ledger) {
  const names = ledger.allowedSpawnNames;
  if (!Array.isArray(names) || names.length === 0) return null;
  return new Set(names.map((name) => String(name)));
}

export function inferSpawnWaveId(ledger, { taskName = "" } = {}) {
  const name = String(taskName || "").trim();
  const mergedWave = name.match(/^(wave[\w-]+)_/i)?.[1];
  if (mergedWave) return mergedWave;
  const surfaceWave = name.match(/^surface-[\w-]+_(wave-\d+)_/i)?.[1];
  if (surfaceWave) return surfaceWave;

  const classified = classifySpawnTaskName(name);
  const spawns = ledger?.spawns ?? [];
  if (classified.patchId) {
    for (let i = spawns.length - 1; i >= 0; i -= 1) {
      const spawn = spawns[i];
      const spawnTask = String(spawn.taskName || "");
      if (spawnTask.startsWith(`${classified.patchId}_`) && spawn.waveId) {
        return String(spawn.waveId);
      }
    }
  }
  const waves = ledger?.waves ?? [];
  if (waves.length > 0) {
    const lastWave = waves[waves.length - 1];
    if (lastWave?.waveId) return String(lastWave.waveId);
  }
  return "";
}

export function isSpawnNameRegistered(taskName, ledger) {
  const allowed = allowedSpawnNamesSet(ledger);
  if (!allowed) return true;
  if (allowed.has(String(taskName))) return true;
  if (/^wave[\w-]*_(spec|quality|simplifier)(?:_review)?$/i.test(taskName)) return true;
  if (/^surface-[\w-]+_wave-\d+_(spec|quality|simplifier)(?:_review)?$/i.test(taskName)) return true;
  for (const prefix of allowed) {
    if (String(taskName).startsWith(`${prefix}_`)) return true;
  }
  return false;
}

export function evaluateSpawnGuard(ledger, input, options = {}) {
  const taskName = String(input.taskName || "").trim();
  const waveId = String(input.waveId || "").trim();
  if (!taskName) {
    return { allowed: false, reasonCode: "missing-task-name", reason: "check-spawn requires --task-name." };
  }
  if (!waveId) {
    return { allowed: false, reasonCode: "missing-wave", reason: "check-spawn requires --wave." };
  }

  const classified = classifySpawnContext({
    taskName,
    subagentType: input.subagentType,
    packetMode: input.packetMode,
    waveId,
  });
  const waveNumber = parseWaveNumber(waveId);
  const tier = Number.isInteger(input.riskTier) ? input.riskTier : 3;
  const maxLanes = resolveMaxConcurrentLanes(ledger, options.env ?? process.env);
  const spawns = ledger.spawns ?? [];
  const nowMs = options.nowMs ?? Date.now();
  const recent = spawnsInWindow(spawns, SPAWN_BURST_WINDOW_MS, nowMs);
  const overrideReason = String(input.overrideReason || "").trim();
  const fixRoundCap = tier >= 3 ? 4 : 2;
  const reviewScopeMode = String(input.reviewScopeMode || "").trim();

  if (recent.length >= maxLanes) {
    return {
      allowed: false,
      reasonCode: "concurrent-lane-cap",
      reason: `Spawn burst blocked: ${recent.length} spawn(s) in the last ${Math.round(SPAWN_BURST_WINDOW_MS / 1000)}s exceeds maxConcurrentLanes=${maxLanes}. Wait for in-flight subagents or raise the cap only when the plan's Parallelization strategy justifies it.`,
      classified,
    };
  }

  if (tier >= 2 && !isSpawnNameRegistered(taskName, ledger)
    && classified.role !== "scout" && classified.role !== "other") {
    return {
      allowed: false,
      reasonCode: "spawn-name-not-registered",
      reason: `Spawn name "${taskName}" is not in the ledger allowlist derived from the plan. Use plan task ids or merged wave reviewers (wave-N_spec_review). Run record-spawn-registry --plan <path> if the plan changed.`,
      classified,
    };
  }

  if (classified.role === "reviewer" && classified.reviewRound > fixRoundCap && !overrideReason) {
    return {
      allowed: false,
      reasonCode: "review-round-cap",
      reason: `Review round r${classified.reviewRound} exceeds the tier ${tier} cap of ${fixRoundCap} for patch ${classified.patchId || taskName}. Record residuals and proceed-with-residuals per bounded-review.md instead of spawning another reviewer.`,
      classified,
    };
  }

  const waveAtLeastTwo = waveNumber !== null && waveNumber >= 2;
  const fullFanOut = hasFullFanOutWave(ledger, waveId);
  if (classified.role === "reviewer" && waveAtLeastTwo && classified.patchId && !classified.isMergedWaveReview && !fullFanOut) {
    return {
      allowed: false,
      reasonCode: "per-patch-review-on-wave-2-plus",
      reason: `Per-patch reviewer "${taskName}" is forbidden on ${waveId} (wave/phase >= 2). Dispatch one merged wave review set (${waveId}_spec_review, ${waveId}_quality_review, ${waveId}_simplifier_review) over the combined diff instead. See references/batch-execution.md, claude-execute-profile.md, and codex-execute-profile.md.`,
      classified,
    };
  }

  if (classified.role === "reviewer" && classified.patchId && !classified.isMergedWaveReview) {
    const prior = perPatchReviewCount(spawns, classified.patchId, waveId);
    if (prior >= PER_PATCH_REVIEW_BUDGET && !overrideReason) {
      return {
        allowed: false,
        reasonCode: "per-patch-review-budget",
        reason: `Patch ${classified.patchId} already has ${prior} reviewer spawn(s) on ${waveId}. One spec + quality + simplifier pass is the per-patch maximum on wave 1; reopen only on P0/P1 via record-review caps, not new spawn names.`,
        classified,
      };
    }
  }

  const batchAdopted = hasDecision(ledger, "batch-execution-adopted");
  const eligible = batchEligible(ledger);

  if (eligible && !batchAdopted && maxLanes >= 3 && recent.length >= 2) {
    return {
      allowed: false,
      reasonCode: "parallel-lane-batch-required",
      reason: "Opening a third concurrent lane requires batch-execution-adopted on Large or multi-group plans.",
      classified,
    };
  }

  if (eligible && !batchAdopted && classified.role === "reviewer") {
    return {
      allowed: false,
      reasonCode: "large-scope-batch-required",
      reason: "Large scope or three-plus task groups require batch-execution-adopted before the first reviewer spawn. Record the decision and bundle items into surface waves with one merged review per wave.",
      classified,
    };
  }

  if (eligible && !batchAdopted && recent.length + 1 >= maxLanes && maxLanes >= 2) {
    return {
      allowed: false,
      reasonCode: "parallel-lane-batch-required",
      reason: "Opening another concurrent lane requires batch-execution-adopted on Large or multi-group plans before the lane cap is reached.",
      classified,
    };
  }

  const totalSpawns = spawns.length;
  const reviewRatio = reviewerSpawnRatio(spawns);
  const largeBatchRun = tier >= 2 && totalSpawns >= BATCH_REVIEWER_HEAVY_MIN_SPAWNS && reviewRatio >= BATCH_REVIEWER_HEAVY_RATIO;
  if (largeBatchRun && !batchAdopted && classified.role === "reviewer") {
    return {
      allowed: false,
      reasonCode: "batch-execution-required",
      reason: `Reviewer-heavy run (>${Math.round(BATCH_REVIEWER_HEAVY_RATIO * 100)}% review spawns, ${BATCH_REVIEWER_HEAVY_MIN_SPAWNS}+ total) requires batch-execution-adopted via execution-ledger.mjs record-decision before more reviewer spawns.`,
      classified,
    };
  }

  if (reviewScopeMode && classified.role === "reviewer" && reviewScopeMode !== "full_lenses") {
    const lane = classified.reviewLane || "";
    if (reviewScopeMode === "deterministic_only") {
      return {
        allowed: false,
        reasonCode: "review-scope-exceeded",
        reason: `Wave diff scope is deterministic_only; do not spawn LLM reviewer "${taskName}". Run review-rules.mjs and targeted lint/typecheck instead.`,
        classified,
      };
    }
    if (reviewScopeMode === "merged_quality" && lane && lane !== "quality") {
      return {
        allowed: false,
        reasonCode: "review-scope-exceeded",
        reason: `Wave diff scope is merged_quality (one reviewer). Blocked excess lens "${lane}" on "${taskName}".`,
        classified,
      };
    }
  }

  const hardCap = Number(options.hardSpawnCap ?? HARD_SPAWN_CAP_DEFAULT);
  if (totalSpawns >= hardCap && classified.role === "reviewer" && !overrideReason) {
    return {
      allowed: false,
      reasonCode: "spawn-budget-exhausted",
      reason: `Spawn budget exhausted (${totalSpawns} recorded). Stop spawning reviewers; close open streams with proceed-with-residuals or park blockers, then continue implementation sequentially.`,
      classified,
    };
  }

  return {
    allowed: true,
    reasonCode: "ok",
    reason: "Spawn allowed.",
    classified,
    record: {
      at: new Date(nowMs).toISOString(),
      taskName,
      waveId,
      role: classified.role,
      patchId: classified.patchId,
      reviewLane: classified.reviewLane,
      reviewRound: classified.reviewRound,
      isMergedWaveReview: classified.isMergedWaveReview,
      reviewerSubagent: classified.reviewerSubagent ?? false,
    },
  };
}
