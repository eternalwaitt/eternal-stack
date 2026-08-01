/**
 * Derive allowed spawn task names and plan metadata from an execution plan.
 */

import { readFileSync } from "node:fs";
import { parseRiskTier } from "./plan-risk-tier.mjs";

const TASK_ID_PATTERN = /\b(?:task\s*)?id[:\s]+([A-Za-z0-9][A-Za-z0-9_.-]*)/gi;
const CHECKBOX_TASK_PATTERN = /^-\s*\[[ xX]\]\s*(?:\*\*)?([A-Za-z0-9][A-Za-z0-9_.-]*)/gm;
const PATCH_ID_PATTERN = /\b(p\d+[a-z]?)\b/gi;
const TASK_GROUP_HEADING = /^##\s+(?:Task group|Phase|P\d+[-–]\s)/gim;

const REVIEW_SUFFIXES = ["spec_review", "quality_review", "simplifier_review", "simplifier"];
const IMPLEMENTER_SUFFIXES = ["writer", "executor", "specialist", "server", "migration"];

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
  }
  PATCH_ID_PATTERN.lastIndex = 0;
  while ((match = PATCH_ID_PATTERN.exec(text)) !== null) {
    ids.add(match[1].toLowerCase());
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
  if (!allowedNames || allowedNames.size === 0) return true;
  const name = String(taskName || "").trim();
  if (!name) return false;
  if (/^wave[\w-]*_(spec|quality|simplifier)(?:_review)?$/i.test(name)) return true;
  if (/^surface-[\w-]+_wave-\d+_(spec|quality|simplifier)(?:_review)?$/i.test(name)) return true;
  if (allowedNames.has(name)) return true;
  for (const allowed of allowedNames) {
    if (name.startsWith(`${allowed}_`)) return true;
  }
  return false;
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
      taskIds,
      taskGroupCount,
      allowedSpawnNames: [...buildAllowedSpawnNames(taskIds)],
    };
  } catch {
    return {
      planPath,
      taskIds: [],
      taskGroupCount: 0,
      allowedSpawnNames: [],
    };
  }
}
