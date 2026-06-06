#!/usr/bin/env node
import { homedir } from "node:os";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const strict = args.includes("--strict");
const sinceDays = Number(argValue(args, "--since-days", "3")) || 3;
const maxFiles = Number(argValue(args, "--max-files", "500")) || 500;
const maxFileBytes = Number(argValue(args, "--max-file-bytes", process.env.CLAUDE_CONTROL_PLANE_HOOK_LOG_MAX_BYTES || "52428800")) || 52_428_800;
const maxNonBlocking = Number(argValue(args, "--max-non-blocking", "-1"));
const maxBlocking = Number(argValue(args, "--max-blocking", "-1"));
const root = expandHome(argValue(args, "--root", process.env.CLAUDE_HOME || "~/.claude"));
const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

function expandHome(value) {
  if (!value.startsWith("~")) return value;
  return `${homePath()}${value.slice(1)}`;
}

function homePath() {
  return process.env.HOME || process.env.USERPROFILE || homedir() || "/tmp";
}

function redact(value) {
  return String(value || "")
    .replaceAll(homePath(), "~")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .slice(0, 220);
}

function increment(map, key) {
  const safeKey = redact(key || "<unknown>");
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function topEntries(map, limit = 10) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function findJsonlFiles(dir, out = [], visited = new Set()) {
  if (out.length >= maxFiles) return out;
  let realDir;
  try {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink()) return out;
    realDir = realpathSync(dir);
  } catch {
    return out;
  }
  if (visited.has(realDir)) return out;
  visited.add(realDir);
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) findJsonlFiles(path, out, visited);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(path);
    if (out.length >= maxFiles) break;
  }
  return out;
}

function findHookObjects(value, out = [], depth = 0) {
  if (!value || depth > 5) return out;
  if (Array.isArray(value)) {
    for (const item of value) findHookObjects(item, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  if (typeof value.type === "string" && value.type.startsWith("hook_")) out.push(value);
  for (const child of Object.values(value)) findHookObjects(child, out, depth + 1);
  return out;
}

function reasonFor(item) {
  const fields = [
    item.hookName,
    item.name,
    item.reason,
    item.error,
    item.message,
    item.stderr,
    item.stdout,
    item.content,
  ];
  const value = fields.find((field) => typeof field === "string" && field.trim());
  return redact(value || item.type || "<empty>");
}

function projectFor(file) {
  const marker = `${root}/projects/`;
  if (file.startsWith(marker)) return file.slice(marker.length).split("/").slice(0, -1).join("/") || "<root>";
  return relative(root, file).split("/").slice(0, -1).join("/") || "<root>";
}

function scan() {
  const files = findJsonlFiles(join(root, "projects")).filter((file) => {
    try {
      return statSync(file).mtimeMs >= cutoffMs;
    } catch {
      return false;
    }
  });
  const counters = { totalHookEvents: 0, nonBlocking: 0, blocking: 0, cancelled: 0, success: 0 };
  const projects = new Map();
  const reasons = new Map();
  const hooks = new Map();
  let linesScanned = 0;
  let parseErrors = 0;
  let skippedLargeFiles = 0;
  for (const file of files) {
    const project = projectFor(file);
    try {
      if (statSync(file).size > maxFileBytes) {
        skippedLargeFiles += 1;
        continue;
      }
    } catch {
      parseErrors += 1;
      continue;
    }
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      linesScanned += 1;
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        parseErrors += 1;
        continue;
      }
      for (const item of findHookObjects(payload)) {
        counters.totalHookEvents += 1;
        if (item.type === "hook_non_blocking_error") counters.nonBlocking += 1;
        if (item.type === "hook_blocking_error") counters.blocking += 1;
        if (item.type === "hook_cancelled") counters.cancelled += 1;
        if (item.type === "hook_success") counters.success += 1;
        increment(projects, project);
        increment(hooks, item.hookName || item.name || item.type);
        increment(reasons, reasonFor(item));
      }
    }
  }
  const violations = [];
  if (maxNonBlocking >= 0 && counters.nonBlocking > maxNonBlocking) violations.push("non_blocking_over_limit");
  if (maxBlocking >= 0 && counters.blocking > maxBlocking) violations.push("blocking_over_limit");
  return {
    schemaVersion: 1,
    command: "live-hook-noise-report",
    sinceDays,
    root: redact(root),
    filesScanned: files.length,
    linesScanned,
    parseErrors,
    skippedLargeFiles,
    counts: counters,
    topReasons: topEntries(reasons),
    topProjects: topEntries(projects),
    topHooks: topEntries(hooks),
    strict,
    violations,
  };
}

function emit(report) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`live-hook-noise files=${report.filesScanned} lines=${report.linesScanned}`);
  console.log(`hooks total=${report.counts.totalHookEvents} nonBlocking=${report.counts.nonBlocking} blocking=${report.counts.blocking}`);
  for (const item of report.topReasons.slice(0, 5)) console.log(`reason ${item.count}: ${item.value}`);
  for (const item of report.violations) console.log(`violation: ${item}`);
}

const report = scan();
emit(report);
if (strict && report.violations.length > 0) process.exit(1);
