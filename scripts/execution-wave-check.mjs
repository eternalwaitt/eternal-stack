#!/usr/bin/env node
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");

function readInput() {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) {
    console.error("execution-wave-check requires JSON on stdin.");
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`execution-wave-check invalid JSON: ${message}`);
    process.exit(2);
  }
}

function normalizePlan(plan) {
  return {
    id: String(plan.id || plan.taskId || ""),
    wave: Number(plan.wave || 1),
    files: (plan.files || plan.filesModified || plan.writeScope || []).map(normalizePath),
  };
}

function normalizePath(file) {
  return String(file || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "")
    .replace(/^\.\//, "") || ".";
}

function pathsOverlap(left, right) {
  if (left === right) return true;
  if (left === "." || right === ".") return true;
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function submoduleHit(files, submodules) {
  return files.some((file) => submodules.some((submodule) => file === submodule || file.startsWith(`${submodule}/`)));
}

function comparableFileList(files) {
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function analyzeWave(wave, plans, submodules, useWorktrees) {
  const overlapsByKey = new Map();
  for (let leftIndex = 0; leftIndex < plans.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < plans.length; rightIndex += 1) {
      const leftPlan = plans[leftIndex];
      const rightPlan = plans[rightIndex];
      for (const leftFile of leftPlan.files) {
        for (const rightFile of rightPlan.files) {
          if (!pathsOverlap(leftFile, rightFile)) continue;
          const file = leftFile === rightFile ? leftFile : `${leftFile} <-> ${rightFile}`;
          const key = `${file}:${leftPlan.id}:${rightPlan.id}`;
          overlapsByKey.set(key, { file, plans: [leftPlan.id, rightPlan.id].sort((left, right) => left.localeCompare(right)) });
        }
      }
    }
  }
  const overlaps = [...overlapsByKey.values()];
  return {
    wave,
    parallelSafe: overlaps.length === 0,
    overlaps,
    heartbeat: `[checkpoint] wave ${wave} starting, ${plans.length} task(s)`,
    plans: plans.map((plan) => ({
      id: plan.id,
      worktreeEligible: Boolean(useWorktrees && !submoduleHit(plan.files, submodules)),
    })),
  };
}

function driftEntries(previousPlans, currentPlans) {
  const previous = new Map(previousPlans.map((plan) => [plan.id, plan]));
  const current = new Map(currentPlans.map((plan) => [plan.id, plan]));
  const drift = [];
  for (const [id, plan] of current.entries()) {
    const before = previous.get(id);
    if (!before) {
      drift.push({ id, type: "added" });
      continue;
    }
    if (before.wave !== plan.wave) drift.push({ id, type: "wave_changed", before: before.wave, after: plan.wave });
    const beforeFiles = comparableFileList(before.files).join("\0");
    const afterFiles = comparableFileList(plan.files).join("\0");
    if (beforeFiles !== afterFiles) drift.push({ id, type: "files_changed", before: before.files, after: plan.files });
  }
  for (const id of previous.keys()) {
    if (!current.has(id)) drift.push({ id, type: "removed" });
  }
  return drift;
}

const input = readInput();
const plans = (input.plans || input).map(normalizePlan);
const previousPlans = (input.previousPlans || input.expectedPlans || []).map(normalizePlan);
const submodules = (input.submodules || []).map(String);
const useWorktrees = input.useWorktrees !== false;
const waves = [...new Set(plans.map((plan) => plan.wave))].sort((a, b) => a - b)
  .map((wave) => analyzeWave(wave, plans.filter((plan) => plan.wave === wave), submodules, useWorktrees));
const drift = previousPlans.length > 0 ? driftEntries(previousPlans, plans) : [];

// schemaVersion anchors consumers; drift reports added/removed plans, wave changes, and order-insensitive file membership changes.
console.log(JSON.stringify({ schemaVersion: 1, waves, drift }, null, 2));
// --strict fails when a wave has file overlap or when any previous/current plan drift is detected.
if (strict && (waves.some((wave) => wave.parallelSafe === false) || drift.length > 0)) {
  process.exit(1);
}
