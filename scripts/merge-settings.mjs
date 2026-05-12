#!/usr/bin/env node
import fs from "node:fs";

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

target.hooks ??= {};

for (const [eventName, templateGroups] of Object.entries(template.hooks ?? {})) {
  target.hooks[eventName] ??= [];
  // Empty/null commands are invalid and intentionally excluded from dedupe tracking.
  const existingCommands = new Set(
    target.hooks[eventName]
      .flatMap((group) => (group.hooks ?? []).map((hook) => String(hook.command ?? "").trim()))
      .filter((command) => command.length > 0),
  );

  for (const group of templateGroups) {
    const hooks = (group.hooks ?? []).filter((hook) => {
      const normalizedCommand = String(hook.command ?? "").trim();
      if (normalizedCommand.length === 0 || existingCommands.has(normalizedCommand)) return false;
      existingCommands.add(normalizedCommand);
      return true;
    });

    if (hooks.length === 0) continue;

    target.hooks[eventName].push({ ...group, hooks });
  }
}

const tempPath = `${targetPath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(tempPath, `${JSON.stringify(target, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, targetPath);
} catch (error) {
  if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to write merged settings (target=${targetPath}, temp=${tempPath}): ${detail}`, { cause: error });
}
