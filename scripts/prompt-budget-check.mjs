#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const root = args.find((arg) => !arg.startsWith("-")) || process.cwd();
const ownedOnly = args.includes("--owned-only");
const limits = [
  ["skills", 18_000],
  ["agents", 14_000],
];
const failures = [];

for (const [dir, limit] of limits) {
  const full = path.join(root, dir);
  if (!existsSync(full)) continue;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (ownedOnly && !entry.name.startsWith("etrnl-")) continue;
    const file = entry.isDirectory()
      ? path.join(full, entry.name, "SKILL.md")
      : path.join(full, entry.name);
    if (!existsSync(file) || !file.endsWith(".md")) continue;
    const size = Buffer.byteLength(readFileSync(file));
    if (size > limit) failures.push(`${path.relative(root, file)} is ${size} bytes; limit is ${limit}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Prompt budget check clean");
