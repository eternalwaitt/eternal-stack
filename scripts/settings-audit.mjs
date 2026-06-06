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
const configuredMaxWalkDepth = Number(process.env.CLAUDE_CONTROL_PLANE_SETTINGS_AUDIT_MAX_DEPTH || "8");
const maxWalkDepth = Number.isFinite(configuredMaxWalkDepth) && configuredMaxWalkDepth >= 0 ? configuredMaxWalkDepth : 8;
const walkDepthWarnings = new Set();

if (!settingsPath) {
  console.error("usage: settings-audit.mjs <settings.json> [--fix] [--json] [--strict-conflicts]");
  process.exit(2);
}

const homeDir = os.homedir();
const envClaudeHome = process.env.CLAUDE_HOME ? path.resolve(process.env.CLAUDE_HOME) : "";
const settingsAbsPath = path.resolve(settingsPath);
const settingsIsTemplate = settingsAbsPath.includes(`${path.sep}templates${path.sep}`);
const configuredClaudeHome = envClaudeHome && settingsAbsPath === path.join(envClaudeHome, "settings.json")
  ? envClaudeHome
  : path.basename(settingsAbsPath) === "settings.json" && path.basename(path.dirname(settingsAbsPath)) === ".claude" && !settingsIsTemplate
    ? path.dirname(settingsAbsPath)
    : path.join(homeDir, ".claude");
const matcherOrder = ["Bash", "Read", "Edit", "Write", "MultiEdit", "WebSearch", "Task", "TaskCreate", "Agent"];
const hookEventNames = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
  "PostCompact",
  "Stop",
  "SubagentStop",
]);
const riskyTopLevelSettings = new Map([
  ["autoCompactWindow", "unsupported top-level compact tuning; let Claude Code own native auto-compact unless a documented setting exists"],
  ["skipAutoPermissionPrompt", "unsupported top-level permission bypass; keep permission behavior stock unless a documented harness permission needs it"],
]);

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
const canonicalCommandSegment = (segment) => segment.replace(/\$\{HOME\}|\$HOME/g, homeDir).replace(homeDirPattern, "$1~");
const canonicalCommand = (command) => {
  const input = String(command ?? "").trim();
  let output = "";
  let segment = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const flush = () => {
    output += inSingleQuote ? segment : canonicalCommandSegment(segment);
    segment = "";
  };

  for (const char of input) {
    if (char === "'" && !inDoubleQuote) {
      flush();
      output += char;
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      segment += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    segment += char;
  }

  flush();
  return output;
};
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

const hookCommandMatch = (command) => {
  const raw = String(command ?? "").trim();
  const match = raw.match(/(?:^|\s)(?:bash\s+)?(["']?)(~|\$\{HOME\}|\$HOME|[^\s"';&|]+)\/\.claude\/hooks\/([^ "';&|]+)\1?(?=\s|$|[;&|])/);
  if (!match) return null;
  const [, quote, root, hook] = match;
  if (quote === "'" && (root === "~" || root === "$HOME" || root === "${HOME}")) return null;
  if (quote === '"' && root === "~") return null;
  return { root, hook };
};

const hookBasename = (command) => {
  const match = hookCommandMatch(command);
  if (!match) return "";
  return path.basename(match.hook);
};

const hookPath = (command) => {
  const match = hookCommandMatch(command);
  if (!match) return "";
  if (match.root === "~" || match.root === "$HOME" || match.root === "${HOME}") {
    return path.join(configuredClaudeHome, "hooks", match.hook);
  }
  const root = match.root;
  return path.join(root, ".claude", "hooks", match.hook);
};

const hookOwner = (basename) => {
  if (!basename) return "";
  if (basename.startsWith("cc-")) return "repo-owned";
  if (knownCompanionHooks.has(basename)) return "known-companion";
  return "unknown-external";
};

function invalidStopContextHandoff(command) {
  return hookBasename(command) === "check-context-and-handoff.sh";
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
  if (eventName === "PreCompact" && ["suggest-compact.sh", "pre-compact-context.sh", "log-compact-event.sh", "pre-compact-backup.sh"].includes(basename)) {
    return {
      id: "compact-companion-noise",
      reason: "compact companion hook competes with native Claude compaction recovery; keep PreCompact limited to repo-owned cc-precompact-save.sh unless explicitly accepted",
    };
  }
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

const requiredHooks = [
  { eventName: "SessionStart", hook: "cc-sessionstart-restore.sh", mustBeSync: true },
  { eventName: "PreCompact", hook: "cc-precompact-save.sh", mustBeSync: true },
  { eventName: "PostCompact", hook: "cc-postcompact-record.sh", mustBeSync: true },
  { eventName: "Stop", hook: "cc-stop-verifier.sh", mustBeSync: true },
];

const hookRows = (settings) => Object.entries(settings.hooks ?? {}).flatMap(([eventName, groups]) =>
  (groups ?? []).flatMap((group) =>
    (group.hooks ?? []).map((hook) => ({
      eventName,
      matcher: group.matcher ?? "*",
      hook,
      command: String(hook.command ?? "").trim(),
      basename: hookBasename(hook.command),
    })),
  ),
);

const executableMode = (file) => {
  try {
    return fs.statSync(file).mode & 0o111 ? "executable" : "not-executable";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "missing";
    return "unreadable";
  }
};

function walkDir(root, visitor, depth = 0) {
  if (!root || !fs.existsSync(root)) return;
  if (depth > maxWalkDepth) {
    walkDepthWarnings.add(root);
    return;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, visitor, depth + 1);
    } else {
      visitor(fullPath);
    }
  }
}

function collectCommandObjects(node, rows, context) {
  if (!node || typeof node !== "object") return;
  if (typeof node.command === "string") {
    rows.push({
      ...context,
      command: canonicalCommand(node.command),
      async: node.async === true,
    });
  }
  if (Array.isArray(node)) {
    for (const child of node) collectCommandObjects(child, rows, context);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    const nextContext = hookEventNames.has(key) ? { ...context, eventName: key } : context;
    collectCommandObjects(child, rows, nextContext);
  }
}

function pluginNameFromManifestPath(file) {
  const parts = file.split(path.sep);
  const cacheIndex = parts.lastIndexOf("cache");
  if (cacheIndex >= 0 && parts[cacheIndex + 1]) return parts[cacheIndex + 1];
  return path.basename(path.dirname(path.dirname(file)));
}

function collectPluginHookManifests() {
  const roots = [
    path.join(configuredClaudeHome, "plugins"),
    path.join(configuredClaudeHome, "plugins", "cache"),
  ];
  const seen = new Set();
  const rows = [];
  for (const root of roots) {
    walkDir(root, (file) => {
      if (path.basename(file) !== "hooks.json" || seen.has(file)) return;
      seen.add(file);
      let manifest;
      try {
        manifest = readJson(file);
      } catch (error) {
        rows.push({
          manifestPath: file,
          plugin: pluginNameFromManifestPath(file),
          eventName: "",
          command: "",
          async: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const plugin = manifest.name || manifest.id || manifest.plugin || pluginNameFromManifestPath(file);
      collectCommandObjects(manifest.hooks ?? manifest, rows, {
        manifestPath: file,
        plugin: String(plugin),
        eventName: "",
      });
    });
  }
  return rows;
}

function collectRiskyTopLevel(settings) {
  return [...riskyTopLevelSettings.entries()]
    .filter(([key]) => Object.prototype.hasOwnProperty.call(settings, key))
    .map(([key, reason]) => ({
      key,
      id: "unsupported-top-level-setting",
      reason,
      valueType: typeof settings[key],
    }));
}

function collectFrontmatterHookDeclarations() {
  const roots = [
    path.join(configuredClaudeHome, "skills"),
    path.join(configuredClaudeHome, "agents"),
  ];
  const rows = [];
  for (const root of roots) {
    walkDir(root, (file) => {
      if (!/\.(md|markdown)$/i.test(file)) return;
      let body = "";
      try {
        body = fs.readFileSync(file, "utf8");
      } catch {
        return;
      }
      const match = body.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return;
      for (const line of match[1].split(/\n/)) {
        const key = line.split(":")[0]?.trim();
        if (/^(hooks?|hook-events?|pluginHooks)$/i.test(key)) {
          rows.push({ file, key, id: "frontmatter-hook-declaration" });
        }
      }
    });
  }
  return rows;
}

function hindsightConfigPath() {
  const defaultHindsightHome = path.join(path.dirname(configuredClaudeHome), ".hindsight");
  const hindsightHome = process.env.HINDSIGHT_HOME ? path.resolve(process.env.HINDSIGHT_HOME) : defaultHindsightHome;
  return path.join(hindsightHome, "claude-code.json");
}

function collectMemoryPluginPosture(settings) {
  const enabledPlugins = settings.enabledPlugins && typeof settings.enabledPlugins === "object" ? settings.enabledPlugins : {};
  const rows = [];
  if (enabledPlugins["hindsight-memory@hindsight"] === true) {
    const configPath = hindsightConfigPath();
    const row = {
      plugin: "hindsight-memory@hindsight",
      enabled: true,
      configPath,
      status: "healthy-config",
      issues: [],
      mode: "unknown",
    };
    if (!fs.existsSync(configPath)) {
      row.status = "unhealthy";
      row.issues.push("missing Hindsight config");
    } else {
      try {
        const config = readJson(configPath);
        row.mode = config.hindsightApiUrl ? "external-api" : "local-daemon";
        if (config.dynamicBankId !== true) row.issues.push("dynamicBankId must be true");
        if (JSON.stringify(config.dynamicBankGranularity) !== JSON.stringify(["agent", "project"])) row.issues.push("dynamicBankGranularity must be [agent,project]");
        if (Number(config.recallContextTurns) > 3) row.issues.push("recallContextTurns must be <= 3");
        if (config.retainToolCalls !== false) row.issues.push("retainToolCalls must be false");
        if (!String(config.recallPromptPreamble || "").includes("Fresh repo/runtime evidence overrides memory")) row.issues.push("fresh-evidence preamble missing");
        if (row.issues.length > 0) row.status = "unhealthy";
      } catch (error) {
        row.status = "unhealthy";
        row.issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    rows.push(row);
  }
  return rows;
}

function collectIssues(settings) {
  const duplicateHooks = [];
  const legacyHooks = [];
  const externalHooks = [];
  const conflictingHooks = [];
  const missingRequiredHooks = [];
  const syncExpectationIssues = [];
  const executableIssues = [];
  const pluginHookManifests = settingsIsTemplate ? [] : collectPluginHookManifests();
  const manifestErrors = pluginHookManifests.filter((row) => row.error);
  const memoryPluginHooks = pluginHookManifests.filter((row) => /hindsight|memory|recall|retain/i.test(`${row.plugin} ${row.command}`));
  const pluginRows = pluginHookManifests
    .filter((row) => row.command && row.eventName)
    .map((row) => ({
      ...row,
      matcher: row.matcher ?? "*",
      hook: { async: row.async === true },
      basename: hookBasename(row.command),
    }));
  const riskyTopLevelIssues = collectRiskyTopLevel(settings);
  const frontmatterHookDeclarations = settingsIsTemplate ? [] : collectFrontmatterHookDeclarations();
  const memoryPluginPosture = collectMemoryPluginPosture(settings);
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
  for (const row of pluginRows) {
    if (!row.basename) continue;
    const owner = hookOwner(row.basename);
    const external = {
      eventName: row.eventName,
      matcher: row.matcher,
      command: row.command,
      hook: row.basename,
      owner,
      plugin: row.plugin,
      manifestPath: row.manifestPath,
    };
    const conflict = conflictForHook(row.basename, row.command, row.eventName, row.matcher);
    if (conflict) conflictingHooks.push({ ...external, ...conflict });
    for (const required of requiredHooks) {
      if (row.eventName !== required.eventName || row.basename !== required.hook) continue;
      if (required.mustBeSync && row.async === true) {
        syncExpectationIssues.push({
          eventName: row.eventName,
          matcher: row.matcher,
          hook: row.basename,
          id: "plugin-required-hook-async",
          reason: `${row.basename} from plugin ${row.plugin} must be synchronous if it registers the compact recovery hook`,
        });
      }
    }
    const file = hookPath(row.command);
    if (owner === "repo-owned" && file) {
      const mode = executableMode(file);
      if (mode !== "executable") {
        executableIssues.push({ eventName: row.eventName, hook: row.basename, file, id: "plugin-hook-not-executable", mode, plugin: row.plugin });
      }
    }
  }
  const rows = hookRows(settings);
  for (const required of requiredHooks) {
    const matches = rows.filter((row) => row.eventName === required.eventName && row.basename === required.hook);
    if (matches.length === 0) {
      missingRequiredHooks.push({ eventName: required.eventName, hook: required.hook, id: "required-hook-missing" });
      continue;
    }
    for (const row of matches) {
      if (required.mustBeSync && row.hook.async === true) {
        syncExpectationIssues.push({
          eventName: row.eventName,
          matcher: row.matcher,
          hook: row.basename,
          id: "compact-restore-sync",
          reason: `${row.basename} must run synchronously for compact recovery`,
        });
      }
      if (!settingsIsTemplate) {
        const file = hookPath(row.command);
        const mode = executableMode(file);
        if (mode !== "executable") {
          executableIssues.push({ eventName: row.eventName, hook: row.basename, file, id: "hook-not-executable", mode });
        }
      }
    }
  }
  return {
    duplicateHooks,
    legacyHooks,
    externalHooks,
    conflictingHooks,
    missingRequiredHooks,
    syncExpectationIssues,
    executableIssues,
    pluginHookManifests,
    manifestErrors,
    walkDepthWarnings: [...walkDepthWarnings],
    memoryPluginHooks,
    riskyTopLevelSettings: riskyTopLevelIssues,
    frontmatterHookDeclarations,
    memoryPluginPosture,
  };
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
const strictOk = after.conflictingHooks.length === 0
  && after.missingRequiredHooks.length === 0
  && after.syncExpectationIssues.length === 0
  && after.executableIssues.length === 0
  && after.manifestErrors.length === 0
  && after.riskyTopLevelSettings.length === 0
  && after.memoryPluginPosture.every((row) => row.status !== "unhealthy");
const result = {
  ok: after.duplicateHooks.length === 0
    && after.legacyHooks.length === 0
    && after.manifestErrors.length === 0
    && (!strictConflicts || strictOk),
  strictOk,
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
  for (const risky of after.riskyTopLevelSettings) {
    console.log(`warning: risky top-level setting ${risky.key}: ${risky.reason}`);
  }
  for (const root of after.walkDepthWarnings) {
    console.log(`warning: settings audit max depth reached at ${root}; set CLAUDE_CONTROL_PLANE_SETTINGS_AUDIT_MAX_DEPTH to scan deeper`);
  }
  if (after.pluginHookManifests.length > 0) {
    console.log(`info: ${after.pluginHookManifests.length} plugin hook(s) visible outside settings.json`);
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
  for (const manifest of after.manifestErrors) {
    console.error(`- plugin hook manifest unreadable ${manifest.manifestPath}: ${manifest.error}`);
  }
  for (const conflict of after.conflictingHooks) {
    console.error(`- conflicting external hook ${conflict.eventName} ${conflict.matcher}: ${conflict.command} (${conflict.reason})`);
  }
  for (const missing of after.missingRequiredHooks) {
    console.error(`- missing required hook ${missing.eventName}: ${missing.hook}`);
  }
  for (const issue of after.syncExpectationIssues) {
    console.error(`- sync expectation ${issue.eventName} ${issue.matcher}: ${issue.reason}`);
  }
  for (const issue of after.executableIssues) {
    console.error(`- hook executable issue ${issue.eventName}: ${issue.hook} ${issue.mode} at ${issue.file}`);
  }
  for (const risky of after.riskyTopLevelSettings) {
    console.error(`- risky top-level setting ${risky.key}: ${risky.reason}`);
  }
  for (const declaration of after.frontmatterHookDeclarations) {
    console.error(`- frontmatter hook declaration ${declaration.key}: ${declaration.file}`);
  }
  for (const posture of after.memoryPluginPosture.filter((row) => row.status === "unhealthy")) {
    console.error(`- memory plugin unhealthy ${posture.plugin}: ${posture.issues.join("; ")}`);
  }
  for (const root of after.walkDepthWarnings) {
    console.error(`- settings audit max depth reached at ${root}; set CLAUDE_CONTROL_PLANE_SETTINGS_AUDIT_MAX_DEPTH to scan deeper`);
  }
}

process.exit(result.ok ? 0 : 1);
