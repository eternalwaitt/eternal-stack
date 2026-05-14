#!/usr/bin/env node
import { readFileSync } from "node:fs";

const SOURCE_FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rs|go|php|rb|java|kt|swift|sh|bash|zsh)$/i;
const EXEMPT_PATH_RE = /(\.test\.|\.spec\.|\/tests?\/|__tests__|\/node_modules\/|\/dist\/|\/build\/|\/coverage\/|\/generated\/|\/__generated__\/|\/migrations\/)/i;
const IMPLEMENTATION_AGENT_RE = /subagent=etrnl-executor/;
const WRITE_MODE_RE = /mode=write/;
const TASK_ID_RE = /taskid=[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?(?=\s|$)/;
const LINEAGE_ID_RE = /lineageid=[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?(?=\s|$)/;
const PACKET_HASH_RE = /packethash=[a-f0-9]{64}/;

function readState() {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid guard state JSON: ${detail}`);
  }
}

function norm(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/^skill\(/, "")
    .replace(/\)$/, "")
    .replace(/^eternal-control-/, "")
    .replace(/^etrnl-/, "");
  const aliases = new Map([
    ["writing-plans", "plan"],
    ["code-review", "review"],
    ["execute-plan", "execute"],
    ["run-plan", "execute"],
    ["parallel-fan-out", "parallel"],
    ["devils-advocate", "stress-test"],
    ["agent-file-doctor", "agent-files"],
  ]);
  return aliases.get(normalized) || normalized;
}

function latestExecuteRequest(state) {
  const values = (state.requestedSkills || [])
    .filter((item) => norm(item?.value) === "execute")
    .map((item) => String(item?.at || ""))
    .filter(Boolean);
  return values.sort().at(-1) || "";
}

function editStamp(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? String(value.at || "")
    : String(value || "");
}

function sourceEditsAfter(state, timestamp) {
  return Object.entries(state.edits || {})
    .filter(([, value]) => editStamp(value) >= timestamp)
    .filter(([file]) => SOURCE_FILE_RE.test(file))
    .filter(([file]) => !EXEMPT_PATH_RE.test(file))
    .length;
}

function agentText(item) {
  return String(item?.value || "").toLowerCase();
}

function hasBoundIdentity(text) {
  return TASK_ID_RE.test(text) && LINEAGE_ID_RE.test(text) && PACKET_HASH_RE.test(text);
}

function implementationAgentsAfter(state, timestamp) {
  return (state.agentCalls || [])
    .filter((item) => String(item?.at || "") >= timestamp)
    .map(agentText)
    .filter((text) => IMPLEMENTATION_AGENT_RE.test(text) && WRITE_MODE_RE.test(text) && hasBoundIdentity(text))
    .length;
}

function reviewerAgentsAfter(state, timestamp, reviewer) {
  return [...(state.reviewerAgentCalls || []), ...(state.agentCalls || [])]
    .filter((item) => String(item?.at || "") >= timestamp)
    .map(agentText)
    .filter((text) => text.includes(`subagent=${reviewer}`) && hasBoundIdentity(text))
    .length;
}

function executeGateStatus(state) {
  const executeAt = latestExecuteRequest(state);
  if (!executeAt) return "";
  if (sourceEditsAfter(state, executeAt) < 2) return "";
  const implementationCount = implementationAgentsAfter(state, executeAt);
  if (implementationCount === 0) return "missing-agent";
  const missingSpec = reviewerAgentsAfter(state, executeAt, "etrnl-spec-reviewer") === 0;
  const missingQuality = reviewerAgentsAfter(state, executeAt, "etrnl-quality-reviewer") === 0;
  return missingSpec || missingQuality ? "missing-reviewers" : "";
}

try {
  process.stdout.write(executeGateStatus(readState()));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`execute-evidence-check failed: ${detail}`);
  process.exit(2);
}
