#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const base = process.env.CLAUDE_CONTROL_PLANE_RUNS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "runs");
const artifactBase = process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
const limit = Number(process.argv[2] || "10");
const staleHours = Number(process.env.ETRNL_STALE_RUN_HOURS || "24");

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

function incompleteLedger(ledger) {
  const tasksIncomplete = (ledger.tasks ?? []).some((task) => !["verified", "skipped"].includes(task.status));
  const agentsIncomplete = (ledger.agents ?? []).some((agent) => !["completed", "verified", "skipped"].includes(agent.status));
  return tasksIncomplete || agentsIncomplete;
}

function staleRun(ledger) {
  const updatedAt = Date.parse(ledger.updatedAt || ledger.startedAt || "");
  return incompleteLedger(ledger) && !Number.isNaN(updatedAt) && Date.now() - updatedAt > staleHours * 60 * 60 * 1000;
}

function reviewSummary() {
  const file = path.join(artifactBase, "review-log.jsonl");
  if (!existsSync(file)) return "reviewLog entries=0 unresolved=0";
  const entries = readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
  const unresolved = entries.filter((entry) => !["resolved", "fixed", "auto-fixed", "false-positive", "skipped"].includes(String(entry.status || entry.action || "").toLowerCase()));
  return `reviewLog entries=${entries.length} unresolved=${unresolved.length}`;
}

if (!existsSync(base)) {
  console.log("No ETRNL run ledger directory found.");
  console.log(reviewSummary());
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
  console.log("No ETRNL workflow runs recorded yet.");
  console.log(reviewSummary());
  console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
  console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
  console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
  process.exit(0);
}

const ledgers = files.map((file) => JSON.parse(readFileSync(path.join(base, file), "utf8")));
for (const ledger of ledgers.slice(0, limit)) {
  const tasks = ledger.tasks ?? [];
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const verified = tasks.filter((task) => task.status === "verified").length;
  const retries = tasks.reduce((sum, task) => sum + Number(task.attempts || 0), 0);
  const failures = (ledger.checks ?? []).filter((check) => check.status === "failed").length;
  const artifacts = (ledger.artifacts ?? []).length;
  console.log(`${ledger.runId}: verified=${verified}/${tasks.length} blocked=${blocked} retries=${retries} failedChecks=${failures} artifacts=${artifacts}`);
}

console.log(reviewSummary());
console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
console.log(`staleRuns=${ledgers.filter(staleRun).length} thresholdHours=${staleHours}`);
