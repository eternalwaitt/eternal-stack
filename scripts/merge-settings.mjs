#!/usr/bin/env node
import fs from "node:fs";

const [targetPath, templatePath] = process.argv.slice(2);

if (!targetPath || !templatePath) {
  console.error("usage: merge-settings.mjs <target-settings.json> <template-settings.json>");
  process.exit(2);
}

const readJson = (path, fallback) => {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
};

const target = readJson(targetPath, {});
const template = readJson(templatePath, {});

target.hooks ??= {};

for (const [eventName, templateGroups] of Object.entries(template.hooks ?? {})) {
  target.hooks[eventName] ??= [];
  const existingCommands = new Set(
    target.hooks[eventName].flatMap((group) =>
      (group.hooks ?? []).map((hook) => String(hook.command ?? "")),
    ),
  );

  for (const group of templateGroups) {
    const hooks = (group.hooks ?? []).filter((hook) => {
      const command = String(hook.command ?? "");
      return command && !existingCommands.has(command);
    });

    if (hooks.length === 0) continue;

    for (const hook of hooks) {
      existingCommands.add(String(hook.command ?? ""));
    }

    target.hooks[eventName].push({ ...group, hooks });
  }
}

fs.writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
