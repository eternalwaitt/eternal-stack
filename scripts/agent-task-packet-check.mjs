#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const templateIndex = args.indexOf("--template");
if (templateIndex !== -1) {
  const templateMode = args[templateIndex + 1];
  if (!templateMode || templateMode.startsWith("--")) {
    console.error('usage: agent-task-packet-check.mjs --template [read-only|write]');
    process.exit(2);
  }
  if (templateMode !== "read-only" && templateMode !== "write") {
    console.error('usage: agent-task-packet-check.mjs --template [read-only|write]');
    process.exit(2);
  }
  const packet = {
    mode: templateMode,
    goal: "Inspect or change one bounded subsystem.",
    contextSummary: "Relevant repo facts, current branch/worktree status, and known constraints.",
    cwd: "/absolute/path/to/repo",
    scope: "Files, routes, modules, or behavior boundary owned by this task.",
    readSet: ["path/to/read-first"],
    expectedOutput: "Concise findings or changed files plus verification evidence.",
    noRevert: true,
  };
  if (templateMode === "write") {
    Object.assign(packet, {
      writeScope: ["path/to/owned-file-or-directory"],
      forbiddenPaths: ["path/to/owned-by-someone-else"],
      verificationCommand: "project-specific verification command",
      modelTier: "sonnet",
      timeoutSec: 1800,
      retryPolicy: "If blocked, report the exact blocker and stop instead of widening scope.",
      webSearchGuidance: "Use only when current external docs are needed; cite primary sources.",
    });
  }
  console.log(JSON.stringify({ packet }, null, 2));
  process.exit(0);
}

const raw = readFileSync(0, "utf8").trim() || "{}";

let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`Task packet input is not valid JSON: ${error.message}`);
  process.exit(2);
}

const payload = event.tool_input ?? event.toolInput ?? event;

function parsePromptPacket(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Packet precedence:
// 1) structured value.packet
// 2) top-level legacy object with mode
// 3) JSON parsed from value.prompt.
function getPacket(value) {
  if (value && typeof value.packet === "object" && value.packet !== null && !Array.isArray(value.packet)) {
    return value.packet;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && value.mode) {
    return value;
  }
  const parsed = parsePromptPacket(value?.prompt);
  if (parsed) return parsed;
  return null;
}

const packet = getPacket(payload);
if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
  console.error("Subagent task packet is missing: packet.");
  console.error("Provide structured JSON under tool_input.packet (or a JSON prompt body).");
  process.exit(1);
}

if (typeof packet.mode !== "string") {
  console.error(`Invalid packet.mode: expected string but got ${typeof packet.mode}.`);
  process.exit(1);
}
const mode = packet.mode.toLowerCase();
if (mode !== "read-only" && mode !== "write") {
  console.error(`Invalid packet.mode: must be "read-only" or "write" (got: ${JSON.stringify(packet.mode)}).`);
  process.exit(1);
}

const baseFields = [
  "goal",
  "contextSummary",
  "cwd",
  "scope",
  "readSet",
  "expectedOutput",
  "noRevert",
];

const writeFields = [
  "writeScope",
  "forbiddenPaths",
  "verificationCommand",
  "modelTier",
  "timeoutSec",
  "retryPolicy",
  "webSearchGuidance",
];

const required = mode === "write" ? [...baseFields, ...writeFields] : baseFields;
const missing = [];
const violations = [];

for (const key of required) {
  if (!(key in packet)) {
    missing.push(key);
  }
}

if ("readSet" in packet && !Array.isArray(packet.readSet)) {
  violations.push("readSet must be an array");
} else if ("readSet" in packet && !packet.readSet.every((item) => typeof item === "string")) {
  violations.push("readSet must be an array of strings");
}

if (mode === "write" && "forbiddenPaths" in packet && !Array.isArray(packet.forbiddenPaths)) {
  violations.push("forbiddenPaths must be an array");
}

if ("timeoutSec" in packet && (!Number.isFinite(packet.timeoutSec) || packet.timeoutSec <= 0)) {
  violations.push("timeoutSec must be a number > 0");
}

function pathList(value, fieldName) {
  function normalizeScopePath(rawPath) {
    const normalized = path.posix.normalize(String(rawPath).replace(/\\/g, "/"));
    if (normalized === "/") return normalized;
    return normalized.replace(/\/+$/g, "");
  }
  // Empty or whitespace-only path entries are always invalid.
  if (Array.isArray(value)) {
    const trimmed = value
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => typeof item === "string" && item.length > 0);
    if (trimmed.length !== value.length) return { paths: trimmed, error: `${fieldName} contains empty path entries` };
    return { paths: trimmed.map(normalizeScopePath) };
  }
  if (typeof value === "string" && value.trim()) return { paths: [normalizeScopePath(value.trim())] };
  return { paths: [], error: `${fieldName} must be a non-empty string or array` };
}

// noRevert must be explicitly boolean true so workers acknowledge they cannot auto-revert.
// String "true", number 1, and other truthy values are rejected to prevent accidental acknowledgment.
if ("noRevert" in packet) {
  if (typeof packet.noRevert !== "boolean") {
    violations.push(`noRevert must be boolean true (got ${typeof packet.noRevert}) — only explicit true is accepted to force worker acknowledgement`);
  } else if (packet.noRevert !== true) {
    violations.push("noRevert must be true — the worker must explicitly acknowledge it cannot auto-revert changes; false or other values are rejected");
  }
}

// C1: Disjoint-ownership check.
// In write mode, writeScope paths and forbiddenPaths must be disjoint.
// A path cannot be both claimed for writing and marked as forbidden.
// Overlap detection uses exact string matching; callers must normalize paths before passing them.
if (mode === "write" && "writeScope" in packet && "forbiddenPaths" in packet) {
  const writeScopeResult = pathList(packet.writeScope, "writeScope");
  const forbiddenPathsResult = pathList(packet.forbiddenPaths, "forbiddenPaths");
  if (writeScopeResult.error) violations.push(writeScopeResult.error);
  if (forbiddenPathsResult.error) violations.push(forbiddenPathsResult.error);
  const writeScope = writeScopeResult.paths;
  const forbiddenPaths = forbiddenPathsResult.paths;
  const writeScopeSet = new Set(writeScope);
  const overlap = forbiddenPaths.filter((item) => writeScopeSet.has(item));
  if (overlap.length > 0) {
    violations.push(`writeScope and forbiddenPaths overlap (disjoint-ownership violation): ${overlap.join(", ")}`);
  }
}

if (missing.length > 0 || violations.length > 0) {
  if (missing.length > 0) {
    console.error(`Subagent task packet is missing: ${missing.join(", ")}.`);
  }
  if (violations.length > 0) {
    console.error(`Subagent task packet has invalid values: ${violations.join(", ")}.`);
  }
  console.error("Include every required structured field so the worker can run without follow-up questions.");
  console.error("Template: node scripts/agent-task-packet-check.mjs --template write");
  process.exit(1);
}

console.log("Task packet ok");
