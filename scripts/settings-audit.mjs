#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const json = args.includes("--json");
const strictConflicts = args.includes("--strict-conflicts");
const settingsPath = args.find((arg) => !arg.startsWith("--"));

if (!settingsPath) {
  console.error("usage: settings-audit.mjs <settings.json> [--fix] [--json] [--strict-conflicts]");
  process.exit(2);
}

const homeDir = os.homedir();
const matcherOrder = ["Bash", "Read", "Edit", "Write", "MultiEdit", "WebSearch", "Task", "TaskCreate", "Agent"];

const readJson = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${detail}`, { cause: error });
  }
};

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

const matcherOverlaps = (left, right) => {
  const leftTokens = matcherTokens(left);
  const rightTokens = matcherTokens(right);
  if (leftTokens === null || rightTokens === null) return true;
  const rightSet = new Set(rightTokens);
  return leftTokens.some((token) => rightSet.has(token));
};

const isLegacyRateLimiter = (command) => /(^|\s)(bash\s+)?~\/\.claude\/hooks\/rate-limiter\.sh(\s|$)/.test(canonicalCommand(command));
const knownCompanionHooks = new Set([
  "block-email-send.sh",
  "block-junk-files.sh",
  "block-secrets.sh",
  "check-code-quality.sh",
  "check-context-and-handoff.sh",
  "cli-update-check.sh",
  "enforce-cli-toolkit.sh",
  "enforce-positive-rules.sh",
  "log-compact-event.sh",
  "pre-compact-backup.sh",
  "pre-compact-context.sh",
  "pre-deploy-veloz.sh",
  "pre-stop-checklist.sh",
  "rtk-rewrite.sh",
  "session-start.sh",
  "suggest-compact.sh",
  "terminal-title.sh",
  "verification-gate.sh",
]);
const rewriteKnownHookCommand = (command, eventName = "") => {
  if (isLegacyRateLimiter(command)) return "bash ~/.claude/hooks/cc-rate-limiter.sh";
  if (eventName === "Stop" && invalidStopContextHandoff(command)) return "";
  return command;
};

const hookBasename = (command) => {
  const canonical = canonicalCommand(command);
  const match = canonical.match(/(?:^|\s)(?:bash\s+)?(?:~|[^\s"';&|]+)\/\.claude\/hooks\/([^ "';&|]+)/);
  if (!match) return "";
  return path.basename(match[1]);
};

const hookPath = (command) => {
  const canonical = canonicalCommand(command);
  const match = canonical.match(/(?:^|\s)(?:bash\s+)?(?:~|([^\s"';&|]+))\/\.claude\/hooks\/([^ "';&|]+)/);
  if (!match) return "";
  if (!match[1]) return path.join(homeDir, ".claude", "hooks", match[2]);
  const basePath = match[1].startsWith("~/") ? path.join(homeDir, match[1].slice(2)) : match[1];
  return path.join(basePath, ".claude", "hooks", match[2]);
};

const hookOwner = (basename) => {
  if (!basename) return "";
  if (basename.startsWith("cc-")) return "repo-owned";
  if (knownCompanionHooks.has(basename)) return "known-companion";
  return "unknown-external";
};

function invalidStopContextHandoff(command) {
  if (hookBasename(command) !== "check-context-and-handoff.sh") return false;
  const filePath = hookPath(command);
  if (!filePath) return false;
  try {
    const body = fs.readFileSync(filePath, "utf8");
    return /hookSpecificOutput[^]*hookEventName[^]*Stop[^]*additionalContext/.test(body);
  } catch {
    return false;
  }
}

const rtkRewriteHasRgProxyGuard = (command) => {
  const filePath = hookPath(command);
  if (!filePath) return false;
  try {
    const body = fs.readFileSync(filePath, "utf8");
    return /rtk-hook-version:\s*(?:[4-9]|\d{2,})/.test(body) || body.includes("rg_rewrite_needs_proxy");
  } catch {
    return false;
  }
};

const conflictForHook = (basename, command, eventName, matcher) => {
  if (basename === "rtk-rewrite.sh") {
    if (rtkRewriteHasRgProxyGuard(command)) return null;
    return {
      id: "rtk-rewrite",
      reason: "outdated rtk-rewrite.sh rewrites Bash commands before the control-plane guard; observed rg -> rtk grep rewrites can break recursive directory searches",
    };
  }
  if (basename === "enforce-cli-toolkit.sh" && eventName === "PreToolUse" && matcherOverlaps(matcher, "Bash")) {
    return {
      id: "legacy-cli-toolkit",
      reason: "legacy CLI-toolkit blocker denies raw Bash commands instead of letting RTK rewrite them; observed first-failure loops should be handled by rtk hook claude plus cc-pretooluse-guard",
    };
  }
  if (basename === "check-context-and-handoff.sh" && eventName === "Stop" && invalidStopContextHandoff(command)) {
    return {
      id: "invalid-stop-context-handoff",
      reason: "legacy handoff monitor emits hookSpecificOutput.additionalContext for Stop and guesses context pressure from transcript size; use PreCompact/context-state instead",
    };
  }
  return null;
};

function collectIssues(settings) {
  const duplicateHooks = [];
  const legacyHooks = [];
  const externalHooks = [];
  const conflictingHooks = [];
  for (const [eventName, groups] of Object.entries(settings.hooks ?? {})) {
    const seen = [];
    for (const group of groups ?? []) {
      for (const hook of group.hooks ?? []) {
        const command = String(hook.command ?? "").trim();
        if (!command) continue;
        const canonical = canonicalCommand(command);
        const basename = hookBasename(command);
        const owner = hookOwner(basename);
        if (owner && owner !== "repo-owned") {
          const external = {
            eventName,
            matcher: group.matcher ?? "*",
            command: canonical,
            hook: basename,
            owner,
          };
          externalHooks.push(external);
          const conflict = conflictForHook(basename, command, eventName, group.matcher);
          if (conflict) conflictingHooks.push({ ...external, ...conflict });
        }
        for (const prior of seen) {
          if (prior.canonical === canonical && matcherOverlaps(prior.matcher, group.matcher)) {
            duplicateHooks.push({
              eventName,
              command: canonical,
              matcher: group.matcher ?? "*",
              priorMatcher: prior.matcher ?? "*",
            });
          }
        }
        if (isLegacyRateLimiter(command)) {
          legacyHooks.push({ eventName, command: canonical, matcher: group.matcher ?? "*" });
        }
        seen.push({ canonical, matcher: group.matcher });
      }
    }
  }
  return { duplicateHooks, legacyHooks, externalHooks, conflictingHooks };
}

function rewriteKnownHooks(settings) {
  for (const [eventName, groups] of Object.entries(settings.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const hook of group.hooks ?? []) {
        hook.command = rewriteKnownHookCommand(hook.command, eventName);
      }
    }
  }
}

function compactSettings(settings) {
  settings.hooks ??= {};
  for (const eventName of Object.keys(settings.hooks)) {
    const compactedGroups = [];
    const byCommand = new Map();
    for (const group of settings.hooks[eventName] ?? []) {
      for (const hook of group.hooks ?? []) {
        const command = String(hook.command ?? "").trim();
        if (!command) continue;
        const key = canonicalCommand(command);
        const existing = byCommand.get(key);
        if (existing) {
          assignMatcher(existing.group, mergeMatcher(existing.group.matcher, group.matcher));
          // Duplicate hooks intentionally use last-write-wins for metadata such
          // as timeout, statusMessage, and enabled so later settings repair stale copies.
          Object.assign(existing.hook, hook);
          continue;
        }
        const compactedGroup = { ...group, hooks: [{ ...hook, command }] };
        byCommand.set(key, { group: compactedGroup, hook: compactedGroup.hooks[0] });
        compactedGroups.push(compactedGroup);
      }
    }
    settings.hooks[eventName] = compactedGroups;
  }
}

let settings;
try {
  settings = readJson(settingsPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const before = collectIssues(settings);
if (fix) {
  rewriteKnownHooks(settings);
  compactSettings(settings);
  const tempPath = `${settingsPath}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, settingsPath);
}
const after = collectIssues(settings);
const result = {
  ok: after.duplicateHooks.length === 0 && after.legacyHooks.length === 0 && (!strictConflicts || after.conflictingHooks.length === 0),
  fixed: fix,
  strictConflicts,
  before,
  after,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`ok: settings audit clean for ${settingsPath}`);
  if (fix && (before.duplicateHooks.length > 0 || before.legacyHooks.length > 0)) {
    console.log(`fixed: duplicates=${before.duplicateHooks.length} legacyRateLimiters=${before.legacyHooks.length}`);
  }
  for (const conflict of after.conflictingHooks) {
    console.log(`warning: conflicting external hook ${conflict.eventName} ${conflict.matcher}: ${conflict.command} (${conflict.reason})`);
  }
  const unknownCount = after.externalHooks.filter((hook) => hook.owner === "unknown-external").length;
  if (unknownCount > 0) {
    console.log(`warning: ${unknownCount} unknown external hook(s) present; inspect --json output before blaming repo-owned control-plane hooks`);
  }
} else {
  console.error(`fail: settings audit found issues in ${settingsPath}`);
  for (const duplicate of after.duplicateHooks) {
    console.error(`- duplicate hook ${duplicate.eventName} ${duplicate.matcher}: ${duplicate.command}`);
  }
  for (const legacy of after.legacyHooks) {
    console.error(`- legacy rate limiter ${legacy.eventName} ${legacy.matcher}: ${legacy.command}`);
  }
  for (const conflict of after.conflictingHooks) {
    console.error(`- conflicting external hook ${conflict.eventName} ${conflict.matcher}: ${conflict.command} (${conflict.reason})`);
  }
}

process.exit(result.ok ? 0 : 1);
