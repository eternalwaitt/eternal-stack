#!/usr/bin/env node
import { readStdinJson } from "./lib/read-stdin.mjs";

const SOURCE_FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rs|go|php|rb|java|kt|swift|sh|bash|zsh)$/i;
const EXEMPT_PATH_RE = /(\.test\.|\.spec\.|\/tests?\/|__tests__|\/node_modules\/|\/dist\/|\/build\/|\/coverage\/|\/generated\/|\/__generated__\/|\/migrations\/)/i;
const IMPLEMENTATION_AGENT_RE = /subagent=etrnl-executor/;
const WRITE_MODE_RE = /mode=write/;
const TASK_ID_RE = /taskid=[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?(?=\s|$)/;
const LINEAGE_ID_RE = /lineageid=[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?(?=\s|$)/;
const PACKET_HASH_RE = /packethash=[a-f0-9]{64}/;
const TS_TRIGGER_PATH_RE = /\.(ts|tsx)$/i;
const TS_TRIGGER_NAME_RE = /(^|\/)(types?|schemas?|dto|contract|api|state-machine|state|validators?|models?)\.(ts|tsx)$|\/(types?|schemas?|dto|contracts?|api|state-machines?|validators?|models?)\//i;
const INSTALL_TRIGGER_RE = /(^|\/)(hooks|templates|skills|agents|scripts)\/|(^|\/)AGENTS\.md$|(^|\/)CLAUDE\.md$|settings.*\.json$/i;

// criticalPath and stopCondition are packet orchestration metadata. This
// checker verifies post-execution evidence binding through task/lineage/hash
// markers instead of interpreting those planning fields directly.

function readState() {
  return readStdinJson({
    emptyValue: {},
    onInvalidJson: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid guard state JSON: ${detail}`);
    },
    onReadError: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid guard state JSON: ${detail}`);
    },
  });
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
    ["dev-execute", "execute"],
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
    .map(([file]) => file);
}

function agentText(item) {
  return String(item?.value || "").toLowerCase();
}

function hasBoundIdentity(text) {
  return TASK_ID_RE.test(text) && LINEAGE_ID_RE.test(text) && PACKET_HASH_RE.test(text);
}

function parseStamp(item) {
  const parsed = Date.parse(String(item?.at || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bindingFromText(text) {
  const taskId = text.match(/taskid=([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)(?=\s|$)/)?.[1] || "";
  const lineageId = text.match(/lineageid=([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)(?=\s|$)/)?.[1] || "";
  const packetHashValue = text.match(/packethash=([a-f0-9]{64})/)?.[1] || "";
  if (!taskId || !lineageId || !packetHashValue) return "";
  return `${taskId}|${lineageId}|${packetHashValue}`;
}

function evidenceText(item) {
  return String(item?.value || item?.command || item?.evidence || item?.summary || "").toLowerCase();
}

function anyEvidenceAfter(state, timestamp, keys, pattern) {
  return keys.some((key) => (state[key] || [])
    .filter((item) => String(item?.at || "") >= timestamp)
    .some((item) => pattern.test(evidenceText(item))));
}

function newSourceFilesAfter(state, timestamp) {
  const direct = Array.isArray(state.newSourceFiles) ? state.newSourceFiles : [];
  const fromDirect = direct
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .filter((item) => typeof item.at === "string" && item.at >= timestamp)
    .map((item) => (typeof item.path === "string" ? item.path : item.file))
    .filter((file) => typeof file === "string" && SOURCE_FILE_RE.test(file) && !EXEMPT_PATH_RE.test(file));
  const fromEdits = Object.entries(state.edits || {})
    .filter(([, value]) => value && typeof value === "object" && value.created === true && editStamp(value) >= timestamp)
    .map(([file]) => file)
    .filter((file) => SOURCE_FILE_RE.test(file) && !EXEMPT_PATH_RE.test(file));
  return [...new Set([...fromDirect, ...fromEdits])];
}

function needsTypeReview(state, sourceFiles) {
  if (state.typeReviewRequired === true) return true;
  return sourceFiles.some((file) => TS_TRIGGER_PATH_RE.test(file) && TS_TRIGGER_NAME_RE.test(file));
}

function needsInstallProof(state, sourceFiles) {
  if (state.installProofRequired === true) return true;
  return sourceFiles.some((file) => INSTALL_TRIGGER_RE.test(file));
}

function implementationAgentsAfter(state, timestamp) {
  return (state.agentCalls || [])
    .filter((item) => String(item?.at || "") >= timestamp)
    .map((item) => ({ text: agentText(item), at: parseStamp(item) }))
    .filter((item) => IMPLEMENTATION_AGENT_RE.test(item.text) && WRITE_MODE_RE.test(item.text) && hasBoundIdentity(item.text));
}

function reviewerAgentsAfter(state, timestamp, reviewer) {
  return [...(state.reviewerAgentCalls || []), ...(state.agentCalls || [])]
    .filter((item) => String(item?.at || "") >= timestamp)
    .map((item) => ({ text: agentText(item), at: parseStamp(item) }))
    .filter((item) => item.text.includes(`subagent=${reviewer}`) && hasBoundIdentity(item.text));
}

function editedFilesAfter(state, timestamp) {
  const edits = state.edits && typeof state.edits === "object" ? state.edits : {};
  return Object.entries(edits)
    .filter(([, value]) => editStamp(value) >= timestamp)
    .map(([file]) => file);
}

function installProofSatisfied(state, timestamp) {
  return anyEvidenceAfter(state, timestamp, ["installProofRuns", "successfulCommands", "verificationRuns"], /\b(staged install|install proof|post-upgrade-canary|rollback-local|update-check|doctor\.sh)\b/);
}

function executeGateStatus(state) {
  const executeAt = latestExecuteRequest(state);
  if (!executeAt) return "";
  const sourceFiles = sourceEditsAfter(state, executeAt);
  const editedFiles = editedFilesAfter(state, executeAt);
  const installProofNeeded = needsInstallProof(state, editedFiles);
  if (sourceFiles.length < 1) {
    // Install-home edits (AGENTS.md/CLAUDE.md/settings*.json) skip the source-edit
    // gauntlet, but they still require install proof and must not bypass the gate.
    if (installProofNeeded && !installProofSatisfied(state, executeAt)) {
      return "missing-install-proof";
    }
    return "";
  }
  const implementations = implementationAgentsAfter(state, executeAt);
  if (implementations.length === 0) return "missing-agent";
  const specReviews = reviewerAgentsAfter(state, executeAt, "etrnl-spec-reviewer");
  const qualityReviews = reviewerAgentsAfter(state, executeAt, "etrnl-quality-reviewer");
  const specsByKey = new Map(specReviews.map((item) => [bindingFromText(item.text), item.at]).filter(([key]) => key));
  const qualityByKey = new Map(qualityReviews.map((item) => [bindingFromText(item.text), item.at]).filter(([key]) => key));
  for (const implementation of implementations) {
    const key = bindingFromText(implementation.text);
    if (!key) return "missing-agent";
    const specAt = specsByKey.get(key) || 0;
    const qualityAt = qualityByKey.get(key) || 0;
    if (specAt <= implementation.at || qualityAt <= implementation.at) return "missing-reviewers";
  }
  if (!anyEvidenceAfter(state, executeAt, ["tddEvidenceRuns", "verificationRuns", "successfulCommands"], /\b(tdd|red[_ -]?green|red_green_verified)\b/)) {
    return "missing-tdd-evidence";
  }
  if (sourceFiles.length >= 2 && !anyEvidenceAfter(state, executeAt, ["simplifierRuns", "requestedSkills", "successfulCommands"], /\b(code-simplifier|simplifier)\b/)) {
    return "missing-simplifier";
  }
  if (newSourceFilesAfter(state, executeAt).length > 0 && !anyEvidenceAfter(state, executeAt, ["reuseEvidenceRuns", "successfulCommands"], /\b(reuse binding|reusebinding|reuse[_ -]?artifact|reuse[_ -]?inventory)\b/)) {
    return "missing-reuse-binding";
  }
  if (needsTypeReview(state, sourceFiles) && !anyEvidenceAfter(state, executeAt, ["typeReviewRuns", "requestedSkills", "successfulCommands"], /\b(typescript-advanced-types|advanced type|advanced types|type trigger)\b/)) {
    return "missing-type-review";
  }
  if (installProofNeeded && !installProofSatisfied(state, executeAt)) {
    return "missing-install-proof";
  }
  return "";
}

try {
  process.stdout.write(executeGateStatus(readState()));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`execute-evidence-check failed: ${detail}`);
  process.exit(2);
}
