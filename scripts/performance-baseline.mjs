#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { nowIso } from "./lib/evidence-trace.mjs";

const args = process.argv.slice(2);
const command = args[0] || "validate";

function artifactDir() {
  return process.env.ETRNL_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts");
}

function baselinesDir() {
  return path.join(artifactDir(), "performance-baselines");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readablePath(flag) {
  const file = argValue(args, flag);
  if (!file) {
    console.error(`performance-baseline trend requires ${flag} <file>.`);
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`performance-baseline trend file not found for ${flag}: ${file}`);
    process.exit(2);
  }
  return file;
}

function readTrendReport(flag) {
  const file = readablePath(flag);
  const report = readJson(file);
  if (!Array.isArray(report.measurements)) {
    console.error(`performance-baseline trend ${flag} file must contain a measurements array: ${file}`);
    process.exit(2);
  }
  return report;
}

function errors(report) {
  const out = [];
  if (report.schemaVersion !== 1) out.push("schemaVersion must be 1");
  if (!report.baselineId) out.push("baselineId is required");
  if (!report.targetLabel) out.push("targetLabel is required");
  if (!Array.isArray(report.measurements) || report.measurements.length === 0) out.push("measurements must be non-empty");
  for (const [index, row] of (report.measurements || []).entries()) {
    if (!row.route && !row.operation) out.push(`measurements[${index}] requires route or operation`);
    if (!Number.isFinite(row.durationMs) || row.durationMs < 0) out.push(`measurements[${index}].durationMs must be a non-negative number`);
    if (row.responseBytes !== undefined && (!Number.isFinite(row.responseBytes) || row.responseBytes < 0)) out.push(`measurements[${index}].responseBytes must be non-negative when provided`);
    if (!row.capturedAt) out.push(`measurements[${index}].capturedAt is required`);
  }
  if (report.nextRun !== undefined) {
    if (!report.nextRun.command) out.push("nextRun.command is required when nextRun exists");
    if (!report.nextRun.thresholds || typeof report.nextRun.thresholds !== "object") out.push("nextRun.thresholds is required when nextRun exists");
  }
  return out;
}

function validate() {
  const file = args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, "--path");
  if (!file) {
    console.error("performance-baseline validate requires a file path.");
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`performance-baseline validate: file not found: ${file}`);
    process.exit(2);
  }
  const issues = errors(readJson(file));
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log(`Performance baseline valid: ${file}`);
}

function trend() {
  const before = readTrendReport("--before");
  const after = readTrendReport("--after");
  const beforeByKey = new Map(before.measurements.map((row) => [row.route || row.operation, row]));
  const afterKeys = new Set(after.measurements.map((row) => row.route || row.operation));
  const comparisons = after.measurements.map((row) => {
    const key = row.route || row.operation;
    const prev = beforeByKey.get(key);
    const deltaMs = prev ? row.durationMs - prev.durationMs : null;
    const deltaPct = prev && prev.durationMs > 0 ? (deltaMs / prev.durationMs) * 100 : null;
    return { key, beforeMs: prev?.durationMs ?? null, afterMs: row.durationMs, deltaMs, deltaPct };
  });
  for (const [key, prev] of beforeByKey.entries()) {
    if (!afterKeys.has(key)) {
      comparisons.push({ key, beforeMs: prev.durationMs, afterMs: null, deltaMs: null, deltaPct: null, removed: true });
    }
  }
  console.log(JSON.stringify({ schemaVersion: 1, command: "trend", comparisons }, null, 2));
}

function readJsonFromStdin() {
  if (process.stdin.isTTY) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let input = "";
    const timeoutMs = Number(process.env.ETRNL_STDIN_TIMEOUT_MS || "5000");
    const timer = setTimeout(() => {
      reject(new Error("stdin did not close; pipe JSON and close stdin/EOF"));
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      try {
        if (!input.trim()) {
          reject(new Error("stdin closed without JSON; pipe JSON and close stdin/EOF"));
          return;
        }
        resolve(JSON.parse(input));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function create() {
  let input = {};
  try {
    input = await readJsonFromStdin();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`performance-baseline invalid JSON from stdin or missing EOF: ${message}`);
    process.exit(2);
  }
  const nextCommand = argValue(args, "--next-command", "");
  const report = {
    schemaVersion: 1,
    baselineId: input.baselineId || argValue(args, "--id", `perf-baseline-${Date.now()}`),
    targetLabel: input.targetLabel || argValue(args, "--target", "target"),
    capturedAt: input.capturedAt || nowIso(),
    measurements: input.measurements || [],
  };
  if (input.nextRun !== undefined) {
    report.nextRun = input.nextRun;
  } else if (nextCommand) {
    report.nextRun = {
      command: nextCommand,
      thresholds: { maxRegressionPct: Number(argValue(args, "--max-regression-pct", "20")) },
    };
  }
  const issues = errors(report);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  const previousUmask = process.umask(0o077);
  try {
    mkdirSync(path.dirname(baselinesDir()), { recursive: true, mode: 0o700 });
    mkdirSync(baselinesDir(), { recursive: true, mode: 0o700 });
  } finally {
    process.umask(previousUmask);
  }
  const file = argValue(args, "--path", path.join(baselinesDir(), `${report.baselineId}.json`));
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

try {
  if (command === "validate") validate();
  else if (command === "trend") trend();
  else if (command === "create") await create();
  else {
    console.error("usage: performance-baseline.mjs create|validate|trend");
    process.exit(2);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`performance-baseline failed: ${message}`);
  process.exit(2);
}
