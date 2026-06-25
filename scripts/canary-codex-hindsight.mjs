#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const json = args.includes("--json");
const valueAfter = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

const codexHome = path.resolve(valueAfter("--codex-home", process.env.CODEX_HOME || path.join(os.homedir(), ".codex")));
const configPath = path.join(codexHome, "config.toml");
const pluginCache = path.join(codexHome, "plugins", "cache");
const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";

function listDirectoryNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

const configMentionsHindsight = /hindsight/i.test(configText);
const pluginCacheMentionsHindsight = listDirectoryNames(pluginCache).some((name) => /hindsight/i.test(name));
const status = configMentionsHindsight ? "configured-unverified" : pluginCacheMentionsHindsight ? "installed-only" : "unproven";
const runtimeProven = false;
const evidence = configMentionsHindsight
  ? "Codex config mentions Hindsight; run a runtime recall canary before marking it proven."
  : pluginCacheMentionsHindsight
    ? "Codex plugin cache mentions Hindsight, but no Codex runtime config was found."
    : "No Codex Hindsight runtime wiring found.";

const report = {
  ok: true,
  command: "canary-codex-hindsight",
  codexHome,
  status,
  runtimeProven,
  evidence,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`codex-hindsight ${status} runtimeProven=${runtimeProven}`);
  console.log(evidence);
}
