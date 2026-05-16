#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";

const [targetPath, templatePath] = process.argv.slice(2);

if (!targetPath || !templatePath) {
  console.error("usage: merge-settings.mjs <target-settings.json> <template-settings.json>");
  process.exit(2);
}

const readJson = (path, fallback) => {
  if (!fs.existsSync(path)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse JSON from ${path}: ${detail}`);
    process.exit(1);
  }
};

const target = readJson(targetPath, {});
const template = readJson(templatePath, {});
const homeDir = os.homedir();
const matcherOrder = ["Bash", "Read", "Edit", "Write", "MultiEdit", "WebSearch", "Task", "TaskCreate", "Agent"];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const homeDirPattern = new RegExp(`(^|[\\s"'=:])${escapeRegex(homeDir)}(?=$|[\\s/"'=:])`, "g");
const canonicalCommand = (command) => String(command ?? "").trim().replace(homeDirPattern, "$1~");
const matcherTokens = (matcher) => {
  if (matcher === undefined || matcher === null || String(matcher).trim() === "") return null;
  return String(matcher)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
};
const matcherFromTokens = (tokens) => {
  if (tokens === null) return undefined;
  const order = new Map(matcherOrder.map((token, index) => [token, index]));
  return [...new Set(tokens)]
    .sort((a, b) => {
      const ai = order.has(a) ? order.get(a) : matcherOrder.length;
      const bi = order.has(b) ? order.get(b) : matcherOrder.length;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    })
    .join("|");
};
const mergeMatcher = (left, right) => {
  const leftTokens = matcherTokens(left);
  const rightTokens = matcherTokens(right);
  if (leftTokens === null || rightTokens === null) return undefined;
  return matcherFromTokens([...leftTokens, ...rightTokens]);
};

const assignMatcher = (group, matcher) => {
  if (matcher === undefined) {
    delete group.matcher;
  } else {
    group.matcher = matcher;
  }
};

target.hooks ??= {};

const compactExistingEventHooks = (eventName) => {
  target.hooks[eventName] ??= [];
  const existingHooksByCommand = new Map();
  const compactedGroups = [];
  for (const group of target.hooks[eventName]) {
    for (const hook of group.hooks ?? []) {
      const command = String(hook.command ?? "").trim();
      if (command.length === 0) continue;
      const key = canonicalCommand(command);
      const existingHook = existingHooksByCommand.get(key);
      if (existingHook) {
        assignMatcher(existingHook.group, mergeMatcher(existingHook.group.matcher, group.matcher));
        // Duplicate hooks intentionally use last-write-wins for metadata such
        // as timeout, statusMessage, and enabled so template updates repair stale copies.
        Object.assign(existingHook.hook, hook);
      } else {
        const compactedGroup = { ...group, hooks: [{ ...hook }] };
        existingHooksByCommand.set(key, { group: compactedGroup, hook: compactedGroup.hooks[0] });
        compactedGroups.push(compactedGroup);
      }
    }
  }
  target.hooks[eventName] = compactedGroups;
  return existingHooksByCommand;
};

const commandOrder = (command) => {
  const canonical = canonicalCommand(command);
  if (canonical.includes("cc-rtk-rg-compat.sh")) return 10;
  if (canonical.includes("cc-pretooluse-guard.sh")) return 20;
  if (canonical === "rtk hook claude" || canonical.includes("rtk-rewrite.sh")) return 30;
  return 100;
};

const orderEventHooks = (eventName) => {
  target.hooks[eventName] ??= [];
  target.hooks[eventName] = target.hooks[eventName]
    .map((group, index) => ({
      group,
      index,
      order: Math.min(...(group.hooks ?? []).map((hook) => commandOrder(hook.command)), 100),
    }))
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.index - right.index;
    })
    .map((item) => item.group);
};

for (const eventName of Object.keys(target.hooks)) {
  compactExistingEventHooks(eventName);
}

for (const [eventName, templateGroups] of Object.entries(template.hooks ?? {})) {
  // Empty/null commands are invalid and intentionally excluded from dedupe tracking.
  const existingHooksByCommand = compactExistingEventHooks(eventName);

  for (const group of templateGroups) {
    const hooks = (group.hooks ?? []).filter((hook) => {
      const normalizedCommand = String(hook.command ?? "").trim();
      if (normalizedCommand.length === 0) return false;
      const key = canonicalCommand(normalizedCommand);
      const existingHook = existingHooksByCommand.get(key);
      if (existingHook) {
        assignMatcher(existingHook.group, mergeMatcher(existingHook.group.matcher, group.matcher));
        // Template metadata wins when the same hook command is already installed.
        Object.assign(existingHook.hook, hook);
        return false;
      }
      return true;
    });

    if (hooks.length === 0) continue;

    for (const hook of hooks) {
      const compactedGroup = { ...group, hooks: [{ ...hook }] };
      target.hooks[eventName].push(compactedGroup);
      existingHooksByCommand.set(canonicalCommand(hook.command), { group: compactedGroup, hook: compactedGroup.hooks[0] });
    }
  }
}

orderEventHooks("PreToolUse");

const tempPath = `${targetPath}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
try {
  fs.writeFileSync(tempPath, `${JSON.stringify(target, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, targetPath);
} catch (error) {
  if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to write merged settings (target=${targetPath}, temp=${tempPath}): ${detail}`, { cause: error });
}
