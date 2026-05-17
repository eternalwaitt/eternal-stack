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
  return JSON.parse(raw);
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

const input = readInput();
const plans = (input.plans || input).map(normalizePlan);
const submodules = (input.submodules || []).map(String);
const useWorktrees = input.useWorktrees !== false;
const waves = [...new Set(plans.map((plan) => plan.wave))].sort((a, b) => a - b)
  .map((wave) => analyzeWave(wave, plans.filter((plan) => plan.wave === wave), submodules, useWorktrees));

console.log(JSON.stringify({ schemaVersion: 1, waves }, null, 2));
if (strict && waves.some((wave) => wave.parallelSafe === false)) {
  process.exit(1);
}
