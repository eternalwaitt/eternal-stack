#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  if (index + 1 >= args.length || args[index + 1] === undefined) {
    throw new Error(`Missing value for flag ${flag}`);
  }
  return args[index + 1];
};

const TRACKED_PATHS = [
  "agents",
  "docs",
  "hooks",
  "rules",
  "scripts",
  "skills",
  "templates",
  "tests",
  "CHANGELOG.md",
  "README.md",
];

const EXCLUDED_DIRS = new Set([".git", "node_modules", "__pycache__", ".serena"]);

const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
const installStatePath =
  process.env.CLAUDE_CONTROL_PLANE_INSTALL_STATE ||
  path.join(claudeHome, "control-plane", "install.json");
const updateStatePath =
  process.env.CLAUDE_CONTROL_PLANE_UPDATE_STATE ||
  path.join(claudeHome, "control-plane", "update-state.json");

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 15000,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
};

const git = (root, gitArgs, options = {}) => run("git", ["-C", root, ...gitArgs], options);

const cleanupJustUpdatedClaims = (markerPath) => {
  const parent = path.dirname(markerPath);
  const prefix = `${path.basename(markerPath)}.claim-`;
  const staleAfterMs = 24 * 60 * 60 * 1000;
  let entries = [];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`CONTROL_PLANE_UPDATE_WARNING failed to scan claim markers: ${message}`);
    }
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
    const claimPath = path.join(parent, entry.name);
    try {
      const ageMs = Date.now() - fs.statSync(claimPath).mtimeMs;
      if (ageMs > staleAfterMs) fs.rmSync(claimPath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
};

const readJson = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${filePath}: ${message}`);
  }
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
};

const isFile = (filePath) => {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to stat source path ${filePath}: ${message}`);
  }
};

const walkFiles = (root, relPath, out) => {
  const absPath = path.join(root, relPath);
  let entries;
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read source directory ${absPath}: ${message}`);
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const entryRel = path.join(relPath, entry.name);
    const entryAbs = path.join(root, entryRel);
    if (entry.isDirectory()) {
      walkFiles(root, entryRel, out);
    } else if (entry.isFile()) {
      out.push(entryRel);
    }
  }
};

const fingerprintSource = (root) => {
  const hash = crypto.createHash("sha256");
  const files = [];
  for (const relPath of TRACKED_PATHS) {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) continue;
    if (isFile(absPath)) {
      files.push(relPath);
    } else {
      walkFiles(root, relPath, files);
    }
  }
  files.sort();
  for (const relPath of files) {
    const absPath = path.join(root, relPath);
    hash.update(relPath);
    hash.update("\0");
    hash.update(fs.readFileSync(absPath));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const sourceVersion = (root) => {
  const changelogPath = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) return "unknown";
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const match = changelog.match(/^## (v\d+\.\d+\.\d+)\b/m);
  return match?.[1] ?? "unknown";
};

const sourceState = (root) => {
  const commitResult = git(root, ["rev-parse", "HEAD"]);
  const commit = commitResult.ok ? commitResult.stdout : "unknown";
  const branchResult = git(root, ["branch", "--show-current"]);
  const branch = branchResult.ok && branchResult.stdout ? branchResult.stdout : "unknown";
  const upstreamResult = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const dirtyResult = git(root, ["status", "--porcelain"]);
  return {
    sourceRoot: root,
    sourceCommit: commit,
    sourceCommitShort: commit === "unknown" ? "unknown" : commit.slice(0, 12),
    sourceBranch: branch,
    sourceUpstream: upstreamResult.ok ? upstreamResult.stdout : "",
    sourceDirty: dirtyResult.ok ? dirtyResult.stdout.length > 0 : false,
    sourceGitAvailable: commitResult.ok && dirtyResult.ok,
    sourceGitWarning: commitResult.ok
      ? ""
      : commitResult.stderr || commitResult.stdout || "git metadata unavailable",
    sourceFingerprint: fingerprintSource(root),
    sourceVersion: sourceVersion(root),
  };
};

const remoteState = (root, force) => {
  const cache = readJson(updateStatePath, {});
  const now = Math.floor(Date.now() / 1000);
  const maxAge = Number(process.env.CLAUDE_CONTROL_PLANE_UPDATE_INTERVAL_SEC || 21_600);
  const lastCheck = Number(cache.lastRemoteCheckAt || 0);
  if (!force && lastCheck > 0 && now - lastCheck < maxAge) {
    return cache.remote ?? { checked: false, reason: "cached" };
  }
  const fetch = git(root, ["fetch", "--quiet", "origin"], { timeout: 20_000 });
  if (!fetch.ok) {
    const remote = { checked: true, ok: false, error: fetch.stderr || fetch.stdout || "git fetch failed" };
    writeJson(updateStatePath, { ...cache, lastRemoteCheckAt: now, remote });
    return remote;
  }
  const upstreamResult = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstream = upstreamResult.ok ? upstreamResult.stdout : "";
  if (!upstream) {
    const remote = { checked: true, ok: true, updateAvailable: false, reason: "no-upstream" };
    writeJson(updateStatePath, { ...cache, lastRemoteCheckAt: now, remote });
    return remote;
  }
  const aheadBehindResult = git(root, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
  if (!aheadBehindResult.ok) {
    const remote = {
      checked: true,
      ok: false,
      updateAvailable: false,
      error: aheadBehindResult.stderr || aheadBehindResult.stdout || "git rev-list failed",
    };
    writeJson(updateStatePath, { ...cache, lastRemoteCheckAt: now, remote });
    return remote;
  }
  const aheadBehind = aheadBehindResult.stdout;
  const [aheadRaw = "0", behindRaw = "0"] = aheadBehind.split(/\s+/);
  const remote = {
    checked: true,
    ok: true,
    upstream,
    ahead: Number(aheadRaw),
    behind: Number(behindRaw),
    updateAvailable: Number(behindRaw) > 0,
  };
  writeJson(updateStatePath, { ...cache, lastRemoteCheckAt: now, remote });
  return remote;
};

const printText = (result) => {
  if (result.justUpdated) {
    console.log(`CONTROL_PLANE_JUST_UPDATED ${result.justUpdated.from || "unknown"} ${result.justUpdated.to || "unknown"}`);
  }
  if (result.localUpdateAvailable) {
    console.log(
      `CONTROL_PLANE_UPDATE_AVAILABLE installed=${result.installedCommitShort} source=${result.sourceCommitShort} version=${result.sourceVersion} run="${result.updateCommand}"`,
    );
  }
  if (result.remote?.updateAvailable) {
    console.log(
      `CONTROL_PLANE_REMOTE_UPDATE_AVAILABLE upstream=${result.remote.upstream} behind=${result.remote.behind} run="${result.updateCommand} --pull"`,
    );
  }
  if (result.warning) {
    console.log(`CONTROL_PLANE_UPDATE_WARNING ${result.warning}`);
  }
  if (result.sourceGitWarning) {
    console.log(`CONTROL_PLANE_UPDATE_WARNING ${result.sourceGitWarning}`);
  }
  if (result.autoUpdate) {
    console.log(result.autoUpdate);
  }
};

const countInstalledEntries = (dir, label, predicate) => {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(predicate)
      .length;
  } catch (error) {
    if (process.env.VERBOSE === "1") {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`update-check warning: unable to count ${label}: ${detail}`);
    }
    return -1;
  }
};

const countInstalledSkills = () => {
  const skillsDir = path.join(claudeHome, "skills");
  return countInstalledEntries(skillsDir, "installed skills", (entry) => entry.isDirectory() && entry.name.startsWith("etrnl-"));
};

const countInstalledAgents = () => {
  const agentsDir = path.join(claudeHome, "agents");
  return countInstalledEntries(agentsDir, "installed agents", (entry) => entry.isFile() && /^etrnl-.*\.md$/.test(entry.name));
};

const settingsMode = (installState) => {
  if (installState.settingsMode) return installState.settingsMode;
  const settingsPath = path.join(claudeHome, "settings.json");
  if (!fs.existsSync(settingsPath)) return "missing";
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const hooks = settings
      && typeof settings === "object"
      && !Array.isArray(settings)
      && settings.hooks
      && typeof settings.hooks === "object"
      && !Array.isArray(settings.hooks)
      ? settings.hooks
      : {};
    const commands = Object.values(hooks).flatMap((eventHooks) => {
      if (!Array.isArray(eventHooks)) return [];
      return eventHooks.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Array.isArray(entry.hooks)) return [];
        return entry.hooks
          .filter((hook) => hook && typeof hook === "object" && !Array.isArray(hook) && hook.command !== undefined)
          .map((hook) => String(hook.command));
      });
    });
    if (commands.length === 0) return "custom";
    const hasAllDefaultHooks = [
      "cc-sessionstart-restore.sh",
      "cc-userprompt-router.sh",
      "cc-posttoolbatch-observer.sh",
      "cc-rate-limiter.sh",
      "cc-sessionend-save.sh",
    ].every((token) => commands.some((command) => command.includes(token)));
    const hasStrictOnlyHook = [
      "cc-pretooluse-guard.sh",
      "cc-stop-verifier.sh",
      "cc-posttoolusefailure-diagnose.sh",
      "cc-subagentstop-record.sh",
      "cc-precompact-save.sh",
      "cc-postcompact-record.sh",
    ].some((token) => commands.some((command) => command.includes(token)));
    if (hasStrictOnlyHook) return "strict";
    return hasAllDefaultHooks ? "default" : "custom";
  } catch {
    return "unreadable";
  }
};

const staleInstalledScripts = (root) => {
  const sourceScripts = path.join(root, "scripts");
  const installedScripts = path.join(claudeHome, "scripts");
  if (!fs.existsSync(sourceScripts) || !fs.existsSync(installedScripts)) return [];
  const sourceOnly = new Set(["scripts/install.sh"]);
  const renamed = new Map([["scripts/doctor.sh", "scripts/doctor-control-plane.sh"]]);
  const files = [];
  walkFiles(root, "scripts", files);
  return files
    .filter((relPath) => /\.(mjs|sh)$/.test(relPath) || relPath.startsWith("scripts/lib/"))
    .filter((relPath) => !sourceOnly.has(relPath))
    .filter((relPath) => {
      const installedRelPath = renamed.get(relPath) || relPath;
      const sourceFile = path.join(root, relPath);
      const installedFile = path.join(claudeHome, installedRelPath);
      if (!fs.existsSync(installedFile)) return true;
      return fs.readFileSync(sourceFile).compare(fs.readFileSync(installedFile)) !== 0;
    })
    .sort();
};

const driftSummary = (root, source, installState) => {
  const staleScripts = staleInstalledScripts(root);
  return {
    sourceDirty: source.sourceDirty,
    installedCommit: installState.sourceCommit || "unknown",
    sourceCommit: source.sourceCommit,
    installedSkillCount: countInstalledSkills(),
    installedAgentCount: countInstalledAgents(),
    settingsMode: settingsMode(installState),
    staleInstalledScripts: {
      count: staleScripts.length,
      files: staleScripts.slice(0, 20),
      truncated: staleScripts.length > 20,
    },
  };
};

const printExplain = (result) => {
  console.log(`Claude control-plane update check: ${result.updateAvailable ? "update available" : "current"}`);
  console.log(`Installed commit: ${result.installedCommitShort}`);
  console.log(`Source commit: ${result.sourceCommitShort}`);
  console.log(`Source dirty: ${result.sourceDirty ? "yes" : "no"}`);
  console.log(`Installed skills: ${result.drift.installedSkillCount}`);
  console.log(`Installed agents: ${result.drift.installedAgentCount}`);
  console.log(`Settings mode: ${result.drift.settingsMode}`);
  console.log(`Stale installed scripts: ${result.drift.staleInstalledScripts.count}`);
  if (result.localUpdateAvailable) {
    console.log(`Next action: ${result.updateCommand}`);
  } else {
    console.log("Next action: none");
  }
};

if (hasFlag("--fingerprint-source")) {
  let root = null;
  try {
    root = valueAfter("--fingerprint-source");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
  if (!root) {
    console.error("usage: update-check.mjs --fingerprint-source <root>");
    process.exit(2);
  }
  console.log(fingerprintSource(path.resolve(root)));
  process.exit(0);
}

if (hasFlag("--source-version")) {
  let root = null;
  try {
    root = valueAfter("--source-version");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
  if (!root) {
    console.error("usage: update-check.mjs --source-version <root>");
    process.exit(2);
  }
  console.log(sourceVersion(path.resolve(root)));
  process.exit(0);
}

const jsonOutput = hasFlag("--json");
const explainOutput = hasFlag("--explain");
const force = hasFlag("--force");
const remoteEnabled = hasFlag("--remote") || process.env.CLAUDE_CONTROL_PLANE_REMOTE_UPDATE_CHECK === "1";
const autoEnabled = hasFlag("--auto") || process.env.CLAUDE_CONTROL_PLANE_AUTO_UPDATE === "1";
const installState = readJson(installStatePath, null);

if (!installState?.sourceRoot) {
  const result = { ok: false, updateAvailable: false, warning: "install-metadata-missing" };
  if (jsonOutput) console.log(JSON.stringify(result, null, 2));
  else if (explainOutput) console.log("Claude control-plane update check: install metadata missing");
  else printText(result);
  process.exit(0);
}

const root = path.resolve(installState.sourceRoot);
if (!fs.existsSync(path.join(root, "scripts", "install.sh"))) {
  const result = { ok: false, updateAvailable: false, warning: "source-root-missing" };
  if (jsonOutput) console.log(JSON.stringify(result, null, 2));
  else if (explainOutput) console.log("Claude control-plane update check: source root missing");
  else printText(result);
  process.exit(0);
}

const source = sourceState(root);
const installedFingerprint = installState.sourceFingerprint || "";
const commitChanged = Boolean(
  installState.sourceCommit &&
    installState.sourceCommit !== "unknown" &&
    source.sourceCommit !== "unknown" &&
    source.sourceCommit !== installState.sourceCommit,
);
const localUpdateAvailable = source.sourceFingerprint !== installedFingerprint || commitChanged;
const updateCommand = `bash ${path.join(root, "scripts", "update.sh")}`;
const justUpdatedPath = path.join(claudeHome, "control-plane", "just-updated.json");
cleanupJustUpdatedClaims(justUpdatedPath);
const justUpdatedClaimPath = `${justUpdatedPath}.claim-${process.pid}-${Date.now()}`;
let justUpdated = null;
try {
  fs.renameSync(justUpdatedPath, justUpdatedClaimPath);
  justUpdated = readJson(justUpdatedClaimPath, null);
  fs.rmSync(justUpdatedClaimPath, { force: true });
} catch (error) {
  if (!(error && typeof error === "object" && error.code === "ENOENT")) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to consume just-updated marker ${justUpdatedPath}: ${message}`);
  }
}

let remote = null;
if (remoteEnabled) {
  remote = remoteState(root, force);
}

let autoUpdate = "";
let autoSucceeded = false;
if (autoEnabled && localUpdateAvailable) {
  const updateScriptPath = path.join(root, "scripts", "update.sh");
  if (!fs.existsSync(updateScriptPath)) {
    autoUpdate = `CONTROL_PLANE_AUTO_UPDATE_FAILED missing update script: ${updateScriptPath}`;
  } else {
    const update = run("bash", [updateScriptPath], {
      env: { CLAUDE_HOME: claudeHome },
      timeout: 60_000,
    });
    autoSucceeded = update.ok;
    autoUpdate = update.ok
      ? `CONTROL_PLANE_AUTO_UPDATED ${installState.sourceCommitShort || "unknown"} ${source.sourceCommitShort}`
      : `CONTROL_PLANE_AUTO_UPDATE_FAILED ${(update.stderr || update.stdout || "update failed").replace(/\s+/g, " ").slice(0, 240)}`;
  }
}

const result = {
  ok: true,
  updateAvailable: (!autoSucceeded && localUpdateAvailable) || Boolean(remote?.updateAvailable),
  localUpdateAvailable: !autoSucceeded && localUpdateAvailable,
  installedCommit: installState.sourceCommit || "unknown",
  installedCommitShort: installState.sourceCommitShort || "unknown",
  installedVersion: installState.sourceVersion || "unknown",
  sourceCommit: source.sourceCommit,
  sourceCommitShort: source.sourceCommitShort,
  sourceVersion: source.sourceVersion,
  sourceDirty: source.sourceDirty,
  sourceGitAvailable: source.sourceGitAvailable,
  sourceGitWarning: source.sourceGitWarning,
  sourceRoot: root,
  updateCommand,
  remote,
  justUpdated,
  autoUpdate,
  drift: driftSummary(root, source, installState),
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else if (explainOutput) {
  printExplain(result);
} else {
  printText(result);
}
