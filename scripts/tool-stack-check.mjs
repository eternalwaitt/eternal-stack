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
const bootstrapToolsPath = path.join(claudeHome, "scripts", "bootstrap-tools.sh");
const statePath = process.env.ETRNL_TOOL_STACK_STATE ||
  path.join(claudeHome, "etrnl", "tool-stack-state.json");
const DEFAULT_LATEST_TTL_SEC = 21_600;
const latestTtlSec = parsePositiveIntegerEnv("ETRNL_TOOL_UPDATE_INTERVAL_SEC", DEFAULT_LATEST_TTL_SEC);
const jsonMode = hasFlag("--json");
const explainMode = hasFlag("--explain");
const force = hasFlag("--force");
const projectPath = valueAfter("--project", valueAfter("--cwd", ""));
const hindsightStrictChecks = /^(1|true|yes)$/i.test(process.env.HINDSIGHT_STRICT_CHECKS || "");
const npmSpecPattern = /^(@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+)(@[A-Za-z0-9._~+-]+)?$/;
function npmSpecFromEnv(name, fallback) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return fallback;
  const value = process.env[name] || "";
  if (!npmSpecPattern.test(value)) {
    console.error(`unsafe ${name} npm spec: ${value || "<empty>"}`);
    process.exit(2);
  }
  return value;
}
const toolSpecs = {
  codegraph: npmSpecFromEnv("ETRNL_CODEGRAPH_NPM_SPEC", "@colbymchenry/codegraph@1.0.1"),
  beads: npmSpecFromEnv("ETRNL_BEADS_NPM_SPEC", "@beads/bd@1.0.5"),
};

function usage() {
  console.error("usage: tool-stack-check.mjs [--json|--explain] [--force] [--project <path>]");
  process.exit(2);
}

if (hasFlag("--help") || hasFlag("-h")) usage();

function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  console.error(`warning: ignoring invalid ${name}=${JSON.stringify(raw)}; using ${fallback}`);
  return fallback;
}

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
  const shellFound = run("sh", ["-c", 'command -v "$1"', "--", command], { timeout: 5000 });
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
    bootstrapCommand: `bash ${shellQuote(bootstrapToolsPath)} project --project ${shellQuote(resolved)}`,
  };
}

function hindsightConfigPath() {
  const hindsightHome = process.env.HINDSIGHT_HOME ? path.resolve(process.env.HINDSIGHT_HOME) : path.join(os.homedir(), ".hindsight");
  return path.join(hindsightHome, "claude-code.json");
}

function curlHealth(url) {
  const curl = commandPath("curl");
  if (!curl) return { ok: false, error: "curl-unavailable" };
  const result = run(curl, ["-fsS", "--max-time", "2", `${url.replace(/\/$/, "")}/health`], { timeout: 3000 });
  return { ok: result.ok, error: result.ok ? "" : result.stderr || result.error || "health-check-failed" };
}

function githubLatestRelease(cache, repo, cacheKeyId) {
  let latestVersion = latestFromCache(cache, cacheKeyId);
  if (latestVersion) return { version: latestVersion, error: "" };
  const gh = commandPath("gh");
  if (!gh) return { version: "", error: "gh-unavailable" };
  const result = run(gh, ["release", "view", "--repo", repo, "--json", "tagName", "--jq", ".tagName"], { timeout: 15_000 });
  const version = result.ok ? parseSemver(result.stdout) : "";
  if (version) saveLatest(cache, cacheKeyId, version);
  return { version, error: version ? "" : result.stderr || result.error || "gh-release-failed" };
}

const HINDSIGHT_PLUGIN_NAME = "hindsight-memory";

function listDirectoryNames(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function hindsightPluginCacheRoots(homeDir) {
  const cacheRoot = path.join(homeDir, "plugins", "cache");
  return [
    path.join(cacheRoot, "hindsight", HINDSIGHT_PLUGIN_NAME),
    path.join(cacheRoot, HINDSIGHT_PLUGIN_NAME),
  ];
}

function hindsightPluginCacheLooksInstalled(versionDir) {
  return ["hooks/hooks.json", "settings.json", ".claude-plugin/plugin.json"].some((relativePath) =>
    fs.existsSync(path.join(versionDir, ...relativePath.split("/"))),
  );
}

function hindsightPluginFromCache(homeDir) {
  let bestVersion = "";
  let cachePath = "";
  for (const root of hindsightPluginCacheRoots(homeDir)) {
    for (const versionName of listDirectoryNames(root)) {
      const version = parseSemver(versionName);
      if (!version) continue;
      const candidate = path.join(root, versionName);
      if (!hindsightPluginCacheLooksInstalled(candidate)) continue;
      if (!bestVersion || compareSemver(version, bestVersion) > 0) {
        bestVersion = version;
        cachePath = candidate;
      }
    }
  }
  return {
    installed: Boolean(bestVersion),
    version: bestVersion,
    cachePath,
  };
}

function hindsightPluginFromCli(claudePath) {
  const pluginList = run(claudePath, ["plugin", "list"], { timeout: 10_000 });
  // probeOk distinguishes a failed CLI invocation (ambiguous) from a successful
  // run that simply did not list the plugin (authoritative "not installed").
  if (!pluginList.ok) {
    return {
      installed: false,
      probeOk: false,
      version: "",
      source: "claude-cli",
      error: pluginList.error || pluginList.stderr || "plugin-list-failed",
    };
  }
  if (!new RegExp(HINDSIGHT_PLUGIN_NAME, "i").test(pluginList.stdout)) {
    return {
      installed: false,
      probeOk: true,
      version: "",
      source: "claude-cli",
      error: "",
    };
  }
  const versionMatch = pluginList.stdout.match(new RegExp(`${HINDSIGHT_PLUGIN_NAME}(?:@[^\\s]+)?\\s+(\\S+)`, "i"));
  return {
    installed: true,
    probeOk: true,
    version: versionMatch ? parseSemver(versionMatch[1]) : "",
    source: "claude-cli",
    error: "",
  };
}

function hindsightStatus() {
  const settingsPath = path.join(claudeHome, "settings.json");
  const settings = readJson(settingsPath, {});
  const pluginEnabled = settings.enabledPlugins?.["hindsight-memory@hindsight"] === true;
  const claude = commandPath("claude");
  const cliProbe = claude ? hindsightPluginFromCli(claude) : { installed: false, probeOk: false, version: "", source: "none", error: "claude-missing" };
  const cacheProbe = hindsightPluginFromCache(claudeHome);
  // The CLI is authoritative when it ran successfully; only fall back to the
  // cache hint when the CLI could not produce a definitive answer.
  const cacheFallback = !cliProbe.probeOk && cacheProbe.installed;
  const pluginInstalled = cliProbe.installed || cacheFallback;
  const pluginInstallSource = cliProbe.installed ? "claude-cli" : (cacheFallback ? "plugin-cache" : "none");
  // When the CLI ran successfully it is authoritative: a definitive "not
  // installed" must not borrow a stale version from the plugin cache.
  const currentVersion = cliProbe.probeOk
    ? (cliProbe.installed ? (cliProbe.version || "") : "")
    : (cacheProbe.version || "");
  const configPath = hindsightConfigPath();
  const config = readJson(configPath, null);
  const configExists = Boolean(config);
  const apiUrl = configExists ? String(config.hindsightApiUrl || "").replace(/\/$/, "") : "";
  const mode = configExists ? (apiUrl ? "external-api" : "local-daemon") : "missing-config";
  const issues = [];
  const warnings = [];
  const addConfigFinding = (message) => (hindsightStrictChecks ? issues : warnings).push(message);
  if (pluginEnabled && !pluginInstalled) issues.push("enabled plugin is not installed");
  if (pluginEnabled && cacheFallback) {
    warnings.push(
      claude
        ? "Hindsight plugin verified from installed-home cache; claude CLI could not confirm"
        : "Hindsight plugin verified from installed-home cache; claude CLI not on PATH",
    );
  }
  if (pluginEnabled && !configExists) issues.push("enabled plugin has no Hindsight config");
  if (configExists) {
    if (config.dynamicBankId !== true) addConfigFinding("dynamicBankId should be true");
    if (JSON.stringify(config.dynamicBankGranularity) !== JSON.stringify(["agent", "project"])) addConfigFinding("dynamicBankGranularity should be [agent,project]");
    if (Number(config.recallContextTurns) > 3) addConfigFinding("recallContextTurns should be <= 3");
    if (config.retainToolCalls !== false) addConfigFinding("retainToolCalls should be false");
    if (!String(config.recallPromptPreamble || "").includes("Fresh repo/runtime evidence overrides memory")) addConfigFinding("fresh-evidence preamble missing");
  }
  const apiHealth = apiUrl ? curlHealth(apiUrl) : { ok: true, skipped: true, reason: mode === "local-daemon" ? "local daemon starts on demand; use canary for live port check" : "no api url configured" };
  if (pluginEnabled && apiUrl && !apiHealth.ok) issues.push(`Hindsight API health failed: ${apiHealth.error}`);
  const latest = githubLatestRelease(cache, "vectorize-io/hindsight", "hindsight");
  return {
    id: "hindsight",
    kind: "claude-plugin",
    claudeInstalled: Boolean(claude),
    installed: pluginInstalled,
    pluginInstalled,
    pluginInstallSource,
    pluginCachePath: cacheProbe.cachePath || "",
    pluginEnabled,
    configExists,
    configPath,
    mode,
    safeRetention: configExists ? config.retainToolCalls === false : false,
    apiHealth,
    currentVersion,
    latestVersion: latest.version,
    latestError: latest.error,
    ok: !pluginEnabled || (pluginInstalled && configExists && issues.length === 0 && apiHealth.ok),
    issues,
    warnings,
    strictChecks: hindsightStrictChecks,
    installCommand: "claude plugin marketplace add vectorize-io/hindsight && claude plugin install hindsight-memory",
    updateCommand: "claude plugin update hindsight-memory",
    healthCommand: "scripts/canary-hindsight.sh",
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
    bootstrapCommand: `bash ${shellQuote(bootstrapToolsPath)} project --project ${shellQuote(resolved)}`,
  };
}

const tools = [
  // Admin-tool install commands interpolate environment specs after regex
  // validation blocks shell metacharacters; trusted administrator-controlled
  // input remains an additional defense in depth.
  {
    id: "codegraph",
    command: "codegraph",
    versionArgs: ["--version"],
    latest: () => npmLatest("@colbymchenry/codegraph"),
    installCommand: `npm install -g ${toolSpecs.codegraph} && codegraph install --target all --location global --yes`,
    updateCommand: `npm install -g ${toolSpecs.codegraph} && codegraph install --target all --location global --yes`,
    healthCommand: "codegraph --version && codegraph install --print-config codex",
  },
  {
    id: "beads",
    command: "bd",
    versionArgs: ["version"],
    latest: () => npmLatestWithFallback("@beads/bd", () => brewLatest("beads")),
    installCommand: `npm install -g ${toolSpecs.beads}`,
    updateCommand: `npm install -g ${toolSpecs.beads}`,
    healthCommand: "bd version && bd status --json",
  },
];

const cache = readJson(statePath, {});
const toolRows = tools.map((tool) => toolStatus(tool, cache));
const hindsight = hindsightStatus();
writeJson(statePath, cache);

const missing = toolRows.filter((tool) => !tool.installed);
const updates = toolRows.filter((tool) => tool.updateAvailable);
const project = projectStatus(projectPath);

function formatToolVersion(tool) {
  if (!tool.currentVersion) return `${tool.id}: missing`;
  const latest = tool.latestVersion ? ` latest=${tool.latestVersion}` : "";
  return `${tool.id}: ${tool.currentVersion}${latest}`;
}

function formatHindsightStatus(hindsightRow) {
  if (!hindsightRow.pluginEnabled) return `hindsight: disabled mode=${hindsightRow.mode}`;
  const health = hindsightRow.ok ? "enabled healthy" : `enabled unhealthy (${hindsightRow.issues.join("; ")})`;
  const warnings = hindsightRow.warnings?.length ? ` warnings=${hindsightRow.warnings.join("; ")}` : "";
  return `hindsight: ${health} mode=${hindsightRow.mode}${warnings}`;
}

function formatProjectStatus(label, healthy, initialized) {
  if (healthy) return `${label}: healthy`;
  return `${label}: ${initialized ? "present but unhealthy" : "missing"}`;
}

const result = {
  ok: missing.length === 0 && hindsight.ok,
  schemaVersion: 1,
  command: "tool-stack-check",
  checkedAt: new Date().toISOString(),
  tools: {
    ...Object.fromEntries(toolRows.map((tool) => [tool.id, tool])),
    hindsight,
  },
  missingTools: missing.map((tool) => tool.id),
  updatesAvailable: updates.map((tool) => tool.id),
  project,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (explainMode) {
  console.log(`Tool stack check: ${missing.length === 0 ? "installed" : "missing tools"}`);
  for (const tool of toolRows) {
    console.log(formatToolVersion(tool));
  }
  console.log(formatHindsightStatus(hindsight));
  if (project) {
    console.log(`Project: ${project.path}`);
    console.log(formatProjectStatus("CodeGraph index", project.codegraphHealthy, project.codegraphInitialized));
    console.log(formatProjectStatus("Beads database", project.beadsHealthy, project.beadsInitialized));
  }
} else {
  for (const tool of missing) {
    console.log(`TOOL_STACK_MISSING ${tool.id} install="${tool.installCommand}"`);
  }
  for (const tool of updates) {
    console.log(`TOOL_STACK_UPDATE_AVAILABLE ${tool.id} current=${tool.currentVersion} latest=${tool.latestVersion} run="${tool.updateCommand}"`);
  }
  if (!hindsight.ok) {
    console.log(`TOOL_STACK_MEMORY_UNHEALTHY hindsight issues="${hindsight.issues.join("; ")}" run="${hindsight.healthCommand}"`);
  }
  if (project && (!project.codegraphHealthy || !project.beadsHealthy)) {
    console.log(`TOOL_STACK_PROJECT_BOOTSTRAP_AVAILABLE run=${shellQuote(project.bootstrapCommand)}`);
  }
}
