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
const maxFileBytes = Number(argValue(args, "--max-file-bytes", process.env.ETRNL_HOOK_LOG_MAX_BYTES || "52428800")) || 52_428_800;
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
    .replace(new RegExp(homePath().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "~")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "<windows_path>")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<token>")
    .replace(/\b(?:sk_live_|sk_test_|sk-proj-|sk-ant-)[A-Za-z0-9_-]{12,}\b/g, "<api_key>")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, "<api_key>")
    .replace(/\b[0-9a-f]{32,64}\b/gi, "<hex_id>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .slice(0, 220);
}

function increment(map, key) {
  const safeKey = redact(key || "<unknown>");
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function incrementObject(object, key) {
  object[key] = (object[key] || 0) + 1;
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

function extractReason(value, depth = 0) {
  if (!value || depth > 6) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const reason = extractReason(item, depth + 1);
      if (reason) return reason;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const keys = ["blockingError", "reason", "error", "message", "stderr", "stdout", "content", "text", "details", "detail"];
  for (const key of keys) {
    if (!(key in value)) continue;
    const reason = extractReason(value[key], depth + 1);
    if (reason) return reason;
  }
  return "";
}

function reasonFor(item) {
  const value = extractReason(item);
  return redact(value || item.hookName || item.name || item.type || "<empty>");
}

function roleFor(payload) {
  return payload?.message?.role || payload?.role || "";
}

function categoryFor(item, payload) {
  if (roleFor(payload) === "system") return "system";
  if (item.type === "hook_blocking_error") return "blocking";
  if (item.type === "hook_non_blocking_error") return "non_blocking_error";
  if (item.type === "hook_cancelled") return "cancelled";
  const reason = reasonFor(item).toLowerCase();
  if (/\b(advisory|warning|reminder|would block)\b/.test(reason)) return "advisory";
  return item.type === "hook_success" ? "success" : "system";
}

function statusFor(item) {
  if (item.type === "hook_blocking_error") return "blocking";
  if (item.type === "hook_non_blocking_error") return "non_blocking_error";
  if (item.type === "hook_cancelled") return "cancelled";
  if (item.type === "hook_success") return "success";
  return "system";
}

function isStopHook(item) {
  const fields = [item.hookEventName, item.hook_event_name, item.eventName, item.event_name, item.hookName, item.name];
  return fields.some((field) => typeof field === "string" && /\bstop\b|stop-verifier/i.test(field));
}

function containsToolUse(value, depth = 0) {
  if (!value || depth > 6) return false;
  if (Array.isArray(value)) return value.some((item) => containsToolUse(item, depth + 1));
  if (typeof value !== "object") return false;
  if (value.type === "tool_use" || value.tool_name || value.toolName) return true;
  return Object.values(value).some((child) => containsToolUse(child, depth + 1));
}

function containsAssistantText(value, depth = 0) {
  if (!value || depth > 6) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => containsAssistantText(item, depth + 1));
  if (typeof value !== "object") return false;
  if (value.type === "text" && typeof value.text === "string" && value.text.trim()) return true;
  return Object.values(value).some((child) => containsAssistantText(child, depth + 1));
}

function assistantContent(payload) {
  return payload?.message?.content || payload?.content || payload?.text || "";
}

function followUpResult(records, index) {
  for (let nextIndex = index + 1; nextIndex < records.length; nextIndex += 1) {
    const record = records[nextIndex];
    if (containsToolUse(record.payload)) return { outcome: "tool_follow_up", record };
    if (roleFor(record.payload) === "assistant" && containsAssistantText(assistantContent(record.payload))) {
      return { outcome: "text_only_follow_up", record };
    }
    if (record.hooks.length === 0) return { outcome: "none", record: undefined };
  }
  return { outcome: "none", record: undefined };
}

function usageTokens(payload) {
  const usage = payload?.message?.usage || payload?.usage || {};
  const input = Number(usage.input_tokens || usage.inputTokens || 0);
  const output = Number(usage.output_tokens || usage.outputTokens || 0);
  const total = Number(usage.total_tokens || usage.totalTokens || input + output);
  return {
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
    total: Number.isFinite(total) ? total : 0,
  };
}

function projectFor(file) {
  const marker = `${root}/projects/`;
  if (file.startsWith(marker)) return file.slice(marker.length).split("/").slice(0, -1).join("/") || "<root>";
  return relative(root, file).split("/").slice(0, -1).join("/") || "<root>";
}

function recordsForFile(file) {
  const records = [];
  let linesScanned = 0;
  let parseErrors = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    linesScanned += 1;
    try {
      const payload = JSON.parse(line);
      records.push({ payload, hooks: findHookObjects(payload) });
    } catch {
      parseErrors += 1;
    }
  }
  return { records, linesScanned, parseErrors };
}

function scan() {
  const files = findJsonlFiles(join(root, "projects")).filter((file) => {
    try {
      return statSync(file).mtimeMs >= cutoffMs;
    } catch {
      return false;
    }
  });
  const counters = {
    totalHookEvents: 0,
    nonBlocking: 0,
    blocking: 0,
    cancelled: 0,
    success: 0,
    statuses: {},
    categories: {},
    actionedOutcomes: { tool_follow_up: 0, text_only_follow_up: 0, none: 0 },
  };
  const projects = new Map();
  const reasons = new Map();
  const hooks = new Map();
  const statuses = new Map();
  const categories = new Map();
  const actionedOutcomes = new Map();
  const noActionStopReasons = new Map();
  const tokenCostEstimate = { eventsWithUsage: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, actionedFollowUpTokens: 0 };
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
    const parsed = recordsForFile(file);
    linesScanned += parsed.linesScanned;
    parseErrors += parsed.parseErrors;
    for (const [index, record] of parsed.records.entries()) {
      const usage = usageTokens(record.payload);
      if (usage.total > 0) {
        tokenCostEstimate.eventsWithUsage += 1;
        tokenCostEstimate.inputTokens += usage.input;
        tokenCostEstimate.outputTokens += usage.output;
        tokenCostEstimate.totalTokens += usage.total;
      }
      for (const item of record.hooks) {
        const reason = reasonFor(item);
        const category = categoryFor(item, record.payload);
        const status = statusFor(item);
        counters.totalHookEvents += 1;
        if (item.type === "hook_non_blocking_error") counters.nonBlocking += 1;
        if (item.type === "hook_blocking_error") counters.blocking += 1;
        if (item.type === "hook_cancelled") counters.cancelled += 1;
        if (item.type === "hook_success") counters.success += 1;
        incrementObject(counters.statuses, status);
        incrementObject(counters.categories, category);
        increment(projects, project);
        increment(hooks, item.hookName || item.name || item.type);
        increment(reasons, reason);
        increment(statuses, status);
        increment(categories, category);
        if (item.type === "hook_blocking_error" && isStopHook(item)) {
          const { outcome, record: followUp } = followUpResult(parsed.records, index);
          counters.actionedOutcomes[outcome] = (counters.actionedOutcomes[outcome] || 0) + 1;
          increment(actionedOutcomes, outcome);
          tokenCostEstimate.actionedFollowUpTokens += usageTokens(followUp?.payload).total;
          if (outcome !== "tool_follow_up") increment(noActionStopReasons, reason);
        }
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
    topStatuses: topEntries(statuses),
    topCategories: topEntries(categories),
    topActionedOutcomes: topEntries(actionedOutcomes),
    topNoActionStopReasons: topEntries(noActionStopReasons),
    tokenCostEstimate,
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
