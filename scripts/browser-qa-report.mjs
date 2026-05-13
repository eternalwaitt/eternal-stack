#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const strict = args.includes("--strict");

function artifactDir() {
  return process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
}

function reportsDir() {
  return path.join(artifactDir(), "browser-qa");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readStdinJson() {
  if (process.stdin.isTTY) return {};
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Invalid JSON on stdin: ${detail}`);
    process.exit(2);
  }
}

function reportErrors(report) {
  const errors = [];
  if (report.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!report.reportId) errors.push("reportId is required");
  if (!Array.isArray(report.routes) || report.routes.length === 0) errors.push("routes must be a non-empty array");
  if (!Array.isArray(report.viewports) || report.viewports.length === 0) errors.push("viewports must be a non-empty array");
  if (!Array.isArray(report.findings)) errors.push("findings must be an array");
  if (!Array.isArray(report.screenshots)) errors.push("screenshots must be an array");
  return errors;
}

function writeReport(report) {
  const file = argValue(args, "--path") || path.join(reportsDir(), `${report.reportId}.json`);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

function create() {
  const input = readStdinJson();
  const report = {
    schemaVersion: 1,
    reportId: input.reportId || argValue(args, "--id", `browser-qa-${Date.now()}`),
    runId: input.runId || argValue(args, "--run-id"),
    createdAt: input.createdAt || nowIso(),
    routes: input.routes || splitList(argValue(args, "--routes", argValue(args, "--route", "/"))),
    viewports: input.viewports || splitList(argValue(args, "--viewports", argValue(args, "--viewport", "desktop"))),
    screenshots: input.screenshots || splitList(argValue(args, "--screenshots")),
    findings: input.findings || [],
    consoleSummary: input.consoleSummary || argValue(args, "--console", "not checked"),
    networkSummary: input.networkSummary || argValue(args, "--network", "not checked"),
    accessibilitySummary: input.accessibilitySummary || argValue(args, "--accessibility", "not checked"),
    responsiveSummary: input.responsiveSummary || argValue(args, "--responsive", "not checked"),
    status: input.status || argValue(args, "--status", "draft"),
  };
  const errors = reportErrors(report);
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
  const errors = reportErrors(report);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Browser QA report valid: ${file}`);
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

if (command === "create") create();
else if (command === "validate") validate();
else if (command === "summary") summary();
else {
  console.error("usage: browser-qa-report.mjs create|validate|summary [--strict]");
  process.exit(2);
}
