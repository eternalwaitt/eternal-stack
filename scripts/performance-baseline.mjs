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
  const issues = errors(report);
  if (issues.length > 0) {
    console.error(`performance-baseline trend ${flag} file is invalid: ${file}\n${issues.join("\n")}`);
    process.exit(2);
  }
  return report;
}

const EVIDENCE_KINDS = new Set(["field", "lab", "trace", "runtime", "query_plan", "bundle"]);
const STATISTICS = new Set(["observation", "median", "p50", "p75", "p95", "p99", "max"]);
const UNITS = new Set(["ms", "bytes", "ratio", "score", "count", "percent"]);

function errorsV1(row, index, out) {
  if (!Number.isFinite(row.durationMs) || row.durationMs < 0) out.push(`measurements[${index}].durationMs must be a non-negative number`);
  if (row.responseBytes !== undefined && (!Number.isFinite(row.responseBytes) || row.responseBytes < 0)) out.push(`measurements[${index}].responseBytes must be non-negative when provided`);
}

function errorsV2(row, index, out) {
  if (!row.metric || typeof row.metric !== "string") out.push(`measurements[${index}].metric is required`);
  if (!Number.isFinite(row.value) || row.value < 0) out.push(`measurements[${index}].value must be a non-negative number`);
  if (!UNITS.has(row.unit)) out.push(`measurements[${index}].unit must be ms, bytes, ratio, score, count, or percent`);
  if (!EVIDENCE_KINDS.has(row.evidenceKind)) out.push(`measurements[${index}].evidenceKind is invalid`);
  if (!STATISTICS.has(row.statistic)) out.push(`measurements[${index}].statistic is invalid`);
  if (!row.conditions || typeof row.conditions !== "object" || Array.isArray(row.conditions)) {
    out.push(`measurements[${index}].conditions must be an object`);
  } else {
    if (!row.conditions.environment || typeof row.conditions.environment !== "string") out.push(`measurements[${index}].conditions.environment is required`);
    if (!row.conditions.sourceRevision || typeof row.conditions.sourceRevision !== "string") out.push(`measurements[${index}].conditions.sourceRevision is required`);
    if (row.conditions.cacheState !== undefined && !["process_cold", "cache_cold", "warm", "browser_cold"].includes(row.conditions.cacheState)) {
      out.push(`measurements[${index}].conditions.cacheState is invalid`);
    }
    if (row.evidenceKind === "field" && (!row.conditions.cohort || !row.conditions.window)) {
      out.push(`measurements[${index}] field evidence requires conditions.cohort and conditions.window`);
    }
  }
  const fieldCountUnavailable = row.evidenceKind === "field"
    && row.sampleCount === null
    && typeof row.conditions?.sampleCountUnavailableReason === "string"
    && row.conditions.sampleCountUnavailableReason.length > 0;
  if ((!Number.isInteger(row.sampleCount) || row.sampleCount < 1) && !fieldCountUnavailable) {
    out.push(`measurements[${index}].sampleCount must be a positive integer or field evidence must name why its provider count is unavailable`);
  }
  if (row.direction !== undefined && !["lower", "higher"].includes(row.direction)) out.push(`measurements[${index}].direction must be lower or higher`);
  if (row.evidenceKind === "lab" && String(row.metric).toLowerCase() === "inp") out.push(`measurements[${index}] cannot claim INP from lab evidence; use field or interaction trace evidence`);
  if (row.evidenceKind === "field" && ["lcp", "inp", "cls"].includes(String(row.metric).toLowerCase()) && row.statistic !== "p75") {
    out.push(`measurements[${index}] field Core Web Vitals must use statistic p75`);
  }
}

function errors(report) {
  const out = [];
  const rows = Array.isArray(report.measurements) ? report.measurements : [];
  if (![1, 2].includes(report.schemaVersion)) out.push("schemaVersion must be 1 or 2");
  if (!report.baselineId) out.push("baselineId is required");
  if (!report.targetLabel) out.push("targetLabel is required");
  if (!Array.isArray(report.measurements) || report.measurements.length === 0) out.push("measurements must be non-empty");
  for (const [index, row] of rows.entries()) {
    if (!row.route && !row.operation) out.push(`measurements[${index}] requires route or operation`);
    if (report.schemaVersion === 1) errorsV1(row, index, out);
    if (report.schemaVersion === 2) errorsV2(row, index, out);
    if (!row.capturedAt) out.push(`measurements[${index}].capturedAt is required`);
  }
  if (report.schemaVersion === 2) {
    const keys = new Set();
    for (const [index, row] of rows.entries()) {
      if (!row.conditions || typeof row.conditions !== "object" || Array.isArray(row.conditions)) continue;
      const key = measurementKey(report, row);
      if (keys.has(key)) out.push(`measurements[${index}] duplicates a metric and comparison-condition key`);
      keys.add(key);
    }
  }
  if (report.nextRun !== undefined) {
    if (!report.nextRun.command) out.push("nextRun.command is required when nextRun exists");
    if (!report.nextRun.thresholds || typeof report.nextRun.thresholds !== "object") out.push("nextRun.thresholds is required when nextRun exists");
    for (const threshold of ["noisePct", "minImprovementPct", "maxRegressionPct"]) {
      const value = report.nextRun.thresholds?.[threshold];
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) out.push(`nextRun.thresholds.${threshold} must be non-negative when provided`);
    }
  }
  return out;
}

function stableJson(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function measurementKey(report, row) {
  const target = row.route || row.operation;
  if (report.schemaVersion === 1) return target;
  const { sourceRevision: _sourceRevision, ...comparisonConditions } = row.conditions;
  return `${target}|${row.metric}|${row.unit}|${row.statistic}|${row.evidenceKind}|${row.direction || "lower"}|${stableJson(comparisonConditions)}`;
}

function measurementValue(report, row) {
  return report.schemaVersion === 1 ? row.durationMs : row.value;
}

function classifyDelta(row, prev, deltaPct, thresholds) {
  if (deltaPct === null) return "added";
  if (["lab", "runtime"].includes(row.evidenceKind) && (row.sampleCount < 3 || prev.sampleCount < 3)) return "inconclusive";
  const improvementPct = (row.direction || "lower") === "lower" ? -deltaPct : deltaPct;
  const noisePct = Number(thresholds.noisePct || 0);
  const minImprovementPct = Number(thresholds.minImprovementPct || noisePct);
  const maxRegressionPct = Number(thresholds.maxRegressionPct || 0);
  if (improvementPct <= -maxRegressionPct && maxRegressionPct > 0) return "regressed";
  if (improvementPct >= minImprovementPct && minImprovementPct > 0) return "improved";
  if (Math.abs(improvementPct) <= noisePct) return "no_change";
  return "inconclusive";
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
  if (before.schemaVersion !== after.schemaVersion) {
    console.error("performance-baseline trend requires matching schemaVersion values");
    process.exit(2);
  }
  if (before.targetLabel !== after.targetLabel) {
    console.error("performance-baseline trend requires matching targetLabel values");
    process.exit(2);
  }
  const thresholds = after.nextRun?.thresholds || {};
  const beforeByKey = new Map(before.measurements.map((row) => [measurementKey(before, row), row]));
  const afterKeys = new Set(after.measurements.map((row) => measurementKey(after, row)));
  const comparisons = after.measurements.map((row) => {
    const key = measurementKey(after, row);
    const prev = beforeByKey.get(key);
    const beforeValue = prev ? measurementValue(before, prev) : null;
    const afterValue = measurementValue(after, row);
    const delta = prev ? afterValue - beforeValue : null;
    const deltaPct = prev && beforeValue > 0 ? (delta / beforeValue) * 100 : null;
    const comparison = { key, beforeValue, afterValue, delta, deltaPct, verdict: classifyDelta(row, prev, deltaPct, thresholds) };
    if (after.schemaVersion === 2) Object.assign(comparison, {
      beforeRevision: prev?.conditions?.sourceRevision ?? null,
      afterRevision: row.conditions.sourceRevision,
    });
    if (after.schemaVersion === 1) Object.assign(comparison, { beforeMs: beforeValue, afterMs: afterValue, deltaMs: delta });
    return comparison;
  });
  for (const [key, prev] of beforeByKey.entries()) {
    if (!afterKeys.has(key)) {
      const beforeValue = measurementValue(before, prev);
      const comparison = { key, beforeValue, afterValue: null, delta: null, deltaPct: null, verdict: "removed", removed: true };
      if (after.schemaVersion === 1) Object.assign(comparison, { beforeMs: beforeValue, afterMs: null, deltaMs: null });
      comparisons.push(comparison);
    }
  }
  console.log(JSON.stringify({ schemaVersion: 2, baselineSchemaVersion: after.schemaVersion, command: "trend", comparisons }, null, 2));
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
        resolve(JSON.parse(input || "{}"));
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
  const inferredSchemaVersion = (input.measurements || []).some((row) => row.metric !== undefined || row.value !== undefined) ? 2 : 1;
  const report = {
    schemaVersion: input.schemaVersion || inferredSchemaVersion,
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
