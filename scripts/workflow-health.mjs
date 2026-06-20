#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { beadLinkDryRun, compactHandoff } from "./lib/etrnl-state-core.mjs";

const args = process.argv.slice(2);
const KNOWN_COMMANDS = new Set(["summary", "status", "doctor", "prune"]);
const VALUE_FLAGS = new Set(["--limit", "--cwd", "--session", "--project", "--older-than-days", "--max-age-days"]);
const positionalArgs = collectPositionals(args);
const unknownCommand = positionalArgs.find((arg) => !KNOWN_COMMANDS.has(arg) && !/^\d+$/.test(arg));
if (unknownCommand) {
  console.error(`Unknown workflow-health command: ${unknownCommand}`);
  console.error("usage: workflow-health.mjs [summary|status|doctor|prune] [--json] [--cwd <path>] [--session <id>] [--project <id>] [--all]");
  process.exit(2);
}
const command = positionalArgs.find((arg) => KNOWN_COMMANDS.has(arg)) || "summary";
const jsonMode = args.includes("--json");
const strictRuntime = args.includes("--strict") || process.env.ETRNL_WORKFLOW_HEALTH_STRICT === "1";
const base = process.env.ETRNL_RUNS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "runs");
const artifactBase = process.env.ETRNL_ARTIFACTS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts");
const limit = Number(flagValue("--limit", args.find((arg) => /^\d+$/.test(arg)) || "10"));
const staleHours = Number(process.env.ETRNL_STALE_RUN_HOURS || "24");
const verbose = process.argv.includes("--verbose") || process.env.VERBOSE === "1";
const DEFAULT_LEDGER_READ_CONCURRENCY = 8;
const MAX_LEDGER_READ_CONCURRENCY = 12;
const configuredLedgerReadConcurrency = Number.parseInt(
  process.env.ETRNL_LEDGER_READ_CONCURRENCY || String(DEFAULT_LEDGER_READ_CONCURRENCY),
  10,
);
const requestedLedgerReadConcurrency = Number.isFinite(configuredLedgerReadConcurrency) && configuredLedgerReadConcurrency > 0
  ? configuredLedgerReadConcurrency
  : DEFAULT_LEDGER_READ_CONCURRENCY;
const ledgerReadConcurrency = Math.min(requestedLedgerReadConcurrency, MAX_LEDGER_READ_CONCURRENCY);
const cwdFilterRaw = flagValue("--cwd");
const cwdFilter = cwdFilterRaw ? path.resolve(cwdFilterRaw) : "";
const sessionFilter = flagValue("--session");
const projectFilter = flagValue("--project");
const includeAll = args.includes("--all");
const scopedView = Boolean(cwdFilter || sessionFilter || projectFilter) && !includeAll;

if (requestedLedgerReadConcurrency > MAX_LEDGER_READ_CONCURRENCY) {
  console.warn(
    `workflow-health warning: ETRNL_LEDGER_READ_CONCURRENCY=${requestedLedgerReadConcurrency} exceeds max ${MAX_LEDGER_READ_CONCURRENCY}; capping.`,
  );
}

function flagValue(name, fallback = "") {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const next = args[index + 1];
      return next && !next.startsWith("--") ? next : fallback;
    }
    if (arg.startsWith(`${name}=`)) {
      const value = arg.slice(name.length + 1);
      return value || fallback;
    }
  }
  return fallback;
}

function collectPositionals(argv) {
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && VALUE_FLAGS.has(arg)) index += 1;
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

function countJsonFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")).length : 0;
}

function allFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? allFiles(entryPath) : [entryPath];
  });
}

function latestMtimeIso(dir) {
  const latest = allFiles(dir).reduce((max, file) => Math.max(max, statSync(file).mtimeMs), 0);
  return latest > 0 ? new Date(latest).toISOString().replace(/\.\d{3}Z$/, "Z") : "none";
}

function hasIncompleteLedger(ledger) {
  const tasksIncomplete = (ledger.tasks ?? []).some((task) => !["verified", "skipped"].includes(task.status));
  const agentsIncomplete = (ledger.agents ?? []).some((agent) => !["completed", "verified", "skipped"].includes(agent.status));
  return tasksIncomplete || agentsIncomplete;
}

function isStaleTimestamp(updatedAtMs, staleWindowHours) {
  return !Number.isNaN(updatedAtMs) && Date.now() - updatedAtMs > staleWindowHours * 60 * 60 * 1000;
}

function staleRun(ledger) {
  const updatedAt = Date.parse(ledger.updatedAt || ledger.startedAt || "");
  return hasIncompleteLedger(ledger) && isStaleTimestamp(updatedAt, staleHours);
}

function isStaleArtifactTime(isoValue) {
  if (!isoValue || isoValue === "none") return false;
  const parsed = Date.parse(isoValue);
  return isStaleTimestamp(parsed, Number(process.env.ETRNL_CONTEXT_STALE_HOURS || staleHours));
}

function parseJson(raw, label) {
  try {
    return { value: JSON.parse(raw), error: "" };
  } catch (error) {
    return { value: null, error: `${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function loadLedgers(baseDir, fileNames) {
  const ledgerParseErrors = [];
  const ledgers = [];
  for (let start = 0; start < fileNames.length; start += ledgerReadConcurrency) {
    const chunk = fileNames.slice(start, start + ledgerReadConcurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (file) => {
        const fullPath = path.join(baseDir, file);
        try {
          const raw = await readFile(fullPath, "utf8");
          return { fullPath, raw, error: "" };
        } catch (error) {
          return { fullPath, raw: "", error: `${fullPath}: ${error instanceof Error ? error.message : String(error)}` };
        }
      }),
    );
    for (const result of chunkResults) {
      if (result.error) {
        ledgerParseErrors.push(result.error);
        continue;
      }
      const parsed = parseJson(result.raw, result.fullPath);
      if (parsed.value) ledgers.push({ ...parsed.value, __file: result.fullPath });
      else ledgerParseErrors.push(parsed.error);
    }
  }
  return { ledgerParseErrors, ledgers };
}

function filteredLedgers(ledgers) {
  if (includeAll) return ledgers;
  return ledgers.filter((ledger) => {
    if (cwdFilter) {
      if (typeof ledger.cwd !== "string" || ledger.cwd.trim() === "") return false;
      if (path.resolve(ledger.cwd) !== cwdFilter) return false;
    }
    if (sessionFilter && ledger.sessionId !== sessionFilter) return false;
    if (projectFilter && ledger.projectId !== projectFilter) return false;
    return true;
  });
}

function reviewStats() {
  const file = path.join(artifactBase, "review-log.jsonl");
  if (!existsSync(file)) return { entries: 0, unresolved: 0, malformed: 0, malformedDetails: [] };
  const entries = [];
  const malformedDetails = [];
  for (const [index, line] of readFileSync(file, "utf8").split(/\n/).filter(Boolean).entries()) {
    const parsed = parseJson(line, `${file}:${index + 1}`);
    if (parsed.value) entries.push(parsed.value);
    else malformedDetails.push(parsed.error);
  }
  const unresolved = entries.filter((entry) => !["resolved", "fixed", "auto-fixed", "false-positive", "skipped"].includes(String(entry.status || entry.action || "").toLowerCase()));
  return { entries: entries.length, unresolved: unresolved.length, malformed: malformedDetails.length, malformedDetails };
}

function effectivenessStats() {
  const file = path.join(artifactBase, "tool-effectiveness", "events.jsonl");
  if (!existsSync(file)) return { events: 0, malformed: 0, latest: "none", tools: [] };
  const tools = new Set();
  let events = 0;
  let malformed = 0;
  for (const [index, line] of readFileSync(file, "utf8").split(/\n/).filter(Boolean).entries()) {
    const parsed = parseJson(line, `${file}:${index + 1}`);
    if (!parsed.value) {
      malformed += 1;
      continue;
    }
    events += 1;
    if (parsed.value.tool) tools.add(String(parsed.value.tool));
  }
  return {
    events,
    malformed,
    latest: latestMtimeIso(path.dirname(file)),
    tools: [...tools].sort(),
  };
}

function compactStats() {
  try {
    const handoff = compactHandoff({ session: sessionFilter, latest: !sessionFilter });
    return {
      found: handoff.found,
      staleVerification: Boolean(handoff.handoff?.verificationStale),
      sessionId: handoff.handoff?.sessionId || "",
      compactEventSeq: handoff.handoff?.compactEventSeq || 0,
      latestVerificationEventSeq: handoff.handoff?.latestVerificationEventSeq || 0,
      preview: handoff.text || "",
    };
  } catch (error) {
    return {
      found: false,
      staleVerification: false,
      sessionId: "",
      compactEventSeq: 0,
      latestVerificationEventSeq: 0,
      preview: "",
      projectionError: error instanceof Error ? error.message : String(error),
    };
  }
}

function beadStats() {
  const defaults = { backlogCandidates: 0, activeExecutionNoise: 0, wouldRunBd: false };
  try {
    const bridge = beadLinkDryRun();
    return {
      backlogCandidates: Number(bridge.backlogCandidates || 0),
      activeExecutionNoise: Number(bridge.activeExecutionNoise || 0),
      wouldRunBd: bridge.wouldRunBd === true,
    };
  } catch (error) {
    return { ...defaults, projectionError: error instanceof Error ? error.message : String(error) };
  }
}

function reviewSummary(verboseMode = false) {
  const stats = reviewStats();
  const summary = stats.malformedDetails.length > 0
    ? `reviewLog entries=${stats.entries} unresolved=${stats.unresolved} malformed=${stats.malformed}`
    : `reviewLog entries=${stats.entries} unresolved=${stats.unresolved}`;
  if (!verboseMode || stats.malformedDetails.length === 0) return summary;
  return [summary, ...stats.malformedDetails.map((detail) => `malformedReviewLogDetail=${detail}`)].join("\n");
}

function ledgerUpdatedTime(ledger) {
  return Date.parse(ledger.updatedAt || ledger.startedAt || "");
}

function latestLedger(ledgers) {
  return [...ledgers].sort((left, right) => {
    const byTime = ledgerUpdatedTime(right) - ledgerUpdatedTime(left);
    if (Number.isFinite(byTime) && byTime !== 0) return byTime;
    return String(right.runId || "").localeCompare(String(left.runId || ""));
  })[0] || null;
}

function activeRunStatus(ledger) {
  if (!ledger) {
    return {
      activeRunId: "",
      unfinishedTasks: 0,
      blockedTasks: 0,
      unfinishedAgents: 0,
      failedChecks: 0,
      missingArtifacts: [],
      verificationChecks: 0,
      phaseStatus: "",
      phaseId: "",
      workstreamId: "",
      uatArtifact: "",
      uatOpenFindings: 0,
    };
  }
  const tasks = ledger.tasks ?? [];
  const agents = ledger.agents ?? [];
  const checks = ledger.checks ?? [];
  const artifactTypes = new Set((ledger.artifacts ?? []).map((artifact) => artifact.type));
  const missingArtifacts = (ledger.requiredArtifacts ?? []).filter((type) => !artifactTypes.has(type));
  return {
    activeRunId: ledger.runId || "",
    unfinishedTasks: tasks.filter((task) => !["verified", "skipped"].includes(task.status)).length,
    blockedTasks: tasks.filter((task) => task.status === "blocked").length,
    unfinishedAgents: agents.filter((agent) => !["completed", "verified", "skipped"].includes(agent.status)).length,
    failedChecks: checks.filter((check) => check.status === "failed").length,
    missingArtifacts,
    verificationChecks: checks.length,
    phaseStatus: ledger.phaseStatus || "",
    phaseId: ledger.phaseId || "",
    workstreamId: ledger.workstreamId || "",
    uatArtifact: ledger.uatArtifact || "",
    uatOpenFindings: Number(ledger.uatOpenFindings || 0),
  };
}

function nextAction(status) {
  if (!status.activeRunId) return "start execution ledger with execution-ledger init";
  if (status.missingArtifacts.length > 0) return `record missing artifacts: ${status.missingArtifacts.join(", ")}`;
  if (status.failedChecks > 0) return "fix failed verification checks and record the rerun";
  if (status.uatOpenFindings > 0) return `resolve UAT findings: ${status.uatOpenFindings}`;
  if (status.blockedTasks > 0) return "resolve blocked tasks or mark accepted blocker explicitly";
  if (status.unfinishedAgents > 0) return "wait for or reconcile unfinished subagent work";
  if (status.unfinishedTasks > 0) return "finish and verify unfinished tasks";
  if (status.verificationChecks === 0) return "record at least one verification check";
  return "none";
}

function buildStatus(ledgers, ledgerParseErrors = []) {
  const active = latestLedger(ledgers);
  const runStatus = activeRunStatus(active);
  const browserQaDir = path.join(artifactBase, "browser-qa");
  const contextsDir = path.join(artifactBase, "contexts");
  const contextsLatest = latestMtimeIso(contextsDir);
  const artifactLatest = latestMtimeIso(artifactBase);
  const review = reviewStats();
  const effectiveness = effectivenessStats();
  const status = {
    schemaVersion: 1,
    command: "status",
    filters: {
      cwd: cwdFilter,
      session: sessionFilter,
      project: projectFilter,
      all: includeAll,
    },
    activeRunId: runStatus.activeRunId,
    unfinishedTasks: runStatus.unfinishedTasks,
    blockedTasks: runStatus.blockedTasks,
    unfinishedAgents: runStatus.unfinishedAgents,
    failedChecks: runStatus.failedChecks,
    missingArtifacts: runStatus.missingArtifacts,
    verificationChecks: runStatus.verificationChecks,
    phase: {
      id: runStatus.phaseId,
      workstreamId: runStatus.workstreamId,
      status: runStatus.phaseStatus,
    },
    uat: {
      artifact: runStatus.uatArtifact,
      openFindings: runStatus.uatOpenFindings,
    },
    runs: {
      total: ledgers.length,
      stale: ledgers.filter(staleRun).length,
      malformed: ledgerParseErrors.length,
      thresholdHours: staleHours,
    },
    staleRuns: ledgers.filter(staleRun).length,
    reviewLog: {
      entries: review.entries,
      unresolved: review.unresolved,
      malformed: review.malformed,
    },
    browserQa: {
      reports: countJsonFiles(browserQaDir),
      latest: latestMtimeIso(browserQaDir),
    },
    contexts: {
      saved: countJsonFiles(contextsDir),
      latest: contextsLatest,
      stale: isStaleArtifactTime(contextsLatest),
    },
    artifactFreshness: {
      latest: artifactLatest,
      stale: isStaleArtifactTime(artifactLatest),
    },
    compact: compactStats(),
    beads: beadStats(),
    nextAction: nextAction(runStatus),
  };
  if (!scopedView && (effectiveness.events > 0 || effectiveness.malformed > 0)) {
    status.effectiveness = effectiveness;
  }
  return status;
}

function prunableLedger(ledger) {
  const configuredMaxAgeDays = Number(flagValue("--older-than-days", flagValue("--max-age-days", "30")));
  const maxAgeDays = Number.isFinite(configuredMaxAgeDays) ? configuredMaxAgeDays : 30;
  const updatedAt = ledgerUpdatedTime(ledger);
  if (!Number.isFinite(updatedAt)) return false;
  if (Date.now() - updatedAt < maxAgeDays * 24 * 60 * 60 * 1000) return false;
  return !hasIncompleteLedger(ledger);
}

function buildDoctor(ledgers, ledgerParseErrors) {
  const prunable = ledgers.filter(prunableLedger);
  const effectiveness = effectivenessStats();
  const compact = compactStats();
  const beads = beadStats();
  const review = reviewStats();
  const staleLedgerCount = ledgers.filter(staleRun).length;
  const runtimeFindings = [];
  if (ledgerParseErrors.length > 0) runtimeFindings.push({ id: "malformed-ledgers", count: ledgerParseErrors.length });
  if (staleLedgerCount > 0) runtimeFindings.push({ id: "stale-ledgers", count: staleLedgerCount });
  if (effectiveness.malformed > 0) runtimeFindings.push({ id: "malformed-effectiveness-events", count: effectiveness.malformed });
  if (compact.staleVerification) runtimeFindings.push({ id: "stale-compact-verification", count: 1 });
  if (review.malformed > 0) runtimeFindings.push({ id: "malformed-review-log", count: review.malformed });
  if (review.unresolved > 0) runtimeFindings.push({ id: "unresolved-review-log", count: review.unresolved });
  return {
    schemaVersion: 1,
    command: "doctor",
    ok: !strictRuntime || runtimeFindings.length === 0,
    strict: strictRuntime,
    strictReady: runtimeFindings.length === 0,
    filters: {
      cwd: cwdFilter,
      session: sessionFilter,
      project: projectFilter,
      all: includeAll,
    },
    ledgers: {
      total: ledgers.length,
      malformed: ledgerParseErrors.length,
      stale: staleLedgerCount,
      prunable: prunable.length,
    },
    effectiveness: scopedView
      ? { events: 0, malformed: 0, stalePilotWindows: 0, scopedOut: true }
      : { events: effectiveness.events, malformed: effectiveness.malformed, stalePilotWindows: 0 },
    reviewLog: {
      entries: review.entries,
      unresolved: review.unresolved,
      malformed: review.malformed,
    },
    compact,
    beads,
    runtimeFindings,
    activeRunId: latestLedger(ledgers)?.runId || "",
    nextAction: prunable.length > 0 ? "run workflow-health prune --dry-run first, then prune without --dry-run" : "none",
  };
}

function renderDoctorText(doctor) {
  return [
    `workflowDoctor ledgers=${doctor.ledgers.total} malformed=${doctor.ledgers.malformed} stale=${doctor.ledgers.stale} prunable=${doctor.ledgers.prunable}`,
    `workflowDoctor effectivenessEvents=${doctor.effectiveness.events} effectivenessMalformed=${doctor.effectiveness.malformed}`,
    `workflowDoctor reviewLogEntries=${doctor.reviewLog.entries} reviewLogUnresolved=${doctor.reviewLog.unresolved} reviewLogMalformed=${doctor.reviewLog.malformed}`,
    `workflowDoctor compactFound=${doctor.compact.found} compactStaleVerification=${doctor.compact.staleVerification}`,
    `workflowDoctor beadsBacklogCandidates=${doctor.beads.backlogCandidates} beadsActiveExecutionNoise=${doctor.beads.activeExecutionNoise}`,
    `workflowDoctor strictReady=${doctor.strictReady} runtimeFindings=${doctor.runtimeFindings.map((finding) => `${finding.id}:${finding.count}`).join(",") || "none"}`,
    `workflowDoctor activeRun=${doctor.activeRunId || "none"} nextAction=${doctor.nextAction}`,
  ].join("\n");
}

function runPrune(ledgers) {
  const prunable = ledgers.filter(prunableLedger);
  const dryRun = args.includes("--dry-run");
  if (!dryRun) {
    for (const ledger of prunable) {
      if (ledger.__file) rmSync(ledger.__file, { force: true });
    }
  }
  const result = {
    schemaVersion: 1,
    command: "prune",
    dryRun,
    pruned: dryRun ? 0 : prunable.length,
    prunable: prunable.map((ledger) => ({ runId: ledger.runId, file: ledger.__file || "" })),
  };
  if (jsonMode) emitJson(result);
  else console.log(`workflowPrune dryRun=${dryRun} prunable=${result.prunable.length} pruned=${result.pruned}`);
}

function emitJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function renderStatusText(status) {
  const missing = status.missingArtifacts.length > 0 ? status.missingArtifacts.join(",") : "none";
  const lines = [
    `workflowStatus activeRun=${status.activeRunId || "none"} unfinished=${status.unfinishedTasks} blocked=${status.blockedTasks} failedChecks=${status.failedChecks}`,
    `workflowStatus missingArtifacts=${missing} staleRuns=${status.staleRuns} browserQa=${status.browserQa.reports} contexts=${status.contexts.saved}`,
    `workflowStatus phase=${status.phase.id || "none"} workstream=${status.phase.workstreamId || "none"} uatOpenFindings=${status.uat.openFindings}`,
    `workflowStatus compactFound=${status.compact.found} compactStaleVerification=${status.compact.staleVerification}`,
    `workflowStatus nextAction=${status.nextAction}`,
  ];
  if (status.effectiveness) {
    lines.splice(3, 0, `workflowStatus effectivenessEvents=${status.effectiveness.events} effectivenessTools=${status.effectiveness.tools.join(",") || "none"}`);
  }
  return lines.join("\n");
}

if (!existsSync(base)) {
  if (command === "doctor") {
    const doctor = buildDoctor([], []);
    if (jsonMode) emitJson(doctor);
    else console.log(renderDoctorText(doctor));
    process.exit(doctor.ok ? 0 : 1);
  }
  if (command === "prune") {
    runPrune([]);
    process.exit(0);
  }
  if (command === "status" || jsonMode) {
    const status = buildStatus([], []);
    if (jsonMode) emitJson(status);
    else console.log(renderStatusText(status));
    process.exit(0);
  }
  console.log("No ETRNL run ledger directory found.");
  console.log(reviewSummary(verbose));
  console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
  console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
  console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
  console.log(`staleRuns=0 thresholdHours=${staleHours}`);
  process.exit(0);
}

const files = readdirSync(base)
  .filter((file) => file.endsWith(".json") && !file.startsWith("current-"))
  .sort()
  .reverse();

if (files.length === 0) {
  if (command === "doctor") {
    const doctor = buildDoctor([], []);
    if (jsonMode) emitJson(doctor);
    else console.log(renderDoctorText(doctor));
    process.exit(doctor.ok ? 0 : 1);
  }
  if (command === "prune") {
    runPrune([]);
    process.exit(0);
  }
  if (command === "status" || jsonMode) {
    const status = buildStatus([], []);
    if (jsonMode) emitJson(status);
    else console.log(renderStatusText(status));
    process.exit(0);
  }
  console.log("No ETRNL workflow runs recorded yet.");
  console.log(reviewSummary(verbose));
  console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
  console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
  console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
  process.exit(0);
}

const { ledgerParseErrors, ledgers } = await loadLedgers(base, files);
const selectedLedgers = filteredLedgers(ledgers);
if (command === "doctor") {
  const doctor = buildDoctor(selectedLedgers, ledgerParseErrors);
  if (jsonMode) emitJson(doctor);
  else console.log(renderDoctorText(doctor));
  process.exit(doctor.ok ? 0 : 1);
}

if (command === "prune") {
  runPrune(selectedLedgers);
  process.exit(0);
}

if (command === "status" || jsonMode) {
  const status = buildStatus(selectedLedgers, ledgerParseErrors);
  if (jsonMode) emitJson(status);
  else console.log(renderStatusText(status));
  process.exit(0);
}

for (const ledger of selectedLedgers.slice(0, limit)) {
  const tasks = ledger.tasks ?? [];
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const verified = tasks.filter((task) => task.status === "verified").length;
  const retries = tasks.reduce((sum, task) => sum + Number(task.attempts || 0), 0);
  const failures = (ledger.checks ?? []).filter((check) => check.status === "failed").length;
  const artifacts = (ledger.artifacts ?? []).length;
  console.log(`${ledger.runId}: verified=${verified}/${tasks.length} blocked=${blocked} retries=${retries} failedChecks=${failures} artifacts=${artifacts}`);
}

if (ledgerParseErrors.length > 0) {
  console.log(`malformedLedgers=${ledgerParseErrors.length}`);
  if (verbose) {
    for (const parseError of ledgerParseErrors) {
      console.log(`malformedLedgerDetail=${parseError}`);
    }
  }
}
console.log(reviewSummary(verbose));
console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
console.log(`staleRuns=${selectedLedgers.filter(staleRun).length} thresholdHours=${staleHours}`);
