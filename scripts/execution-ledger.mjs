#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";

const STATUSES = new Set(["pending", "in_progress", "reviewing", "changes_requested", "verified", "blocked", "skipped"]);
const AGENT_DONE = new Set(["completed", "verified", "skipped"]);

const args = process.argv.slice(2);
const command = args[0] ?? "help";

const argValue = (flag, fallback = "") => readArgValue(args, flag, fallback);

function safeId(value) {
  return String(value || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
}

function runsDir() {
  return process.env.CLAUDE_CONTROL_PLANE_RUNS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "runs");
}

function pointerPath(sessionId) {
  return path.join(runsDir(), `current-${safeId(sessionId)}.json`);
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function currentLedgerPath(sessionId) {
  const pointer = pointerPath(sessionId);
  if (!existsSync(pointer)) return "";
  const data = readJson(pointer);
  return data.path || "";
}

function validateLedger(ledger) {
  const errors = [];
  if (ledger.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!ledger.runId) errors.push("runId is required");
  if (!Array.isArray(ledger.tasks)) errors.push("tasks must be an array");
  if (!Array.isArray(ledger.agents)) errors.push("agents must be an array");
  if (!Array.isArray(ledger.checks)) errors.push("checks must be an array");
  if (ledger.artifacts && !Array.isArray(ledger.artifacts)) errors.push("artifacts must be an array");
  if (ledger.requiredArtifacts && !Array.isArray(ledger.requiredArtifacts)) errors.push("requiredArtifacts must be an array");

  for (const task of ledger.tasks ?? []) {
    if (!task.id) errors.push("task is missing id");
    if (!STATUSES.has(task.status)) errors.push(`task ${task.id || "<unknown>"} has invalid status ${task.status}`);
  }
  for (const agent of ledger.agents ?? []) {
    if (!agent.id) errors.push("agent is missing id");
    if (!agent.role) errors.push(`agent ${agent.id || "<unknown>"} is missing role`);
    if (!agent.status) errors.push(`agent ${agent.id || "<unknown>"} is missing status`);
  }
  return errors;
}

function completionErrors(ledger) {
  const errors = validateLedger(ledger);
  const unfinishedTasks = (ledger.tasks ?? [])
    .filter((task) => !["verified", "skipped"].includes(task.status))
    .map((task) => `${task.id}:${task.status}`);
  const unfinishedAgents = (ledger.agents ?? [])
    .filter((agent) => !AGENT_DONE.has(agent.status))
    .map((agent) => `${agent.id}:${agent.status}`);
  const artifactTypes = new Set((ledger.artifacts ?? []).map((artifact) => artifact.type));
  const missingArtifacts = (ledger.requiredArtifacts ?? []).filter((type) => !artifactTypes.has(type));
  if (unfinishedTasks.length > 0) errors.push(`unfinished tasks: ${unfinishedTasks.join(", ")}`);
  if (unfinishedAgents.length > 0) errors.push(`unfinished agents: ${unfinishedAgents.join(", ")}`);
  if (missingArtifacts.length > 0) errors.push(`missing artifacts: ${missingArtifacts.join(", ")}`);
  if ((ledger.checks ?? []).length === 0) errors.push("no verification checks recorded");
  return errors;
}

function initLedger() {
  const sessionId = argValue("--session", process.env.CLAUDE_SESSION_ID || "default");
  const runId = `run-${safeId(sessionId)}-${Date.now()}`;
  const file = path.join(runsDir(), `${runId}.json`);
  const ledger = {
    schemaVersion: 1,
    runId,
    sessionId,
    planPath: argValue("--plan"),
    mode: argValue("--mode", "agent-os"),
    startedAt: nowIso(),
    updatedAt: nowIso(),
    tasks: [],
    agents: [],
    checks: [],
    artifacts: [],
    requiredArtifacts: [],
    decisions: [],
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
  const file = currentLedgerPath(argValue("--session", process.env.CLAUDE_SESSION_ID || "default"));
  if (!file) return;
  const errors = completionErrors(readJson(file));
  if (errors.length > 0) {
    console.error(`Execution ledger is not complete: ${errors.join("; ")}`);
    process.exit(1);
  }
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

function setTask() {
  const taskId = argValue("--task");
  const status = argValue("--status");
  if (!taskId || !STATUSES.has(status)) {
    console.error("set-task requires --task and a valid --status.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const existing = (ledger.tasks ?? []).find((task) => task.id === taskId);
  const next = { id: taskId, title: argValue("--title", existing?.title || taskId), status, heartbeatAt: nowIso() };
  ledger.tasks = existing
    ? ledger.tasks.map((task) => task.id === taskId ? { ...task, ...next } : task)
    : [...(ledger.tasks ?? []), next];
  ledger.updatedAt = nowIso();
  writeJson(file, ledger);
}

function recordCheck() {
  const name = argValue("--name");
  const commandText = argValue("--command");
  const status = argValue("--status", "passed");
  if (!name || !commandText) {
    console.error("record-check requires --name and --command.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  ledger.checks = ledger.checks ?? [];
  ledger.checks.push({ name, command: commandText, status, outputSummary: argValue("--summary"), at: nowIso() });
  ledger.updatedAt = nowIso();
  writeJson(file, ledger);
}

function requireArtifact() {
  const type = argValue("--type");
  if (!type) {
    console.error("require-artifact requires --type.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  const required = new Set(ledger.requiredArtifacts ?? []);
  required.add(type);
  ledger.requiredArtifacts = [...required].sort();
  ledger.updatedAt = nowIso();
  writeJson(file, ledger);
}

function recordArtifact() {
  const type = argValue("--type");
  const artifactPath = argValue("--path");
  if (!type || !artifactPath) {
    console.error("record-artifact requires --type and --path.");
    process.exit(2);
  }
  const file = currentLedgerOrFail();
  const ledger = readJson(file);
  ledger.artifacts = ledger.artifacts ?? [];
  ledger.artifacts.push({ type, path: artifactPath, status: argValue("--status", "recorded"), at: nowIso() });
  ledger.updatedAt = nowIso();
  writeJson(file, ledger);
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
  const redacted = raw.replace(
    /((api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|bearer|credential|jwt)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s"',}]+)/gi,
    "$1[redacted]",
  );
  return redacted.length > 400 ? `${redacted.slice(0, 400)}... [truncated]` : redacted;
}

function recordSubagent() {
  const raw = readFileSync(0, "utf8").trim();
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
  const ledger = readJson(file);
  if (!(ledger.tasks ?? []).some((task) => task.id === taskId)) {
    console.error(`Subagent output references unknown ETRNL_TASK_ID: ${taskId}.`);
    process.exit(1);
  }
  const agentId = event.agent_id || event.subagent_id || `subagent-${Date.now()}`;
  ledger.agents = ledger.agents ?? [];
  ledger.agents.push({ id: agentId, role: "subagent", status: "completed", taskId, endedAt: nowIso() });
  ledger.tasks = (ledger.tasks ?? []).map((task) => task.id === taskId ? { ...task, status: "reviewing", heartbeatAt: nowIso() } : task);
  ledger.updatedAt = nowIso();
  writeJson(file, ledger);
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
else if (command === "set-task") setTask();
else if (command === "record-check") recordCheck();
else if (command === "require-artifact") requireArtifact();
else if (command === "record-artifact") recordArtifact();
else if (command === "record-subagent") recordSubagent();
else if (command === "history") history();
else {
  console.error("usage: execution-ledger.mjs init|validate|check-stop|set-task|record-check|require-artifact|record-artifact|record-subagent|history");
  process.exit(2);
}
