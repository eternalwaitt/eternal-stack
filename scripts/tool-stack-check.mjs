#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const valueAfter = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
const statePath = process.env.CLAUDE_CONTROL_PLANE_TOOL_STACK_STATE ||
  path.join(claudeHome, "control-plane", "tool-stack-state.json");
const latestTtlSec = Number(process.env.CLAUDE_CONTROL_PLANE_TOOL_UPDATE_INTERVAL_SEC || 21_600);
const jsonMode = hasFlag("--json");
const explainMode = hasFlag("--explain");
const force = hasFlag("--force");
const projectPath = valueAfter("--project", valueAfter("--cwd", ""));

function usage() {
  console.error("usage: tool-stack-check.mjs [--json|--explain] [--force] [--project <path>]");
  process.exit(2);
}

if (hasFlag("--help") || hasFlag("-h")) usage();

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 15_000,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : "",
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function commandPath(command) {
  const found = run("command", ["-v", command], { timeout: 5000 });
  if (found.ok && found.stdout) return found.stdout.split(/\n/)[0];
  const shellFound = run("sh", ["-lc", `command -v ${command}`], { timeout: 5000 });
  return shellFound.ok && shellFound.stdout ? shellFound.stdout.split(/\n/)[0] : "";
}

function parseSemver(text) {
  const match = String(text || "").match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
  return match ? match[1] : "";
}

function compareSemver(left, right) {
  const leftVersion = semverTuple(left);
  const rightVersion = semverTuple(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = leftVersion.core[index] - rightVersion.core[index];
    if (delta !== 0) return delta;
  }
  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function semverTuple(version) {
  const withoutBuild = String(version || "0.0.0").split("+")[0];
  const prereleaseIndex = withoutBuild.indexOf("-");
  const coreText = prereleaseIndex < 0 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex);
  const prereleaseText = prereleaseIndex < 0 ? "" : withoutBuild.slice(prereleaseIndex + 1);
  return {
    core: coreText.split(".").slice(0, 3).map((part) => Number(part || 0)),
    prerelease: prereleaseText ? prereleaseText.split(".") : [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) {
      const delta = Number(left[index]) - Number(right[index]);
      if (delta !== 0) return delta;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    const delta = left[index].localeCompare(right[index]);
    if (delta !== 0) return delta;
  }
  return 0;
}

function cacheKey(toolId) {
  return `latest:${toolId}`;
}

function latestFromCache(cache, toolId) {
  const entry = cache[cacheKey(toolId)];
  if (!entry || force) return "";
  const checkedAt = Number(entry.checkedAt || 0);
  if (checkedAt <= 0 || Math.floor(Date.now() / 1000) - checkedAt > latestTtlSec) return "";
  return String(entry.version || "");
}

function saveLatest(cache, toolId, version) {
  if (!version) return;
  cache[cacheKey(toolId)] = { version, checkedAt: Math.floor(Date.now() / 1000) };
}

function npmLatest(packageName) {
  const npm = commandPath("npm");
  if (!npm) return { version: "", error: "npm-unavailable" };
  const result = run(npm, ["view", packageName, "version"], { timeout: 15_000 });
  return { version: result.ok ? parseSemver(result.stdout) : "", error: result.ok ? "" : result.stderr || result.error || "npm-view-failed" };
}

function npmLatestWithFallback(packageName, fallback) {
  const latest = npmLatest(packageName);
  return latest.version ? latest : fallback();
}

function brewLatest(formulaName) {
  const brew = commandPath("brew");
  if (!brew) return { version: "", error: "brew-unavailable" };
  const json = run(brew, ["info", formulaName, "--json=v2"], { timeout: 20_000 });
  if (json.ok && json.stdout) {
    try {
      const parsed = JSON.parse(json.stdout);
      const formula = parsed.formulae?.find((item) => item.name === formulaName) || parsed.formulae?.[0];
      const version = parseSemver(formula?.versions?.stable || "");
      if (version) return { version, error: "" };
    } catch {
      // Fall through to text parser.
    }
  }
  const text = run(brew, ["info", formulaName], { timeout: 20_000 });
  return { version: text.ok ? parseSemver(text.stdout) : "", error: text.ok ? "" : text.stderr || text.error || "brew-info-failed" };
}

function toolStatus(tool, cache) {
  const bin = commandPath(tool.command);
  const installed = Boolean(bin);
  const versionResult = installed ? run(bin, tool.versionArgs, { timeout: 10_000 }) : { ok: false, stdout: "", stderr: "", error: "missing" };
  const currentVersion = installed ? parseSemver(versionResult.stdout || versionResult.stderr) : "";
  let latestVersion = latestFromCache(cache, tool.id);
  let latestError = "";
  if (!latestVersion) {
    const latest = tool.latest();
    latestVersion = latest.version;
    latestError = latest.error;
    saveLatest(cache, tool.id, latestVersion);
  }
  const updateAvailable = Boolean(currentVersion && latestVersion && compareSemver(currentVersion, latestVersion) < 0);
  return {
    id: tool.id,
    command: tool.command,
    installed,
    path: bin,
    currentVersion,
    latestVersion,
    latestError,
    updateAvailable,
    installCommand: tool.installCommand,
    updateCommand: tool.updateCommand,
    healthCommand: tool.healthCommand,
  };
}

function projectStatus(projectRoot) {
  if (!projectRoot) return null;
  const resolved = path.resolve(projectRoot);
  if (!fs.existsSync(resolved)) return failedProjectStatus(resolved, "path does not exist");
  if (!fs.statSync(resolved).isDirectory()) return failedProjectStatus(resolved, "path is not a directory");
  const codegraphDir = path.join(resolved, ".codegraph");
  const beadsDir = path.join(resolved, ".beads");
  const codegraphStatus = commandPath("codegraph")
    ? run("codegraph", ["status", "--json", resolved], { timeout: 20_000 })
    : { ok: false, stdout: "", stderr: "", error: "codegraph-missing" };
  const beadsStatus = commandPath("bd")
    ? run("bd", ["-C", resolved, "status", "--json"], { timeout: 20_000 })
    : { ok: false, stdout: "", stderr: "", error: "bd-missing" };
  return {
    path: resolved,
    codegraphInitialized: fs.existsSync(codegraphDir),
    codegraphHealthy: codegraphStatus.ok,
    codegraphError: codegraphStatus.ok ? "" : codegraphStatus.stderr || codegraphStatus.error,
    beadsInitialized: fs.existsSync(beadsDir),
    beadsHealthy: beadsStatus.ok,
    beadsError: beadsStatus.ok ? "" : beadsStatus.stderr || beadsStatus.error,
    bootstrapCommand: `bash ~/.claude/scripts/bootstrap-tools.sh project --project ${shellQuote(resolved)}`,
  };
}

function failedProjectStatus(resolved, message) {
  return {
    path: resolved,
    error: message,
    codegraphInitialized: false,
    codegraphHealthy: false,
    codegraphError: message,
    beadsInitialized: false,
    beadsHealthy: false,
    beadsError: message,
    bootstrapCommand: `bash ~/.claude/scripts/bootstrap-tools.sh project --project ${shellQuote(resolved)}`,
  };
}

const tools = [
  {
    id: "codegraph",
    command: "codegraph",
    versionArgs: ["--version"],
    latest: () => npmLatest("@colbymchenry/codegraph"),
    installCommand: "npm install -g @colbymchenry/codegraph && codegraph install --target all --location global --yes",
    updateCommand: "npm install -g @colbymchenry/codegraph && codegraph install --target all --location global --yes",
    healthCommand: "codegraph --version && codegraph install --print-config codex",
  },
  {
    id: "beads",
    command: "bd",
    versionArgs: ["version"],
    latest: () => npmLatestWithFallback("@beads/bd", () => brewLatest("beads")),
    installCommand: "npm install -g @beads/bd",
    updateCommand: "npm install -g @beads/bd",
    healthCommand: "bd version && bd status --json",
  },
];

const cache = readJson(statePath, {});
const toolRows = tools.map((tool) => toolStatus(tool, cache));
writeJson(statePath, cache);

const missing = toolRows.filter((tool) => !tool.installed);
const updates = toolRows.filter((tool) => tool.updateAvailable);
const project = projectStatus(projectPath);
const result = {
  ok: missing.length === 0,
  schemaVersion: 1,
  command: "tool-stack-check",
  checkedAt: new Date().toISOString(),
  tools: Object.fromEntries(toolRows.map((tool) => [tool.id, tool])),
  missingTools: missing.map((tool) => tool.id),
  updatesAvailable: updates.map((tool) => tool.id),
  project,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (explainMode) {
  console.log(`Tool stack check: ${missing.length === 0 ? "installed" : "missing tools"}`);
  for (const tool of toolRows) {
    const versionText = tool.currentVersion ? `${tool.currentVersion}${tool.latestVersion ? ` latest=${tool.latestVersion}` : ""}` : "missing";
    console.log(`${tool.id}: ${versionText}`);
  }
  if (project) {
    console.log(`Project: ${project.path}`);
    console.log(`CodeGraph index: ${project.codegraphHealthy ? "healthy" : project.codegraphInitialized ? "present but unhealthy" : "missing"}`);
    console.log(`Beads database: ${project.beadsHealthy ? "healthy" : project.beadsInitialized ? "present but unhealthy" : "missing"}`);
  }
} else {
  for (const tool of missing) {
    console.log(`TOOL_STACK_MISSING ${tool.id} install="${tool.installCommand}"`);
  }
  for (const tool of updates) {
    console.log(`TOOL_STACK_UPDATE_AVAILABLE ${tool.id} current=${tool.currentVersion} latest=${tool.latestVersion} run="${tool.updateCommand}"`);
  }
  if (project && (!project.codegraphHealthy || !project.beadsHealthy)) {
    console.log(`TOOL_STACK_PROJECT_BOOTSTRAP_AVAILABLE run=${shellQuote(project.bootstrapCommand)}`);
  }
}
