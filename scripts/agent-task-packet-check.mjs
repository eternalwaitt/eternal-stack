#!/usr/bin/env node
import { readFileSync } from "node:fs";

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
}

if (mode === "write" && "forbiddenPaths" in packet && !Array.isArray(packet.forbiddenPaths)) {
  violations.push("forbiddenPaths must be an array");
}

if ("timeoutSec" in packet && (!Number.isFinite(packet.timeoutSec) || packet.timeoutSec <= 0)) {
  violations.push("timeoutSec must be a number > 0");
}

function pathList(value, fieldName) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  violations.push(`${fieldName} must be a non-empty string or array`);
  return [];
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
  const writeScope = pathList(packet.writeScope, "writeScope");
  const forbiddenPaths = pathList(packet.forbiddenPaths, "forbiddenPaths");
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
  process.exit(1);
}

console.log("Task packet ok");
