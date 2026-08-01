/**
 * Derive allowed spawn task names and plan metadata from an execution plan.
 */

import { readFileSync } from "node:fs";
import { parseRiskTier } from "./plan-risk-tier.mjs";
import { isSpawnNameRegistered } from "./spawn-guard.mjs";

const TASK_ID_PATTERN = /\b(?:task\s*)?id[:\s]+([A-Za-z0-9][A-Za-z0-9_.-]*)/gi;
const CHECKBOX_TASK_PATTERN = /^-\s*\[[ xX]\]\s*(?:\*\*)?([A-Za-z0-9][A-Za-z0-9_.-]*)/gm;
const PATCH_ID_PATTERN = /\b(p\d+[a-z]?)\b/gi;
const TASK_GROUP_HEADING = /^##\s+(?:Task group|Phase|P\d+[-–]\s)/gim;
const MAX_CONCURRENT_LANES_CAP = 6;
const MAX_CONCURRENT_LANES_PATTERNS = [
  /maxConcurrentLanes\s*[=:]\s*(\d+)/i,
  /maximum concurrent implementation lanes:\s*(\d+)/i,
  /at most (\d+) concurrent lanes/i,
  /maxConcurrentLanes\s+is\s+(\d+)/i,
];

const REVIEW_SUFFIXES = ["spec_review", "quality_review", "simplifier_review", "simplifier"];
const IMPLEMENTER_SUFFIXES = ["writer", "executor", "specialist", "server", "migration"];

function parallelizationSection(planText) {
  const match = String(planText || "").match(
    /^##\s+Parallelization strategy\b[^\n]*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/im,
  );
  return match ? match[1] : "";
}

function parseMaxConcurrentLanesFromText(text) {
  for (const pattern of MAX_CONCURRENT_LANES_PATTERNS) {
    const match = String(text || "").match(pattern);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_CONCURRENT_LANES_CAP) {
      return parsed;
    }
  }
  return null;
}

export function extractMaxConcurrentLanes(planText) {
  const text = String(planText || "");
  const scoped = parallelizationSection(text);
  if (scoped) {
    const fromSection = parseMaxConcurrentLanesFromText(scoped);
    if (fromSection !== null) return fromSection;
  }
  return parseMaxConcurrentLanesFromText(text);
}

export function countTaskGroups(planText) {
  const text = String(planText || "");
  const headings = text.match(TASK_GROUP_HEADING) ?? [];
  const phaseBlocks = text.match(/^##\s+Phase\s+/gim) ?? [];
  return Math.max(headings.length, phaseBlocks.length, 0);
}

export function extractPlanTaskIds(planText) {
  const ids = new Set();
  const text = String(planText || "");
  let match;
  TASK_ID_PATTERN.lastIndex = 0;
  while ((match = TASK_ID_PATTERN.exec(text)) !== null) {
    ids.add(match[1]);
  }
  CHECKBOX_TASK_PATTERN.lastIndex = 0;
  while ((match = CHECKBOX_TASK_PATTERN.exec(text)) !== null) {
    ids.add(match[1]);
    const patchMatch = match[0].match(/\b(p\d+[a-z]?)\b/i);
    if (patchMatch) ids.add(patchMatch[1].toLowerCase());
  }
  return [...ids];
}

export function buildAllowedSpawnNames(taskIds) {
  const allowed = new Set();
  for (const id of taskIds) {
    const base = String(id).trim();
    if (!base) continue;
    allowed.add(base);
    for (const suffix of REVIEW_SUFFIXES) {
      allowed.add(`${base}_${suffix}`);
    }
    for (const suffix of IMPLEMENTER_SUFFIXES) {
      allowed.add(`${base}_${suffix}`);
    }
  }
  return allowed;
}

export function isAllowedSpawnName(taskName, allowedNames) {
  const ledger = allowedNames instanceof Set
    ? { allowedSpawnNames: [...allowedNames] }
    : { allowedSpawnNames: Array.isArray(allowedNames) ? allowedNames : [] };
  return isSpawnNameRegistered(taskName, ledger);
}

export function resolvePlanScopeFromFile(planPath) {
  try {
    const text = readFileSync(planPath, "utf8");
    const triage = text.match(/Scope triage:\s*(\w+)/i)?.[1]?.toLowerCase();
    if (triage) return { scope: triage, reason: "plan-scope-line" };
    const { tier } = parseRiskTier(text);
    if (tier >= 3) return { scope: "large", reason: "tier-3-full-packet" };
    if (tier < 2) return { scope: "not-applicable", reason: "tier-below-2" };
    return { scope: "small", reason: "tier-2-default" };
  } catch {
    return { scope: "large", reason: "plan-unreadable" };
  }
}

export function loadPlanRegistry(planPath) {
  try {
    const text = readFileSync(planPath, "utf8");
    const taskIds = extractPlanTaskIds(text);
    const taskGroupCount = countTaskGroups(text);
    return {
      planPath,
      readable: true,
      taskIds,
      taskGroupCount,
      maxConcurrentLanes: extractMaxConcurrentLanes(text),
      allowedSpawnNames: [...buildAllowedSpawnNames(taskIds)],
    };
  } catch {
    return {
      planPath,
      readable: false,
      taskIds: [],
      taskGroupCount: 0,
      maxConcurrentLanes: null,
      allowedSpawnNames: [],
    };
  }
}
