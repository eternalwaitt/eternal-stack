#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { classifyAuditPathExclusion } from "./lib/audit-exclusions.mjs";
import { gitSubprocessLimits } from "./lib/env-utils.mjs";

const args = process.argv.slice(2);
let json = false;
let includeUntracked = false;
let quiet = false;
let root = process.cwd();
let rootProvided = false;
const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const DEFAULT_GIT_MAX_BUFFER = 20 * 1024 * 1024;
const GIT_LIMITS = gitSubprocessLimits({
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
  maxBufferBytes: DEFAULT_GIT_MAX_BUFFER,
});
const AUDIT_WITH_CARE_WEIGHT = 3;
const SENSITIVE_PATH_WEIGHT = 3;
const SENSITIVE_NAME_WEIGHT = 2;
const AUDITABLE_CATEGORY_WEIGHT = 1;
const REPORT_THRESHOLD = 4;
const MAX_FILES_REPORT = 25;

for (const arg of args) {
  if (arg === "--json") json = true;
  else if (arg === "--quiet") quiet = true;
  else if (arg === "--include-untracked") includeUntracked = true;
  else if (arg.startsWith("--root=")) {
    const value = arg.slice("--root=".length);
    if (!value) fail("--root requires a non-empty path");
    root = value;
    rootProvided = true;
  }
  else if (arg === "--help") {
    console.log("usage: code-health-inventory.mjs [--json] [--quiet] [--include-untracked] [--root=/path]");
    process.exit(0);
  }
}

function git(gitArgs, options = {}) {
  const result = spawnSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_LIMITS.timeout,
    maxBuffer: GIT_LIMITS.maxBuffer,
  });
  if (result.status === 0 && !result.error) return result.stdout;
  if (options.allowFailure === true) return "";
  const stderr = String(result.stderr || result.error?.message || "").trim();
  const detail = stderr ? `: ${stderr}` : "";
  throw new Error(`git ${gitArgs.join(" ")} failed${detail}`);
}

function fail(message) {
  console.error(`code-health-inventory: ${message}`);
  process.exit(1);
}

function checkGit() {
  const result = spawnSync("git", ["--version"], {
    encoding: "utf8",
    timeout: GIT_LIMITS.timeout,
    maxBuffer: GIT_LIMITS.maxBuffer,
  });
  if (result.status !== 0 || result.error) {
    fail("git is not available in PATH");
  }
}

checkGit();

if (!rootProvided) {
  try {
    const topLevel = git(["rev-parse", "--show-toplevel"]).trim();
    if (topLevel) root = topLevel;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  }
}

function gitFiles() {
  const tracked = git(["ls-files", "-z"]);
  const untracked = includeUntracked ? git(["ls-files", "--others", "--exclude-standard", "-z"], { allowFailure: true }) : "";
  return `${tracked}${untracked}`
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

const codeExts = new Set([
  ".bash",
  ".cjs",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
  ".zsh",
]);
const docsExts = new Set([".md", ".mdx", ".rst", ".txt"]);
const configExts = new Set([".json", ".jsonc", ".toml", ".yaml", ".yml", ".xml", ".ini"]);
// These patterns run on lowercased file paths (see classify()).
const lockfileAndBuildPatterns = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.(?:yaml|json)$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)cargo\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)\.terraform\.lock\.hcl$/,
  /(^|\/)dockerfile$/,
  /(^|\/)makefile$/,
  /(^|\/)gemfile(?:\.lock)?$/,
];

function classify(file) {
  const lower = file.toLowerCase();
  const ext = path.extname(lower);
  const excluded = classifyAuditPathExclusion(lower);
  if (excluded) return excluded;
  if (/(^|\/)(migrations?)\//.test(lower)) {
    return { category: "migration", auditScope: "audit-with-care", reason: "migration/history file" };
  }
  if (/(\.test|\.spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|test|tests)\//.test(lower)) {
    return { category: "test", auditScope: "audit", reason: "" };
  }
  if (lower.startsWith("docs/") || docsExts.has(ext)) {
    return { category: "docs", auditScope: "audit", reason: "" };
  }
  if (lower.startsWith("scripts/") || lower.startsWith("hooks/") || [".sh", ".bash", ".zsh"].includes(ext)) {
    return { category: "script", auditScope: "audit", reason: "" };
  }
  if (codeExts.has(ext)) {
    return { category: "source", auditScope: "audit", reason: "" };
  }
  if (configExts.has(ext) || lockfileAndBuildPatterns.some((pattern) => pattern.test(lower))) {
    return { category: "config", auditScope: "audit", reason: "" };
  }
  return { category: "asset-or-other", auditScope: "listed", reason: "non-source asset or unknown type" };
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function hotspotScore(file) {
  let score = 0;
  const reasons = [];
  const lower = file.path.toLowerCase();
  if (file.auditScope === "audit-with-care") {
    score += AUDIT_WITH_CARE_WEIGHT;
    reasons.push("audit-with-care");
  }
  if (!["docs", "test"].includes(file.category) && /(?:^|[/-])(?:auth|security|payment|billing|tenant|permissions?|webhooks?|migrations?)(?:$|[/-])/.test(lower)) {
    score += SENSITIVE_PATH_WEIGHT;
    reasons.push("sensitive path");
  }
  if (/(?:^|[_./-])(?:schema|router|handler|middleware|env|secret|token|credential|upload|export|delete|admin)(?:$|[_./-])/.test(lower)) {
    score += SENSITIVE_NAME_WEIGHT;
    reasons.push("sensitive name");
  }
  if (["source", "script", "config", "migration"].includes(file.category)) {
    score += AUDITABLE_CATEGORY_WEIGHT;
    reasons.push("auditable code/config");
  }
  return { score, reasons };
}

const files = gitFiles().map((file) => {
  const ext = path.extname(file).toLowerCase() || "[none]";
  const item = classify(file);
  const base = { path: file, ext, ...item };
  return { ...base, riskHotspot: hotspotScore(base) };
});

const byCategory = {};
const byExtension = {};
for (const file of files) {
  increment(byCategory, file.category);
  increment(byExtension, file.ext);
}

const report = {
  root,
  generatedAt: new Date().toISOString(),
  includeUntracked,
  totalFiles: files.length,
  auditFiles: files.filter((file) => file.auditScope === "audit").length,
  auditWithCareFiles: files.filter((file) => file.auditScope === "audit-with-care").length,
  listedOnlyFiles: files.filter((file) => file.auditScope === "listed").length,
  byCategory,
  byExtension,
  riskHotspots: files
    .filter((file) => file.riskHotspot.score >= REPORT_THRESHOLD)
    .sort((left, right) => right.riskHotspot.score - left.riskHotspot.score || left.path.localeCompare(right.path))
    .slice(0, MAX_FILES_REPORT)
    .map((file) => ({ path: file.path, score: file.riskHotspot.score, reasons: file.riskHotspot.reasons })),
  files,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else if (!quiet) {
  const totalLabel = includeUntracked ? "Total tracked and untracked files" : "Total tracked files";
  console.log(`# Code Health Inventory\n`);
  console.log(`Root: ${report.root}`);
  console.log(`${totalLabel}: ${report.totalFiles}`);
  console.log(`Audit files: ${report.auditFiles}`);
  console.log(`Audit-with-care files: ${report.auditWithCareFiles}`);
  console.log(`Listed-only files: ${report.listedOnlyFiles}\n`);
  console.log("| Category | Files |");
  console.log("| --- | ---: |");
  for (const [category, count] of Object.entries(byCategory).sort()) {
    console.log(`| ${category} | ${count} |`);
  }
}
