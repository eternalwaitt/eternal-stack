#!/usr/bin/env node
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8").trim() || "{}";

let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`Task packet input is not valid JSON: ${error.message}`);
  process.exit(2);
}

const payload = event.tool_input ?? event.toolInput ?? event;
const text = JSON.stringify(payload);
const checks = [
  ["goal", /goal\s*:|\bgoal\b/i],
  ["context summary", /context summary|context_summary|context:/i],
  ["exact scope", /exact scope|bounded scope|\bscope\b/i],
  ["cwd/project context", /\bcwd\b|project context|working directory/i],
  ["read set", /read set|read_set|read paths|files to read/i],
  ["write scope or read-only", /write scope|write_scope|read-only|readonly/i],
  ["forbidden files", /forbidden files|forbidden_files|do not edit|do not touch/i],
  ["expected output", /expected output|expected_output|output format/i],
  ["verification command", /verification command|verification_command|verify:/i],
  ["model tier", /model tier|\bmodel\b/i],
  ["timeout", /timeout\s*:|\btimeout\b|time limit/i],
  ["retry policy", /retry policy|retry_policy|attempts/i],
  ["no-revert instruction", /do not revert|not to revert|never revert/i],
  ["WebSearch guidance", /websearch|web search|internet access|official docs/i],
];

const missing = checks
  .filter(([, pattern]) => !pattern.test(text))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Subagent task packet is missing: ${missing.join(", ")}.`);
  console.error("Include every required field so the worker can run without follow-up questions.");
  process.exit(1);
}

console.log("Task packet ok");
