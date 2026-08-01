#!/usr/bin/env node
/**
 * Diff-size review scope for tier 0-2. Tier >= 3 always full_lenses.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { planTouchesInstallSurface } from "./lib/plan-risk-tier.mjs";

const SMALL_MAX = Number(process.env.ETRNL_REVIEW_SCOPE_SMALL_MAX ?? 50);
const MEDIUM_MAX = Number(process.env.ETRNL_REVIEW_SCOPE_MEDIUM_MAX ?? 200);

const NEVER_GATE_FRAGMENTS = [
  "auth",
  "payment",
  "money",
  "migration",
  "tenant",
  "install",
  "hook",
  "schema",
];

export function diffLineCount(cwd, baseRef = "HEAD") {
  try {
    const out = execSync(`git diff --numstat ${baseRef}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let lines = 0;
    for (const row of out.split("\n")) {
      if (!row.trim()) continue;
      const parts = row.split("\t");
      if (parts.length < 2) continue;
      lines += Number.parseInt(parts[0], 10) || 0;
      lines += Number.parseInt(parts[1], 10) || 0;
    }
    return lines;
  } catch {
    return MEDIUM_MAX + 1;
  }
}

export function changedPaths(cwd, baseRef = "HEAD") {
  try {
    const out = execSync(`git diff --name-only ${baseRef}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function isNeverGatePath(filePath) {
  const lower = String(filePath || "").toLowerCase();
  return NEVER_GATE_FRAGMENTS.some((frag) => lower.includes(frag));
}

export function classifyReviewScope({ riskTier, planPath, cwd = process.cwd(), waveId = "", baseRef = "HEAD", diffLines = null }) {
  if (Number(riskTier) >= 3) {
    return { mode: "full_lenses", reason: "tier-3-invariant", lineCount: null, waveId };
  }
  const workCwd = path.resolve(cwd || process.cwd());
  const resolvedPlan = planPath ? path.resolve(workCwd, planPath) : "";
  const paths = changedPaths(workCwd, baseRef);
  if (paths.some(isNeverGatePath)) {
    return { mode: "full_lenses", reason: "never-gate-path", lineCount: diffLineCount(workCwd, baseRef), waveId };
  }
  if (resolvedPlan && existsSync(resolvedPlan)) {
    try {
      const planText = readFileSync(resolvedPlan, "utf8");
      if (planTouchesInstallSurface(planText)) {
        return { mode: "full_lenses", reason: "install-surface", lineCount: diffLineCount(workCwd, baseRef), waveId };
      }
    } catch {
      return { mode: "full_lenses", reason: "plan-unreadable", lineCount: null, waveId };
    }
  } else if (planPath) {
    return { mode: "full_lenses", reason: "plan-unreadable", lineCount: null, waveId };
  }
  const explicitDiffLines = Number.isInteger(diffLines) && diffLines >= 0;
  const lineCount = explicitDiffLines
    ? diffLines
    : diffLineCount(workCwd, baseRef);
  if (lineCount < SMALL_MAX) {
    return { mode: "deterministic_only", reason: "diff-under-small-max", lineCount, waveId };
  }
  if (lineCount < MEDIUM_MAX) {
    return { mode: "merged_quality", reason: "diff-under-medium-max", lineCount, waveId };
  }
  return { mode: "full_lenses", reason: "diff-at-or-above-medium-max", lineCount, waveId };
}

import { fileURLToPath } from "node:url";

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "classify") {
    const json = args.includes("--json");
    const cwd = args.includes("--cwd") ? args[args.indexOf("--cwd") + 1] : process.cwd();
    const tier = Number(args.includes("--tier") ? args[args.indexOf("--tier") + 1] : 2);
    const plan = args.includes("--plan") ? args[args.indexOf("--plan") + 1] : "";
    const waveId = args.includes("--wave") ? args[args.indexOf("--wave") + 1] : "";
    const diffLinesRaw = args.includes("--diff-lines") ? args[args.indexOf("--diff-lines") + 1] : "";
    const diffLines = diffLinesRaw === "" ? null : Number.parseInt(diffLinesRaw, 10);
    if (diffLinesRaw !== "" && (!Number.isInteger(diffLines) || diffLines < 0)) {
      process.stderr.write("review-scope: --diff-lines must be a non-negative integer\n");
      process.exit(2);
    }
    const result = classifyReviewScope({ riskTier: tier, planPath: plan, cwd, waveId, diffLines });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`mode=${result.mode} reason=${result.reason} lines=${result.lineCount ?? "n/a"}`);
  } else if (command && command !== "--help") {
    process.stderr.write("usage: review-scope.mjs classify [--cwd <dir>] [--tier <n>] [--plan <path>] [--wave <id>] [--diff-lines <n>] [--json]\n");
    process.exit(2);
  }
}
