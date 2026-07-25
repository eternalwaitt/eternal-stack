#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { nowIso } from "./lib/evidence-trace.mjs";
import { UX_FINDING_STATUSES, UX_FINDING_STATUS_SET, UX_SEVERITIES } from "./lib/ux-finding-taxonomy.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";
const jsonOutput = args.includes("--json");
const UX_CATEGORY_ID = "ui-ux-product";

function usage() {
  console.error([
    "usage: ux-audit-check.mjs <command> [options]",
    "",
    "commands:",
    "  coverage --inventory <file> --artifact <file> [--json]",
    "  baseline --artifact <file> [--path <file>] [--id <id>] [--target <label>]",
    "  validate-baseline <file>",
    "  trend --before <file> --after <file>",
  ].join("\n"));
  process.exit(2);
}

function readJson(flag, positional = false) {
  const file = positional && args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, flag);
  if (!file) {
    console.error(`ux-audit-check ${command} requires ${flag} <file>.`);
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`ux-audit-check ${command} file not found: ${file}`);
    process.exit(2);
  }
  try {
    return { file, data: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    console.error(`ux-audit-check ${command} cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uxReport(artifact) {
  return asArray(artifact.categoryReports).find((report) => report.categoryId === UX_CATEGORY_ID);
}

function defect(code, detail, fix) {
  return { code, detail, fix };
}

function integer(value) {
  return Number.isInteger(value) ? value : null;
}

function exceptionCount(report, kind) {
  return asArray(report.coverageExceptions)
    .filter((entry) => entry?.kind === kind && String(entry?.reason || "").trim().length > 0)
    .reduce((total, entry) => total + (integer(entry.count) || 0), 0);
}

function checkDimension(report, defects, kind, totalField, coveredField) {
  const total = integer(report.coverage?.[totalField]);
  const covered = integer(report.coverage?.[coveredField]);
  if (total === null || covered === null) {
    defects.push(defect("missing-coverage-counters", `coverage.${totalField} and coverage.${coveredField} must be integers`, `Add integer coverage.${totalField} and coverage.${coveredField} to the ${UX_CATEGORY_ID} report.`));
    return;
  }
  const excepted = exceptionCount(report, kind);
  if (covered + excepted < total) {
    defects.push(defect(
      `uncovered-${kind}`,
      `${covered} of ${total} ${kind} dispositioned, ${excepted} carried a coverageExceptions reason`,
      `Audit the remaining ${total - covered - excepted} ${kind} or add coverageExceptions rows of kind ${kind} with a reason and count.`,
    ));
  }
}

function coverageDefects(inventory, artifact) {
  const defects = [];
  const report = uxReport(artifact);
  if (!report) {
    defects.push(defect("missing-ux-category-report", `artifact has no ${UX_CATEGORY_ID} category report`, `Add a categoryReports entry for ${UX_CATEGORY_ID}.`));
    return defects;
  }
  if (!report.coverage || typeof report.coverage !== "object" || Array.isArray(report.coverage)) {
    defects.push(defect("missing-coverage-counters", "coverage object is missing", "Add a coverage object with route, surface, and state-cell counters."));
    return defects;
  }
  const inventoryRoutes = integer(inventory.worklists?.ux_routes?.count);
  const reportRoutes = integer(report.coverage.routesTotal);
  if (inventoryRoutes !== null && reportRoutes !== null && inventoryRoutes !== reportRoutes) {
    defects.push(defect("route-inventory-mismatch", `inventory lists ${inventoryRoutes} routes, report claims ${reportRoutes}`, "Regenerate the report from the current ux-inventory worklists."));
  }
  const inventoryHash = inventory.worklists?.ux_routes?.sha256;
  const consumedHash = report.consumedWorklistHashes?.ux_routes;
  if (inventoryHash && consumedHash && inventoryHash !== consumedHash) {
    defects.push(defect("worklist-hash-mismatch", "consumedWorklistHashes.ux_routes does not match the inventory hash", "Consume the shared ux_routes worklist hash produced by ux-inventory.mjs."));
  }
  checkDimension(report, defects, "routes", "routesTotal", "routesCovered");
  checkDimension(report, defects, "surfaces", "surfacesTotal", "surfacesCovered");
  checkDimension(report, defects, "state-cells", "stateCellsTotal", "stateCellsCovered");

  const inventoryAxes = inventory.axes && typeof inventory.axes === "object" ? inventory.axes : {};
  const coveredAxes = report.coverage.axesCovered && typeof report.coverage.axesCovered === "object" ? report.coverage.axesCovered : {};
  for (const [axis, values] of Object.entries(inventoryAxes)) {
    const expected = asArray(values);
    const observed = asArray(coveredAxes[axis]);
    const missing = expected.filter((value) => !observed.includes(String(value)));
    if (missing.length > 0 && exceptionCount(report, `axis:${axis}`) === 0) {
      defects.push(defect("uncovered-axis", `axis ${axis} missing ${missing.join(", ")}`, `Exercise the missing ${axis} values or add a coverageExceptions row of kind axis:${axis}.`));
    }
  }
  if (!Array.isArray(report.quickWins)) {
    defects.push(defect("missing-quick-wins", "quickWins array is missing", "Add a quickWins array; an empty array states that no quick win survived triage."));
  }
  if (!Array.isArray(report.systemicFindings)) {
    defects.push(defect("missing-systemic-findings", "systemicFindings array is missing", "Add a systemicFindings array so repeated instances collapse into one row with an instance count."));
  }
  for (const [index, finding] of asArray(report.checks).flatMap((check) => asArray(check.findings)).entries()) {
    const status = String(finding?.status || "open");
    if (!UX_FINDING_STATUS_SET.has(status)) {
      defects.push(defect("invalid-finding-status", `finding ${index} uses status ${status}`, `Use one of: ${UX_FINDING_STATUSES.join(", ")}.`));
    }
  }
  return defects;
}

function runCoverage() {
  const inventory = readJson("--inventory").data;
  const { file, data } = readJson("--artifact");
  const defects = coverageDefects(inventory, data);
  if (jsonOutput) {
    console.log(JSON.stringify({ ok: defects.length === 0, artifactPath: file, defects }, null, 2));
  } else if (defects.length === 0) {
    console.log(`ok: ux coverage gate passed for ${file}`);
  } else {
    for (const item of defects) {
      console.error(`${item.code}: ${item.detail}`);
      console.error(`fix: ${item.fix}`);
    }
  }
  process.exit(defects.length === 0 ? 0 : 1);
}

function baselinesDir() {
  return path.join(
    process.env.ETRNL_ARTIFACTS_DIR
      || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts"),
    "ux-baselines",
  );
}

function severityCounts(report) {
  const counts = Object.fromEntries(UX_SEVERITIES.map((severity) => [severity, 0]));
  for (const check of asArray(report.checks)) {
    for (const finding of asArray(check.findings)) {
      const severity = String(finding?.severity || "");
      if (severity in counts) counts[severity] += 1;
    }
  }
  return counts;
}

function baselineErrors(baseline) {
  const out = [];
  if (baseline.schemaVersion !== 1) out.push("schemaVersion must be 1");
  if (!baseline.baselineId) out.push("baselineId is required");
  if (!baseline.targetLabel) out.push("targetLabel is required");
  if (!Array.isArray(baseline.scores) || baseline.scores.length === 0) out.push("scores must be non-empty");
  for (const [index, row] of asArray(baseline.scores).entries()) {
    if (!row.checkId) out.push(`scores[${index}].checkId is required`);
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 10) out.push(`scores[${index}].score must be between 0 and 10`);
  }
  if (!baseline.coverage || typeof baseline.coverage !== "object") out.push("coverage is required");
  return out;
}

function runBaseline() {
  const { data } = readJson("--artifact");
  const report = uxReport(data);
  if (!report) {
    console.error(`ux-audit-check baseline requires a ${UX_CATEGORY_ID} category report.`);
    process.exit(1);
  }
  const baseline = {
    schemaVersion: 1,
    baselineId: argValue(args, "--id", `ux-baseline-${Date.now()}`),
    targetLabel: argValue(args, "--target", data.targetLabel || "target"),
    capturedAt: nowIso(),
    coverage: report.coverage || {},
    severityCounts: severityCounts(report),
    scores: asArray(report.checks).map((check) => ({
      checkId: check.checkId,
      status: check.status,
      score: Number(check.uxHealthScore?.score ?? 0),
    })),
  };
  const issues = baselineErrors(baseline);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  const previousUmask = process.umask(0o077);
  try {
    mkdirSync(baselinesDir(), { recursive: true, mode: 0o700 });
  } finally {
    process.umask(previousUmask);
  }
  const file = argValue(args, "--path", path.join(baselinesDir(), `${baseline.baselineId}.json`));
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

function runValidateBaseline() {
  const { file, data } = readJson("--path", true);
  const issues = baselineErrors(data);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log(`UX baseline valid: ${file}`);
}

function runTrend() {
  const before = readJson("--before").data;
  const after = readJson("--after").data;
  const beforeScores = new Map(asArray(before.scores).map((row) => [row.checkId, row]));
  const comparisons = asArray(after.scores).map((row) => {
    const previous = beforeScores.get(row.checkId);
    return {
      checkId: row.checkId,
      beforeScore: previous ? previous.score : null,
      afterScore: row.score,
      delta: previous ? Number((row.score - previous.score).toFixed(2)) : null,
    };
  });
  const severityDelta = {};
  for (const severity of UX_SEVERITIES) {
    const beforeCount = Number(before.severityCounts?.[severity] ?? 0);
    const afterCount = Number(after.severityCounts?.[severity] ?? 0);
    severityDelta[severity] = { before: beforeCount, after: afterCount, delta: afterCount - beforeCount };
  }
  console.log(JSON.stringify({ schemaVersion: 1, command: "trend", comparisons, severityDelta }, null, 2));
}

try {
  if (command === "coverage") runCoverage();
  else if (command === "baseline") runBaseline();
  else if (command === "validate-baseline") runValidateBaseline();
  else if (command === "trend") runTrend();
  else usage();
} catch (error) {
  console.error(`ux-audit-check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
