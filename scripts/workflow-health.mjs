#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const base = process.env.CLAUDE_CONTROL_PLANE_RUNS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "runs");
const artifactBase = process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
  || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
const limit = Number(process.argv[2] || "10");
const staleHours = Number(process.env.ETRNL_STALE_RUN_HOURS || "24");
const verbose = process.argv.includes("--verbose") || process.env.VERBOSE === "1";
const DEFAULT_LEDGER_READ_CONCURRENCY = 8;
const MAX_LEDGER_READ_CONCURRENCY = 12;

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
  const configuredConcurrency = Number.parseInt(process.env.ETRNL_LEDGER_READ_CONCURRENCY || String(DEFAULT_LEDGER_READ_CONCURRENCY), 10);
  const requestedConcurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? configuredConcurrency
    : DEFAULT_LEDGER_READ_CONCURRENCY;
  const concurrency = Math.min(requestedConcurrency, MAX_LEDGER_READ_CONCURRENCY);
  if (requestedConcurrency > MAX_LEDGER_READ_CONCURRENCY) {
    const warning = `workflow-health warning: ETRNL_LEDGER_READ_CONCURRENCY=${requestedConcurrency} exceeds max ${MAX_LEDGER_READ_CONCURRENCY}; capping.`;
    if (verbose) console.error(warning);
  }
  for (let start = 0; start < fileNames.length; start += concurrency) {
    const chunk = fileNames.slice(start, start + concurrency);
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
      if (parsed.value) ledgers.push(parsed.value);
      else ledgerParseErrors.push(parsed.error);
    }
  }
  return { ledgerParseErrors, ledgers };
}

function reviewSummary(verboseMode = false) {
  const file = path.join(artifactBase, "review-log.jsonl");
  if (!existsSync(file)) return "reviewLog entries=0 unresolved=0";
  const entries = [];
  const malformedDetails = [];
  for (const [index, line] of readFileSync(file, "utf8").split(/\n/).filter(Boolean).entries()) {
    const parsed = parseJson(line, `${file}:${index + 1}`);
    if (parsed.value) entries.push(parsed.value);
    else malformedDetails.push(parsed.error);
  }
  const unresolved = entries.filter((entry) => !["resolved", "fixed", "auto-fixed", "false-positive", "skipped"].includes(String(entry.status || entry.action || "").toLowerCase()));
  const summary = malformedDetails.length > 0
    ? `reviewLog entries=${entries.length} unresolved=${unresolved.length} malformed=${malformedDetails.length}`
    : `reviewLog entries=${entries.length} unresolved=${unresolved.length}`;
  if (!verboseMode || malformedDetails.length === 0) return summary;
  return [summary, ...malformedDetails.map((detail) => `malformedReviewLogDetail=${detail}`)].join("\n");
}

if (!existsSync(base)) {
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
  console.log("No ETRNL workflow runs recorded yet.");
  console.log(reviewSummary(verbose));
  console.log(`browserQa reports=${countJsonFiles(path.join(artifactBase, "browser-qa"))}`);
  console.log(`contexts saved=${countJsonFiles(path.join(artifactBase, "contexts"))}`);
  console.log(`artifactFreshness latest=${latestMtimeIso(artifactBase)}`);
  process.exit(0);
}

const { ledgerParseErrors, ledgers } = await loadLedgers(base, files);
for (const ledger of ledgers.slice(0, limit)) {
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
console.log(`staleRuns=${ledgers.filter(staleRun).length} thresholdHours=${staleHours}`);
