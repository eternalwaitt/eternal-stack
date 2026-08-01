#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { updateJsonUnderLock } from "./lib/json-file-store.mjs";
import { readStdinJson } from "./lib/read-stdin.mjs";

const args = process.argv.slice(2);
const subcommand = args.length > 0 && !args[0].startsWith("-") ? args[0] : "merge";
const markdownMode = args.includes("--markdown");
const jsonMode = args.includes("--json");
const filePath = argValue(args, "--file", "");

const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const AUTOFIX_CLASSES = new Set(["safe_auto", "gated_auto", "manual"]);
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Trajectory park thresholds. A loop that re-reports one fingerprint, ping-pongs
// between streams, or stops reducing findings spends turns without converging, so
// the stream parks on the first tripped counter instead of running the reopen cap
// down to zero. Counters come from `execution-ledger.mjs history --gates --json`.
const PARK_LIMIT_DEFAULTS = {
  recurringFindingCount: 3,
  streamAlternationCount: 4,
  roundsSinceProgress: 2,
};
const PARK_LIMIT_ENV = {
  recurringFindingCount: "ETRNL_REVIEW_RECURRING_FINDING_LIMIT",
  streamAlternationCount: "ETRNL_REVIEW_STREAM_ALTERNATION_LIMIT",
  roundsSinceProgress: "ETRNL_REVIEW_ROUNDS_SINCE_PROGRESS_LIMIT",
};
const PARK_REASON_CODES = {
  recurringFindingCount: "recurring-finding-limit",
  streamAlternationCount: "stream-alternation-limit",
  roundsSinceProgress: "rounds-since-progress-limit",
};

// Adaptive skip: a reviewer that returned nothing on this many consecutive
// dispatches stops being dispatched. Counters persist in `review-learnings.json`,
// the store `review-learn.mjs` already owns, so no second state file exists.
const ADAPTIVE_SKIP_STREAK_ENV = "ETRNL_REVIEW_ADAPTIVE_SKIP_STREAK";
const ADAPTIVE_SKIP_STREAK_DEFAULT = 5;

const HELP = `usage: review-merge.mjs [--file <path>] [--markdown]
                        [--trajectory <path>] [--wave <id>]
                        [--reopen-round <n>] [--reopen-cap <n>]
                        [--dispatched <a,b,c>] [--learnings <path>]
       review-merge.mjs skip-plan --reviewers <a,b,c> [--scope wave|repo] [--learnings <path>] [--json]

Merge parallel reviewer findings into one artifact.

Input: JSON array on stdin or via --file. Each finding object:
  reviewer      string   reviewer role or id
  severity      P0|P1|P2|P3
  confidence    number   0-1
  file          string   relative file path
  line          number   line number
  fingerprint   string   optional dedup key
  summary       string   finding text
  autofix_class safe_auto|gated_auto|manual

Output: merged report JSON (default) or markdown (--markdown).
  blocking   P0/P1 findings above confidence threshold
  safe_auto    non-blocking safe_auto findings (fix now)
  residual     non-blocking gated_auto/manual findings (todos)
  dropped      findings below confidence threshold (never silent)
  park         trajectory park decision with named reason codes
  capDecision  what to do when the loop ends: reopen, close, proceed-with-residuals,
               or owner-decision (the only value that may interrupt the user)

Trajectory park (--trajectory <ledger history --gates --json output>):
  recurringFindingCount >= ${PARK_LIMIT_DEFAULTS.recurringFindingCount}   env ${PARK_LIMIT_ENV.recurringFindingCount}
  streamAlternationCount >= ${PARK_LIMIT_DEFAULTS.streamAlternationCount}  env ${PARK_LIMIT_ENV.streamAlternationCount}
  roundsSinceProgress >= ${PARK_LIMIT_DEFAULTS.roundsSinceProgress}     env ${PARK_LIMIT_ENV.roundsSinceProgress}

Adaptive reviewer skip:
  --dispatched records per-reviewer finding counts into review-learnings.json.
  skip-plan reports which reviewers dispatch and which skip, each skip carrying a
  machine-readable reasonCode. Security lenses, tenancy lenses, and deep-audit
  lanes are exempt and always dispatch.
  Streak limit ${ADAPTIVE_SKIP_STREAK_DEFAULT} consecutive zero-finding dispatches; env ${ADAPTIVE_SKIP_STREAK_ENV}.

Exit 1 when blocking is non-empty; 0 otherwise.`;

function abort(message) {
  console.error(`review-merge: ${message}`);
  process.exit(2);
}

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const text = String(raw).trim();
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== text) {
    abort(`${name} must be a positive integer (got ${JSON.stringify(raw)})`);
  }
  return parsed;
}

function nonNegativeIntArg(flag) {
  const raw = argValue(args, flag, "");
  if (!raw) return null;
  const text = String(raw).trim();
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== text) {
    abort(`${flag} must be a non-negative integer (got ${JSON.stringify(raw)})`);
  }
  return parsed;
}

function listArg(flag) {
  return argValue(args, flag, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parkLimits() {
  const limits = {};
  for (const counter of Object.keys(PARK_LIMIT_DEFAULTS)) {
    limits[counter] = positiveIntEnv(PARK_LIMIT_ENV[counter], PARK_LIMIT_DEFAULTS[counter]);
  }
  return limits;
}

function learningsPath() {
  const override = argValue(args, "--learnings", "");
  if (override) return path.resolve(override);
  const scope = argValue(args, "--scope", "wave");
  if (scope === "repo") {
    abort("--scope repo requires --learnings <path>; use .etrnl/review-learnings.json in the target repo only when repo-local streaks must survive across machines");
  }
  const root = path.resolve(argValue(args, "--root", "") || process.cwd());
  const home = process.env.HOME;
  if (!home) {
    abort("review-merge requires --learnings <path> or a set HOME for the default private overlay");
  }
  const repoKey = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return path.join(home, ".claude/review-learnings", repoKey, "review-learnings.json");
}

// Throws rather than exits: this runs inside the store lock, and process.exit()
// skips the finally block that releases it, stranding every other lane behind a
// lock directory until the staleness timeout reclaims it.
function parseLearnings(storePath) {
  if (!existsSync(storePath)) return { schemaVersion: 1, recurrences: {}, promoted: {}, cleanRuns: {} };
  const parsed = JSON.parse(readFileSync(storePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${storePath} is not a review-learnings object`);
  }
  return parsed;
}

function readLearnings(storePath) {
  try {
    return parseLearnings(storePath);
  } catch (error) {
    abort(`cannot read ${storePath}: ${error.message}`);
  }
  return null;
}

// The store belongs to review-learn.mjs and this command rewrites the whole
// parsed object, so a concurrent writer's rows survive only when the read and
// the write are one critical section. Parallel reviewer lanes are the point of
// this feature, so the read happens inside the lock and the replacement lands
// through rename(): a crashed writer leaves the previous store intact.
function updateLearnings(storePath, mutate) {
  try {
    return updateJsonUnderLock(storePath, {
      read: parseLearnings,
      update: mutate,
      label: "review learnings",
    });
  } catch (error) {
    abort(`cannot update ${storePath}: ${error.message}`);
  }
  return null;
}

function normalizeSummary(summary) {
  return String(summary || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ");
}

function dedupeKey(finding) {
  if (finding.fingerprint) return String(finding.fingerprint);
  const prefix = normalizeSummary(finding.summary).slice(0, 80);
  return `${finding.file}:${finding.line}:${prefix}`;
}

function validateFinding(finding, index) {
  const errors = [];
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    return [`findings[${index}] must be an object`];
  }
  if (!finding.reviewer) errors.push(`findings[${index}] missing reviewer`);
  if (!SEVERITIES.has(finding.severity)) errors.push(`findings[${index}] invalid severity ${finding.severity}`);
  const confidence = Number(finding.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push(`findings[${index}] confidence must be 0-1`);
  }
  if (!finding.file) errors.push(`findings[${index}] missing file`);
  if (!Number.isInteger(finding.line) || finding.line < 1) errors.push(`findings[${index}] line must be a positive integer`);
  if (!finding.summary) errors.push(`findings[${index}] missing summary`);
  if (!AUTOFIX_CLASSES.has(finding.autofix_class)) {
    errors.push(`findings[${index}] invalid autofix_class ${finding.autofix_class}`);
  }
  return errors;
}

function loadFindings() {
  let payload;
  if (filePath) {
    try {
      payload = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      console.error(`review-merge --file ${filePath}: ${error.message}`);
      process.exit(2);
    }
  } else {
    payload = readStdinJson({ required: true });
  }
  if (!Array.isArray(payload)) {
    console.error("review-merge input must be a JSON array of findings.");
    process.exit(2);
  }
  const errors = payload.flatMap((finding, index) => validateFinding(finding, index));
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(2);
  }
  return payload;
}

function pickHighestSeverity(group) {
  return group.reduce((best, current) => (
    SEVERITY_RANK[current.severity] < SEVERITY_RANK[best.severity] ? current : best
  ));
}

function confidenceThreshold(severity) {
  return severity === "P0" ? 0.50 : 0.60;
}

function mergeFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = dedupeKey(finding);
    const bucket = groups.get(key) ?? [];
    bucket.push(finding);
    groups.set(key, bucket);
  }

  const kept = [];
  const dropped = [];

  for (const group of groups.values()) {
    const base = pickHighestSeverity(group);
    let confidence = Math.max(...group.map((item) => Number(item.confidence)));
    if (group.length >= 2) confidence = Math.min(1, confidence + 0.10);
    const merged = {
      ...base,
      confidence,
      fingerprint: base.fingerprint || dedupeKey(base),
      reviewers: [...new Set(group.map((item) => item.reviewer))],
      reviewerCount: group.length,
    };
    const threshold = confidenceThreshold(merged.severity);
    if (confidence < threshold) {
      dropped.push({
        ...merged,
        dropReason: `confidence ${confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}`,
      });
    } else {
      kept.push(merged);
    }
  }

  const blocking = kept.filter((item) => item.severity === "P0" || item.severity === "P1");
  const safe_auto = kept.filter((item) => item.severity !== "P0" && item.severity !== "P1" && item.autofix_class === "safe_auto");
  const residual = kept.filter((item) => item.severity !== "P0" && item.severity !== "P1" && (item.autofix_class === "gated_auto" || item.autofix_class === "manual"));

  return {
    inputCount: findings.length,
    mergedCount: kept.length,
    droppedCount: dropped.length,
    blocking,
    safe_auto,
    residual,
    dropped,
  };
}

function counterValue(wave, counter) {
  const raw = wave[counter];
  if (raw === undefined || raw === null) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    abort(`wave ${wave.waveId}: ${counter} must be a non-negative integer (got ${JSON.stringify(raw)})`);
  }
  return parsed;
}

// Accepts the ledger's `history --gates --json` payload, a bare waves array, or a
// single wave row, so a caller pipes the ledger output through without reshaping it.
function loadTrajectoryWave() {
  const trajectoryPath = argValue(args, "--trajectory", "");
  const waveId = argValue(args, "--wave", "");
  if (!trajectoryPath) {
    if (waveId) abort("--wave requires --trajectory <path>");
    return { status: "not-provided", wave: null };
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(path.resolve(trajectoryPath), "utf8"));
  } catch (error) {
    abort(`cannot read --trajectory ${trajectoryPath}: ${error.message}`);
  }
  let waves = null;
  if (Array.isArray(payload)) waves = payload;
  else if (payload && Array.isArray(payload.waves)) waves = payload.waves;
  else if (payload && typeof payload === "object" && payload.waveId) waves = [payload];
  if (!waves) {
    abort("--trajectory must hold `execution-ledger.mjs history --gates --json` output, a waves array, or one wave row");
  }
  if (waves.length === 0) {
    abort("--trajectory holds no wave rows; record counters with `execution-ledger.mjs record-trajectory` first");
  }
  for (const wave of waves) {
    if (!wave || typeof wave !== "object" || !wave.waveId) abort("--trajectory wave rows each require a waveId");
  }
  if (waveId) {
    const match = waves.find((wave) => String(wave.waveId) === waveId);
    if (!match) abort(`--wave ${waveId} is absent from ${trajectoryPath}`);
    return { status: "parsed", wave: match };
  }
  if (waves.length > 1) abort("--trajectory holds several waves; name one with --wave <id>");
  return { status: "parsed", wave: waves[0] };
}

function evaluatePark() {
  const limits = parkLimits();
  const reopenRoundsUsed = nonNegativeIntArg("--reopen-round");
  const reopenCap = nonNegativeIntArg("--reopen-cap");
  // Report-only: the reopen cap is enforced by the caller that owns the loop, so
  // exhausting it is never a park reason code here. Parking happens on the
  // trajectory counters below, which is what lets a stream stop before the cap.
  const reopenCapExhausted = reopenRoundsUsed === null || reopenCap === null
    ? null
    : reopenRoundsUsed >= reopenCap;
  const { status, wave } = loadTrajectoryWave();
  if (status !== "parsed") {
    return {
      parked: false,
      trajectoryStatus: status,
      waveId: null,
      limits,
      counters: null,
      reasons: [],
      reopenRoundsUsed,
      reopenCap,
      reopenCapExhausted,
    };
  }
  const counters = {};
  const reasons = [];
  for (const counter of Object.keys(limits)) {
    const value = counterValue(wave, counter);
    counters[counter] = value;
    if (value >= limits[counter]) {
      reasons.push({
        counter,
        value,
        limit: limits[counter],
        reasonCode: PARK_REASON_CODES[counter],
        reason: `${counter} ${value} reached the park limit ${limits[counter]}`,
      });
    }
  }
  return {
    parked: reasons.length > 0,
    trajectoryStatus: status,
    waveId: String(wave.waveId),
    limits,
    counters,
    reasons,
    reopenRoundsUsed,
    reopenCap,
    reopenCapExhausted,
  };
}

// A spent reopen cap or a tripped park counter ends the loop; severity decides
// what happens next, and the merge computes it so no caller has to improvise.
// Only a P0/P1 that survived every round earns an owner's turn — a lower
// severity is a residual by definition, and asking about one halts independent
// work that the open finding never touched.
function evaluateCapDecision(report, park) {
  const loopEndReasons = park.reopenCapExhausted === true ? ["reopen-cap-exhausted"] : [];
  for (const entry of park.reasons) loopEndReasons.push(entry.reasonCode);
  const blockingCount = report.blocking.length;
  const residualCount = report.residual.length;
  const base = {
    loopEnded: loopEndReasons.length > 0,
    loopEndReasons,
    blockingCount,
    residualCount,
    blockingFingerprints: report.blocking.map((item) => item.fingerprint),
    waveId: park.waveId,
    reopenRoundsUsed: park.reopenRoundsUsed,
    reopenCap: park.reopenCap,
  };

  if (!base.loopEnded) {
    return blockingCount > 0
      ? {
        ...base,
        decision: "reopen",
        ownerDecisionRequired: false,
        reason: `${blockingCount} blocking finding(s) open with reopen rounds remaining`,
        nextAction: "fix the blocking findings and re-run only the reviewers whose lenses cover the changed surfaces",
      }
      : {
        ...base,
        decision: "close",
        ownerDecisionRequired: false,
        reason: "no blocking findings",
        nextAction: "close the task or wave",
      };
  }

  if (blockingCount === 0) {
    return {
      ...base,
      decision: "proceed-with-residuals",
      ownerDecisionRequired: false,
      reason: `loop ended (${loopEndReasons.join(", ")}) with no blocking findings; ${residualCount} residual finding(s) carry forward`,
      nextAction: "record the residual findings as non-blocking notes, close the stream, and continue; do not ask the user to authorize another round",
    };
  }

  return {
    ...base,
    decision: "owner-decision",
    ownerDecisionRequired: true,
    reason: `loop ended (${loopEndReasons.join(", ")}) with ${blockingCount} blocking finding(s) still open`,
    nextAction: "stop this task or stream only, keep independent task groups running, and escalate the named blocking fingerprints with `execution-ledger.mjs record-decision` plus `record-review --override-owner-approved`",
  };
}

function recordDispatchOutcome(findings) {
  const dispatched = listArg("--dispatched");
  if (dispatched.length === 0) return null;
  const streakLimit = positiveIntEnv(ADAPTIVE_SKIP_STREAK_ENV, ADAPTIVE_SKIP_STREAK_DEFAULT);
  const storePath = learningsPath();
  const reviewers = [];
  const at = new Date().toISOString();
  updateLearnings(storePath, (store) => {
    reviewers.length = 0;
    if (!store.reviewerDispatches || typeof store.reviewerDispatches !== "object" || Array.isArray(store.reviewerDispatches)) {
      store.reviewerDispatches = {};
    }
    for (const reviewer of dispatched) {
      const findingCount = findings.filter((finding) => String(finding.reviewer) === reviewer).length;
      const prior = store.reviewerDispatches[reviewer] ?? {};
      const row = {
        dispatches: Number(prior.dispatches || 0) + 1,
        zeroFindingStreak: findingCount === 0 ? Number(prior.zeroFindingStreak || 0) + 1 : 0,
        lastFindingCount: findingCount,
        updatedAt: at,
      };
      store.reviewerDispatches[reviewer] = row;
      reviewers.push({ reviewer, findingCount, ...row });
    }
    return store;
  });
  return { store: storePath, streakLimit, reviewers };
}

function renderMarkdown(report) {
  const lines = [
    "# Merged review report",
    "",
    `Input findings: ${report.inputCount}; kept: ${report.mergedCount}; dropped: ${report.droppedCount}`,
    "",
  ];
  if (report.park.parked) {
    lines.push(
      `Park: wave ${report.park.waveId} parked — ${report.park.reasons.map((entry) => entry.reasonCode).join(", ")}`,
      "",
    );
  }
  lines.push(`Decision: ${report.capDecision.decision} — ${report.capDecision.reason}`, "");
  for (const [title, items] of [
    ["Blocking (P0/P1)", report.blocking],
    ["Safe auto-fix", report.safe_auto],
    ["Residual todos", report.residual],
    ["Dropped", report.dropped],
  ]) {
    lines.push(`## ${title}`, "");
    if (items.length === 0) {
      lines.push("_none_", "");
      continue;
    }
    for (const item of items) {
      lines.push(`- **${item.severity}** \`${item.file}:${item.line}\` — ${item.summary} (confidence ${item.confidence.toFixed(2)}, reviewers: ${item.reviewers.join(", ")})`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

// Deep-audit lane ids come from the live registry, not a copied list: a lane that
// reports zero findings is a coverage result, and auto-skipping it would restore
// the sampling the audit work removed. An unloadable registry means the exemption
// set is unknown, so no reviewer skips at all.
async function exemptionIndex() {
  try {
    const registry = await import("./lib/deep-audit-categories.mjs");
    const ids = new Set();
    for (const category of registry.REGISTERED_DEEP_AUDIT_CATEGORIES ?? []) {
      if (category?.categoryId) ids.add(String(category.categoryId).toLowerCase());
      if (category?.skillName) ids.add(String(category.skillName).toLowerCase());
      for (const lane of category?.lanes ?? []) {
        if (lane?.laneId) ids.add(String(lane.laneId).toLowerCase());
      }
    }
    return { available: true, ids };
  } catch {
    return { available: false, ids: new Set() };
  }
}

function exemptionFor(reviewer, index) {
  const id = String(reviewer).toLowerCase();
  if (id.includes("security")) {
    return { reasonCode: "exempt-security", reason: "security lens never auto-skips" };
  }
  if (id.includes("tenan")) {
    return { reasonCode: "exempt-tenancy", reason: "tenancy lens never auto-skips" };
  }
  if (index.ids.has(id) || id.startsWith("etrnl-audit-") || id.startsWith("etrnl-deep-audit") || id.startsWith("deep-audit")) {
    return { reasonCode: "exempt-audit-lane", reason: "deep-audit lane zero findings is a coverage result, not redundancy" };
  }
  return null;
}

async function skipPlan() {
  const reviewers = listArg("--reviewers");
  if (reviewers.length === 0) abort("skip-plan requires --reviewers <a,b,c>");
  const streakLimit = positiveIntEnv(ADAPTIVE_SKIP_STREAK_ENV, ADAPTIVE_SKIP_STREAK_DEFAULT);
  const index = await exemptionIndex();
  const storePath = learningsPath();
  const store = readLearnings(storePath);
  const rows = store.reviewerDispatches && typeof store.reviewerDispatches === "object" ? store.reviewerDispatches : {};
  const dispatch = [];
  const skips = [];
  const exemptions = [];
  for (const reviewer of reviewers) {
    const zeroFindingStreak = Number(rows[reviewer]?.zeroFindingStreak || 0);
    if (!index.available) {
      dispatch.push(reviewer);
      continue;
    }
    const exemption = exemptionFor(reviewer, index);
    if (exemption) {
      dispatch.push(reviewer);
      exemptions.push({ reviewer, zeroFindingStreak, ...exemption });
      continue;
    }
    if (zeroFindingStreak >= streakLimit) {
      skips.push({
        reviewer,
        kind: "reviewer",
        reasonCode: "zero-finding-streak",
        reason: `${zeroFindingStreak} consecutive dispatches returned 0 findings (limit ${streakLimit})`,
        zeroFindingStreak,
        count: 1,
      });
      continue;
    }
    dispatch.push(reviewer);
  }
  const report = {
    schemaVersion: 1,
    skipEvaluation: index.available ? "evaluated" : "unavailable",
    streakLimit,
    store: storePath,
    dispatch,
    skips,
    exemptions,
  };
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  process.stdout.write(`review-merge skip-plan: ${dispatch.length} dispatch, ${skips.length} skip, ${exemptions.length} exempt (${report.skipEvaluation})\n`);
  for (const reviewer of dispatch) process.stdout.write(`  dispatch ${reviewer}\n`);
  for (const entry of skips) process.stdout.write(`  skip ${entry.reviewer} [${entry.reasonCode}] ${entry.reason}\n`);
  for (const entry of exemptions) process.stdout.write(`  exempt ${entry.reviewer} [${entry.reasonCode}] ${entry.reason}\n`);
}

function mergeMain() {
  const findings = loadFindings();
  const report = mergeFindings(findings);
  report.park = evaluatePark();
  report.capDecision = evaluateCapDecision(report, report.park);
  report.dispatchAccounting = recordDispatchOutcome(findings);

  if (markdownMode) {
    process.stdout.write(renderMarkdown(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.blocking.length > 0 ? 1 : 0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
if (subcommand === "skip-plan") {
  await skipPlan();
} else if (subcommand === "merge") {
  mergeMain();
} else {
  console.error(HELP);
  process.exit(2);
}
