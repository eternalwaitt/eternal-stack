#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const valueAfter = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const scriptParent = path.dirname(scriptDir);
const scriptInstalledHome = fs.existsSync(path.join(scriptParent, "etrnl", "install.json")) ? scriptParent : "";
const envHome = process.env.CLAUDE_HOME || process.env.CODEX_HOME || "";
const controlHome =
  process.env.ETRNL_HOME ||
  scriptInstalledHome ||
  envHome ||
  path.join(os.homedir(), ".claude");
const agent = valueAfter("--agent", path.basename(controlHome) === ".codex" ? "codex" : "claude");
const skill = valueAfter("--skill", "unknown");
const jsonOutput = hasFlag("--json");
const updateScript = process.env.ETRNL_UPDATE_CHECK_SCRIPT || path.join(scriptDir, "update-check.mjs");

const emit = (result) => {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.promptNeeded) return;
  console.log(
    `ETRNL_SKILL_UPDATE_AVAILABLE agent=${result.agent} skill=${result.skill} update="${result.updateCommand}" bootstrap="${result.bootstrapCommand}"`,
  );
  if (result.summary) console.log(result.summary);
  if (result.rawUpdateOutput) console.log(result.rawUpdateOutput);
  console.log("Before using this skill, tell the user only about pending remote or tool-stack updates; local Eternal Stack repair was checked without mutating this process.");
};

if (!fs.existsSync(updateScript)) {
  emit({
    ok: false,
    promptNeeded: true,
    agent,
    skill,
    controlHome,
    reason: "update-check-missing",
    updateCommand: "",
    bootstrapCommand: "",
    summary: `update-check.mjs missing at ${updateScript}`,
  });
  process.exit(0);
}

const autoUpdateDisabled = process.env.ETRNL_AUTO_UPDATE === "0";
const updateArgs = [updateScript, "--json"];
if (!autoUpdateDisabled) {
  updateArgs.push("--auto");
}
const update = spawnSync(process.execPath, updateArgs, {
  encoding: "utf8",
  // Startup runs can include git and tool-stack probes; keep this bounded but above slow-network fetches.
  timeout: 180_000,
  env: {
    ...process.env,
    ETRNL_HOME: controlHome,
  },
});

if (update.status !== 0 || !update.stdout.trim()) {
  const timedOut = update.error?.code === "ETIMEDOUT"
    || update.signal === "SIGTERM"
    || (update.error && /timed out/i.test(String(update.error.message || update.error)));
  emit({
    ok: false,
    promptNeeded: true,
    agent,
    skill,
    controlHome,
    reason: timedOut ? "update-check-timeout" : "update-check-failed",
    updateCommand: "",
    bootstrapCommand: "",
    summary: timedOut
      ? "update-check timed out after 180s"
      : (update.stderr || update.stdout || "update-check failed").replace(/\s+/g, " ").trim().slice(0, 300),
  });
  process.exit(0);
}

let state;
try {
  state = JSON.parse(update.stdout);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  emit({
    ok: false,
    promptNeeded: true,
    agent,
    skill,
    controlHome,
    reason: "update-check-json-invalid",
    updateCommand: "",
    bootstrapCommand: "",
    summary: detail,
  });
  process.exit(0);
}

const toolStack = state.toolStack || {};
const missingTools = Array.isArray(toolStack.missingTools) ? toolStack.missingTools : [];
const toolUpdates = Array.isArray(toolStack.updatesAvailable) ? toolStack.updatesAvailable : [];
const updateCommand = state.updateCommand || "";
function quoteForShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

const bootstrapCommand = state.sourceRoot
  ? `bash ${quoteForShell(path.join(state.sourceRoot, "scripts", "bootstrap-tools.sh"))} install --yes`
  : "";
const actionLines = [];
const warningLines = [];
if (state.localUpdateAvailable) {
  actionLines.push(
    `ETRNL_UPDATE_AVAILABLE installed=${state.installedCommitShort || "unknown"} source=${state.sourceCommitShort || "unknown"} version=${state.sourceVersion || "unknown"} run="${updateCommand}"`,
  );
}
if (state.remote?.updateAvailable) {
  actionLines.push(
    `ETRNL_REMOTE_UPDATE_AVAILABLE upstream=${state.remote.upstream || "unknown"} behind=${state.remote.behind || 0} run="${updateCommand} --pull"`,
  );
}
for (const tool of Object.values(toolStack.tools || {})) {
  if (tool?.updateAvailable) {
    actionLines.push(
      `TOOL_STACK_UPDATE_AVAILABLE ${tool.id} current=${tool.currentVersion} latest=${tool.latestVersion} run="${tool.updateCommand}"`,
    );
  } else if (tool && (tool.kind === "claude-plugin" ? tool.pluginEnabled && !tool.pluginInstalled : tool.installed === false)) {
    actionLines.push(`TOOL_STACK_MISSING ${tool.id} install="${tool.installCommand}"`);
  }
}
if (state.warning) warningLines.push(`ETRNL_UPDATE_WARNING ${state.warning}`);
if (state.sourceGitWarning) warningLines.push(`ETRNL_UPDATE_WARNING ${state.sourceGitWarning}`);

const resultOk = state.ok !== false;
const promptNeeded = Boolean(
  !resultOk ||
    missingTools.length ||
    toolUpdates.length ||
    actionLines.length,
);
emit({
  ok: resultOk,
  promptNeeded,
  agent,
  skill,
  controlHome,
  updateAvailable: Boolean(state.updateAvailable),
  localUpdateAvailable: Boolean(state.localUpdateAvailable),
  remoteUpdateAvailable: Boolean(state.remote?.updateAvailable),
  missingTools,
  toolUpdates,
  warnings: warningLines,
  updateCommand,
  bootstrapCommand,
  summary: promptNeeded
    ? `etrnl=${resultOk ? (state.localUpdateAvailable ? "stale" : "current") : "degraded"} tools=${[...missingTools, ...toolUpdates].join(",") || "current"}`
    : "",
  rawUpdateOutput: [...actionLines, ...warningLines].join("\n"),
});
