#!/usr/bin/env node
import { readFileSync } from "node:fs";

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
    files: (plan.files || plan.filesModified || plan.writeScope || []).map(String),
  };
}

function intersects(left, right) {
  return left.some((item) => right.includes(item));
}

function submoduleHit(files, submodules) {
  return files.some((file) => submodules.some((submodule) => file === submodule || file.startsWith(`${submodule}/`)));
}

function analyzeWave(wave, plans, submodules, useWorktrees) {
  const seen = new Map();
  const overlaps = [];
  for (const plan of plans) {
    for (const file of plan.files) {
      if (seen.has(file)) overlaps.push({ file, plans: [seen.get(file), plan.id] });
      else seen.set(file, plan.id);
    }
  }
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
