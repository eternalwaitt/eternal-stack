#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { packetHash } from "./lib/evidence-trace.mjs";

const args = process.argv.slice(2);
const knownCommands = new Set(["hash"]);
const command = knownCommands.has(args[0]) ? args[0] : "";
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
      taskId: "T1",
      lineageId: "wave-1.T1",
      writeScope: ["path/to/owned-file-or-directory"],
      forbiddenPaths: ["path/to/owned-by-someone-else"],
      verificationCommand: "project-specific verification command",
      modelTier: "sonnet",
      timeoutSec: 1800,
      retryPolicy: "If blocked, report the exact blocker and stop instead of widening scope.",
      webSearchGuidance: "Use only when current external docs are needed; cite primary sources.",
      reviewers: ["etrnl-spec-reviewer", "etrnl-quality-reviewer"],
      specReviewRequired: true,
      qualityReviewRequired: true,
      simplifierReviewRequired: false,
      tddRequired: false,
      tddEvidence: "red/green evidence row or not-applicable rationale",
      reuseArtifact: "reuse binding artifact path or existing analog decision",
      createsNewSurface: false,
      newSurfaceJustification: "",
      simplifierEvidence: "code-simplifier evidence row or not applicable for tiny/no-source work",
      integrationOwner: "parent agent",
      expectedDiffShape: "Small patch within writeScope plus tests/docs needed for the change.",
      deepStackExecution: false,
      deepStackArtifacts: "path/to/deep-stack-artifacts.json",
      riskTier: { tier: 1, reason: "Small source change after deep review.", verificationGate: "project-specific verification command" },
      completionEvidence: "Plan item to diff/test evidence, or not applicable for Tier 0.",
    });
  }
  console.log(JSON.stringify({ packet }, null, 2));
  process.exit(0);
}

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

const fieldAliases = new Map([
  ["context", "contextSummary"],
  ["context_summary", "contextSummary"],
  ["read_set", "readSet"],
  ["write_scope", "writeScope"],
  ["forbidden_files", "forbiddenPaths"],
  ["forbidden_paths", "forbiddenPaths"],
  ["expected_output", "expectedOutput"],
  ["no_revert", "noRevert"],
  ["verification_command", "verificationCommand"],
  ["model_tier", "modelTier"],
  ["timeout_sec", "timeoutSec"],
  ["retry_policy", "retryPolicy"],
  ["web_search_guidance", "webSearchGuidance"],
  ["task_id", "taskId"],
  ["lineage_id", "lineageId"],
  ["spec_review_required", "specReviewRequired"],
  ["quality_review_required", "qualityReviewRequired"],
  ["simplifier_review_required", "simplifierReviewRequired"],
  ["tdd_required", "tddRequired"],
  ["tdd_evidence", "tddEvidence"],
  ["reuse_artifact", "reuseArtifact"],
  ["creates_new_surface", "createsNewSurface"],
  ["new_surface_justification", "newSurfaceJustification"],
  ["simplifier_evidence", "simplifierEvidence"],
  ["integration_owner", "integrationOwner"],
  ["expected_diff_shape", "expectedDiffShape"],
  ["deep_stack_execution", "deepStackExecution"],
  ["deep_stack_artifacts", "deepStackArtifacts"],
  ["risk_tier", "riskTier"],
  ["completion_evidence", "completionEvidence"],
]);

function normalizePacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return packet;
  const normalized = { ...packet };
  for (const [source, target] of fieldAliases.entries()) {
    if (!(target in normalized) && source in normalized) {
      normalized[target] = normalized[source];
    }
  }
  return normalized;
}

function readInput() {
  const fileArg = args
    .slice(command ? 1 : 0)
    .find((arg) => arg && !arg.startsWith("-")) || "";
  let raw = "";
  try {
    raw = fileArg
      ? readFileSync(fileArg, "utf8").trim()
      : readFileSync(0, "utf8").trim();
  } catch (error) {
    console.error(`Failed to read task packet input from ${fileArg || "stdin"}: ${error.message}`);
    process.exit(2);
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Task packet input is not valid JSON: ${error.message}`);
    process.exit(2);
  }
}

// Packet precedence:
// 1) structured value.packet
// 2) top-level legacy object with mode
// 3) JSON parsed from value.prompt.
function getPacket(value) {
  if (value && typeof value.packet === "object" && value.packet !== null && !Array.isArray(value.packet)) {
    return normalizePacket(value.packet);
  }
  if (value && typeof value === "object" && !Array.isArray(value) && value.mode) {
    return normalizePacket(value);
  }
  const parsed = parsePromptPacket(value?.prompt);
  if (parsed && typeof parsed.packet === "object" && parsed.packet !== null && !Array.isArray(parsed.packet)) {
    return normalizePacket(parsed.packet);
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.mode) {
    return normalizePacket(parsed);
  }
  return null;
}

const event = readInput();
const payload = event.tool_input ?? event.toolInput ?? event;
const packet = getPacket(payload);
if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
  console.error("Subagent task packet is missing: packet.");
  console.error("Provide structured JSON under tool_input.packet (or a JSON prompt body).");
  process.exit(1);
}

if (command === "hash" || args.includes("--hash")) {
  console.log(packetHash(packet));
  process.exit(0);
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
  "taskId",
  "lineageId",
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

if ("reviewers" in packet) {
  if (!Array.isArray(packet.reviewers)) {
    violations.push("reviewers must be an array");
  } else if (!packet.reviewers.every((item) => typeof item === "string" && item.trim().length > 0)) {
    violations.push("reviewers must be an array of non-empty strings");
  }
}

for (const key of ["specReviewRequired", "qualityReviewRequired", "simplifierReviewRequired", "deepStackExecution", "tddRequired", "createsNewSurface"]) {
  if (key in packet && typeof packet[key] !== "boolean") {
    violations.push(`${key} must be a boolean`);
  }
}

for (const key of ["integrationOwner", "expectedDiffShape", "tddEvidence", "reuseArtifact", "newSurfaceJustification", "simplifierEvidence"]) {
  if (key in packet && (typeof packet[key] !== "string" || packet[key].trim().length === 0)) {
    violations.push(`${key} must be a non-empty string`);
  }
}

// Dots are intentional for hierarchical ids such as `wave-1.T1`.
for (const key of ["taskId", "lineageId"]) {
  if (key in packet) {
    if (typeof packet[key] !== "string" || packet[key].trim().length === 0) {
      violations.push(`${key} must be a non-empty string`);
    } else if (!/^[A-Za-z0-9_.-]+$/.test(packet[key])) {
      violations.push(`${key} must contain only letters, numbers, dots, underscores, or hyphens`);
    }
  }
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

function pathsOverlap(left, right) {
  if (left === right) return true;
  if (left === "." || right === ".") return true;
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
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
  const overlap = forbiddenPaths.filter((forbiddenPath) => writeScope.some((writePath) => pathsOverlap(writePath, forbiddenPath)));
  if (overlap.length > 0) {
    violations.push(`writeScope and forbiddenPaths overlap (disjoint-ownership violation): ${overlap.join(", ")}`);
  }
  const waveSize = "waveSize" in packet ? Number(packet.waveSize) : 1;
  if ("waveSize" in packet && (!Number.isInteger(waveSize) || waveSize <= 0)) {
    violations.push("waveSize must be a positive integer when provided");
  }
  if ("parallelSafe" in packet && typeof packet.parallelSafe !== "boolean") {
    violations.push("parallelSafe must be a boolean when provided");
  }
  const parallelWritePacket = writeScope.length >= 2 || waveSize >= 2 || packet.parallelSafe === true;
  if (mode === "write" && waveSize >= 2 && !("waveId" in packet)) missing.push("waveId");
  if (parallelWritePacket) {
    const reviewers = Array.isArray(packet.reviewers) ? packet.reviewers : [];
    if (packet.specReviewRequired !== true) missing.push("specReviewRequired");
    if (packet.qualityReviewRequired !== true) missing.push("qualityReviewRequired");
    if (!("integrationOwner" in packet)) missing.push("integrationOwner");
    if (!("expectedDiffShape" in packet)) missing.push("expectedDiffShape");
    if (packet.specReviewRequired === true && !reviewers.includes("etrnl-spec-reviewer")) {
      violations.push("reviewers must include etrnl-spec-reviewer when specReviewRequired is true");
    }
    if (packet.qualityReviewRequired === true && !reviewers.includes("etrnl-quality-reviewer")) {
      violations.push("reviewers must include etrnl-quality-reviewer when qualityReviewRequired is true");
    }
  }
}

if (mode === "write" && packet.createsNewSurface === true) {
  if (!("reuseArtifact" in packet)) missing.push("reuseArtifact");
  if (!("newSurfaceJustification" in packet)) missing.push("newSurfaceJustification");
}

if (mode === "write" && packet.tddRequired === true && !("tddEvidence" in packet)) {
  missing.push("tddEvidence");
}

if (mode === "write" && packet.deepStackExecution === true) {
  const reviewers = Array.isArray(packet.reviewers) ? packet.reviewers : [];
  for (const key of ["deepStackArtifacts", "riskTier", "completionEvidence", "tddEvidence", "reuseArtifact", "simplifierEvidence"]) {
    if (!(key in packet)) missing.push(key);
  }
  if (packet.simplifierReviewRequired !== true) missing.push("simplifierReviewRequired");
  if (packet.tddRequired !== true) missing.push("tddRequired");
  if (packet.specReviewRequired !== true) missing.push("specReviewRequired");
  if (packet.qualityReviewRequired !== true) missing.push("qualityReviewRequired");
  if (packet.specReviewRequired === true && !reviewers.includes("etrnl-spec-reviewer")) {
    violations.push("reviewers must include etrnl-spec-reviewer when deepStackExecution is true");
  }
  if (packet.qualityReviewRequired === true && !reviewers.includes("etrnl-quality-reviewer")) {
    violations.push("reviewers must include etrnl-quality-reviewer when deepStackExecution is true");
  }
  if (typeof packet.deepStackArtifacts !== "string" || packet.deepStackArtifacts.trim().length === 0) {
    violations.push("deepStackArtifacts must be a non-empty string when deepStackExecution is true");
  }
  if (!packet.riskTier || typeof packet.riskTier !== "object" || Array.isArray(packet.riskTier)) {
    violations.push("riskTier must be an object when deepStackExecution is true");
  } else {
    if (!Number.isInteger(packet.riskTier.tier) || packet.riskTier.tier < 0 || packet.riskTier.tier > 3) {
      violations.push("riskTier.tier must be 0, 1, 2, or 3");
    }
    if (typeof packet.riskTier.reason !== "string" || packet.riskTier.reason.trim().length === 0) {
      violations.push("riskTier.reason must be a non-empty string");
    }
    if (typeof packet.riskTier.verificationGate !== "string" || packet.riskTier.verificationGate.trim().length === 0) {
      violations.push("riskTier.verificationGate must be a non-empty string");
    }
  }
  if (typeof packet.completionEvidence !== "string" || packet.completionEvidence.trim().length === 0) {
    violations.push("completionEvidence must be a non-empty string when deepStackExecution is true");
  }
  if (typeof packet.tddEvidence !== "string" || packet.tddEvidence.trim().length === 0) {
    violations.push("tddEvidence must be a non-empty string when deepStackExecution is true");
  }
  if (typeof packet.reuseArtifact !== "string" || packet.reuseArtifact.trim().length === 0) {
    violations.push("reuseArtifact must be a non-empty string when deepStackExecution is true");
  }
  if (typeof packet.simplifierEvidence !== "string" || packet.simplifierEvidence.trim().length === 0) {
    violations.push("simplifierEvidence must be a non-empty string when deepStackExecution is true");
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

console.log(`Task packet ok packetHash=${packetHash(packet)}`);
