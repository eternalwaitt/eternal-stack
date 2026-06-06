#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { appendEvent, stableHash } from "./lib/etrnl-state-core.mjs";
import { gitSubprocessLimits } from "./lib/env-utils.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const dryRun = args.includes("--dry-run");
const staleHours = Number(argValue("--stale-hours", process.env.ETRNL_CONTEXT_STALE_HOURS || "24"));
const DEFAULT_GIT_TIMEOUT_MS = 5_000;
const DEFAULT_GIT_MAX_BUFFER = 5 * 1024 * 1024;
const GIT_LIMITS = gitSubprocessLimits({
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
  maxBufferBytes: DEFAULT_GIT_MAX_BUFFER,
});

function argValue(flag, fallback = "") {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function allValues(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function contextDir() {
  const base = process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
  return path.join(base, "contexts");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isStale(context) {
  const savedAt = Date.parse(context.savedAt || "");
  return Number.isNaN(savedAt) ? true : Date.now() - savedAt > staleHours * 60 * 60 * 1000;
}

function gitOutput(argsForGit) {
  try {
    return execFileSync("git", argsForGit, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_LIMITS.timeout,
      maxBuffer: GIT_LIMITS.maxBuffer,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return `unavailable: ${message}`;
  }
}

function contextErrors(context) {
  const errors = [];
  if (context.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!context.contextId) errors.push("contextId is required");
  if (!context.savedAt) errors.push("savedAt is required");
  if (context.savedAt && Number.isNaN(Date.parse(context.savedAt))) errors.push("savedAt must be an ISO timestamp");
  if (!Number.isFinite(Number(context.modifiedFileCount ?? 0))) errors.push("modifiedFileCount must be numeric");
  if (!Array.isArray(context.remainingWork)) errors.push("remainingWork must be an array");
  return errors;
}

function normalizeContext(context) {
  const normalized = { ...context };
  if (normalized.schemaVersion !== 1) {
    normalized.schemaVersion = 1;
  }
  if (Array.isArray(normalized.modifiedFiles)) {
    normalized.modifiedFileCount = normalized.modifiedFiles.length;
    delete normalized.modifiedFiles;
  } else if (!Number.isFinite(Number(normalized.modifiedFileCount ?? 0))) {
    normalized.modifiedFileCount = 0;
  }
  for (const key of ["decisions", "blockers", "remainingWork", "verification"]) {
    if (!Array.isArray(normalized[key])) {
      normalized[key] = [];
    }
  }
  return normalized;
}

function appendContextEntries(context, appendDryRun = false) {
  const base = {
    sessionId: context.contextId,
    cwd: process.cwd(),
  };
  const rows = [
    ...context.decisions.map((value) => ({ entryType: "decision", value })),
    ...context.blockers.map((value) => ({ entryType: "blocker", value })),
    ...context.remainingWork.map((value) => ({ entryType: "next_action", value })),
    ...context.verification.map((value) => ({ entryType: "fact", value })),
  ];
  for (const row of rows) {
    const result = appendEvent({ ...base, eventKind: "context_entry", data: row }, { dryRun: appendDryRun });
    if (!result.ok) throw new Error(result.error.message);
  }
}

function save() {
  const title = argValue("--title", "ETRNL context");
  const context = {
    schemaVersion: 1,
    contextId: argValue("--id", `context-${Date.now()}`),
    title,
    projectFingerprint: stableHash(process.cwd()),
    branch: gitOutput(["branch", "--show-current"]),
    head: gitOutput(["rev-parse", "--short", "HEAD"]),
    modifiedFileCount: (() => {
      const output = gitOutput(["status", "--short"]);
      return output.startsWith("unavailable:") ? 0 : output.split(/\n/).filter(Boolean).length;
    })(),
    decisions: allValues("--decision"),
    blockers: allValues("--blocker"),
    remainingWork: allValues("--remaining"),
    verification: allValues("--verification"),
    savedAt: argValue("--saved-at", nowIso()),
  };
  const errors = contextErrors(context);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  const file = path.join(contextDir(), `${context.contextId}.json`);
  if (dryRun) {
    appendContextEntries(context, true);
    console.log(`dry-run: would write ${file}`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
  appendContextEntries(context, false);
  console.log(file);
}

function readContext(file) {
  const context = normalizeContext(JSON.parse(readFileSync(file, "utf8")));
  const errors = contextErrors(context);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return context;
}

function show() {
  const file = args[1] && !args[1].startsWith("-") ? args[1] : argValue("--path");
  if (!file) {
    console.error("context-state show requires a context file path.");
    process.exit(2);
  }
  const context = readContext(file);
  console.log(`# ${context.title}`);
  console.log(`branch=${context.branch} head=${context.head} savedAt=${context.savedAt} stale=${isStale(context)}`);
  console.log(`modified=${context.modifiedFileCount ?? 0} remaining=${context.remainingWork.length} blockers=${context.blockers.length}`);
}

function list() {
  if (!existsSync(contextDir())) {
    console.log("No ETRNL context saves recorded.");
    return;
  }
  const files = readdirSync(contextDir()).filter((file) => file.endsWith(".json")).sort().reverse();
  for (const file of files.slice(0, Number(argValue("--limit", "10")))) {
    const context = readContext(path.join(contextDir(), file));
    console.log(`${context.contextId}: ${context.title} branch=${context.branch} remaining=${context.remainingWork.length}`);
  }
}

if (command === "save") save();
else if (command === "show" || command === "restore" || command === "validate") show();
else if (command === "list") list();
else {
  console.error("usage: context-state.mjs save|show|restore|validate|list");
  process.exit(2);
}
