#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const sinceDays = Number(argValue(args, "--since-days", "3")) || 3;
const claudeRoot = expandHome(argValue(args, "--claude-root", process.env.CLAUDE_HOME || "~/.claude"));
const codexMemoryRoot = expandHome(argValue(args, "--codex-memory-root", "~/.codex/memories"));
const keywords = argValue(args, "--keywords", "hook,skill,CodeRabbit,lint,typecheck,tooling,CI,stale,warning,deploy")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
const scriptDir = dirname(fileURLToPath(import.meta.url));

function expandHome(value) {
  if (!value.startsWith("~")) return value;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || "/tmp";
  return `${home}${value.slice(1)}`;
}

function redact(value) {
  return String(value || "")
    .replaceAll(process.env.HOME || "\u0000", "~")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>");
}

function listFiles(dir, suffix, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(path, suffix, out);
    else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(path);
  }
  return out;
}

function recent(file) {
  try {
    return statSync(file).mtimeMs >= cutoffMs;
  } catch {
    return false;
  }
}

function runHookNoise() {
  const result = spawnSync(process.execPath, [
    join(scriptDir, "live-hook-noise-report.mjs"),
    "--root",
    claudeRoot,
    "--since-days",
    String(sinceDays),
    "--json",
  ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) return { error: redact(result.stderr || result.stdout || "hook noise scan failed") };
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: redact(`hook noise JSON parse failed: ${message}`) };
  }
}

function scanCodexMemory() {
  const rolloutDir = join(codexMemoryRoot, "rollout_summaries");
  const files = listFiles(rolloutDir, ".jsonl").filter(recent);
  const hits = new Map(keywords.map((keyword) => [keyword, 0]));
  let linesScanned = 0;
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      linesScanned += 1;
      for (const keyword of keywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) hits.set(keyword, (hits.get(keyword) || 0) + 1);
      }
    }
  }
  return {
    root: redact(codexMemoryRoot),
    filesScanned: files.length,
    linesScanned,
    keywordHits: [...hits.entries()].map(([keyword, count]) => ({ keyword, count })).filter((item) => item.count > 0),
    sampleFiles: files.slice(0, 8).map((file) => redact(relative(codexMemoryRoot, file))),
  };
}

function recommendations(hookNoise, codex) {
  const items = [];
  if ((hookNoise.counts?.nonBlocking || 0) > 0) items.push("route repeated hook errors into a live hook-noise report before adding new hook behavior");
  if ((hookNoise.counts?.blocking || 0) > 0) items.push("treat blocking hook errors as install/runtime drift until the failing hook name is proven current");
  if (codex.keywordHits.some((item) => /CodeRabbit|CI|lint|typecheck/i.test(item.keyword))) items.push("run PR loops through local gates, remote checks, and review feedback before claiming readiness");
  if (codex.keywordHits.some((item) => /skill|tooling|stale/i.test(item.keyword))) items.push("refresh installed skills/scripts after source updates and rerun doctor");
  return items;
}

const hookNoise = runHookNoise();
const codex = scanCodexMemory();
const report = {
  schemaVersion: 1,
  command: "session-audit",
  sinceDays,
  claude: hookNoise,
  codexMemory: codex,
  recommendations: recommendations(hookNoise, codex),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`session-audit sinceDays=${sinceDays}`);
  console.log(`claude hooks nonBlocking=${hookNoise.counts?.nonBlocking || 0} blocking=${hookNoise.counts?.blocking || 0}`);
  console.log(`codex memory files=${codex.filesScanned} keywordRows=${codex.keywordHits.length}`);
  for (const item of report.recommendations) console.log(`recommendation: ${item}`);
}
