#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const jsonMode = args.includes("--json");
const BUGLOG_FINGERPRINT_VERSION = 3;

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

function normalizeSummary(summary) {
  return String(summary || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ");
}

function redactText(value) {
  return String(value || "")
    .replace(/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9_=-]{8,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\b(aws_secret_access_key|aws_session_token|password|passwd|token|api[_-]?key)\s*=\s*[^ \n\r\t]+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}\b/g, "$1 [REDACTED]");
}

function fingerprint(record) {
  const version = Number(record.fingerprintVersion ?? 1);
  // Fingerprint versions are intentionally compatible: v1 used sessionId only,
  // v2 added normalized summaries, and v3 drops sessionId so repeated lessons
  // dedupe across sessions and can power local learning hints.
  if (version === 1) {
    return createHash("sha256")
      .update([record.cwd, record.file, record.category, record.sessionId].join(":"))
      .digest("hex")
      .slice(0, 16);
  }
  if (version === 2) {
    return createHash("sha256")
      .update([version, record.cwd, record.file, record.category, record.sessionId, normalizeSummary(record.summary)].join(":"))
      .digest("hex")
      .slice(0, 16);
  }
  return createHash("sha256")
    .update([version, record.cwd, record.file, record.category, normalizeSummary(record.summary)].join(":"))
    .digest("hex")
    .slice(0, 16);
}

function parseEntry(line, index, file) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`${file}:${index + 1}: ${error.message}`);
  }
}

function readEntries(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line, index) => parseEntry(line, index, file));
}

function suggestedGuard(category) {
  const normalized = String(category || "").toLowerCase();
  if (normalized.includes("secret") || normalized.includes("credential")) return "add secret/credential pre-tool or post-tool gate";
  if (normalized.includes("browser") || normalized.includes("qa")) return "add browser-qa-report validation or route fixture";
  if (normalized.includes("verification") || normalized.includes("test")) return "add smoke, doctor, or test workflow gate";
  if (normalized.includes("repeat") || normalized.includes("edit")) return "add regression fixture for repeated edit failure";
  return "add deterministic hook, checker, or regression test";
}

function severityFor(entry) {
  const text = `${entry.category || ""} ${entry.summary || ""}`.toLowerCase();
  if (/secret|credential|token|password|api[_-]?key|prod|production|data loss/.test(text)) return "P0";
  if (/verification|browser|qa|silent|fallback|repeat|regression/.test(text)) return "P1";
  return "P2";
}

function suggestionFor(entry) {
  return {
    file: entry.file,
    category: entry.category,
    summary: redactText(entry.summary),
    severity: severityFor(entry),
    fingerprint: entry.fingerprint,
    lastSeen: entry.at || "",
    suggestedGuard: suggestedGuard(entry.category),
  };
}

function aggregateFingerprint(cwd, category, summary) {
  return createHash("sha256")
    .update(["project-aggregate", cwd, category, normalizeSummary(summary)].join(":"))
    .digest("hex")
    .slice(0, 16);
}

function aggregateSuggestionFor(cwd, entries) {
  const sorted = [...entries].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
  const latest = sorted[sorted.length - 1];
  const recentFiles = [...new Set(sorted.slice().reverse().map((entry) => entry.file))].slice(0, 5);
  return {
    kind: "aggregate",
    category: latest.category,
    summary: redactText(latest.summary),
    severity: severityFor(latest),
    fingerprint: aggregateFingerprint(cwd, latest.category, latest.summary),
    firstSeen: sorted[0]?.at || "",
    lastSeen: latest.at || "",
    affectedFilesCount: new Set(sorted.map((entry) => entry.file)).size,
    occurrenceCount: sorted.length,
    recentFiles,
    suggestedGuard: suggestedGuard(latest.category),
  };
}

function projectSuggestions(cwd, entries, limit) {
  const normalizedLimit = Math.max(1, Number.isFinite(limit) ? limit : 5);
  const aggregateThreshold = Math.max(
    2,
    Number.parseInt(argValue(args, "--aggregate-threshold", "3"), 10) || 3,
  );
  const groups = new Map();
  for (const entry of entries) {
    const key = [entry.category, normalizeSummary(entry.summary)].join("\0");
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }
  const suggestions = [];
  const groupedEntries = [...groups.values()].sort((left, right) => {
    const leftLast = left.map((entry) => entry.at || "").sort().at(-1) || "";
    const rightLast = right.map((entry) => entry.at || "").sort().at(-1) || "";
    return rightLast.localeCompare(leftLast);
  });
  for (const group of groupedEntries) {
    const sorted = [...group].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
    if (sorted.length >= aggregateThreshold) {
      suggestions.push(aggregateSuggestionFor(cwd, sorted));
    } else {
      suggestions.push(...sorted.reverse().map(suggestionFor));
    }
    if (suggestions.length >= normalizedLimit) break;
  }
  return suggestions.slice(0, normalizedLimit);
}

function maxAgeMs() {
  const raw = argValue(args, "--max-age-days", process.env.CLAUDE_CONTROL_PLANE_LEARNING_HINT_MAX_AGE_DAYS || "90");
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days * 24 * 60 * 60 * 1000;
}

function freshEnough(entry) {
  const windowMs = maxAgeMs();
  if (windowMs === null) return true;
  const seen = Date.parse(entry.at || "");
  if (!Number.isFinite(seen)) return true;
  return Date.now() - seen <= windowMs;
}

function record() {
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const rawFile = argValue(args, "--file");
  const category = argValue(args, "--category", "quality");
  const summary = argValue(args, "--summary");
  if (!rawFile || !summary) {
    console.error("project-buglog record requires --file and --summary.");
    process.exit(2);
  }
  const file = normalizeFile(cwd, rawFile);

  const target = buglogPath();
  const entry = {
    schemaVersion: 1,
    fingerprintVersion: BUGLOG_FINGERPRINT_VERSION,
    cwd,
    file,
    category,
    summary: redactText(summary),
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
  const rawFile = argValue(args, "--file");
  if (!rawFile) {
    console.error("project-buglog suggest requires --file.");
    process.exit(2);
  }
  const file = normalizeFile(cwd, rawFile);
  const entries = readEntries(buglogPath())
    .filter((entry) => entry.cwd === cwd && entry.file === file)
    .filter(freshEnough)
    .slice(-3)
    .reverse();
  if (jsonMode) {
    console.log(JSON.stringify({
      schemaVersion: 1,
      cwd,
      file,
      suggestions: entries.map(suggestionFor),
    }, null, 2));
    return;
  }
  if (entries.length === 0) return;
  console.log(`Previous bug notes for ${file}:`);
  for (const entry of entries) {
    console.log(`- ${entry.category}: ${redactText(entry.summary)}`);
  }
}

function latestUnique(entries) {
  const byFingerprint = new Map();
  for (const entry of entries) {
    byFingerprint.set(entry.fingerprint, entry);
  }
  return [...byFingerprint.values()].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
}

function suggestProject() {
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const limit = Number.parseInt(argValue(args, "--limit", "5"), 10);
  const entries = latestUnique(
    readEntries(buglogPath())
      .filter((entry) => entry.cwd === cwd)
      .filter(freshEnough),
  );
  const suggestions = projectSuggestions(cwd, entries, limit);
  if (jsonMode) {
    console.log(JSON.stringify({
      schemaVersion: 1,
      project: path.basename(cwd),
      suggestions,
    }, null, 2));
    return;
  }
  if (suggestions.length === 0) return;
  console.log(`Previous project bug notes for ${path.basename(cwd)}:`);
  for (const suggestion of suggestions) {
    console.log(`- ${suggestion.file}: ${suggestion.category}: ${suggestion.summary}`);
  }
}

function validate() {
  const entries = readEntries(buglogPath());
  const errors = [];
  for (const entry of entries) {
    if (entry.schemaVersion !== 1) errors.push("entry missing schemaVersion");
    const fingerprintVersion = Number(entry.fingerprintVersion ?? 1);
    if (![1, 2, 3].includes(fingerprintVersion)) {
      errors.push(
        `${entry.file || "<unknown>"} invalid fingerprintVersion (supported fingerprintVersion values: 1, 2, 3; got ${entry.fingerprintVersion})`,
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
else if (command === "suggest-project") suggestProject();
else if (command === "validate") validate();
else {
  console.error("usage: project-buglog.mjs record|suggest|suggest-project|validate");
  process.exit(2);
}
