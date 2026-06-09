#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";
import { nowIso, safeId } from "./lib/evidence-trace.mjs";
import { readStdinRaw } from "./lib/read-stdin.mjs";

const STATUSES = new Set(["pending", "in_progress", "reviewing", "changes_requested", "verified", "blocked", "skipped"]);
const PHASE_STATUSES = new Set(["pending", "in_progress", "uat", "verified", "blocked", "skipped"]);
const CHECK_STATUSES = new Set(["passed", "failed", "blocked", "skipped"]);
const AGENT_DONE = new Set(["completed", "verified", "skipped"]);
const EVIDENCE_DONE = new Set(["passed", "verified", "red_green_verified", "not_applicable", "skipped"]);
// Defaults allow brief multi-agent contention; tune with env vars for unusually slow disks.
const LOCK_TIMEOUT_MS = Number(process.env.ETRNL_LEDGER_LOCK_TIMEOUT_MS || 30000);
const LOCK_STALE_MS = Number(process.env.ETRNL_LEDGER_LOCK_STALE_MS || 120000);
const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

const args = process.argv.slice(2);
const command = args[0] ?? "help";

// Packet fields such as criticalPath and stopCondition are validated by
// agent-task-packet-check.mjs and retained as reviewer/operator metadata.
// This ledger records execution evidence; it does not schedule subtasks or
// evaluate packet stop conditions at runtime.

const argValue = (flag, fallback = "") => readArgValue(args, flag, fallback);

function runsDir() {
  return process.env.ETRNL_RUNS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "runs");
}

function pointerPath(sessionId) {
  return path.join(runsDir(), `current-${safeId(sessionId)}.json`);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function sleepMs(ms) {
  Atomics.wait(LOCK_SLEEP, 0, 0, ms);
}

function acquireFileLock(file) {
  const lockDir = `${file}.lock`;
  const startedAt = Date.now();
  let attempts = 0;
  while (true) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      writeFileSync(path.join(lockDir, "owner"), `${process.pid} ${new Date().toISOString()}\n`, { mode: 0o600 });
      return () => rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      attempts += 1;
      try {
        const stats = statSync(lockDir);
        if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for execution ledger lock: ${lockDir}`);
      }
      sleepMs(Math.min(250, 25 + attempts * 10));
    }
  }
}

function withFileLock(file, callback) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const release = acquireFileLock(file);
  try {
    return callback();
  } finally {
    release();
  }
}

function writeJsonUnlocked(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

function writeJson(file, value) {
  withFileLock(file, () => writeJsonUnlocked(file, value));
}

function updateJson(file, updater) {
  return withFileLock(file, () => {
    const current = readJson(file);
    const next = updater(current) || current;
    writeJsonUnlocked(file, next);
    return next;
  });
}

function currentLedgerPath(sessionId) {
  const pointer = pointerPath(sessionId);
  if (!existsSync(pointer)) return "";
  const data = readJson(pointer);
  return data.path || "";
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
  if (ledger.reviews && !Array.isArray(ledger.reviews)) errors.push("reviews must be an array");
  if (ledger.phases && !Array.isArray(ledger.phases)) errors.push("phases must be an array");
  if (ledger.tddEvidence && !Array.isArray(ledger.tddEvidence)) errors.push("tddEvidence must be an array");
  if (ledger.simplifierEvidence && !Array.isArray(ledger.simplifierEvidence)) errors.push("simplifierEvidence must be an array");
  if (ledger.specialistEvidence && !Array.isArray(ledger.specialistEvidence)) errors.push("specialistEvidence must be an array");
  if (ledger.completionAudit && !Array.isArray(ledger.completionAudit)) errors.push("completionAudit must be an array");
  if (ledger.installProof && !Array.isArray(ledger.installProof)) errors.push("installProof must be an array");
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
  return errors;
}

function initLedger() {
  const sessionId = argValue("--session", process.env.CLAUDE_SESSION_ID || "default");
  const runId = `run-${safeId(sessionId)}-${Date.now()}`;
  const file = path.join(runsDir(), `${runId}.json`);
  const cwd = path.resolve(argValue("--cwd", process.cwd()));
  const at = nowIso();
  const ledger = {
    schemaVersion: 2,
    runId,
    sessionId,
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
    decisions: [],
    events: [{ type: "ledger.init", at }],
    continuations: { count: 0, max: 3, lastReason: "" },
  };
  writeJson(file, ledger);
  writeJson(pointerPath(sessionId), { path: file, updatedAt: ledger.updatedAt });
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
      console.error(`No active execution ledger for session ${safeId(sessionId)}.`);
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
  const sessionId = argValue("--session", process.env.CLAUDE_SESSION_ID || "default");
  const file = currentLedgerPath(sessionId);
  if (!file) {
    console.error(`No active execution ledger for session ${safeId(sessionId)}.`);
    process.exit(1);
  }
  return file;
}

function appendEvent(ledger, type, payload = {}) {
  if (ledger.schemaVersion !== 2) return;
  ledger.events = ledger.events ?? [];
  ledger.events.push({ type, at: nowIso(), ...payload });
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
    const existing = (ledger.tasks ?? []).find((task) => task.id === taskId);
    const next = { id: taskId, title: argValue("--title", existing?.title || taskId), status, heartbeatAt: nowIso() };
    for (const [flag, key] of [
      ["--mode", "mode"],
      ["--lineage", "lineageId"],
      ["--lineage-id", "lineageId"],
      ["--packet-hash", "packetHash"],
    ]) {
      const value = argValue(flag);
      if (value) next[key] = value;
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
      if (args.includes(flag)) next[key] = true;
    }
    ledger.tasks = existing
      ? ledger.tasks.map((task) => task.id === taskId ? { ...task, ...next } : task)
      : [...(ledger.tasks ?? []), next];
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "task.set", { taskId, status });
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

function recordTaskEvidence(field, eventType, commandName, rowBuilder) {
  const taskId = argValue("--task");
  const file = currentLedgerOrFail();
  const { lineageId, packetHash } = requireBoundEvidenceArgs(file, taskId, commandName);
  updateJson(file, (ledger) => {
    requireTaskBinding(ledger, taskId, commandName);
    const at = preciseNowIso();
    ledger[field] = ledger[field] ?? [];
    const row = {
      taskId,
      lineageId,
      packetHash,
      status: argValue("--status", "verified"),
      evidence: argValue("--evidence"),
      at,
      ...rowBuilder(),
    };
    ledger[field].push(row);
    ledger.updatedAt = nowIso();
    appendEvent(ledger, eventType, { taskId, status: row.status });
    return ledger;
  });
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
  // Validate binding before the lock (a rejection mid-lock would leak it), and match
  // the bound-evidence matcher: a packet/lineage-bound task needs matching binding on
  // its completion audit, or the requirement never clears.
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
    if (taskId) requireTaskBinding(ledger, taskId, "record-completion-audit");
    const status = argValue("--status", "verified");
    ledger.completionAudit = ledger.completionAudit ?? [];
    ledger.completionAudit.push({
      item,
      taskId,
      lineageId,
      packetHash,
      classification: argValue("--classification", "DONE"),
      status,
      impact: argValue("--impact", "low"),
      evidence: argValue("--evidence"),
      acceptedBy: argValue("--accepted-by"),
      at: preciseNowIso(),
    });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "completion-audit.recorded", { item, taskId, status });
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
    ledger.checks.push({ name, command: commandText, status, outputSummary: argValue("--summary"), at: nowIso() });
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
    return ledger;
  });
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
  updateJson(file, (ledger) => {
    const at = preciseNowIso();
    requireTaskBinding(ledger, taskId, "record-review");
    ledger.reviews = ledger.reviews ?? [];
    ledger.reviews.push({
      reviewer,
      taskId,
      lineageId,
      packetHash: packetHashValue,
      status,
      reviewOf: argValue("--review-of", "implementation"),
      at,
      completedAt: at,
    });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "review.recorded", { reviewer, taskId, status, packetHash: packetHashValue });
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
  updateJson(file, (ledger) => {
    if (!(ledger.tasks ?? []).some((task) => task.id === taskId)) {
      console.error(`Subagent output references unknown ETRNL_TASK_ID: ${taskId}.`);
      process.exit(1);
    }
    const at = preciseNowIso();
    ledger.agents = ledger.agents ?? [];
    ledger.agents.push({ id: agentId, role: "subagent", status: "completed", taskId, endedAt: at, completedAt: at });
    ledger.tasks = (ledger.tasks ?? []).map((task) => task.id === taskId ? { ...task, status: "reviewing", heartbeatAt: nowIso() } : task);
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "subagent.completed", { agentId, taskId });
    return ledger;
  });
}

function history() {
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
else if (command === "record-subagent") recordSubagent();
else if (command === "history") history();
else {
  console.error("usage: execution-ledger.mjs init|validate|check-stop [--require-ledger] [--require-tasks] [--require-plan-phases]|check-bound-execute|set-task|set-phase|record-uat|record-check|require-artifact|record-artifact|record-agent|record-review|record-tdd|record-simplifier|record-specialist|record-completion-audit|record-install-proof|record-subagent|history");
  process.exit(2);
}
