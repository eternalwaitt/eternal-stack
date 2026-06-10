#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const RESOLVED = new Set(["resolved", "fixed", "auto-fixed", "false-positive", "skipped"]);
const ALLOWED_SEVERITIES = new Set(["critical", "p0", "p1", "p2", "p3", "major", "minor", "trivial", "warning", "info"]);
const ALLOWED_STATUSES = new Set(["open", "triaged", "in-progress", "resolved", "fixed", "auto-fixed", "false-positive", "skipped"]);
const ALLOWED_ACTIONS = new Set(["unresolved", "triaged", "resolved", "fixed", "auto-fixed", "false-positive", "skipped"]);

function artifactDir() {
  return process.env.ETRNL_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts");
}

function logPath() {
  return readArgValue(args, "--path") || path.join(artifactDir(), "review-log.jsonl");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/sk[_-][A-Za-z0-9_-]{12,}/g, "[REDACTED_SECRET]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/g, "[REDACTED_SECRET]")
    .replace(/glpat-[A-Za-z0-9_-]{12,}/g, "[REDACTED_SECRET]")
    .replace(/npm_[A-Za-z0-9]{12,}/g, "[REDACTED_SECRET]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/g, "[REDACTED_SECRET]")
    .replace(/AKIA[A-Z0-9]{16}/g, "[REDACTED_SECRET]")
    .replace(/(aws_secret_access_key\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}(["']?)/gi, "$1[REDACTED_SECRET]$2");
}

function fingerprint(record) {
  const seed = record.fingerprint || [
    record.path,
    record.line,
    record.category,
    record.finding,
  ].filter(Boolean).join(":");
  return createHash("sha256").update(seed || JSON.stringify(record)).digest("hex").slice(0, 16);
}

function readEntries(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error.message}`);
    }
  });
}

function validateEnumArg(flagName, rawValue, allowedValues) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (allowedValues.has(normalized)) return normalized;
  throw new Error(`review-log add invalid ${flagName}: ${JSON.stringify(rawValue)} (allowed: ${[...allowedValues].join(", ")})`);
}

function validateCategoryArg(rawValue) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) return normalized;
  throw new Error(
    `review-log add invalid --category: ${JSON.stringify(rawValue)} (must match /^[a-z0-9][a-z0-9._-]{0,63}$/)`,
  );
}

function addEntry() {
  const file = logPath();
  const finding = readArgValue(args, "--finding");
  if (!finding) {
    console.error("review-log add requires --finding.");
    process.exit(2);
  }
  let severity;
  let status;
  let action;
  let category;
  try {
    severity = validateEnumArg("--severity", readArgValue(args, "--severity", "info"), ALLOWED_SEVERITIES);
    status = validateEnumArg("--status", readArgValue(args, "--status", "open"), ALLOWED_STATUSES);
    action = validateEnumArg("--action", readArgValue(args, "--action", "unresolved"), ALLOWED_ACTIONS);
    category = validateCategoryArg(readArgValue(args, "--category", "review"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const record = redact({
    schemaVersion: 1,
    id: `review-${Date.now()}`,
    runId: readArgValue(args, "--run-id"),
    planPath: readArgValue(args, "--plan"),
    specialist: readArgValue(args, "--specialist", "general"),
    severity,
    status,
    action,
    category,
    path: readArgValue(args, "--file"),
    line: readArgValue(args, "--line"),
    finding,
    verification: readArgValue(args, "--verification"),
    at: nowIso(),
  });
  record.fingerprint = fingerprint(record);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(record)}\n`, { flag: "a", mode: 0o600 });
  console.log(record.fingerprint);
}

function validate() {
  const entries = readEntries(logPath());
  const errors = [];
  for (const entry of entries) {
    if (entry.schemaVersion !== 1) errors.push(`${entry.id || "<unknown>"} missing schemaVersion`);
    if (!entry.fingerprint) errors.push(`${entry.id || "<unknown>"} missing fingerprint`);
    if (!entry.finding) errors.push(`${entry.id || "<unknown>"} missing finding`);
  }
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Review log valid: ${entries.length} entries`);
}

function summary() {
  const entries = readEntries(logPath());
  const unresolved = entries.filter((entry) => !RESOLVED.has(String(entry.status || entry.action || "").toLowerCase()));
  const critical = unresolved.filter((entry) => /critical|p0|p1/i.test(entry.severity || "")).length;
  console.log(`reviewLog entries=${entries.length} unresolved=${unresolved.length} critical=${critical}`);
}

if (command === "add") addEntry();
else if (command === "validate") validate();
else if (command === "summary") summary();
else {
  console.error("usage: review-log.mjs add|validate|summary [--path file]");
  process.exit(2);
}
