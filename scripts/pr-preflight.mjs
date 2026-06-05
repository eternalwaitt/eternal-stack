#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0] || "status";
const json = args.includes("--json");
const commandTimeoutMs = Number(process.env.PR_PREFLIGHT_TIMEOUT_MS || "30000") || 30_000;

function run(bin, binArgs) {
  const result = spawnSync(bin, binArgs, { encoding: "utf8", timeout: commandTimeoutMs, maxBuffer: 16 * 1024 * 1024 });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

function splitLines(value) {
  return String(value || "").split(/\r?\n/).filter(Boolean);
}

function porcelainPath(line) {
  return String(line || "").replace(/^.{1,2}\s+/, "").trim();
}

function emit(payload) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`branch=${payload.branch || ""}`);
    console.log(`upstream=${payload.upstream || ""}`);
    console.log(`dirty=${payload.dirty}`);
    console.log(`existingPr=${payload.existingPr || ""}`);
    for (const item of payload.blockers) console.log(`blocker: ${item}`);
    for (const item of payload.warnings) console.log(`warning: ${item}`);
  }
}

function packageManagerGate() {
  if (existsSync("pnpm-lock.yaml")) return "pnpm";
  if (existsSync("yarn.lock")) return "yarn";
  if (existsSync("bun.lockb")) return "bun";
  if (existsSync("package-lock.json")) return "npm";
  if (existsSync("Cargo.toml")) return "cargo";
  if (existsSync("go.mod")) return "go";
  return "";
}

function status() {
  const blockers = [];
  const warnings = [];
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"]);
  if (!gitRoot.ok) blockers.push("not inside a git repository");
  const branch = run("git", ["branch", "--show-current"]).stdout;
  if (!branch) blockers.push("detached HEAD or missing branch name");
  const upstreamResult = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstream = upstreamResult.ok ? upstreamResult.stdout : "";
  if (!upstream) warnings.push("branch has no upstream");
  const porcelain = splitLines(run("git", ["status", "--porcelain"]).stdout);
  const changedFiles = porcelain.filter((line) => !line.startsWith("?? ")).map((line) => porcelainPath(line)).filter(Boolean);
  const untrackedFiles = porcelain.filter((line) => line.startsWith("?? ")).map((line) => porcelainPath(line));
  const ghVersion = run("gh", ["--version"]);
  const ghAvailable = ghVersion.ok;
  let ghAuthenticated = false;
  let existingPr = "";
  let checkSummary = [];
  if (!ghAvailable) {
    warnings.push("gh CLI unavailable; remote PR state cannot be checked");
  } else {
    ghAuthenticated = run("gh", ["auth", "status"]).ok;
    if (!ghAuthenticated) warnings.push("gh CLI is not authenticated");
    const prView = run("gh", ["pr", "view", "--json", "number,url,headRefName,baseRefName,state"]);
    if (prView.ok) existingPr = prView.stdout;
    const checks = run("gh", ["pr", "checks", "--json", "name,state,workflow,link"]);
    if (checks.ok) {
      try {
        checkSummary = JSON.parse(checks.stdout);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`gh pr checks returned non-JSON output: ${message}`);
      }
    }
  }
  emit({
    schemaVersion: 1,
    command: "status",
    branch,
    upstream,
    dirty: changedFiles.length > 0 || untrackedFiles.length > 0,
    changedFiles,
    untrackedFiles,
    ghAvailable,
    ghAuthenticated,
    existingPr,
    checkSummary,
    suggestedLocalGate: packageManagerGate(),
    blockers,
    warnings,
  });
  process.exit(blockers.length > 0 ? 1 : 0);
}

function validate() {
  const raw = readFileSync(0, "utf8").trim();
  const blockers = [];
  const warnings = [];
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      blockers.push(`invalid JSON input: ${message}`);
      emit({ schemaVersion: 1, command: "validate", blockers, warnings: [] });
      process.exit(1);
    }
  }
  if (!payload.branch) blockers.push("branch missing");
  if (payload.dirty === undefined) blockers.push("dirty status missing");
  if (!Array.isArray(payload.changedFiles)) blockers.push("changedFiles must be an array");
  if (!Array.isArray(payload.blockers)) blockers.push("blockers must be an array");
  if (payload.ghAvailable === true && payload.ghAuthenticated !== true) warnings.push("gh available but not authenticated; remote PR checks will be skipped");
  emit({ schemaVersion: 1, command: "validate", blockers, warnings });
  process.exit(blockers.length > 0 ? 1 : 0);
}

if (command === "status") status();
else if (command === "validate") validate();
else {
  console.error("usage: pr-preflight.mjs status|validate [--json]");
  process.exit(2);
}
