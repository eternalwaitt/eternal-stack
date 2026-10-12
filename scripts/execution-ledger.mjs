#!/usr/bin/env node
import { projectIdentity, validIdentity } from "./lib/project-identity.mjs";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";
import { withFileLock, writeJsonAtomic } from "./lib/json-file-store.mjs";
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
import {
  classifySpawnContext,
  evaluateSpawnGuard,
  inferSpawnWaveId,
  resolveMaxConcurrentLanes,
} from "./lib/spawn-guard.mjs";
import { explainSpawnVerdict } from "./lib/spawn-guard-explain.mjs";
import { loadPlanRegistry, resolvePlanScopeFromFile } from "./lib/spawn-registry.mjs";
import { classifyReviewScope } from "./review-scope.mjs";
import { readStdinJson, readStdinRaw } from "./lib/read-stdin.mjs";
import { acquireCheckSlot, checkOwnerAlive } from "./lib/check-coordination.mjs";
import { CHECK_RESOURCE_LIMITS, admitBudgetAction, validateWorkflowContract } from "./lib/workflow-contract.mjs";

import { reviewBinding, hasReviewArtifact } from "./lib/review-evidence.mjs";

import { requestReview } from "./lib/review-controller.mjs";
import { syncProjectState, acknowledgeProjectState, stateAckErrors, projectStateContext, stateSnapshot, stateReadReceipt, taskNote } from "./lib/project-state.mjs";

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
  return withFileLock(file, () => {
    const result = updater(readJson(file));
    // Persist captured evidence first. A projection failure propagates without
    // losing the real command result or publishing an uncommitted receipt.
    writeJsonAtomic(file, result, { mode: 0o600 });
    const statePath = result.projectState?.path;
    syncProjectState(result);
    if (result.projectState?.path !== statePath) writeJsonAtomic(file, result, { mode: 0o600 });
    return result;
  }, LOCK_OPTIONS);
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
  if (ledger.workflowContract !== undefined) {
    try {
      validateWorkflowContract(ledger.workflowContract);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
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
  if (ledger.spawns && !Array.isArray(ledger.spawns)) errors.push("spawns must be an array");
  if (ledger.activeWorkerReservations && !Array.isArray(ledger.activeWorkerReservations)) errors.push("activeWorkerReservations must be an array");
  if (ledger.planScope !== undefined && typeof ledger.planScope !== "string") errors.push("planScope must be a string");
  if (ledger.taskGroupCount !== undefined && (!Number.isInteger(ledger.taskGroupCount) || ledger.taskGroupCount < 0)) {
    errors.push("taskGroupCount must be a non-negative integer");
  }
  if (ledger.allowedSpawnNames !== undefined && !Array.isArray(ledger.allowedSpawnNames)) {
    errors.push("allowedSpawnNames must be an array");
  }
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
  let passedChecks = (ledger.checks ?? []).filter((check) => check.status === "passed");
  if (ledger.workflowContract) {
    const named = new Set((ledger.checks ?? []).map((check) => check.name || "<unknown>"));
    passedChecks = [...named].map((name) => {
      const rows = (ledger.checks ?? []).filter((check) => (check.name || "<unknown>") === name && check.evidenceKind === "command-run");
      return rows.at(-1);
    }).filter((check) => check?.status === "passed");
  }
  if (passedChecks.length === 0) return errors;
  const stamped = passedChecks.filter((check) => check.treeHash);
  if (stamped.length === 0) return errors;
  const currentHash = worktreeHash(ledger.cwd || process.cwd());
  if (!currentHash) {
    errors.push("cannot verify checks against the current worktree");
    return errors;
  }
  if (stamped.some((check) => check.treeHash !== currentHash || (check.evidenceKind === "command-run" && check.startedTreeHash !== check.treeHash))) {
    errors.push("verification checks are stale for the current worktree");
  }
  return errors;
}

function latestTier3InvestigatorMs(ledger, afterAt) {
  const afterMs = Date.parse(afterAt || "");
  if (!Number.isFinite(afterMs)) {
    throw new Error("tier3-residual-closure-pending requires a parseable pendingAt timestamp");
  }
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
  const errors = [...validateLedger(ledger), ...stateAckErrors(ledger)];
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
  const contract = ledger.workflowContract;
  const checks = ledger.checks ?? [];
  const failedChecks = contract
    ? [...new Set(checks.map((check) => check.name || "<unknown>"))]
      .map((name) => {
        const named = checks.filter((check) => (check.name || "<unknown>") === name);
        return named.filter((check) => check.evidenceKind === "command-run").at(-1) ?? named.at(-1);
      })
      .filter((check) => check.status !== "passed")
      .map((check) => `${check.name || "<unknown>"}:${check.status || "<missing>"}`)
    : checks.filter((check) => check.status !== "passed")
      .map((check) => `${check.name || "<unknown>"}:${check.status || "<missing>"}`);
  if (unfinishedTasks.length > 0) errors.push(`unfinished tasks: ${unfinishedTasks.join(", ")}`);
  if (unfinishedAgents.length > 0) errors.push(`unfinished agents: ${unfinishedAgents.join(", ")}`);
  if (missingArtifacts.length > 0) errors.push(`missing artifacts: ${missingArtifacts.join(", ")}`);
  if (Number(ledger.uatOpenFindings || 0) > 0) errors.push(`open UAT findings: ${ledger.uatOpenFindings}`);
  if (contract) {
    const activeReservations = (ledger.activeWorkerReservations ?? []).filter((reservation) => reservation.status === "active");
    if (activeReservations.length > 0) {
      errors.push(`active worker reservations remain: ${activeReservations.map((reservation) => `${reservation.taskName || reservation.id} (${reservation.id})`).join(", ")}`);
    }
  }
  if (checks.length === 0 && (!contract || contract.requirements.mechanicalVerification)) errors.push("no verification checks recorded");
  if ((ledger.workflowCheckReservations ?? []).length > 0) errors.push("one or more captured command checks did not finish");
  if (failedChecks.length > 0) errors.push(`verification checks not passed: ${failedChecks.join(", ")}`);
  if (contract?.requirements?.mechanicalVerification) {
    const passedCommands = checks.filter((check) => check.evidenceKind === "command-run"
      && check.status === "passed" && check.exitCode === 0 && /^[a-f0-9]{64}$/.test(check.outputDigest || "")
      && Array.isArray(check.argv) && check.argv.length > 0
      && check.startedTreeHash && check.startedTreeHash === check.treeHash && check.treeHash);
    if (passedCommands.length === 0) errors.push("no mechanically captured command verification; record-check self-reports do not satisfy this contract");
    if ((ledger.workflowBudgetUsage?.verificationAttempts ?? checks.filter((check) => check.evidenceKind === "command-run").length) > contract.budget.maxVerificationAttempts) {
      errors.push(`verification-attempt budget exceeded (${contract.budget.maxVerificationAttempts})`);
    }
  }
  if (contract?.requirements?.taskRecord && tasks.length === 0) errors.push("workflow contract requires an execution task record");
  if (contract?.requirements?.planPhases) {
    if (!ledger.planPath) errors.push("workflow contract requires a plan path");
    if (phases.length === 0) errors.push("workflow contract requires plan phases");
  }
  if (contract?.requirements?.packet && !tasks.some((task) => task.packetHash && task.lineageId)) {
    errors.push("workflow contract requires a task bound to a packet and lineage");
  }
  if (contract?.requirements?.tddEvidence && !(ledger.tddEvidence ?? []).some((item) => EVIDENCE_DONE.has(item.status))) {
    errors.push("workflow contract requires recorded red/green TDD evidence");
  }
  if (contract?.requirements?.planPhases && phases.length > 0) {
    const latest = new Map();
    for (const phase of phases) if (phase.id) latest.set(phase.id, phase.status);
    const unfinished = [...latest].filter(([, status]) => !["verified", "skipped"].includes(status)).map(([id, status]) => `${id}:${status}`);
    if (unfinished.length > 0) errors.push(`workflow contract phases not verified or explicitly skipped: ${unfinished.join(", ")}`);
  }
  if (contract?.requirements?.independentReview) {
    const latestReview = (ledger.workflowReviews ?? []).at(-1);
    const currentHash = worktreeHash(ledger.cwd || process.cwd());
    const completedReviews = [latestReview].filter((review) => review?.status === "verified" && hasReviewArtifact(review, currentHash, reviewBinding(ledger)));
    if (completedReviews.length === 0 || ["pending", "running", "failed"].includes(ledger.reviewRequest?.status)) errors.push("workflow contract requires a recorded independent review with retained separate reviewer output");
    if ((ledger.workflowBudgetUsage?.reviews ?? (ledger.workflowReviews ?? []).length) > contract.budget.maxReviews) errors.push(`review budget exceeded (${contract.budget.maxReviews})`);
  }
  if (contract && ledger.workflowBudgetUsage) {
    const fields = { workers: "maxWorkers", reviews: "maxReviews", reviewWorkers: "maxReviews", retries: "maxRetries", verificationAttempts: "maxVerificationAttempts" };
    for (const [used, allowed] of Object.entries(fields)) {
      if ((ledger.workflowBudgetUsage[used] ?? 0) > contract.budget[allowed]) errors.push(`${used} budget exceeded (${contract.budget[allowed]})`);
    }
  }
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

function enrichLedgerPlanMetadata(ledger) {
  const planPath = ledger.planPath || argValue("--plan");
  if (!planPath) return { ...ledger, spawns: ledger.spawns ?? [] };
  const scopeInfo = resolvePlanScopeFromFile(planPath);
  const registry = loadPlanRegistry(planPath);
  const hasTaskIds = registry.taskIds.length > 0;
  const planMaxConcurrentLanes = Number.isInteger(registry.maxConcurrentLanes)
    ? registry.maxConcurrentLanes
    : ledger.planMaxConcurrentLanes;
  return {
    ...ledger,
    planScope: scopeInfo.scope || ledger.planScope,
    planScopeReason: scopeInfo.reason || ledger.planScopeReason,
    taskGroupCount: hasTaskIds ? registry.taskGroupCount : ledger.taskGroupCount,
    planMaxConcurrentLanes,
    allowedSpawnNames: hasTaskIds ? registry.allowedSpawnNames : (ledger.allowedSpawnNames ?? []),
    spawns: ledger.spawns ?? [],
  };
}

function resolveReviewScopeMode(ledger, tier, waveId) {
  if (tier >= 3) return "full_lenses";
  try {
    return classifyReviewScope({
      riskTier: tier,
      planPath: ledger.planPath,
      cwd: ledger.cwd,
      waveId,
    }).mode;
  } catch {
    return "full_lenses";
  }
}

function recordSpawnRegistry() {
  const file = currentLedgerOrFail();
  const planPath = argValue("--plan") || readJson(file).planPath;
  if (!planPath) {
    console.error("record-spawn-registry requires --plan or ledger.planPath.");
    process.exit(1);
  }
  const registry = loadPlanRegistry(planPath);
  if (!registry.readable) {
    console.error(`record-spawn-registry: cannot read plan at ${planPath}.`);
    process.exit(1);
  }
  const existing = readJson(file);
  const priorNames = existing.allowedSpawnNames ?? [];
  if (registry.allowedSpawnNames.length === 0 && priorNames.length > 0) {
    console.error("record-spawn-registry: plan produced an empty allowlist; refusing to wipe the existing registry.");
    process.exit(1);
  }
  const scopeInfo = resolvePlanScopeFromFile(planPath);
  updateJson(file, (ledger) => {
    ledger.planPath = planPath;
    ledger.planScope = scopeInfo.scope;
    ledger.planScopeReason = scopeInfo.reason;
    ledger.taskGroupCount = registry.taskGroupCount;
    ledger.planMaxConcurrentLanes = registry.maxConcurrentLanes ?? null;
    ledger.allowedSpawnNames = registry.allowedSpawnNames;
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "spawn.registry.updated", {
      planPath,
      planScope: scopeInfo.scope,
      taskGroupCount: registry.taskGroupCount,
      planMaxConcurrentLanes: registry.maxConcurrentLanes ?? null,
      allowedCount: registry.allowedSpawnNames.length,
    });
    return ledger;
  });
  console.log(`Spawn registry updated: scope=${scopeInfo.scope} names=${registry.allowedSpawnNames.length}`);
}

function checkSpawn() {
  const file = currentLedgerOrFail();
  const dryRun = args.includes("--dry-run");
  const taskName = argValue("--task-name");
  const waveId = argValue("--wave");
  const subagentType = argValue("--subagent-type");
  const packetMode = argValue("--packet-mode");
  const overrideReason = argValue("--override-spawn-cap");
  const jsonOutput = args.includes("--json");
  const explainOutput = args.includes("--explain");

  const evaluateLocked = (ledger) => {
    const enriched = enrichLedgerPlanMetadata(ledger);
    const activeReservations = (enriched.activeWorkerReservations ?? []).filter((reservation) => reservation.status === "active");
    if (enriched.workflowContract) {
      const contractLimit = enriched.workflowContract.budget.maxConcurrentWorkers;
      // An active contract owns this cap; neither an older native execute
      // profile nor ETRNL_MAX_CONCURRENT_LANES may raise it.
      enriched.executeProfile = { ...(enriched.executeProfile ?? {}), maxConcurrentLanes: contractLimit };
      enriched.planMaxConcurrentLanes = contractLimit;
    }
    const classified = classifySpawnContext({ taskName, waveId, subagentType, packetMode });
    const tier = enriched.workflowContract ? null : resolvePlanRiskTier(enriched);
    const reviewScopeMode = enriched.workflowContract ? "workflow-contract" : resolveReviewScopeMode(enriched, tier, waveId);
    const verdict = enriched.workflowContract
      ? {
        allowed: true,
        reasonCode: "ok",
        reason: "Spawn admitted by the explicit workflow contract.",
        classified,
        record: {
          at: nowIso(), taskName, waveId, role: classified.role,
          patchId: classified.patchId, reviewLane: classified.reviewLane,
          reviewRound: classified.reviewRound, isMergedWaveReview: classified.isMergedWaveReview,
          reviewerSubagent: classified.reviewerSubagent ?? false,
        },
      }
      : evaluateSpawnGuard(enriched, {
        taskName,
        waveId,
        riskTier: tier,
        overrideReason,
        reviewScopeMode,
        subagentType,
        packetMode,
      });
    let budgetDenial = null;
    if (enriched.workflowContract) {
      const usage = {
        ...(enriched.workflowBudgetUsage ?? {}),
        workers: enriched.workflowBudgetUsage?.workers ?? (enriched.spawns ?? []).length,
        concurrentWorkers: activeReservations.length,
      };
      let admission = admitBudgetAction(enriched.workflowContract, usage, "worker");
      if (admission.allowed && classified.role === "reviewer") {
        admission = admitBudgetAction(enriched.workflowContract, usage, "reviewer");
      }
      if (!admission.allowed) budgetDenial = admission.reason;
    }
    return { enriched, tier, reviewScopeMode, verdict, budgetDenial, activeReservations };
  };

  const emitDenied = (explained) => {
    if (jsonOutput || explainOutput) {
      console.log(JSON.stringify(explained, null, 2));
    } else {
      console.error(`Spawn guard blocked ${taskName}: ${explained.reason}`);
      if (explained.exampleCommand) {
        console.error(`Recovery: ${explained.exactFix}`);
        console.error(`Example: ${explained.exampleCommand}`);
      }
    }
    process.exit(1);
  };

  if (!taskName && readJson(file).workflowContract) {
    emitDenied({
      allowed: false,
      reasonCode: "missing-task-name",
      reason: "Contract-backed spawns require a non-empty stable --task-name so the reservation can be identified and released.",
    });
  }

  if (dryRun) {
    const { enriched, reviewScopeMode, verdict, budgetDenial, activeReservations } = evaluateLocked(readJson(file));
    const explained = budgetDenial ? { allowed: false, reason: budgetDenial } : explainSpawnVerdict(verdict);
    if (!verdict.allowed || budgetDenial) emitDenied(explained);
    const payload = {
      allowed: true,
      dryRun: true,
      maxConcurrentLanes: resolveMaxConcurrentLanes(enriched, process.env),
      activeWorkers: activeReservations.length,
      spawnCount: (enriched.spawns ?? []).length,
      reviewScopeMode,
      ...explained,
    };
    if (jsonOutput || explainOutput) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`Spawn guard allowed ${taskName} on ${waveId}`);
    }
    return;
  }

  const allowRecord = args.includes("--allow-record")
    || process.env.ETRNL_SPAWN_GUARD_RECORDER === "hook";
  if (!allowRecord) {
    console.error("check-spawn: recording requires hook authority; pass --dry-run for skill-side probes or --allow-record for tests.");
    process.exit(2);
  }

  let denied = null;
  let recorded = null;
  updateJson(file, (current) => {
    const { enriched, reviewScopeMode, verdict, budgetDenial, activeReservations } = evaluateLocked(current);
    const explained = budgetDenial ? { allowed: false, reason: budgetDenial } : explainSpawnVerdict(verdict);
    if (!verdict.allowed || budgetDenial) {
      denied = explained;
      return current;
    }
    enriched.spawns = enriched.spawns ?? [];
    const reservationId = enriched.workflowContract ? randomUUID() : null;
    enriched.spawns.push({ ...verdict.record, ...(reservationId ? { reservationId, workerStatus: "active" } : {}) });
    if (enriched.workflowContract) {
      enriched.activeWorkerReservations = enriched.activeWorkerReservations ?? [];
      enriched.activeWorkerReservations.push({
        id: reservationId,
        taskName,
        waveId,
        role: verdict.record.role,
        patchId: verdict.record.patchId,
        status: "active",
        reservedAt: nowIso(),
      });
      const usage = enriched.workflowBudgetUsage ?? { workers: 0, concurrentWorkers: 0, reviews: 0, retries: 0, verificationAttempts: 0 };
      enriched.workflowBudgetUsage = {
        ...usage,
        workers: (usage.workers ?? 0) + 1,
        ...(verdict.record.role === "reviewer" ? { reviewWorkers: (usage.reviewWorkers ?? 0) + 1 } : {}),
        concurrentWorkers: activeReservations.length + 1,
      };
    }
    enriched.updatedAt = nowIso();
    appendEvent(enriched, "spawn.recorded", verdict.record);
    Object.assign(current, enriched);
    recorded = { enriched, reviewScopeMode, explained, reservationId };
    return current;
  });
  if (denied) emitDenied(denied);

  const payload = {
    allowed: true,
    dryRun: false,
    maxConcurrentLanes: resolveMaxConcurrentLanes(recorded.enriched, process.env),
    spawnCount: (recorded.enriched.spawns ?? []).length,
    ...(recorded.reservationId ? { reservationId: recorded.reservationId } : {}),
    reviewScopeMode: recorded.reviewScopeMode,
    ...recorded.explained,
  };
  if (jsonOutput || explainOutput) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Spawn guard allowed ${taskName} on ${waveId}`);
  }
}

function inferSpawnWave() {
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const taskName = argValue("--task-name", "");
  const waveId = inferSpawnWaveId(ledger, { taskName });
  if (args.includes("--json")) {
    console.log(JSON.stringify({ waveId: waveId || null }, null, 2));
  } else {
    console.log(waveId || "");
  }
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
  const planPath = argValue("--plan");
  const workflowContractFlagIndex = args.indexOf("--workflow-contract");
  const workflowContractPath = argValue("--workflow-contract")
    || (workflowContractFlagIndex >= 0 && args[workflowContractFlagIndex + 1] === "-" ? "-" : "");
  let workflowContract;
  if (workflowContractPath) {
    try {
      const inputContract = workflowContractPath === "-" ? readStdinJson({
        emptyValue: null,
        onInvalidJson: (error) => { throw new Error(`invalid JSON: ${error.message}`); },
        onReadError: (error) => { throw new Error(`cannot read JSON: ${error.message}`); },
      }) : readJson(path.resolve(workflowContractPath));
      workflowContract = validateWorkflowContract(inputContract);
    } catch (error) {
      console.error(`init: invalid workflow contract: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }
  const scopeInfo = planPath ? resolvePlanScopeFromFile(planPath) : { scope: null, reason: "no-plan" };
  const registry = planPath ? loadPlanRegistry(planPath) : { taskGroupCount: 0, allowedSpawnNames: [] };
  const ledger = enrichLedgerPlanMetadata({
    schemaVersion: 2,
    runId,
    sessionId: bucket,
    cwd,
    projectId: projectIdentity(cwd, { projectId: argValue("--project"), statePath: argValue("--state-path") }).projectId,
    ...(argValue("--project") ? { portableProjectId: argValue("--project") } : {}),
    planPath,
    ...(workflowContract ? { workflowContract } : {}),
    ...(scopeInfo.scope ? { planScope: scopeInfo.scope, planScopeReason: scopeInfo.reason } : {}),
    taskGroupCount: registry.taskGroupCount,
    allowedSpawnNames: registry.allowedSpawnNames,
    spawns: [],
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
  });
  let selectedFile = file;
  withFileLock(pointerPath(bucket), () => {
    const pointer = existsSync(pointerPath(bucket)) ? readJson(pointerPath(bucket)) : null;
    if (pointer?.path && existsSync(pointer.path)) {
      const existing = readJson(pointer.path);
      if (existing.workflowContract && ledgerOwnedByWorktree(pointer.path, cwd)) {
        if (workflowContract && JSON.stringify(existing.workflowContract) !== JSON.stringify(workflowContract)) {
          throw new Error("init cannot replace an active workflow contract or reset its budget; resume the existing task");
        }
        selectedFile = pointer.path;
        updateJson(selectedFile, current => {
          if (current.projectState?.path && argValue("--state-path") && current.projectState.path !== argValue("--state-path")) throw new Error('cannot replace bound canonical project state; reconcile existing state first');
          const next = planPath ? enrichLedgerPlanMetadata({ ...current, planPath }) : current;
          syncProjectState(next, { explicit: argValue("--state-path"), bootstrap: true });
          return next;
        });
        return;
      }
    }
    syncProjectState(ledger, { explicit: argValue("--state-path"), bootstrap: true });
    writeJson(file, ledger);
    writeJsonAtomic(pointerPath(bucket), { path: file, updatedAt: ledger.updatedAt }, { mode: 0o600 });
  });
  console.log(selectedFile);
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
  let requireTasks = args.includes("--require-tasks");
  let requirePlanPhases = args.includes("--require-plan-phases");
  const file = currentLedgerPath(sessionId);
  if (!file) {
    if (args.includes("--require-ledger")) {
      console.error(`No active execution ledger for session ${resolvedSessionLabel()}.`);
      console.error(missingLedgerHint());
      process.exit(1);
    }
    return;
  }
  const ledger = readJson(file);
  // An explicit workflow contract is authoritative for workflow shape. The
  // stop hook's plan-prompt fallback is retained for legacy ledgers only; in
  // particular, structured contracts do not acquire mandatory legacy phases.
  if (ledger.workflowContract) {
    requireTasks = false;
    requirePlanPhases = false;
  }
  if (!args.includes("--json")) syncProjectState(ledger);
  const errors = completionErrors(ledger, { requireTasks, requirePlanPhases });
  if (args.includes("--json")) { console.log(JSON.stringify({ ok: errors.length === 0, errors })); if (errors.length) process.exitCode = 1; return; }
  if (errors.length > 0) {
    console.error(`Execution ledger is not complete: ${errors.join("; ")}`);
    process.exit(1);
  }
}

function workflowState() {
  const file = currentLedgerPath(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"));
  if (!file) {
    console.log("{}");
    return;
  }
  const ledger = readJson(file);
  if (!ledger.workflowContract) {
    console.log("{}");
    return;
  }
  validateWorkflowContract(ledger.workflowContract);
  const commandRunEvidence = (ledger.checks ?? [])
    .filter((check) => check.evidenceKind === "command-run")
    .map(({ name, argv, status, exitCode, outputDigest, startedTreeHash, treeHash, at }) => ({
      name, argv, status, exitCode, outputDigest, startedTreeHash, treeHash, evidenceKind: "command-run", at,
    }));
  const contractReviewEvidence = (ledger.workflowReviews ?? []).slice(-1).map((review) => ({
    ...review, independent: !["pending", "running", "failed"].includes(ledger.reviewRequest?.status) && hasReviewArtifact(review, worktreeHash(ledger.cwd || process.cwd()), reviewBinding(ledger)),
  }));
  const packetEvidence = (ledger.tasks ?? []).some((task) => task.packetHash && task.lineageId);
  const tddEvidenceRuns = (ledger.tddEvidence ?? []).map((row) => ({
    value: "tdd red green evidence",
    status: row.status,
    at: row.at || row.completedAt || "",
  }));
  console.log(JSON.stringify({
    workflowContract: ledger.workflowContract,
    commandRunEvidence,
    contractReviewEvidence,
    planPath: ledger.planPath || "",
    planPhases: ledger.phases ?? [],
    packetEvidence,
    tddEvidenceRuns,
  }));
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
  for (const key of ["mode", "lineageId", "packetHash", "featureId", "owner", "aliases"]) {
    const snake = key === "lineageId" ? "lineage_id" : key === "packetHash" ? "packet_hash" : key;
    const value = fields[key] ?? fields[snake];
    if (value) {
      if (["featureId", "owner"].includes(key) && !validIdentity(value)) throw new Error(`invalid ${key}`);
      if (key === "aliases" && (!Array.isArray(value) || value.some(item => typeof item !== "string" || item.length > 120))) throw new Error("invalid aliases");
      next[key] = value;
    }
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
  if (ledger.projectState?.path) {
    try {
      const snapshot = stateSnapshot(ledger, taskId);
      ledger.projectState.reads ||= {};
      ledger.projectState.reads[snapshot.taskNoteKey] ||= stateReadReceipt(snapshot);
      const aggregate = stateSnapshot(ledger);
      ledger.projectState.reads[aggregate.taskNoteKey] ||= stateReadReceipt(aggregate);
      delete ledger.projectState.readError;
    } catch (error) {
      // The outer writer persists this canonical mutation first; state projection
      // then propagates malformed/missing authored state without losing the task.
      ledger.projectState.readError = error.message;
    }
  }
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
      ["--feature", "featureId"], ["--owner", "owner"],
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
    if (argValue("--aliases")) fields.aliases = JSON.parse(argValue("--aliases"));
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
      evidenceKind: "self-reported",
      outputSummary: argValue("--summary"),
      at: nowIso(),
      treeHash: worktreeHash(ledger.cwd || process.cwd()),
    });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "check.recorded", { name, status });
    return ledger;
  });
}

function reserveContractBudget(file, action, detail = {}) {
  let denial = "";
  updateJson(file, (ledger) => {
    const contract = ledger.workflowContract;
    if (!contract) return ledger;
    const usage = ledger.workflowBudgetUsage ?? { workers: 0, concurrentWorkers: 0, reviews: 0, retries: 0, verificationAttempts: 0 };
    const admission = admitBudgetAction(contract, usage, action);
    if (!admission.allowed) {
      denial = admission.reason;
      return ledger;
    }
    const field = { worker: "workers", review: "reviews", retry: "retries", verification: "verificationAttempts" }[action];
    ledger.workflowBudgetUsage = { ...usage, [field]: (usage[field] ?? 0) + 1 };
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "workflow.budget-reserved", { action, usage: ledger.workflowBudgetUsage, ...detail });
    return ledger;
  });
  if (denial) {
    console.error(`Workflow budget exhausted: ${denial}; stop and preserve the partial result.`);
    process.exit(1);
  }
}

async function runCheck() {
  const separator = args.indexOf("--");
  const argv = separator >= 0 ? args.slice(separator + 1) : [];
  const name = argValue("--name");
  const timeoutMs = Number(argValue("--timeout-ms", "900000"));
  if (!name || argv.length === 0 || !argv[0]) {
    console.error("run-check requires --name and an executable argv after --; shell strings are not accepted.");
    process.exit(2);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 7_200_000) {
    console.error("run-check --timeout-ms must be an integer from 1 to 7200000 (two hours).");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const initialLedger = readJson(file);
  const cwd = path.resolve(initialLedger.cwd || process.cwd());
  const commandDigest = createHash("sha256").update(JSON.stringify(argv)).digest("hex");
  const reuseKey = argValue("--reuse-key", "");
  // Only hashes are retained; environment values can contain credentials.
  const environmentDigest = createHash("sha256").update(JSON.stringify(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
  const maxConcurrent = Number(argValue("--max-concurrent-checks", String(CHECK_RESOURCE_LIMITS.defaultConcurrency)));
  const slot = await acquireCheckSlot(path.join(runsDir(), "coordination", `${worktreeKey(cwd)}.json`), { maxConcurrent, waitMs: timeoutMs, checkKey: createHash("sha256").update(JSON.stringify([cwd, commandDigest, environmentDigest, timeoutMs])).digest("hex") });
  try {
  const startedTreeHash = worktreeHash(cwd);
  // Explicit opt-in: caller supplies an identity covering ignored dependencies,
  // toolchain and external inputs. Empty/unknown source hashes never reuse.
  const checkSnapshot = readJson(file);
  const unfinishedSameCheck = (checkSnapshot.workflowCheckReservations ?? []).some(check => check.name === name || check.commandDigest === commandDigest);
  const reusable = !unfinishedSameCheck && reuseKey && startedTreeHash && (checkSnapshot.checks ?? []).findLast(check =>
    check.evidenceKind === "command-run"
    && check.commandDigest === commandDigest && check.environmentDigest === environmentDigest
    && check.cwd === cwd && check.timeoutMs === timeoutMs
    && check.startedTreeHash === startedTreeHash && check.treeHash === startedTreeHash);
  if (reusable?.status === "passed" && reusable.reuseKey === reuseKey) {
    updateJson(file, ledger => {
      ledger.checks.push({ ...reusable, name, reusedFrom: { name: reusable.name, at: reusable.at }, reusedAt: nowIso() });
      appendEvent(ledger, "check.reused", { name, commandDigest, treeHash: startedTreeHash });
      return ledger;
    });
    process.stdout.write(`Reused command check ${name}: passed (source, argv, environment and declared inputs unchanged)\n`);
    return;
  }
  const reservationId = randomUUID();
  let budgetDenial = "";
  let attempt = 1;
  updateJson(file, (ledger) => {
    const completed = (ledger.checks ?? []).filter((check) => (check.name === name || check.commandDigest === commandDigest) && check.evidenceKind === "command-run" && !check.reusedFrom).length;
    const pending = (ledger.workflowCheckReservations ?? []).filter((reservation) => (reservation.name === name || reservation.commandDigest === commandDigest)).length;
    attempt = completed + pending + 1;
    if (!ledger.workflowContract) {
      ledger.workflowCheckReservations = ledger.workflowCheckReservations ?? [];
      ledger.workflowCheckReservations.push({ id: reservationId, name, commandDigest, ownerPid: process.pid, at: nowIso(), attempt });
      return ledger;
    }
    let usage = ledger.workflowBudgetUsage ?? { workers: 0, concurrentWorkers: 0, reviews: 0, retries: 0, verificationAttempts: 0 };
    if (attempt > 1) {
      const retry = admitBudgetAction(ledger.workflowContract, usage, "retry");
      if (!retry.allowed) { budgetDenial = retry.reason; return ledger; }
      usage = { ...usage, retries: (usage.retries ?? 0) + 1 };
    }
    const verification = admitBudgetAction(ledger.workflowContract, usage, "verification");
    if (!verification.allowed) { budgetDenial = verification.reason; return ledger; }
    usage = { ...usage, verificationAttempts: (usage.verificationAttempts ?? 0) + 1 };
    ledger.workflowBudgetUsage = usage;
    ledger.workflowCheckReservations = ledger.workflowCheckReservations ?? [];
    ledger.workflowCheckReservations.push({ id: reservationId, name, commandDigest, ownerPid: process.pid, at: nowIso(), attempt });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "workflow.budget-reserved", { action: attempt > 1 ? "retry+verification" : "verification", name, attempt, usage });
    return ledger;
  });
  if (budgetDenial) {
    console.error(`Workflow budget exhausted: ${budgetDenial}; stop and preserve the partial result.`);
    process.exitCode = 1;
    return;
  }
  const startedAt = nowIso();
  const outputHash = createHash("sha256");
  const stdoutHash = createHash("sha256");
  const stderrHash = createHash("sha256");
  let outputBytes = 0;
  let forwardedBytes = 0;
  const tailBytesPerStream = 8 * 1024;
  const tails = new Map([[process.stdout, Buffer.alloc(0)], [process.stderr, Buffer.alloc(0)]]);
  const forward = (stream, chunk) => {
    outputBytes += chunk.length;
    const tail = Buffer.concat([tails.get(stream), chunk]);
    tails.set(stream, tail.subarray(Math.max(0, tail.length - tailBytesPerStream)));
    const available = CHECK_RESOURCE_LIMITS.outputBytes - 2 * tailBytesPerStream - forwardedBytes;
    if (available > 0) {
      const bounded = chunk.subarray(0, available);
      forwardedBytes += bounded.length;
      stream.write(bounded);
    }
  };
  let pid = null;
  let exitCode = null;
  let signal = null;
  let spawnError = "";
  let timedOut = false;
  let interruptedBy = "";
  let escalationTimer = null;
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });
  const killTree = (signalName) => {
    if (process.platform !== "win32" && Number.isInteger(child.pid)) {
      try { process.kill(-child.pid, signalName); return; } catch { /* fall back to the direct child */ }
    }
    try { child.kill(signalName); } catch { /* it may have exited */ }
  };
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    killTree("SIGTERM");
    escalationTimer = setTimeout(() => killTree("SIGKILL"), 2_000);
  }, timeoutMs);
  const interruptHandler = (signalName) => {
    if (interruptedBy) return;
    interruptedBy = signalName;
    killTree(signalName);
    escalationTimer = setTimeout(() => killTree("SIGKILL"), 2_000);
  };
  const onSigint = () => interruptHandler("SIGINT");
  const onSigterm = () => interruptHandler("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  pid = child.pid ?? null;
  if (pid) slot.registerChild(pid);
  child.once("exit", () => {
    // Descendants may keep inherited pipes open after the direct command exits.
    // Start cleanup on exit rather than waiting for pipe close.
    killTree("SIGTERM");
    if (!escalationTimer) escalationTimer = setTimeout(() => killTree("SIGKILL"), 50);
  });
  child.stdout.on("data", (chunk) => {
    stdoutHash.update(chunk);
    outputHash.update("stdout\0");
    outputHash.update(chunk);
    forward(process.stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderrHash.update(chunk);
    outputHash.update("stderr\0");
    outputHash.update(chunk);
    forward(process.stderr, chunk);
  });
  child.on("error", (error) => { spawnError = error.message; });
  await new Promise((resolve) => child.on("close", (code, childSignal) => {
    exitCode = code;
    signal = childSignal;
    resolve();
  }));
  clearTimeout(timeoutTimer);
  // Keep the escalation armed after the direct child closes: descendants can
  // ignore the initial signal and inherit no stdio, so `close` alone does not
  // prove the detached command group has exited.
  if (escalationTimer && !timedOut && !interruptedBy) clearTimeout(escalationTimer);
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  const status = exitCode === 0 && !signal && !spawnError && !timedOut && !interruptedBy ? "passed" : "failed";
  // Successful finite commands must not leave background descendants running.
  // Never target unrelated PIDs: only the detached command process group.
  if (process.platform !== "win32" && Number.isInteger(child.pid)) {
    killTree("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 50));
    killTree("SIGKILL");
  }
  if (outputBytes > forwardedBytes) {
    process.stderr.write("\n[Check output truncated; final stdout/stderr tails follow]\n");
    for (const [stream, tail] of tails) { stream.write(tail); forwardedBytes += tail.length; }
    process.stderr.write(`\nCheck output limited to ${forwardedBytes} prefix/tail bytes; digests cover all ${outputBytes} bytes.\n`);
  }
  const evidence = {
    name,
    command: argv.map((part) => JSON.stringify(part)).join(" "),
    argv,
    status,
    evidenceKind: "command-run",
    pid,
    exitCode,
    signal,
    timeoutMs,
    timedOut,
    ...(interruptedBy ? { interruptedBy } : {}),
    ...(spawnError ? { spawnError } : {}),
    cwd,
    commandDigest,
    environmentDigest,
    ...(reuseKey ? { reuseKey } : {}),
    outputBytes,
    forwardedBytes,
    coordinationWaitMs: slot.waitedMs,
    outputDigest: outputHash.digest("hex"),
    stdoutDigest: stdoutHash.digest("hex"),
    stderrDigest: stderrHash.digest("hex"),
    startedAt,
    at: nowIso(),
    startedTreeHash,
    treeHash: worktreeHash(cwd),
  };
  updateJson(file, (current) => {
    current.workflowCheckReservations = (current.workflowCheckReservations ?? []).filter((reservation) => {
      if (reservation.id === reservationId) return false;
      if ((reservation.name === name || reservation.commandDigest === commandDigest)
        && Number.isSafeInteger(reservation.ownerPid) && !checkOwnerAlive(reservation.ownerPid)) {
        appendEvent(current, "check.abandoned-attempt-replaced", { reservationId: reservation.id, name: reservation.name, replacement: name });
        return false;
      }
      return true;
    });
    current.checks = current.checks ?? [];
    current.checks.push(evidence);
    current.updatedAt = nowIso();
    appendEvent(current, "check.command-captured", {
      name, status, exitCode, signal, commandDigest, outputDigest: evidence.outputDigest,
    });
    return current;
  });
  process.stdout.write(`\nCaptured command check ${name}: ${status} (exit=${exitCode ?? "null"}${timedOut ? ", timed out" : ""}${interruptedBy ? `, interrupted by ${interruptedBy}` : ""})\n`);
  if (status !== "passed") process.exitCode = 1;
  } finally { slot.release(); }
}

function recordWorkflowReview() {
  const reviewer = argValue("--reviewer");
  const status = argValue("--status", "verified");
  if (!reviewer || !["verified", "blocked", "skipped"].includes(status)) {
    console.error("record-workflow-review requires --reviewer and status verified|blocked|skipped.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const preview = readJson(file);
  if (!preview.workflowContract || preview.workflowContract.budget.maxReviews < 1) {
    console.error("record-workflow-review requires a workflow contract with an available review budget.");
    process.exit(2);
  }
  const treeHash = worktreeHash(preview.cwd || process.cwd());
  let artifact = {};
  if (status === "verified") {
    console.error("verified review imports are not accepted; use request-review then companion review-and-resume from the outer host");
    process.exit(2);
  }
  reserveContractBudget(file, "review", { reviewer });
  updateJson(file, (ledger) => {
    ledger.workflowReviews = ledger.workflowReviews ?? [];
    ledger.workflowReviews.push({ reviewer, status, at: nowIso(), treeHash, ...artifact });
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "workflow.review-recorded", { reviewer, status });
    return ledger;
  });
}

function recordBudgetUse() {
  const action = argValue("--action");
  if (action !== "retry") {
    console.error("record-budget-use currently accepts only --action retry; other usage is captured by workflow commands.");
    process.exit(2);
  }
  const operation = argValue("--operation");
  if (!["replan", "redelegate", "context-restore"].includes(operation)) {
    console.error("Manual retry accounting requires --operation replan|redelegate|context-restore. Do not pre-reserve check/review/resume retries: run-check and the review controller account for their own attempts automatically.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  reserveContractBudget(file, action, { operation, note: argValue("--note") });
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

function releaseWorkerReservation(ledger, {
  reservationId = "",
  taskName = "",
  waveId = "",
  taskId = "",
  role = "",
  agentId = "",
  status = "completed",
  reason = "",
} = {}) {
  const active = (ledger.activeWorkerReservations ?? []).filter((reservation) => reservation.status === "active");
  if (active.length === 0) {
    if (reservationId) throw new Error(`No active worker reservation ${reservationId} exists`);
    return null;
  }
  let candidates;
  if (reservationId) candidates = active.filter((reservation) => reservation.id === reservationId);
  else if (taskName) candidates = active.filter((reservation) => reservation.taskName === taskName && (!waveId || reservation.waveId === waveId));
  else {
    candidates = active.filter((reservation) => {
      const taskMatches = reservation.patchId === taskId || reservation.taskName === taskId || reservation.taskName.startsWith(`${taskId}_`);
      const roleMatches = !role || reservation.role === role;
      const waveMatches = !waveId || reservation.waveId === waveId;
      return taskMatches && roleMatches && waveMatches;
    });
  }
  if (candidates.length !== 1) {
    if (reservationId || taskName) throw new Error(candidates.length === 0
      ? `No active worker reservation matches ${reservationId || taskName}`
      : `Worker reservation identity is ambiguous (${candidates.length} active matches); provide --reservation-id`);
    return { released: false, reason: candidates.length === 0 ? "no-matching-reservation" : "ambiguous-reservation", matches: candidates.length };
  }
  const reservation = candidates[0];
  if (["failed", "cancelled", "blocked"].includes(status) && !String(reason).trim()) {
    throw new Error(`Releasing a worker as ${status} requires --release-reason`);
  }
  const at = nowIso();
  reservation.status = status;
  reservation.endedAt = at;
  if (reason) reservation.releaseReason = String(reason).trim();
  if (agentId) reservation.endedByAgentId = agentId;
  ledger.spawns = (ledger.spawns ?? []).map((spawn) => spawn.reservationId === reservation.id
    ? { ...spawn, workerStatus: status, workerEndedAt: at, ...(agentId ? { endedByAgentId: agentId } : {}) }
    : spawn);
  ledger.workflowBudgetUsage = {
    ...(ledger.workflowBudgetUsage ?? {}),
    workers: ledger.workflowBudgetUsage?.workers ?? (ledger.spawns ?? []).length,
    concurrentWorkers: (ledger.activeWorkerReservations ?? []).filter((item) => item.status === "active").length,
  };
  appendEvent(ledger, "worker.reservation-released", {
    reservationId: reservation.id,
    taskName: reservation.taskName,
    waveId: reservation.waveId,
    taskId,
    agentId,
    status,
    reason: String(reason).trim(),
  });
  return { released: true, reservationId: reservation.id, status };
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
  let reservationRelease = null;
  if (ledger.workflowContract && !["active", "running", "started", "pending"].includes(status)) {
    reservationRelease = releaseWorkerReservation(ledger, {
      reservationId: options.reservationId,
      taskName: options.spawnTaskName,
      waveId: options.waveId,
      taskId,
      role: options.spawnRole,
      agentId: id,
      status,
      reason: options.releaseReason,
    });
    if (reservationRelease?.released) ledger.agents.at(-1).workerReservationId = reservationRelease.reservationId;
  }
  ledger.updatedAt = nowIso();
  appendEvent(ledger, "agent.recorded", { agentId: id, taskId, role, mode, status, packetHash: packetHashValue, reservationRelease });
}

function recordAgent() {
  const id = argValue("--id", argValue("--agent", `agent-${Date.now()}`));
  const taskId = argValue("--task");
  const lineageId = argValue("--lineage", argValue("--lineage-id"));
  const packetHashValue = argValue("--packet-hash");
  const role = argValue("--role", "etrnl-executor");
  const mode = argValue("--mode", "write");
  const status = argValue("--status", "completed");
  const reservationId = argValue("--release-reservation", argValue("--reservation-id", ""));
  const releaseReason = argValue("--release-reason", "");
  const spawnTaskName = argValue("--spawn-task-name", "");
  const waveId = argValue("--wave", "");
  const spawnRole = argValue("--spawn-role", "");
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
    applyRecordAgent(ledger, taskId, { id, role, mode, status, lineageId, packetHash: packetHashValue, reservationId, spawnTaskName, waveId, spawnRole, releaseReason });
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
  const reservationId = event.reservation_id || event.worker_reservation_id || "";
  const spawnTaskName = event.spawn_task_name || event.task_name || "";
  const waveId = event.wave_id || event.waveId || "";
  const workerRole = event.worker_role || "";
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
    const reservationRelease = ledger.workflowContract ? releaseWorkerReservation(ledger, {
      reservationId,
      taskName: spawnTaskName,
      waveId,
      taskId,
      role: workerRole,
      agentId,
      status: "completed",
    }) : null;
    ledger.agents.push({ id: agentId, role: "subagent", status: "completed", taskId, agentType, outputTokens, findingsCount, endedAt: at, completedAt: at, ...(reservationRelease?.released ? { workerReservationId: reservationRelease.reservationId } : {}) });
    ledger.tasks = (ledger.tasks ?? []).map((task) => task.id === taskId ? { ...task, status: "reviewing", heartbeatAt: nowIso() } : task);
    ledger.updatedAt = nowIso();
    appendEvent(ledger, "subagent.completed", { agentId, taskId, reservationRelease });
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
else if (command === "workflow-state") workflowState();
else if (command === "record-state") {
  updateJson(currentLedgerOrFail(), ledger => { acknowledgeProjectState(ledger, argValue("--learning"), { outcome: argValue("--outcome") || undefined, pending: argValue("--pending") || undefined, unchangedReason: argValue("--unchanged-reason") || undefined, taskId: argValue("--task"), expectedRevision: argValue("--revision") || undefined, expectedEntryRevision: argValue("--entry-revision") || undefined, owner: argValue("--owner") || undefined, disposition: argValue("--disposition", "open"), handoverFrom: argValue("--handover-from") }); return ledger; });
}
else if (command === "read-state") {
  updateJson(currentLedgerOrFail(), ledger => { const snapshot = stateSnapshot(ledger,argValue("--task")); ledger.projectState.reads ||= {}; ledger.projectState.reads[snapshot.taskNoteKey] = stateReadReceipt(snapshot); console.log(JSON.stringify(snapshot)); return ledger; });
}
else if (command === "resume-state") {
  updateJson(currentLedgerOrFail(), ledger => {
    if (ledger.workflowContract && ledger.workflowContract.effects === 'repository-write' && !ledger.workflowContract.workKind) {
      ledger.workflowContract.workKind = 'substantive'; ledger.workflowContract.requirements.projectState = true;
      delete ledger.projectState?.ack;
    }
    syncProjectState(ledger,{bootstrap:true}); return ledger;
  });
}
else if (command === "project-state") console.log(projectStateContext(argValue("--cwd", process.cwd()), argValue("--state-path")));
else if (command === "check-bound-execute") checkBoundExecute();
else if (command === "check-spawn") checkSpawn();
else if (command === "infer-spawn-wave") inferSpawnWave();
else if (command === "record-spawn-registry") recordSpawnRegistry();
else if (command === "set-task") setTask();
else if (command === "set-phase") setPhase();
else if (command === "record-uat") recordUat();
else if (command === "record-check") recordCheck();
else if (command === "run-check") await runCheck();
else if (command === "request-review") console.log(JSON.stringify(requestReview(currentLedgerOrFail(), argValue("--checkpoint"), argValue("--host", "codex") === "claude" ? process.env.CLAUDE_SESSION_ID : process.env.CODEX_THREAD_ID, argValue("--knowledge-packet"), argValue("--host", "codex"))));
else if (command === "record-workflow-review") recordWorkflowReview();
else if (command === "record-budget-use") recordBudgetUse();
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
  console.error(`usage: execution-ledger.mjs init [--workflow-contract <JSON file|->]|validate|check-stop [--require-ledger] [--require-tasks] [--require-plan-phases]|workflow-state|check-bound-execute|check-spawn [--task-name <name>] [--wave <id>] [--subagent-type <type>] [--packet-mode <mode>] [--dry-run] [--allow-record] [--explain] [--json]|record-spawn-registry [--plan <path>]|set-task|set-phase|record-uat|record-check|run-check --name <name> [--timeout-ms 1..7200000] -- <executable> [args]|request-review --checkpoint <path>|record-state --outcome <text> --pending <text> --learning updated|none [or --unchanged-reason <text>]|project-state [--cwd <path>] [--state-path <path>]|record-workflow-review --reviewer <name> --status blocked|skipped|record-budget-use --action retry --operation replan|redelegate|context-restore|require-artifact|record-artifact|record-agent|record-review|record-tdd|record-simplifier|record-specialist|record-completion-audit|record-install-proof|record-task-bundle [--file <path>]|<json-stdin>|record-trajectory --wave <id> [--recurring-finding-count <n>] [--stream-alternation-count <n>] [--rounds-since-progress <n>]|record-decision|record-subagent|reconcile [--apply] [--json]|history [--progress] [--renegotiation-check] [--gates] [--plan <path>] [--json]`);
  console.error(reopenCapUsageText());
  process.exit(2);
}
