#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const BUGLOG_FINGERPRINT_VERSION = 2;

function artifactDir() {
  return process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "control-plane", "artifacts");
}

function buglogPath() {
  return process.env.CLAUDE_CONTROL_PLANE_BUGLOG
    || path.join(artifactDir(), "project-buglog.jsonl");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeFile(cwd, file) {
  const resolved = path.resolve(cwd || process.cwd(), file);
  return path.relative(cwd || process.cwd(), resolved) || path.basename(resolved);
}

function fingerprint(record) {
  const version = Number(record.fingerprintVersion ?? 1);
  if (version === 1) {
    return createHash("sha256")
      .update([record.cwd, record.file, record.category, record.sessionId].join(":"))
      .digest("hex")
      .slice(0, 16);
  }
  return createHash("sha256")
    .update([version, record.cwd, record.file, record.category, record.sessionId, record.summary].join(":"))
    .digest("hex")
    .slice(0, 16);
}

function readEntries(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error.message}`);
    }
  });
}

function record() {
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const file = normalizeFile(cwd, argValue(args, "--file"));
  const category = argValue(args, "--category", "quality");
  const summary = argValue(args, "--summary");
  if (!file || !summary) {
    console.error("project-buglog record requires --file and --summary.");
    process.exit(2);
  }

  const target = buglogPath();
  const entry = {
    schemaVersion: 1,
    fingerprintVersion: BUGLOG_FINGERPRINT_VERSION,
    cwd,
    file,
    category,
    summary,
    sessionId: argValue(args, "--session", process.env.CLAUDE_SESSION_ID || "default"),
    at: nowIso(),
  };
  entry.fingerprint = fingerprint(entry);
  const existing = readEntries(target);
  if (existing.some((item) => item.fingerprint === entry.fingerprint)) {
    console.log(entry.fingerprint);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, `${JSON.stringify(entry)}\n`, { flag: "a", mode: 0o600 });
  console.log(entry.fingerprint);
}

function suggest() {
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const file = normalizeFile(cwd, argValue(args, "--file"));
  if (!file) {
    console.error("project-buglog suggest requires --file.");
    process.exit(2);
  }
  const entries = readEntries(buglogPath())
    .filter((entry) => entry.cwd === cwd && entry.file === file)
    .slice(-3)
    .reverse();
  if (entries.length === 0) return;
  console.log(`Previous bug notes for ${file}:`);
  for (const entry of entries) {
    console.log(`- ${entry.category}: ${entry.summary}`);
  }
}

function validate() {
  const entries = readEntries(buglogPath());
  const errors = [];
  for (const entry of entries) {
    if (entry.schemaVersion !== 1) errors.push("entry missing schemaVersion");
    const fingerprintVersion = Number(entry.fingerprintVersion ?? 1);
    if (![1, 2].includes(fingerprintVersion)) {
      errors.push(
        `${entry.file || "<unknown>"} invalid fingerprintVersion (supported fingerprintVersion values: 1, 2; got ${entry.fingerprintVersion})`,
      );
    }
    if (!entry.cwd || !entry.file) errors.push("entry missing cwd/file");
    if (!entry.category || !entry.summary) errors.push(`${entry.file || "<unknown>"} missing category/summary`);
    if (!entry.fingerprint) errors.push(`${entry.file || "<unknown>"} missing fingerprint`);
  }
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Project buglog valid: ${entries.length} entries`);
}

if (command === "record") record();
else if (command === "suggest") suggest();
else if (command === "validate") validate();
else {
  console.error("usage: project-buglog.mjs record|suggest|validate");
  process.exit(2);
}
