#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { fileInfo, fileSha256, isFreshIso, nowIso, resolveContainedPath } from "./lib/evidence-trace.mjs";
import { readStdinJson as readSharedStdinJson } from "./lib/read-stdin.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const strict = args.includes("--strict");

function artifactDir() {
  return process.env.ETRNL_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts");
}

function reportsDir() {
  return path.join(artifactDir(), "browser-qa");
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseJsonArg(flag, fallback = undefined) {
  const raw = argValue(args, flag);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${flag} must be valid JSON: ${detail}`);
    process.exit(2);
  }
}

function hasCheckedSummary(value) {
  const summary = String(value || "").trim().toLowerCase();
  return summary.length > 0
    && !["not checked", "unchecked", "not run", "n/a", "na", "none"].includes(summary);
}

function artifactRoot() {
  return path.resolve(argValue(args, "--artifact-root", artifactDir()));
}

function maxAgeMs() {
  const raw = argValue(args, "--max-age-minutes", process.env.ETRNL_BROWSER_QA_MAX_AGE_MINUTES || "1440");
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 24 * 60 * 60 * 1000;
}

function readStdinJson() {
  return readSharedStdinJson({ emptyValue: {} });
}

function hasCliCreateArgs() {
  return Boolean(
    argValue(args, "--path")
    || argValue(args, "--id")
    || argValue(args, "--routes")
    || argValue(args, "--route")
    || argValue(args, "--viewports")
    || argValue(args, "--viewport")
    || argValue(args, "--matrix")
    || argValue(args, "--schema-version")
    || argValue(args, "--target-url")
    || argValue(args, "--tool")
    || argValue(args, "--provenance")
    || argValue(args, "--status")
    || argValue(args, "--console")
    || argValue(args, "--network")
  );
}

function readCreateInput() {
  if (process.stdin.isTTY) {
    return readStdinJson();
  }
  if (hasCliCreateArgs()) {
    return readSharedStdinJson({
      emptyValue: {},
      maxWaitMs: 100,
      onReadError: () => {},
    });
  }
  return readStdinJson();
}

function defaultMatrix(routes, viewports) {
  return routes.flatMap((route) => viewports.map((viewport) => ({
    route,
    viewport,
    status: "draft",
    screenshot: "",
    consoleErrors: null,
    failedRequests: null,
    notes: "",
  })));
}

function hasV2Input(input) {
  const explicitSchemaVersion = argValue(args, "--schema-version") || input.schemaVersion;
  if (explicitSchemaVersion !== undefined && explicitSchemaVersion !== null && explicitSchemaVersion !== "") {
    const schemaVersion = Number(explicitSchemaVersion);
    if (![1, 2].includes(schemaVersion)) {
      console.error("schemaVersion must be 1 or 2");
      process.exit(2);
    }
    return schemaVersion === 2;
  }
  return Array.isArray(input.matrix)
    || Boolean(argValue(args, "--matrix"))
    || Boolean(argValue(args, "--target-url"))
    || Boolean(argValue(args, "--tool"))
    || Boolean(argValue(args, "--provenance"));
}

function screenshotHash(row) {
  return evidenceHash(row, "screenshot", true);
}

function evidenceHash(row, field, includeLegacySha = false) {
  return row[`${field}Sha256`] || row[`${field}Hash`] || (includeLegacySha ? row.sha256 : "") || "";
}

function matrixKey(route, viewport) {
  return JSON.stringify([route, viewport]);
}

function validateCompleteMatrix(report, errors) {
  if (report.status !== "complete") return;
  if (!Array.isArray(report.routes) || !Array.isArray(report.viewports) || !Array.isArray(report.matrix)) return;
  const expected = new Map();
  for (const route of report.routes) {
    for (const viewport of report.viewports) {
      expected.set(matrixKey(route, viewport), { route, viewport });
    }
  }
  const observed = new Map();
  for (const row of report.matrix) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    if (typeof row.route !== "string" || typeof row.viewport !== "string") continue;
    const key = matrixKey(row.route, row.viewport);
    const current = observed.get(key) || { route: row.route, viewport: row.viewport, count: 0 };
    current.count += 1;
    observed.set(key, current);
  }
  for (const expectedEntry of expected.values()) {
    const seen = observed.get(matrixKey(expectedEntry.route, expectedEntry.viewport));
    if (!seen) {
      errors.push(`matrix missing route ${expectedEntry.route} viewport ${expectedEntry.viewport}`);
    } else if (seen.count > 1) {
      errors.push(`matrix contains duplicate route ${expectedEntry.route} viewport ${expectedEntry.viewport}`);
    }
  }
  for (const entry of observed.values()) {
    if (!expected.has(matrixKey(entry.route, entry.viewport))) {
      errors.push(`matrix contains extra route ${entry.route} viewport ${entry.viewport}`);
    }
  }
}

function reportErrors(report, options = {}) {
  const errors = [];
  const root = path.resolve(options.artifactRoot || artifactRoot());
  if (![1, 2].includes(report.schemaVersion)) errors.push("schemaVersion must be 1 or 2");
  if (!report.reportId) errors.push("reportId is required");
  if (!Array.isArray(report.routes) || report.routes.length === 0) errors.push("routes must be a non-empty array");
  if (!Array.isArray(report.viewports) || report.viewports.length === 0) errors.push("viewports must be a non-empty array");
  if (!Array.isArray(report.findings)) errors.push("findings must be an array");
  if (!Array.isArray(report.screenshots)) errors.push("screenshots must be an array");
  if (report.schemaVersion === 2) {
    if (!Array.isArray(report.matrix)) errors.push("matrix must be an array");
    if (report.provenance !== undefined && (typeof report.provenance !== "object" || report.provenance === null || Array.isArray(report.provenance))) {
      errors.push("provenance must be an object");
    }
    if (report.status === "complete") {
      if (!existsSync(root)) errors.push(`artifactRoot does not exist: ${root}`);
      const provenance = report.provenance;
      for (const key of ["tool", "targetUrl", "command", "capturedAt"]) {
        if (!provenance || typeof provenance[key] !== "string" || provenance[key].trim() === "") {
          errors.push(`complete v2 reports require provenance.${key}`);
        }
      }
      if (provenance?.capturedAt && !isFreshIso(provenance.capturedAt, maxAgeMs())) {
        errors.push("complete v2 reports require fresh provenance.capturedAt");
      }
    }
    if (Array.isArray(report.matrix)) {
      if (report.status === "complete" && report.matrix.length === 0) errors.push("complete reports require a non-empty matrix");
      for (const [index, row] of report.matrix.entries()) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          errors.push(`matrix[${index}] must be an object`);
          continue;
        }
        if (typeof row.route !== "string" || row.route.trim() === "") errors.push(`matrix[${index}].route is required`);
        if (typeof row.viewport !== "string" || row.viewport.trim() === "") errors.push(`matrix[${index}].viewport is required`);
        if (report.status === "complete") {
          if (!["passed", "failed", "blocked", "skipped"].includes(String(row.status || ""))) {
            errors.push(`matrix[${index}].status must be passed, failed, blocked, or skipped`);
          }
          if (!Number.isFinite(row.consoleErrors)) errors.push(`matrix[${index}].consoleErrors must be a number`);
          if (!Number.isFinite(row.failedRequests)) errors.push(`matrix[${index}].failedRequests must be a number`);
          if (row.status !== "skipped") {
            const screenshot = String(row.screenshot || "").trim();
            if (!screenshot) {
              errors.push(`matrix[${index}].screenshot is required for complete non-skipped rows`);
            } else if (existsSync(root)) {
              try {
                const contained = resolveContainedPath(root, screenshot);
                if (!contained.ok) {
                  errors.push(`matrix[${index}].screenshot invalid: ${contained.error}`);
                } else {
                  const info = fileInfo(contained.path);
                  if (!info.isFile || info.size <= 0) {
                    errors.push(`matrix[${index}].screenshot must be a non-empty file`);
                  } else {
                    const expectedHash = screenshotHash(row);
                    if (!expectedHash) {
                      errors.push(`matrix[${index}].screenshotSha256 is required`);
                    } else {
                      const actualHash = fileSha256(contained.path);
                      if (actualHash !== expectedHash) errors.push(`matrix[${index}].screenshotSha256 does not match screenshot file`);
                    }
                  }
                }
              } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                errors.push(`matrix[${index}].screenshot invalid: ${detail}`);
              }
            }
            if (!row.capturedAt || !isFreshIso(row.capturedAt, maxAgeMs())) {
              errors.push(`matrix[${index}].capturedAt must be a fresh ISO timestamp`);
            }
            for (const field of ["trace", "video"]) {
              const artifact = String(row[field] || "").trim();
              if (!artifact) continue;
              const contained = resolveContainedPath(root, artifact);
              if (!contained.ok) {
                errors.push(`matrix[${index}].${field} invalid: ${contained.error}`);
                continue;
              }
              const info = fileInfo(contained.path);
              if (!info.isFile || info.size <= 0) {
                errors.push(`matrix[${index}].${field} must be a non-empty file`);
                continue;
              }
              const expectedHash = evidenceHash(row, field);
              if (!expectedHash) {
                errors.push(`matrix[${index}].${field}Sha256 is required when ${field} is present`);
              } else if (fileSha256(contained.path) !== expectedHash) {
                errors.push(`matrix[${index}].${field}Sha256 does not match ${field} file`);
              }
            }
            if (row.pageErrors !== undefined) {
              if (!Array.isArray(row.pageErrors)) errors.push(`matrix[${index}].pageErrors must be an array when provided`);
              else if (row.status === "passed" && row.pageErrors.length > 0) errors.push(`matrix[${index}].pageErrors must be empty for passed rows`);
            }
          }
        }
      }
      validateCompleteMatrix(report, errors);
    }
  }
  if (report.status === "complete") {
    if (!hasCheckedSummary(report.consoleSummary)) {
      errors.push("complete reports require consoleSummary from a real console check");
    }
    if (!hasCheckedSummary(report.networkSummary)) {
      errors.push("complete reports require networkSummary from a real network check");
    }
  }
  return errors;
}

function writeReport(report) {
  const file = argValue(args, "--path") || path.join(reportsDir(), `${report.reportId}.json`);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

function create() {
  const input = readCreateInput();
  const routes = input.routes || splitList(argValue(args, "--routes", argValue(args, "--route", "/")));
  const viewports = input.viewports || splitList(argValue(args, "--viewports", argValue(args, "--viewport", "desktop")));
  const schemaVersion = hasV2Input(input) ? 2 : 1;
  const report = {
    schemaVersion,
    reportId: input.reportId || argValue(args, "--id", `browser-qa-${Date.now()}`),
    runId: input.runId || argValue(args, "--run-id"),
    createdAt: input.createdAt || nowIso(),
    routes,
    viewports,
    screenshots: input.screenshots || splitList(argValue(args, "--screenshots")),
    findings: input.findings || [],
    consoleSummary: input.consoleSummary || argValue(args, "--console", "not checked"),
    networkSummary: input.networkSummary || argValue(args, "--network", "not checked"),
    accessibilitySummary: input.accessibilitySummary || argValue(args, "--accessibility", "not checked"),
    responsiveSummary: input.responsiveSummary || argValue(args, "--responsive", "not checked"),
    status: input.status || argValue(args, "--status", "draft"),
  };
  if (schemaVersion === 2) {
    report.targetUrl = input.targetUrl || argValue(args, "--target-url");
    report.tool = input.tool || argValue(args, "--tool", "browser-qa-report");
    report.matrix = input.matrix || parseJsonArg("--matrix", defaultMatrix(routes, viewports));
    report.provenance = input.provenance || parseJsonArg("--provenance", {
      tool: report.tool,
      targetUrl: report.targetUrl,
      command: "browser-qa-report create",
      createdBy: "eternal-stack",
      capturedAt: nowIso(),
    });
  }
  const errors = reportErrors(report, { artifactRoot: artifactRoot() });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  writeReport(report);
}

function validate() {
  const file = args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, "--path");
  if (!file) {
    console.error("browser-qa-report validate requires a file path.");
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(file, "utf8"));
  const errors = reportErrors(report, { artifactRoot: artifactRoot() });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Browser QA report valid: ${file}`);
}

function migrate() {
  const source = args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, "--source");
  if (!source) {
    console.error("browser-qa-report migrate requires a source file path.");
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(source, "utf8"));
  const routes = Array.isArray(report.routes) ? report.routes : [];
  const viewports = Array.isArray(report.viewports) ? report.viewports : [];
  const sourceMatrix = Array.isArray(report.matrix) && report.matrix.length > 0
    ? report.matrix
    : defaultMatrix(routes, viewports);
  const migrated = {
    ...report,
    schemaVersion: 2,
    reportId: `${report.reportId || path.basename(source, ".json")}-v2`,
    migratedAt: nowIso(),
    migratedFrom: {
      schemaVersion: report.schemaVersion,
      path: source,
    },
    routes,
    viewports,
    matrix: sourceMatrix.map((row) => ({
      ...row,
      consoleErrors: row.consoleErrors ?? 0,
      failedRequests: row.failedRequests ?? 0,
      notes: [row.notes, "migrated from v1 report summary"].filter(Boolean).join("; "),
    })),
    provenance: report.provenance || {
      command: "browser-qa-report migrate",
      source,
    },
    status: report.status === "complete" ? "draft" : report.status || "draft",
  };
  const errors = reportErrors(migrated, { artifactRoot: artifactRoot() });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  writeReport(migrated);
}

function summary() {
  if (!existsSync(reportsDir())) {
    console.log("browserQa reports=0 openFindings=0");
    return;
  }
  const files = readdirSync(reportsDir()).filter((file) => file.endsWith(".json"));
  let openFindings = 0;
  let validReports = 0;
  let skipped = 0;
  const skippedFiles = [];
  for (const file of files) {
    let report;
    try {
      report = JSON.parse(readFileSync(path.join(reportsDir(), file), "utf8"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Skipping invalid report ${file}: ${detail}`);
      skipped += 1;
      skippedFiles.push(file);
      continue;
    }
    validReports += 1;
    const findings = Array.isArray(report.findings) ? report.findings : [];
    openFindings += findings.filter((finding) => finding.status !== "fixed").length;
  }
  console.log(`browserQa reports=${validReports} openFindings=${openFindings}`);
  if (skipped > 0) {
    console.error(`browserQa warning: skippedReports=${skipped} files=${skippedFiles.join(",")}`);
    if (strict) {
      process.exit(1);
    }
  }
}

function hashFile() {
  const file = args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, "--path");
  if (!file) {
    console.error("browser-qa-report hash requires a file path.");
    process.exit(2);
  }
  console.log(fileSha256(file));
}

if (command === "create") create();
else if (command === "validate") validate();
else if (command === "migrate") migrate();
else if (command === "summary") summary();
else if (command === "hash") hashFile();
else {
  console.error("usage: browser-qa-report.mjs create|validate|migrate|summary|hash [--strict]");
  process.exit(2);
}
