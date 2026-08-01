#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";
import { updateJsonUnderLock, withFileLock, writeJsonAtomic } from "./lib/json-file-store.mjs";
import { nowIso, safeId } from "./lib/evidence-trace.mjs";
import { worktreeHash } from "./lib/etrnl-state-core.mjs";
import {
  currentLedgerPath as resolveLedgerPath,
  ledgerOwnedByWorktree,
  legacyPointerPath,
  pointerPath,
  runsDir,
  sessionBucket,
  worktreeKey,
} from "./lib/ledger-pointer.mjs";
import { parseRiskTier } from "./lib/plan-risk-tier.mjs";
import { readStdinJson, readStdinRaw } from "./lib/read-stdin.mjs";

const STATUSES = new Set(["pending", "in_progress", "reviewing", "changes_requested", "verified", "blocked", "skipped"]);
const PHASE_STATUSES = new Set(["pending", "in_progress", "uat", "verified", "blocked", "skipped"]);
const CHECK_STATUSES = new Set(["passed", "failed", "blocked", "skipped"]);
const AGENT_DONE = new Set(["completed", "verified", "skipped"]);
// Trajectory counters live on the ledger's own wave rows so bounded-review consumers
// read them through `history --gates --json` instead of adding a second store.
const TRAJECTORY_COUNTERS = ["recurringFindingCount", "streamAlternationCount", "roundsSinceProgress"];
const EVIDENCE_DONE = new Set(["passed", "verified", "red_green_verified", "not_applicable", "skipped"]);
const REVIEW_DONE = new Set(["verified", "completed"]);
// Defaults allow brief multi-agent contention; tune with env vars for unusually slow disks.
// The raw env values are passed through on purpose: acquireFileLock validates them and
// falls back to its own defaults, so a typo cannot turn the timeout into NaN — which
// would compare false against every elapsed time and spin the lock loop forever.
const LOCK_OPTIONS = {
  timeoutMs: process.env.ETRNL_LEDGER_LOCK_TIMEOUT_MS,
  staleMs: process.env.ETRNL_LEDGER_LOCK_STALE_MS,
  label: "execution ledger",
};

const args = process.argv.slice(2);
const command = args[0] ?? "help";

// Packet fields such as criticalPath and stopCondition are validated by
// agent-task-packet-check.mjs and retained as reviewer/operator metadata.
// This ledger records execution evidence; it does not schedule subtasks or
// evaluate packet stop conditions at runtime.

const argValue = (flag, fallback = "") => readArgValue(args, flag, fallback);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  withFileLock(file, () => writeJsonAtomic(file, value, { mode: 0o600 }), LOCK_OPTIONS);
}

function updateJson(file, updater) {
  return updateJsonUnderLock(file, {
    read: readJson,
    update: updater,
    mode: 0o600,
    ...LOCK_OPTIONS,
  });
}

function currentLedgerPath(sessionId) {
  return resolveLedgerPath(sessionId);
}

function validateLedger(ledger) {
  const errors = [];
  if (![1, 2].includes(ledger.schemaVersion)) errors.push("schemaVersion must be 1 or 2");
  if (!ledger.runId) errors.push("runId is required");
  if (!Array.isArray(ledger.tasks)) errors.push("tasks must be an array");
  if (!Array.isArray(ledger.agents)) errors.push("agents must be an array");
  if (!Array.isArray(ledger.checks)) errors.push("checks must be an array");
  if (ledger.artifacts && !Array.isArray(ledger.artifacts)) errors.push("artifacts must be an array");
  if (ledger.requiredArtifacts && !Array.isArray(ledger.requiredArtifacts)) errors.push("requiredArtifacts must be an array");
  if (ledger.schemaVersion === 2 && !Array.isArray(ledger.events)) errors.push("events must be an array");
  // Events predating actor provenance stay valid; a malformed actor does not.
  if (Array.isArray(ledger.events)) {
    for (const [index, event] of ledger.events.entries()) {
      if (event?.actor === undefined) continue;
      if (typeof event.actor !== "object" || event.actor === null || Array.isArray(event.actor)) {
        errors.push(`events[${index}].actor must be an object`);
      } else if (typeof event.actor.session !== "string" || event.actor.session.length === 0) {
        errors.push(`events[${index}].actor.session must be a non-empty string`);
      }
    }
  }
  if (ledger.reviews && !Array.isArray(ledger.reviews)) errors.push("reviews must be an array");
  if (ledger.phases && !Array.isArray(ledger.phases)) errors.push("phases must be an array");
  if (ledger.tddEvidence && !Array.isArray(ledger.tddEvidence)) errors.push("tddEvidence must be an array");
  if (ledger.simplifierEvidence && !Array.isArray(ledger.simplifierEvidence)) errors.push("simplifierEvidence must be an array");
  if (ledger.specialistEvidence && !Array.isArray(ledger.specialistEvidence)) errors.push("specialistEvidence must be an array");
  if (ledger.completionAudit && !Array.isArray(ledger.completionAudit)) errors.push("completionAudit must be an array");
  if (ledger.installProof && !Array.isArray(ledger.installProof)) errors.push("installProof must be an array");
  if (ledger.waves && !Array.isArray(ledger.waves)) errors.push("waves must be an array");
  if (ledger.phaseId !== undefined && typeof ledger.phaseId !== "string") errors.push("phaseId must be a string");
  if (ledger.workstreamId !== undefined && typeof ledger.workstreamId !== "string") errors.push("workstreamId must be a string");
  if (ledger.uatArtifact !== undefined && typeof ledger.uatArtifact !== "string") errors.push("uatArtifact must be a string");
  if (ledger.phaseStatus !== undefined && !PHASE_STATUSES.has(ledger.phaseStatus)) {
    errors.push(`phaseStatus has invalid status ${ledger.phaseStatus}`);
  }
  if (ledger.uatOpenFindings !== undefined && (!Number.isInteger(ledger.uatOpenFindings) || ledger.uatOpenFindings < 0)) {
    errors.push("uatOpenFindings must be a non-negative integer");
  }

  for (const task of ledger.tasks ?? []) {
    if (!task.id) errors.push("task is missing id");
    if (!STATUSES.has(task.status)) errors.push(`task ${task.id || "<unknown>"} has invalid status ${task.status}`);
  }
  for (const agent of ledger.agents ?? []) {
    if (!agent.id) errors.push("agent is missing id");
    if (!agent.role) errors.push(`agent ${agent.id || "<unknown>"} is missing role`);
    if (!agent.status) errors.push(`agent ${agent.id || "<unknown>"} is missing status`);
    if (agent.mode === "write" && !agent.packetHash) errors.push(`agent ${agent.id || "<unknown>"} write evidence is missing packetHash`);
  }
  for (const phase of Array.isArray(ledger.phases) ? ledger.phases : []) {
    if (!phase.id) errors.push("phase is missing id");
    if (!PHASE_STATUSES.has(phase.status)) {
      errors.push(`phase ${phase.id || "<unknown>"} has invalid status ${phase.status}`);
    }
  }
  for (const wave of Array.isArray(ledger.waves) ? ledger.waves : []) {
    if (!wave.waveId) errors.push("wave is missing waveId");
    for (const counter of TRAJECTORY_COUNTERS) {
      const value = wave[counter];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`wave ${wave.waveId || "<unknown>"} ${counter} must be a non-negative integer`);
      }
    }
  }
  for (const check of Array.isArray(ledger.checks) ? ledger.checks : []) {
    if (!check.name) errors.push("check is missing name");
    if (!check.command) errors.push(`check ${check.name || "<unknown>"} is missing command`);
    if (!CHECK_STATUSES.has(check.status)) errors.push(`check ${check.name || "<unknown>"} has invalid status ${check.status}`);
  }
  for (const [field, label] of [
    ["tddEvidence", "TDD evidence"],
    ["simplifierEvidence", "simplifier evidence"],
    ["specialistEvidence", "specialist evidence"],
    ["completionAudit", "completion audit"],
    ["installProof", "install proof"],
  ]) {
    for (const item of Array.isArray(ledger[field]) ? ledger[field] : []) {
      if (!item.status) errors.push(`${label} row is missing status`);
      if (item.taskId && !taskExists(ledger, item.taskId)) errors.push(`${label} references unknown task: ${item.taskId}`);
    }
  }
  for (const artifact of Array.isArray(ledger.artifacts) ? ledger.artifacts : []) {
    if (!artifact.type) errors.push("artifact is missing type");
    if (!artifact.path) errors.push(`artifact ${artifact.type || "<unknown>"} is missing path`);
    if (artifact.path && !existsSync(path.resolve(ledger.cwd || process.cwd(), artifact.path))) {
      errors.push(`artifact ${artifact.type || "<unknown>"} path does not exist: ${artifact.path}`);
    }
  }
  return errors;
}

function sameLineage(evidence, task) {
  return String(evidence.lineageId || "") === String(task.lineageId || "");
}

function evidenceTimeMs(evidence) {
  for (const key of ["completedAt", "endedAt", "at", "timestamp"]) {
    const parsed = Date.parse(String(evidence[key] || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function latestEvidenceTime(evidenceItems) {
  const times = evidenceItems.map(evidenceTimeMs).filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : Number.NaN;
}

function preciseNowIso() {
  return new Date().toISOString();
}

function boundEvidenceErrors(ledger) {
  const errors = [];
  const agents = ledger.agents ?? [];
  const reviews = ledger.reviews ?? [];
  for (const task of ledger.tasks ?? []) {
    if (!(task.mode === "write" || task.requiresImplementationEvidence === true)) continue;
    const matchingAgents = agents.filter((agent) => {
      if (agent.taskId !== task.id) return false;
      if (!AGENT_DONE.has(agent.status)) return false;
      if (task.packetHash && agent.packetHash !== task.packetHash) return false;
      if (!sameLineage(agent, task)) return false;
      // `etrnl-executor` is the implementation role, so legacy executor records count even if mode was omitted.
      return agent.mode === "write" || agent.role === "etrnl-executor";
    });
    const latestImplementationTime = latestEvidenceTime(matchingAgents);
    if (matchingAgents.length === 0) {
      errors.push(`task ${task.id} missing bound write implementation evidence`);
    }
    for (const [flag, reviewer] of [
      ["specReviewRequired", "etrnl-spec-reviewer"],
      ["qualityReviewRequired", "etrnl-quality-reviewer"],
    ]) {
      if (task[flag] !== true) continue;
      const matchingReviews = reviews.filter((review) => {
        if (review.taskId !== task.id) return false;
        if (review.reviewer !== reviewer) return false;
        if (!["completed", "verified", "skipped"].includes(review.status)) return false;
        if (task.packetHash && review.packetHash !== task.packetHash) return false;
        if (!sameLineage(review, task)) return false;
        return true;
      });
      if (matchingReviews.length === 0) {
        errors.push(`task ${task.id} missing ${reviewer} review evidence`);
      } else if (Number.isFinite(latestImplementationTime)
        && !matchingReviews.some((review) => evidenceTimeMs(review) > latestImplementationTime)) {
        errors.push(`task ${task.id} ${reviewer} review evidence must be after implementation evidence`);
      }
    }
  }
  return errors;
}

function taskBoundEvidenceRows(ledger, field, task) {
  return (ledger[field] ?? []).filter((row) => {
    if (row.taskId !== task.id) return false;
    if (!EVIDENCE_DONE.has(row.status)) return false;
    if (task.packetHash && row.packetHash !== task.packetHash) return false;
    if (task.lineageId && !sameLineage(row, task)) return false;
    return true;
  });
}

function requiredEvidenceErrors(ledger) {
  const errors = [];
  for (const task of ledger.tasks ?? []) {
    if (task.status === "skipped") continue;
    if (task.tddRequired === true && taskBoundEvidenceRows(ledger, "tddEvidence", task).length === 0) {
      errors.push(`task ${task.id} missing TDD evidence`);
    }
    if (task.simplifierReviewRequired === true && taskBoundEvidenceRows(ledger, "simplifierEvidence", task).length === 0) {
      errors.push(`task ${task.id} missing simplifier evidence`);
    }
    if (task.domainReviewRequired === true && taskBoundEvidenceRows(ledger, "specialistEvidence", task).length === 0) {
      errors.push(`task ${task.id} missing specialist evidence`);
    }
    if (task.completionAuditRequired === true && taskBoundEvidenceRows(ledger, "completionAudit", task).length === 0) {
      errors.push(`task ${task.id} missing completion audit evidence`);
    }
    if (task.installProofRequired === true && taskBoundEvidenceRows(ledger, "installProof", task).length === 0) {
      errors.push(`task ${task.id} missing install proof evidence`);
    }
  }
  return errors;
}

function worktreeCheckErrors(ledger) {
  const errors = [];
  const passedChecks = (ledger.checks ?? []).filter((check) => check.status === "passed");
  if (passedChecks.length === 0) return errors;
  const stamped = passedChecks.filter((check) => check.treeHash);
  if (stamped.length === 0) return errors;
  const currentHash = worktreeHash(ledger.cwd || process.cwd());
  if (!currentHash) {
    errors.push("cannot verify checks against the current worktree");
    return errors;
  }
  if (stamped.some((check) => check.treeHash !== currentHash)) {
    errors.push("verification checks are stale for the current worktree");
  }
  return errors;
}

function latestTier3InvestigatorMs(ledger, afterAt) {
  const afterMs = Date.parse(afterAt || "");
  let latest = null;
  const consider = (rowAt) => {
    const ms = Date.parse(rowAt || "");
    if (!Number.isFinite(ms)) return;
    if (Number.isFinite(afterMs) && ms < afterMs) return;
    if (latest === null || ms > latest) latest = ms;
  };
  for (const row of ledger.specialistEvidence ?? []) {
    if (String(row.skill || row.reviewer || "") !== "etrnl-investigator") continue;
    if (row.status !== "verified" && row.status !== "completed") continue;
    consider(row.at);
  }
  for (const row of ledger.reviews ?? []) {
    if (row.reviewer !== "etrnl-investigator" || !REVIEW_DONE.has(row.status)) continue;
    consider(row.at);
  }
  for (const row of ledger.agents ?? []) {
    if (row.agentType !== "etrnl-investigator" && row.role !== "etrnl-investigator") continue;
    if (!AGENT_DONE.has(row.status)) continue;
    consider(row.at || row.completedAt);
  }
  return latest;
}

function tier3ResidualClosureErrors(ledger) {
  if (resolvePlanRiskTier(ledger) < 3) return [];
  const decisions = ledger.decisions ?? [];
  let searchFrom = 0;
  while (searchFrom < decisions.length) {
    const pendingIdx = decisions.findIndex((row, idx) => idx >= searchFrom && row.topic === "tier3-residual-closure-pending");
    if (pendingIdx < 0) break;
    const pendingAt = decisions[pendingIdx].at;
    const confirmedIdx = decisions.findIndex((row, idx) => idx > pendingIdx && row.topic === "tier3-residual-closure-confirmed");
    const investigatorMs = latestTier3InvestigatorMs(ledger, pendingAt);
    if (investigatorMs === null) {
      return ["tier-3 auth/money/migration/tenancy/security residual closure requires completed etrnl-investigator evidence after tier3-residual-closure-pending"];
    }
    if (confirmedIdx < 0) {
      return ["tier-3 auth/money/migration/tenancy/security residual closure requires record-decision owner confirmation (topic: tier3-residual-closure-confirmed)"];
    }
    const confirmedMs = Date.parse(decisions[confirmedIdx].at || "");
    if (Number.isFinite(confirmedMs) && confirmedMs < investigatorMs) {
      return ["tier-3 auth/money/migration/tenancy/security residual closure requires owner confirmation after etrnl-investigator evidence"];
    }
    searchFrom = confirmedIdx + 1;
  }
  return [];
}

function completionErrors(ledger, options = {}) {
  const errors = validateLedger(ledger);
  const tasks = ledger.tasks ?? [];
  const phases = ledger.phases ?? [];
  const unfinishedTasks = tasks
    .filter((task) => !["verified", "skipped"].includes(task.status))
    .map((task) => `${task.id}:${task.status}`);
  const unfinishedAgents = (ledger.agents ?? [])
    .filter((agent) => !AGENT_DONE.has(agent.status))
    .map((agent) => `${agent.id}:${agent.status}`);
  const artifactTypes = new Set((ledger.artifacts ?? []).map((artifact) => artifact.type));
  const missingArtifacts = (ledger.requiredArtifacts ?? []).filter((type) => !artifactTypes.has(type));
  const failedChecks = (ledger.checks ?? [])
    .filter((check) => check.status !== "passed")
    .map((check) => `${check.name || "<unknown>"}:${check.status || "<missing>"}`);
  if (unfinishedTasks.length > 0) errors.push(`unfinished tasks: ${unfinishedTasks.join(", ")}`);
  if (unfinishedAgents.length > 0) errors.push(`unfinished agents: ${unfinishedAgents.join(", ")}`);
  if (missingArtifacts.length > 0) errors.push(`missing artifacts: ${missingArtifacts.join(", ")}`);
  if (Number(ledger.uatOpenFindings || 0) > 0) errors.push(`open UAT findings: ${ledger.uatOpenFindings}`);
  if ((ledger.checks ?? []).length === 0) errors.push("no verification checks recorded");
  if (failedChecks.length > 0) errors.push(`verification checks not passed: ${failedChecks.join(", ")}`);
  errors.push(...worktreeCheckErrors(ledger));
  if (options.requireTasks && tasks.length === 0) errors.push("no execution tasks recorded");
  if (options.requirePlanPhases && !ledger.planPath) errors.push("no plan path recorded");
  if (options.requirePlanPhases && phases.length === 0) errors.push("no plan phases recorded");
  if (options.requirePlanPhases && phases.length > 0) {
    const latestPhaseStatuses = new Map();
    for (const phase of phases) {
      if (phase.id) latestPhaseStatuses.set(phase.id, phase.status);
    }
    const unfinishedPhases = [...latestPhaseStatuses.entries()]
      .filter(([, status]) => !["verified", "skipped"].includes(status))
      .map(([id, status]) => `${id}:${status}`);
    if (unfinishedPhases.length > 0) {
      errors.push(`plan phases not verified or explicitly skipped: ${unfinishedPhases.join(", ")}`);
    }
  }
  errors.push(...boundEvidenceErrors(ledger));
  errors.push(...requiredEvidenceErrors(ledger));
  errors.push(...tier3ResidualClosureErrors(ledger));
  return errors;
}

function initLedger() {
  const cwd = path.resolve(argValue("--cwd", process.cwd()));
  // The bucket is derived from the ledger's own cwd, not the caller's: `init --cwd`
  // declares which worktree the run belongs to, and later commands run from inside
  // that worktree must resolve the pointer this init writes.
  const bucket = sessionBucket(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"), cwd);
  const runId = `run-${bucket}-${Date.now()}`;
  const file = path.join(runsDir(), `${runId}.json`);
  const at = nowIso();
  const ledger = {
    schemaVersion: 2,
    runId,
    sessionId: bucket,
    cwd,
    projectId: safeId(argValue("--project", path.basename(cwd) || "default")),
    planPath: argValue("--plan"),
    mode: argValue("--mode", "agent-os"),
    startedAt: at,
    updatedAt: at,
    tasks: [],
    agents: [],
    reviews: [],
    tddEvidence: [],
    simplifierEvidence: [],
    specialistEvidence: [],
    completionAudit: [],
    installProof: [],
    checks: [],
    artifacts: [],
    requiredArtifacts: [],
    phases: [],
    waves: [],
    decisions: [],
    events: [{ type: "ledger.init", at, actor: eventActor(bucket) }],
    continuations: { count: 0, max: 3, lastReason: "" },
  };
  writeJson(file, ledger);
  writeJson(pointerPath(bucket), { path: file, updatedAt: ledger.updatedAt });
  console.log(file);
}

function validateCommand() {
  const explicitPath = args[1] && !args[1].startsWith("-") ? args[1] : "";
  const file = explicitPath || currentLedgerPath(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"));
  if (!file) return;
  const errors = validateLedger(readJson(file));
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("Execution ledger valid");
}

function checkStop() {
  const sessionId = argValue("--session", process.env.CLAUDE_SESSION_ID || "default");
  const requireTasks = args.includes("--require-tasks");
  const requirePlanPhases = args.includes("--require-plan-phases");
  const file = currentLedgerPath(sessionId);
  if (!file) {
    if (args.includes("--require-ledger")) {
      console.error(`No active execution ledger for session ${resolvedSessionLabel()}.`);
      console.error(missingLedgerHint());
      process.exit(1);
    }
    return;
  }
  const errors = completionErrors(readJson(file), { requireTasks, requirePlanPhases });
  if (errors.length > 0) {
    console.error(`Execution ledger is not complete: ${errors.join("; ")}`);
    process.exit(1);
  }
}

function checkBoundExecute() {
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const taskId = argValue("--task");
  const packetHashValue = argValue("--packet-hash");
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const selectedTasks = taskId
    ? (ledger.tasks ?? []).filter((task) => task.id === taskId)
    : (ledger.tasks ?? []);
  const scoped = {
    ...ledger,
    tasks: selectedTasks.map((task) => ({ ...task })),
  };
  if (taskId && (scoped.tasks ?? []).length === 0) {
    console.error(`No task recorded for ${taskId}.`);
    process.exit(1);
  }
  if (packetHashValue || lineageId) {
    scoped.tasks = (scoped.tasks ?? []).map((task) => ({
      ...task,
      ...(packetHashValue ? { packetHash: packetHashValue } : {}),
      ...(lineageId ? { lineageId } : {}),
    }));
  }
  const errors = boundEvidenceErrors(scoped);
  if (errors.length > 0) {
    console.error(`Execution evidence is not bound: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log("Execution evidence bound");
}

function currentLedgerOrFail() {
  const file = currentLedgerPath(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"));
  if (!file) {
    console.error(`No active execution ledger for session ${resolvedSessionLabel()}.`);
    console.error(missingLedgerHint());
    process.exit(1);
  }
  return file;
}

// A run ledger from another worktree is unreachable by design, so the operator needs
// to be told which of the two situations they are in: no run started here yet, or a
// run started elsewhere that this worktree may not append to.
function missingLedgerHint() {
  let foreign = "";
  try {
    const target = readJson(legacyPointerPath()).path || "";
    if (target && existsSync(target) && !ledgerOwnedByWorktree(target)) foreign = target;
  } catch {
    foreign = "";
  }
  return foreign
    ? `The shared 'default' pointer names ${path.basename(foreign)}, which belongs to another worktree. Run \`init\` here or set CLAUDE_SESSION_ID.`
    : "Run `execution-ledger.mjs init` in this worktree first.";
}

// The session label a command resolves to, computed exactly like pointerPath so an
// event records the bucket that was actually written, not the one the caller meant.
// An empty --session (an unset CLAUDE_SESSION_ID expanded by the shell) collapses to
// the shared "default" label; qualifying it by worktree is what keeps two concurrent
// sessions in different repositories from resolving one another's ledger.
function resolvedSessionLabel() {
  return sessionBucket(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"));
}

// Ledger events are the only record of which process mutated a run. session/pid/ppid/cwd
// come from the OS and from pointer resolution, so they hold even when the caller lies;
// --actor and ETRNL_AGENT are self-reported, so they land under `claims` and carry the
// same trust caveat agent-output-contract.mjs applies to a self-declared ETRNL_AGENT.
function eventActor(bucket = resolvedSessionLabel()) {
  const claimed = argValue("--actor", process.env.ETRNL_AGENT || "").trim();
  return {
    session: bucket,
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    ...(claimed ? { claims: claimed } : {}),
  };
}

function appendEvent(ledger, type, payload = {}) {
  if (ledger.schemaVersion !== 2) return;
  ledger.events = ledger.events ?? [];
  // actor is spread last so a payload key cannot forge it.
  ledger.events.push({ type, at: nowIso(), ...payload, actor: eventActor() });
}

function resolvePlanPath(ledger) {
  if (!ledger.planPath) return "";
  return path.isAbsolute(ledger.planPath)
    ? ledger.planPath
    : path.resolve(ledger.cwd || process.cwd(), ledger.planPath);
}

function resolvePlanRiskTier(ledger) {
  const planPath = resolvePlanPath(ledger);
  if (!planPath) return 3;
  try {
    return parseRiskTier(readFileSync(planPath, "utf8")).tier;
  } catch {
    return 3;
  }
}

function maxReopenRoundsForTier(tier) {
  return tier >= 3 ? 4 : 2;
}

function doneReviewsForLineage(ledger, taskId, reviewer, lineageId) {
  return (ledger.reviews ?? []).filter((review) => review.taskId === taskId
    && review.reviewer === reviewer
    && String(review.lineageId || "") === String(lineageId || "")
    && REVIEW_DONE.has(review.status));
}

function reopenCapUsageText() {
  return "Reopen counting rule: the first record-review with status verified/completed for a task+reviewer+lineageId is the initial pass (not a reopen); each later record-review for the same triple after a verified/completed row is one reopen round. Tier 0-2 allows 2 reopen rounds; tier 3 allows 4; unknown tier defaults to 3. A finding that is not P0/P1 at the cap is a residual: record it as a non-blocking note and close the stream instead of reopening. Pass --override-owner-approved \"<reason>\" only for a P0/P1 that survived every round.";
}

function assertReviewReopenAllowed(ledger, { taskId, reviewer, lineageId, overrideReason }) {
  const priorDone = doneReviewsForLineage(ledger, taskId, reviewer, lineageId).length;
  if (priorDone === 0) return;
  const tier = resolvePlanRiskTier(ledger);
  const maxReopens = maxReopenRoundsForTier(tier);
  if (priorDone > maxReopens && !overrideReason) {
    console.error(
      `record-review reopen cap exceeded for task ${taskId}, reviewer ${reviewer}, lineage ${lineageId}: `
      + `${priorDone} prior verified/completed review(s); tier ${tier} allows at most ${maxReopens} reopen round(s). `
      + `${reopenCapUsageText()}`,
    );
    process.exit(1);
  }
}

const TASK_DONE = new Set(["verified", "skipped"]);

function taskDurationMinutes(task) {
  const startMs = Date.parse(String(task.startedAt || ""));
  const endMs = Date.parse(String(task.completedAt || task.heartbeatAt || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return Number.NaN;
  return (endMs - startMs) / 60_000;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function parsePlanEstimateHours(planText) {
  const match = planText.match(/^\s*Estimated(?:\s+duration|\s+time)?:\s*([0-9]+(?:\.[0-9]+)?)\s*h(?:ours?)?\s*$/im);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  return Number.isFinite(hours) && hours > 0 ? hours : Number.NaN;
}

function computeProgress(ledger) {
  const tasks = ledger.tasks ?? [];
  const total = tasks.length;
  const done = tasks.filter((task) => TASK_DONE.has(task.status)).length;
  const remaining = Math.max(total - done, 0);
  const completedDurations = tasks
    .filter((task) => TASK_DONE.has(task.status))
    .map((task) => taskDurationMinutes(task))
    .filter((value) => Number.isFinite(value));
  const medianMinutesPerTask = median(completedDurations);
  const lower = Number.isFinite(medianMinutesPerTask) ? Math.round(medianMinutesPerTask * remaining) : Number.NaN;
  const upper = Number.isFinite(lower) ? Math.round(lower * 1.5) : Number.NaN;
  return {
    done,
    total,
    remaining,
    medianMinutesPerTask: Number.isFinite(medianMinutesPerTask) ? Math.round(medianMinutesPerTask) : null,
    remainingBandMinutes: Number.isFinite(lower) && Number.isFinite(upper)
      ? { lower, upper }
      : null,
    projectedRemainingMinutes: Number.isFinite(lower) ? lower : null,
  };
}

function resolveRenegotiationThresholdMinutes(ledger) {
  const planPath = resolvePlanPath(ledger);
  if (planPath) {
    try {
      const estimateHours = parsePlanEstimateHours(readFileSync(planPath, "utf8"));
      if (Number.isFinite(estimateHours)) return estimateHours * 60 * 2;
    } catch {
      // fall through to default threshold
    }
  }
  return 8 * 60;
}

function applySetTask(ledger, taskId, fields = {}, commandName = "set-task") {
  const existing = (ledger.tasks ?? []).find((task) => task.id === taskId);
  const status = fields.status || existing?.status;
  if (!status || !STATUSES.has(status)) {
    console.error(`${commandName} requires a valid status.`);
    process.exit(2);
  }
  const at = nowIso();
  const next = {
    id: taskId,
    title: fields.title || existing?.title || taskId,
    status,
    heartbeatAt: at,
  };
  if (status === "in_progress" && !existing?.startedAt) {
    next.startedAt = fields.startedAt || at;
  } else if (existing?.startedAt) {
    next.startedAt = existing.startedAt;
  }
  if (TASK_DONE.has(status)) {
    next.completedAt = fields.completedAt || at;
  } else if (existing?.completedAt) {
    next.completedAt = existing.completedAt;
  }
  for (const key of ["mode", "lineageId", "packetHash"]) {
    const snake = key === "lineageId" ? "lineage_id" : key === "packetHash" ? "packet_hash" : key;
    const value = fields[key] ?? fields[snake];
    if (value) next[key] = value;
  }
  for (const key of [
    "requiresImplementationEvidence",
    "specReviewRequired",
    "qualityReviewRequired",
    "tddRequired",
    "simplifierReviewRequired",
    "domainReviewRequired",
    "completionAuditRequired",
    "installProofRequired",
  ]) {
    if (fields[key] === true) next[key] = true;
  }
  ledger.tasks = existing
    ? ledger.tasks.map((task) => task.id === taskId ? { ...task, ...next } : task)
    : [...(ledger.tasks ?? []), next];
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "task.set", { taskId, status });
}

function setTask() {
  const taskId = argValue("--task");
  const status = argValue("--status");
  if (!taskId || !STATUSES.has(status)) {
    console.error("set-task requires --task and a valid --status.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    const fields = { status, title: argValue("--title") };
    for (const [flag, key] of [
      ["--mode", "mode"],
      ["--lineage", "lineageId"],
      ["--lineage-id", "lineageId"],
      ["--packet-hash", "packetHash"],
    ]) {
      const value = argValue(flag);
      if (value) fields[key] = value;
    }
    for (const [flag, key] of [
      ["--requires-implementation-evidence", "requiresImplementationEvidence"],
      ["--spec-review-required", "specReviewRequired"],
      ["--quality-review-required", "qualityReviewRequired"],
      ["--tdd-required", "tddRequired"],
      ["--simplifier-review-required", "simplifierReviewRequired"],
      ["--domain-review-required", "domainReviewRequired"],
      ["--completion-audit-required", "completionAuditRequired"],
      ["--install-proof-required", "installProofRequired"],
    ]) {
      if (args.includes(flag)) fields[key] = true;
    }
    applySetTask(ledger, taskId, fields);
    return ledger;
  });
}

// Validate packet/lineage binding before acquiring the file lock. A task bound to
// a packet/lineage must record matching evidence, otherwise stale generic rows could
// satisfy the bound requirement after a reissue. Validating here (not inside the lock)
// avoids leaking the lock when the process exits on a rejection.
function requireBoundEvidenceArgs(file, taskId, commandName) {
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const packetHash = argValue("--packet-hash");
  if (taskId) {
    const boundTask = (readJson(file).tasks ?? []).find((task) => task.id === taskId);
    if (boundTask?.packetHash && !packetHash) {
      console.error(`${commandName} requires --packet-hash for task ${taskId} bound to a packet.`);
      process.exit(2);
    }
    if (boundTask?.lineageId && !lineageId) {
      console.error(`${commandName} requires --lineage for task ${taskId} bound to a lineage.`);
      process.exit(2);
    }
  }
  return { lineageId, packetHash };
}

function applyRecordTaskEvidence(ledger, field, eventType, commandName, taskId, options, rowBuilder) {
  const lineageId = options.lineageId ?? options.lineage_id ?? "";
  const packetHash = options.packetHash ?? options.packet_hash ?? "";
  requireTaskBinding(ledger, taskId, commandName);
  const at = preciseNowIso();
  ledger[field] = ledger[field] ?? [];
  const row = {
    taskId,
    lineageId,
    packetHash,
    status: options.status || "verified",
    evidence: options.evidence,
    at,
    ...rowBuilder(options),
  };
  ledger[field].push(row);
  ledger.updatedAt = nowIso();
  appendEvent(ledger, eventType, { taskId, status: row.status });
}

function recordTaskEvidence(field, eventType, commandName, rowBuilder) {
  const taskId = argValue("--task");
  const file = currentLedgerOrFail();
  const { lineageId, packetHash } = requireBoundEvidenceArgs(file, taskId, commandName);
  updateJson(file, (ledger) => {
    applyRecordTaskEvidence(ledger, field, eventType, commandName, taskId, {
      lineageId,
      packetHash,
      status: argValue("--status", "verified"),
      evidence: argValue("--evidence"),
    }, () => rowBuilder());
    return ledger;
  });
}

function applyRecordTdd(ledger, taskId, options) {
  applyRecordTaskEvidence(ledger, "tddEvidence", "tdd.recorded", "record-tdd", taskId, options, (opts) => ({
    sourceFiles: opts.sourceFiles ?? opts.source_files,
    redCommand: opts.redCommand ?? opts.red_command,
    redStatus: opts.redStatus ?? opts.red_status,
    redFailure: opts.redFailure ?? opts.red_failure,
    greenCommand: opts.greenCommand ?? opts.green_command,
    greenStatus: opts.greenStatus ?? opts.green_status,
    rationaleWhenNotTestFirst: opts.rationaleWhenNotTestFirst ?? opts.rationale,
  }));
}

function recordTdd() {
  recordTaskEvidence("tddEvidence", "tdd.recorded", "record-tdd", () => ({
    sourceFiles: argValue("--source-files"),
    redCommand: argValue("--red-command"),
    redStatus: argValue("--red-status"),
    redFailure: argValue("--red-failure"),
    greenCommand: argValue("--green-command"),
    greenStatus: argValue("--green-status"),
    rationaleWhenNotTestFirst: argValue("--rationale"),
  }));
}

function applyRecordSimplifier(ledger, taskId, options) {
  applyRecordTaskEvidence(ledger, "simplifierEvidence", "simplifier.recorded", "record-simplifier", taskId, options, (opts) => ({
    reviewer: opts.reviewer || "code-simplifier",
  }));
}

function recordSimplifier() {
  recordTaskEvidence("simplifierEvidence", "simplifier.recorded", "record-simplifier", () => ({
    reviewer: argValue("--reviewer", "code-simplifier"),
  }));
}

function recordSpecialist() {
  recordTaskEvidence("specialistEvidence", "specialist.recorded", "record-specialist", () => ({
    skill: argValue("--skill", argValue("--reviewer", "specialist")),
  }));
}

function applyRecordCompletionAudit(ledger, taskId, options) {
  const item = options.item;
  if (!item) {
    console.error("record-completion-audit requires item.");
    process.exit(2);
  }
  const lineageId = options.lineageId ?? options.lineage_id ?? "";
  const packetHash = options.packetHash ?? options.packet_hash ?? "";
  requireTaskBinding(ledger, taskId, "record-completion-audit");
  const status = options.status || "verified";
  ledger.completionAudit = ledger.completionAudit ?? [];
  ledger.completionAudit.push({
    item,
    taskId,
    lineageId,
    packetHash,
    classification: options.classification || "DONE",
    status,
    impact: options.impact || "low",
    evidence: options.evidence,
    acceptedBy: options.acceptedBy ?? options.accepted_by,
    at: preciseNowIso(),
  });
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "completion-audit.recorded", { item, taskId, status });
}

function recordCompletionAudit() {
  const item = argValue("--item");
  if (!item) {
    console.error("record-completion-audit requires --item.");
    process.exit(2);
  }
  const taskId = argValue("--task");
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const packetHash = argValue("--packet-hash");
  const file = currentLedgerOrFail();
  if (taskId) {
    const boundTask = (readJson(file).tasks ?? []).find((task) => task.id === taskId);
    if (boundTask?.packetHash && !packetHash) {
      console.error(`record-completion-audit requires --packet-hash for task ${taskId} bound to a packet.`);
      process.exit(2);
    }
    if (boundTask?.lineageId && !lineageId) {
      console.error(`record-completion-audit requires --lineage for task ${taskId} bound to a lineage.`);
      process.exit(2);
    }
  }
  updateJson(file, (ledger) => {
    applyRecordCompletionAudit(ledger, taskId, {
      item,
      lineageId,
      packetHash,
      classification: argValue("--classification", "DONE"),
      status: argValue("--status", "verified"),
      impact: argValue("--impact", "low"),
      evidence: argValue("--evidence"),
      acceptedBy: argValue("--accepted-by"),
    });
    return ledger;
  });
}

function recordInstallProof() {
  const stage = argValue("--stage");
  if (!stage) {
    console.error("record-install-proof requires --stage.");
    process.exit(2);
  }
  recordTaskEvidence("installProof", "install-proof.recorded", "record-install-proof", () => ({
    stage,
    command: argValue("--command"),
  }));
}

function recordCheck() {
  const name = argValue("--name");
  const commandText = argValue("--command");
  const status = argValue("--status", "passed");
  if (!name || !commandText) {
    console.error("record-check requires --name and --command.");
    process.exit(2);
  }
  if (!CHECK_STATUSES.has(status)) {
    console.error(`record-check got invalid --status: ${status}.`);
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    ledger.checks = ledger.checks ?? [];
    ledger.checks.push({
      name,
      command: commandText,
      status,
      outputSummary: argValue("--summary"),
      at: nowIso(),
      treeHash: worktreeHash(ledger.cwd || process.cwd()),
    });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "check.recorded", { name, status });
    return ledger;
  });
}

function requireArtifact() {
  const type = argValue("--type");
  if (!type) {
    console.error("require-artifact requires --type.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    const required = new Set(ledger.requiredArtifacts ?? []);
    required.add(type);
    ledger.requiredArtifacts = [...required].sort();
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "artifact.required", { artifactType: type });
    return ledger;
  });
}

function recordArtifact() {
  const type = argValue("--type");
  const artifactPath = argValue("--path");
  if (!type || !artifactPath) {
    console.error("record-artifact requires --type and --path.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    const resolvedArtifactPath = path.resolve(ledger.cwd || process.cwd(), artifactPath);
    if (!existsSync(resolvedArtifactPath)) {
      console.error(`record-artifact path does not exist: ${artifactPath}`);
      process.exit(1);
    }
    ledger.artifacts = ledger.artifacts ?? [];
    ledger.artifacts.push({ type, path: artifactPath, status: argValue("--status", "recorded"), at: nowIso() });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "artifact.recorded", { artifactType: type, path: artifactPath });
    return ledger;
  });
}

function taskExists(ledger, taskId) {
  return (ledger.tasks ?? []).some((task) => task.id === taskId);
}

function requireTaskBinding(ledger, taskId, commandName) {
  if (!taskId) {
    console.error(`${commandName} requires --task.`);
    process.exit(2);
  }
  if (!taskExists(ledger, taskId)) {
    console.error(`${commandName} references unknown task: ${taskId}.`);
    process.exit(1);
  }
}

function applyRecordAgent(ledger, taskId, options) {
  const id = options.id || options.agent || `agent-${Date.now()}`;
  const lineageId = options.lineageId ?? options.lineage_id ?? "";
  const packetHashValue = options.packetHash ?? options.packet_hash ?? "";
  const role = options.role || "etrnl-executor";
  const mode = options.mode || "write";
  const status = options.status || "completed";
  if (mode === "write" && (!lineageId || !packetHashValue)) {
    console.error("record-agent write evidence requires lineageId and packetHash.");
    process.exit(2);
  }
  const at = preciseNowIso();
  requireTaskBinding(ledger, taskId, "record-agent");
  ledger.agents = ledger.agents ?? [];
  ledger.agents.push({
    id,
    role,
    mode,
    status,
    taskId,
    lineageId,
    packetHash: packetHashValue,
    at,
    completedAt: at,
  });
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "agent.recorded", { agentId: id, taskId, role, mode, status, packetHash: packetHashValue });
}

function recordAgent() {
  const id = argValue("--id", argValue("--agent", `agent-${Date.now()}`));
  const taskId = argValue("--task");
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const packetHashValue = argValue("--packet-hash");
  const role = argValue("--role", "etrnl-executor");
  const mode = argValue("--mode", "write");
  const status = argValue("--status", "completed");
  if (!taskId) {
    console.error("record-agent requires --task.");
    process.exit(2);
  }
  if (mode === "write" && (!lineageId || !packetHashValue)) {
    console.error("record-agent write evidence requires --lineage and --packet-hash.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    applyRecordAgent(ledger, taskId, { id, role, mode, status, lineageId, packetHash: packetHashValue });
    return ledger;
  });
}

function reviewTimestampAfterImplementation(ledger, taskId, lineageId, packetHash) {
  const matchingAgents = (ledger.agents ?? []).filter((agent) => {
    if (agent.taskId !== taskId) return false;
    if (!AGENT_DONE.has(agent.status)) return false;
    if (packetHash && agent.packetHash !== packetHash) return false;
    if (lineageId && String(agent.lineageId || "") !== String(lineageId || "")) return false;
    return agent.mode === "write" || agent.role === "etrnl-executor";
  });
  const latestImplementationTime = latestEvidenceTime(matchingAgents);
  if (!Number.isFinite(latestImplementationTime)) return preciseNowIso();
  return new Date(latestImplementationTime + 1).toISOString();
}

function applyRecordReview(ledger, taskId, options) {
  const reviewer = options.reviewer || options.id || "";
  const lineageId = options.lineageId ?? options.lineage_id ?? "";
  const packetHashValue = options.packetHash ?? options.packet_hash ?? "";
  const status = options.status || "verified";
  const overrideReason = options.overrideOwnerApproved ?? options.override_owner_approved ?? "";
  if (!reviewer) {
    console.error("record-review requires reviewer.");
    process.exit(2);
  }
  if (!lineageId || !packetHashValue) {
    console.error("record-review requires lineageId and packetHash.");
    process.exit(2);
  }
  requireTaskBinding(ledger, taskId, "record-review");
  const at = reviewTimestampAfterImplementation(ledger, taskId, lineageId, packetHashValue);
  ledger.reviews = ledger.reviews ?? [];
  ledger.reviews.push({
    reviewer,
    taskId,
    lineageId,
    packetHash: packetHashValue,
    status,
    reviewOf: options.reviewOf ?? options.review_of ?? "implementation",
    at,
    completedAt: at,
    ...(overrideReason ? { overrideOwnerApproved: overrideReason } : {}),
  });
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "review.recorded", { reviewer, taskId, status, packetHash: packetHashValue });
}

function recordReview() {
  const reviewer = argValue("--reviewer", argValue("--id", ""));
  const taskId = argValue("--task");
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const packetHashValue = argValue("--packet-hash");
  const status = argValue("--status", "verified");
  if (!reviewer) {
    console.error("record-review requires --reviewer.");
    process.exit(2);
  }
  if (!taskId) {
    console.error("record-review requires --task.");
    process.exit(2);
  }
  if (!lineageId || !packetHashValue) {
    console.error("record-review requires --lineage and --packet-hash.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const overrideReason = argValue("--override-owner-approved");
  const preview = readJson(file);
  requireTaskBinding(preview, taskId, "record-review");
  assertReviewReopenAllowed(preview, {
    taskId,
    reviewer,
    lineageId,
    overrideReason,
  });
  updateJson(file, (ledger) => {
    applyRecordReview(ledger, taskId, {
      reviewer,
      lineageId,
      packetHash: packetHashValue,
      status,
      reviewOf: argValue("--review-of", "implementation"),
      overrideOwnerApproved: overrideReason,
    });
    return ledger;
  });
}

function setPhase() {
  const phaseId = argValue("--phase", argValue("--phase-id"));
  const workstreamId = argValue("--workstream", argValue("--workstream-id"));
  const phaseStatus = argValue("--status", "in_progress");
  if (!phaseId || !PHASE_STATUSES.has(phaseStatus)) {
    console.error("set-phase requires --phase and a valid --status.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    ledger.phaseId = phaseId;
    if (workstreamId) ledger.workstreamId = workstreamId;
    ledger.phaseStatus = phaseStatus;
    ledger.updatedAt = nowIso();
    ledger.phases = ledger.phases ?? [];
    ledger.phases.push({ id: phaseId, workstreamId, status: phaseStatus, at: nowIso() });
    appendEvent(ledger, "phase.set", { phaseId, workstreamId, status: phaseStatus });
    return ledger;
  });
}

function recordUat() {
  const openFindingsRaw = argValue("--open-findings", "0");
  const openFindings = Number.parseInt(openFindingsRaw, 10);
  if (!Number.isInteger(openFindings) || openFindings < 0) {
    console.error("record-uat requires --open-findings to be a non-negative integer.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const artifact = argValue("--artifact");
  updateJson(file, (ledger) => {
    if (artifact) ledger.uatArtifact = artifact;
    ledger.uatOpenFindings = openFindings;
    ledger.phaseStatus = argValue("--status", openFindings > 0 ? "uat" : "verified");
    if (!PHASE_STATUSES.has(ledger.phaseStatus)) {
      console.error(`record-uat got invalid --status: ${ledger.phaseStatus}`);
      process.exit(2);
    }
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "uat.recorded", { artifact, openFindings, status: ledger.phaseStatus });
    return ledger;
  });
}

function extractSubagentText(event) {
  return [
    event.last_assistant_message,
    event.message,
    event.response,
    event.reason,
    event.tool_result?.content,
  ].filter(Boolean).join("\n");
}

function redactStdinPreview(raw) {
  const content = String(raw || "");
  const digest = createHash("sha256").update(content).digest("hex");
  return `stdin redacted (bytes=${Buffer.byteLength(content, "utf8")} sha256=${digest})`;
}

function recordSubagent() {
  const raw = readStdinRaw();
  if (!raw) {
    console.error("record-subagent requires JSON on stdin.");
    process.exit(2);
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`record-subagent: invalid JSON on stdin: ${detail}`);
    console.error(redactStdinPreview(raw));
    process.exit(2);
  }
  const sessionId = safeId(event.session_id || process.env.CLAUDE_SESSION_ID || "default");
  const file = currentLedgerPath(sessionId);
  if (!file) return;
  const text = extractSubagentText(event);
  const taskId = event.task_id || text.match(/ETRNL_TASK_ID[:=]\s*([A-Za-z0-9_.-]+)/i)?.[1];
  if (!taskId) {
    console.error("Subagent output is missing ETRNL_TASK_ID.");
    process.exit(1);
  }
  const agentId = event.agent_id || event.subagent_id || `subagent-${Date.now()}`;
  // Deterministic token accounting derived from the same captured output text.
  // outputTokens is a fixed length/4 estimate (no wall-clock, no model call) so
  // token-savings.mjs can attribute cost per agent role and flag net-negative work.
  const outputTokens = Math.ceil(text.length / 4);
  // Isolate the ETRNL_CONTRACT block before parsing authoritative fields.
  // Agents emit the contract LAST (same convention as agent-output-contract.mjs
  // extractBlock), so the block is from the "ETRNL_CONTRACT: v1" line to EOF.
  // Running the regexes over the full joined text would let a preamble or a
  // duplicated ETRNL_AGENT/ETRNL_FINDINGS value earlier in the output win over
  // the authoritative one in the contract block. When no block is present, keep
  // the defaults (findingsCount 0, agentType null).
  const contractLines = text.split("\n");
  const contractStart = contractLines.findIndex((line) => line.trim() === "ETRNL_CONTRACT: v1");
  const contractBlock = contractStart === -1 ? "" : contractLines.slice(contractStart).join("\n");
  // LAST-value semantics: keyValues() in agent-output-contract.mjs sets the key on
  // every match, so the final assignment wins when a key repeats in the block. The
  // ledger must persist the SAME value the validator gates on, so take the last
  // match (not String.match()'s first) for both keys. Keep the defaults (findingsCount
  // 0, agentType null) when the key is absent.
  const findingsMatch = [...contractBlock.matchAll(/ETRNL_FINDINGS[:=]\s*(\d+)/gi)].at(-1);
  const findingsCount = findingsMatch ? Number.parseInt(findingsMatch[1], 10) : 0;
  const agentTypeMatch = [...contractBlock.matchAll(/ETRNL_AGENT[:=]\s*([A-Za-z0-9_-]+)/gi)].at(-1);
  const agentType = agentTypeMatch ? agentTypeMatch[1] : null;
  updateJson(file, (ledger) => {
    if (!(ledger.tasks ?? []).some((task) => task.id === taskId)) {
      console.error(`Subagent output references unknown ETRNL_TASK_ID: ${taskId}.`);
      process.exit(1);
    }
    const at = preciseNowIso();
    ledger.agents = ledger.agents ?? [];
    ledger.agents.push({ id: agentId, role: "subagent", status: "completed", taskId, agentType, outputTokens, findingsCount, endedAt: at, completedAt: at });
    ledger.tasks = (ledger.tasks ?? []).map((task) => task.id === taskId ? { ...task, status: "reviewing", heartbeatAt: nowIso() } : task);
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "subagent.completed", { agentId, taskId });
    return ledger;
  });
}

function validateBundlePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.error("record-task-bundle requires a JSON object.");
    process.exit(2);
  }
  if (!payload.taskId || typeof payload.taskId !== "string") {
    console.error("record-task-bundle requires taskId string.");
    process.exit(2);
  }
  for (const key of ["task", "agent", "tdd", "simplifier", "completionAudit"]) {
    if (payload[key] !== undefined && (typeof payload[key] !== "object" || Array.isArray(payload[key]))) {
      console.error(`record-task-bundle ${key} must be an object when present.`);
      process.exit(2);
    }
  }
  if (payload.reviews !== undefined && !Array.isArray(payload.reviews)) {
    console.error("record-task-bundle reviews must be an array when present.");
    process.exit(2);
  }
  return payload;
}

function loadBundlePayload() {
  const file = argValue("--file");
  if (file) {
    try {
      return validateBundlePayload(JSON.parse(readFileSync(file, "utf8")));
    } catch (error) {
      console.error(`record-task-bundle --file ${file}: ${error.message}`);
      process.exit(2);
    }
  }
  return validateBundlePayload(readStdinJson({ required: true }));
}

function recordTaskBundle() {
  const payload = loadBundlePayload();
  const taskId = payload.taskId;
  const file = currentLedgerOrFail();
  const preview = readJson(file);
  if (payload.task) {
    // no-op: set-task validation happens inside the lock
  } else if (!taskExists(preview, taskId)) {
    console.error(`record-task-bundle references unknown task: ${taskId}.`);
    process.exit(1);
  }
  updateJson(file, (ledger) => {
    if (payload.task) {
      applySetTask(ledger, taskId, payload.task, "record-task-bundle");
    } else if (!taskExists(ledger, taskId)) {
      console.error(`record-task-bundle references unknown task: ${taskId}.`);
      process.exit(1);
    }
    if (payload.agent) {
      applyRecordAgent(ledger, taskId, payload.agent);
    }
    if (Array.isArray(payload.reviews)) {
      for (const review of payload.reviews) {
        assertReviewReopenAllowed(ledger, {
          taskId,
          reviewer: review.reviewer || review.id || "",
          lineageId: review.lineageId ?? review.lineage_id ?? "",
          overrideReason: review.overrideOwnerApproved ?? review.override_owner_approved ?? "",
        });
        applyRecordReview(ledger, taskId, review);
      }
    }
    if (payload.tdd) {
      applyRecordTdd(ledger, taskId, payload.tdd);
    }
    if (payload.simplifier) {
      applyRecordSimplifier(ledger, taskId, payload.simplifier);
    }
    if (payload.completionAudit) {
      applyRecordCompletionAudit(ledger, taskId, payload.completionAudit);
    }
    appendEvent(ledger, "task-bundle.recorded", { taskId });
    return ledger;
  });
}

function historyProgress() {
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const progress = computeProgress(ledger);
  const jsonOutput = args.includes("--json");
  const renegotiationCheck = args.includes("--renegotiation-check");
  const thresholdMinutes = resolveRenegotiationThresholdMinutes(ledger);
  const renegotiationRequired = Number.isFinite(progress.projectedRemainingMinutes)
    && progress.projectedRemainingMinutes > thresholdMinutes;
  if (jsonOutput) {
    const payload = { ...progress, runId: ledger.runId };
    if (renegotiationCheck) {
      payload.renegotiationRequired = renegotiationRequired;
      payload.renegotiationThresholdMinutes = thresholdMinutes;
    }
    console.log(JSON.stringify(payload));
    return;
  }
  const band = progress.remainingBandMinutes
    ? `${progress.remainingBandMinutes.lower}-${progress.remainingBandMinutes.upper}`
    : "unknown";
  console.log(
    `${ledger.runId} tasks=${progress.done}/${progress.total} remaining=${progress.remaining} `
    + `medianMinutesPerTask=${progress.medianMinutesPerTask ?? "unknown"} remainingBandMinutes=${band}`,
  );
  if (renegotiationCheck) {
    console.log(
      `renegotiationRequired=${renegotiationRequired} thresholdMinutes=${thresholdMinutes} `
      + `projectedRemainingMinutes=${progress.projectedRemainingMinutes ?? "unknown"}`,
    );
  }
}

function markdownRowCells(line) {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined);
  return inner.split("|").map((cell) => cell.trim());
}

// Reads the first plan table that carries both a Phase and a Gate column (the
// `## Phases` table). Later tables such as the autoplan decision log repeat those
// headers, so parsing stops once the first matching table ends.
function parsePlanPhaseGates(planText) {
  const rows = [];
  let phaseIndex = -1;
  let gateIndex = -1;
  for (const line of planText.split("\n")) {
    if (!line.trim().startsWith("|")) {
      if (rows.length > 0) break;
      phaseIndex = -1;
      gateIndex = -1;
      continue;
    }
    const cells = markdownRowCells(line);
    if (phaseIndex === -1) {
      const headers = cells.map((cell) => cell.toLowerCase());
      phaseIndex = headers.indexOf("phase");
      gateIndex = headers.indexOf("gate");
      if (phaseIndex === -1 || gateIndex === -1) {
        phaseIndex = -1;
        gateIndex = -1;
      }
      continue;
    }
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const phase = cells[phaseIndex] || "";
    const gate = cells[gateIndex] || "";
    if (phase) rows.push({ phase, gate });
  }
  return rows;
}

function phaseKey(value) {
  return String(value || "").trim().split(/\s+/)[0].toLowerCase();
}

function nextPlanGate(ledger, gateRows) {
  const statusByPhase = new Map();
  for (const phase of ledger.phases ?? []) {
    if (phase.id) statusByPhase.set(phaseKey(phase.id), phase.status);
  }
  for (const row of gateRows) {
    const status = statusByPhase.get(phaseKey(row.phase));
    if (status && ["verified", "skipped"].includes(status)) continue;
    return row;
  }
  return null;
}

function waveTrajectory(ledger) {
  return (ledger.waves ?? []).map((wave) => ({
    waveId: wave.waveId,
    recurringFindingCount: Number(wave.recurringFindingCount || 0),
    streamAlternationCount: Number(wave.streamAlternationCount || 0),
    roundsSinceProgress: Number(wave.roundsSinceProgress || 0),
  }));
}

// Gate reporting never estimates time. When --plan is absent or unreadable the
// report degrades to ledger-only fields and still exits 0.
function historyGates() {
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const tasks = ledger.tasks ?? [];
  const total = tasks.length;
  const done = tasks.filter((task) => TASK_DONE.has(task.status)).length;
  const planArg = argValue("--plan");
  let planStatus = planArg ? "missing" : "not-provided";
  let nextGate = null;
  if (planArg) {
    const planPath = path.isAbsolute(planArg) ? planArg : path.resolve(ledger.cwd || process.cwd(), planArg);
    try {
      const gateRows = parsePlanPhaseGates(readFileSync(planPath, "utf8"));
      planStatus = gateRows.length > 0 ? "parsed" : "no-gates";
      nextGate = nextPlanGate(ledger, gateRows);
    } catch {
      planStatus = "missing";
    }
  }
  const waves = waveTrajectory(ledger);
  if (args.includes("--json")) {
    console.log(JSON.stringify({
      runId: ledger.runId,
      done,
      total,
      remaining: Math.max(total - done, 0),
      phase: ledger.phaseId || null,
      phaseStatus: ledger.phaseStatus || null,
      workstream: ledger.workstreamId || null,
      uatGate: ledger.uatArtifact || null,
      uatOpenFindings: Number(ledger.uatOpenFindings || 0),
      planStatus,
      nextGate: nextGate ? { phase: nextGate.phase, gate: nextGate.gate } : null,
      waves,
    }));
    return;
  }
  console.log(
    `${ledger.runId} tasks=${done}/${total} phase=${ledger.phaseId || "unknown"} `
    + `phaseStatus=${ledger.phaseStatus || "unknown"} workstream=${ledger.workstreamId || "unknown"} `
    + `uatGate=${ledger.uatArtifact || "none"} uatOpenFindings=${Number(ledger.uatOpenFindings || 0)}`,
  );
  console.log(
    `planStatus=${planStatus} nextGate=${nextGate ? nextGate.gate || "unnamed" : "unknown"} `
    + `nextGatePhase=${nextGate ? nextGate.phase : "unknown"}`,
  );
  for (const wave of waves) {
    console.log(
      `wave ${wave.waveId} recurringFindingCount=${wave.recurringFindingCount} `
      + `streamAlternationCount=${wave.streamAlternationCount} roundsSinceProgress=${wave.roundsSinceProgress}`,
    );
  }
}

function applyRecordTrajectory(ledger, waveId, counters) {
  ledger.waves = ledger.waves ?? [];
  const existing = ledger.waves.find((wave) => wave.waveId === waveId);
  const next = {
    waveId,
    recurringFindingCount: 0,
    streamAlternationCount: 0,
    roundsSinceProgress: 0,
    ...existing,
    ...counters,
    at: nowIso(),
  };
  ledger.waves = existing
    ? ledger.waves.map((wave) => wave.waveId === waveId ? next : wave)
    : [...ledger.waves, next];
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "trajectory.recorded", { waveId, ...counters });
}

function recordTrajectory() {
  const waveId = argValue("--wave", argValue("--wave-id"));
  if (!waveId) {
    console.error("record-trajectory requires --wave.");
    process.exit(2);
  }
  const counters = {};
  for (const [flag, key] of [
    ["--recurring-finding-count", "recurringFindingCount"],
    ["--stream-alternation-count", "streamAlternationCount"],
    ["--rounds-since-progress", "roundsSinceProgress"],
  ]) {
    const raw = argValue(flag);
    if (!raw) continue;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== raw.trim()) {
      console.error(`record-trajectory ${flag} must be a non-negative integer.`);
      process.exit(2);
    }
    counters[key] = parsed;
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    applyRecordTrajectory(ledger, waveId, counters);
    return ledger;
  });
}

function recordDecision() {
  const topic = argValue("--topic");
  const decision = argValue("--decision");
  const rationale = argValue("--rationale", argValue("--reason"));
  if (!topic || !decision) {
    console.error("record-decision requires --topic and --decision.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  updateJson(file, (ledger) => {
    ledger.decisions = ledger.decisions ?? [];
    ledger.decisions.push({
      topic,
      decision,
      rationale: rationale || "",
      at: nowIso(),
    });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "decision.recorded", { topic, decision });
    return ledger;
  });
  console.log(`Decision recorded: ${topic}=${decision}`);
}

// A ledger carries two session identities that are easy to confuse: the bucket its
// pointer was filed under (encoded in runId by init) and the Claude session that owns
// it (`sessionId`, which workflow-health filters on for session restore). They diverge
// when init resolves an empty --session to the shared "default" bucket. Reconcile
// retires duplicate and dangling pointers so a stale bucket cannot hand one run's
// ledger to an unrelated session, and records — never silently rewrites — a divergence.
function reconcilePointers() {
  const apply = args.includes("--apply");
  const asJson = args.includes("--json");
  const dir = runsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const pointerNames = entries.map((entry) => entry.name).filter((name) => name.startsWith("current-"));

  const byTarget = new Map();
  const findings = [];
  for (const name of pointerNames) {
    let target = "";
    try {
      target = readJson(path.join(dir, name)).path || "";
    } catch {
      target = "";
    }
    if (!target || !existsSync(target)) {
      findings.push({ kind: "dangling-pointer", pointer: name, target, action: "retire" });
      continue;
    }
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(name);
  }

  for (const [target, pointers] of byTarget) {
    let ledger;
    try {
      ledger = readJson(target);
    } catch {
      continue;
    }
    const ownerSession = safeId(ledger.sessionId || "default");
    // runId is `run-<bucket>-<timestamp>`; the bucket is everything between them.
    const bucket = String(ledger.runId || "").replace(/^run-/, "").replace(/-\d+$/, "");
    if (bucket && ownerSession !== bucket) {
      findings.push({
        kind: "session-divergence",
        ledger: path.basename(target),
        sessionId: ledger.sessionId || "",
        pointerBucket: bucket,
        action: "record",
      });
    }
    // Worktree scoping keeps the unnamed default bucket from being shared, but a
    // session id named identically in two repositories still resolves one ledger.
    // Actor cwds are the evidence for that, so report it rather than guess intent.
    const foreign = foreignWriterEvents(ledger);
    if (foreign.events > 0) {
      findings.push({
        kind: "foreign-writer",
        ledger: path.basename(target),
        foreignWorktrees: foreign.worktrees,
        foreignEvents: foreign.events,
        action: "record",
      });
    }
    if (pointers.length < 2) continue;
    // Keep the pointer naming the owning session when one exists; otherwise the newest,
    // since that is the pointer an active session most recently resolved through.
    const preferred = pointers.find((name) => name === `current-${ownerSession}.json`)
      ?? [...pointers].sort((a, b) => pointerUpdatedAt(dir, a) - pointerUpdatedAt(dir, b)).at(-1);
    for (const name of pointers.filter((candidate) => candidate !== preferred)) {
      findings.push({
        kind: "aliased-pointer",
        pointer: name,
        ledger: path.basename(target),
        keeping: preferred,
        action: "retire",
      });
    }
  }

  if (apply) {
    const retiredDir = path.join(dir, "retired-pointers");
    for (const finding of findings) {
      if (finding.action === "retire") {
        mkdirSync(retiredDir, { recursive: true, mode: 0o700 });
        renameSync(path.join(dir, finding.pointer), path.join(retiredDir, `${Date.now()}-${finding.pointer}`));
      }
      if (finding.action === "record" || finding.kind === "aliased-pointer") {
        const target = path.join(dir, finding.ledger);
        if (!existsSync(target)) continue;
        const payload = {
          finding: finding.kind,
          ...(finding.pointer ? { retiredPointer: finding.pointer, keptPointer: finding.keeping } : {}),
          ...(finding.pointerBucket ? { sessionId: finding.sessionId, pointerBucket: finding.pointerBucket } : {}),
          ...(finding.kind === "foreign-writer"
            ? { foreignWorktrees: finding.foreignWorktrees, foreignEvents: finding.foreignEvents }
            : {}),
        };
        updateJson(target, (ledger) => {
          // A divergence is a standing property, so re-running must not restamp it.
          const already = (ledger.events ?? []).some((event) => event.type === "ledger.reconciled"
            && Object.entries(payload).every(([key, value]) => event[key] === value));
          if (already) return ledger;
          appendEvent(ledger, "ledger.reconciled", payload);
          ledger.updatedAt = nowIso();
          return ledger;
        });
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ applied: apply, pointers: pointerNames.length, findings }, null, 2));
    return;
  }
  const verb = apply ? "reconciled" : "found (dry run; pass --apply)";
  console.log(`${findings.length} finding(s) ${verb} across ${pointerNames.length} pointer(s)`);
  for (const finding of findings) {
    console.log(`  ${finding.kind}: ${reconcileDetail(finding)}`);
  }
}

function reconcileDetail(finding) {
  if (finding.kind === "session-divergence") {
    return `${finding.ledger}: sessionId=${finding.sessionId} pointerBucket=${finding.pointerBucket}`;
  }
  if (finding.kind === "foreign-writer") {
    return `${finding.ledger}: ${finding.foreignEvents} event(s) from ${finding.foreignWorktrees} other worktree(s)`;
  }
  return `${finding.pointer} -> ${finding.ledger || finding.target || "missing"}${finding.keeping ? ` (keeping ${finding.keeping})` : ""}`;
}

// Maintenance runs legitimately act on a ledger from outside its worktree: `init --cwd`
// is often launched from a wrapper's directory, and `reconcile` sweeps every ledger from
// wherever the operator stands. Counting those would make the finding self-sustaining,
// since reconcile's own record would be the next run's evidence.
const LEDGER_MAINTENANCE_EVENTS = new Set(["ledger.init", "ledger.reconciled"]);

// Count events written from outside the worktree the ledger was opened in. Events
// predating actor provenance carry no cwd and are not counted as foreign.
function foreignWriterEvents(ledger) {
  if (!ledger.cwd) return { worktrees: 0, events: 0 };
  const owner = worktreeKey(ledger.cwd);
  const worktrees = new Set();
  let events = 0;
  for (const event of Array.isArray(ledger.events) ? ledger.events : []) {
    const cwd = event?.actor?.cwd;
    if (!cwd || LEDGER_MAINTENANCE_EVENTS.has(event.type)) continue;
    const key = worktreeKey(cwd);
    if (key === owner) continue;
    worktrees.add(key);
    events += 1;
  }
  return { worktrees: worktrees.size, events };
}

function pointerUpdatedAt(dir, name) {
  try {
    return Date.parse(readJson(path.join(dir, name)).updatedAt || "") || 0;
  } catch {
    return 0;
  }
}

function history() {
  if (args.includes("--progress")) {
    historyProgress();
    return;
  }
  if (args.includes("--gates")) {
    historyGates();
    return;
  }
  mkdirSync(runsDir(), { recursive: true, mode: 0o700 });
  const files = readdirSync(runsDir()).filter((file) => file.endsWith(".json") && !file.startsWith("current-"));
  const recent = files.sort().slice(-Number(argValue("--limit", "10"))).reverse();
  for (const file of recent) {
    const ledger = readJson(path.join(runsDir(), file));
    const blocked = (ledger.tasks ?? []).filter((task) => task.status === "blocked").length;
    const verified = (ledger.tasks ?? []).filter((task) => task.status === "verified").length;
    console.log(`${ledger.runId} tasks=${verified}/${(ledger.tasks ?? []).length} blocked=${blocked} checks=${(ledger.checks ?? []).length}`);
  }
}

if (command === "init") initLedger();
else if (command === "validate") validateCommand();
else if (command === "check-stop") checkStop();
else if (command === "check-bound-execute") checkBoundExecute();
else if (command === "set-task") setTask();
else if (command === "set-phase") setPhase();
else if (command === "record-uat") recordUat();
else if (command === "record-check") recordCheck();
else if (command === "require-artifact") requireArtifact();
else if (command === "record-artifact") recordArtifact();
else if (command === "record-agent") recordAgent();
else if (command === "record-review") recordReview();
else if (command === "record-tdd") recordTdd();
else if (command === "record-simplifier") recordSimplifier();
else if (command === "record-specialist") recordSpecialist();
else if (command === "record-completion-audit") recordCompletionAudit();
else if (command === "record-install-proof") recordInstallProof();
else if (command === "record-task-bundle") recordTaskBundle();
else if (command === "record-subagent") recordSubagent();
else if (command === "record-trajectory") recordTrajectory();
else if (command === "record-decision") recordDecision();
else if (command === "reconcile") reconcilePointers();
else if (command === "history") history();
else {
  console.error(`usage: execution-ledger.mjs init|validate|check-stop [--require-ledger] [--require-tasks] [--require-plan-phases]|check-bound-execute|set-task|set-phase|record-uat|record-check|require-artifact|record-artifact|record-agent|record-review|record-tdd|record-simplifier|record-specialist|record-completion-audit|record-install-proof|record-task-bundle [--file <path>]|<json-stdin>|record-trajectory --wave <id> [--recurring-finding-count <n>] [--stream-alternation-count <n>] [--rounds-since-progress <n>]|record-decision|record-subagent|reconcile [--apply] [--json]|history [--progress] [--renegotiation-check] [--gates] [--plan <path>] [--json]`);
  console.error(reopenCapUsageText());
  process.exit(2);
}
