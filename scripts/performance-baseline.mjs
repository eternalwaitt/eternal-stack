#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { nowIso } from "./lib/evidence-trace.mjs";

const args = process.argv.slice(2);
const command = args[0] || "validate";

function artifactDir() {
  return process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
}

function baselinesDir() {
  return path.join(artifactDir(), "performance-baselines");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
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
  const issues = errors(readJson(file));
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log(`Performance baseline valid: ${file}`);
}

function trend() {
  const before = readJson(argValue(args, "--before"));
  const after = readJson(argValue(args, "--after"));
  const beforeByKey = new Map(before.measurements.map((row) => [row.route || row.operation, row]));
  const comparisons = after.measurements.map((row) => {
    const key = row.route || row.operation;
    const prev = beforeByKey.get(key);
    const deltaMs = prev ? row.durationMs - prev.durationMs : null;
    const deltaPct = prev && prev.durationMs > 0 ? (deltaMs / prev.durationMs) * 100 : null;
    return { key, beforeMs: prev?.durationMs ?? null, afterMs: row.durationMs, deltaMs, deltaPct };
  });
  console.log(JSON.stringify({ schemaVersion: 1, command: "trend", comparisons }, null, 2));
}

function create() {
  let input = {};
  if (!process.stdin.isTTY) {
    try {
      input = JSON.parse(readFileSync(0, "utf8") || "{}");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`performance-baseline invalid JSON from stdin: ${message}`);
      process.exit(2);
    }
  }
  const report = {
    schemaVersion: 1,
    baselineId: input.baselineId || argValue(args, "--id", `perf-baseline-${Date.now()}`),
    targetLabel: input.targetLabel || argValue(args, "--target", "target"),
    capturedAt: input.capturedAt || nowIso(),
    measurements: input.measurements || [],
    nextRun: input.nextRun || {
      command: argValue(args, "--next-command", ""),
      thresholds: { maxRegressionPct: Number(argValue(args, "--max-regression-pct", "20")) },
    },
  };
  const issues = errors(report);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  mkdirSync(baselinesDir(), { recursive: true, mode: 0o700 });
  const file = argValue(args, "--path", path.join(baselinesDir(), `${report.baselineId}.json`));
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

try {
  if (command === "validate") validate();
  else if (command === "trend") trend();
  else if (command === "create") create();
  else {
    console.error("usage: performance-baseline.mjs create|validate|trend");
    process.exit(2);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`performance-baseline failed: ${message}`);
  process.exit(2);
}
