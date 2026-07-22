#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argValue } from "./lib/cli-args.mjs";
import { readStdinJson } from "./lib/read-stdin.mjs";

const args = process.argv.slice(2);
const markdownMode = args.includes("--markdown");
const filePath = argValue(args, "--file", "");

const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const AUTOFIX_CLASSES = new Set(["safe_auto", "gated_auto", "manual"]);
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

const HELP = `usage: review-merge.mjs [--file <path>] [--markdown]

Merge parallel reviewer findings into one artifact.

Input: JSON array on stdin or via --file. Each finding object:
  reviewer      string   reviewer role or id
  severity      P0|P1|P2|P3
  confidence    number   0-1
  file          string   relative file path
  line          number   line number
  fingerprint   string   optional dedup key
  summary       string   finding text
  autofix_class safe_auto|gated_auto|manual

Output: merged report JSON (default) or markdown (--markdown).
  blocking   P0/P1 findings above confidence threshold
  safe_auto    non-blocking safe_auto findings (fix now)
  residual     non-blocking gated_auto/manual findings (todos)
  dropped      findings below confidence threshold (never silent)

Exit 1 when blocking is non-empty; 0 otherwise.`;

function normalizeSummary(summary) {
  return String(summary || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ");
}

function dedupeKey(finding) {
  if (finding.fingerprint) return String(finding.fingerprint);
  const prefix = normalizeSummary(finding.summary).slice(0, 80);
  return `${finding.file}:${finding.line}:${prefix}`;
}

function validateFinding(finding, index) {
  const errors = [];
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    return [`findings[${index}] must be an object`];
  }
  if (!finding.reviewer) errors.push(`findings[${index}] missing reviewer`);
  if (!SEVERITIES.has(finding.severity)) errors.push(`findings[${index}] invalid severity ${finding.severity}`);
  const confidence = Number(finding.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push(`findings[${index}] confidence must be 0-1`);
  }
  if (!finding.file) errors.push(`findings[${index}] missing file`);
  if (!Number.isInteger(finding.line) || finding.line < 1) errors.push(`findings[${index}] line must be a positive integer`);
  if (!finding.summary) errors.push(`findings[${index}] missing summary`);
  if (!AUTOFIX_CLASSES.has(finding.autofix_class)) {
    errors.push(`findings[${index}] invalid autofix_class ${finding.autofix_class}`);
  }
  return errors;
}

function loadFindings() {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }
  let payload;
  if (filePath) {
    try {
      payload = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      console.error(`review-merge --file ${filePath}: ${error.message}`);
      process.exit(2);
    }
  } else {
    payload = readStdinJson({ required: true });
  }
  if (!Array.isArray(payload)) {
    console.error("review-merge input must be a JSON array of findings.");
    process.exit(2);
  }
  const errors = payload.flatMap((finding, index) => validateFinding(finding, index));
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(2);
  }
  return payload;
}

function pickHighestSeverity(group) {
  return group.reduce((best, current) => (
    SEVERITY_RANK[current.severity] < SEVERITY_RANK[best.severity] ? current : best
  ));
}

function confidenceThreshold(severity) {
  return severity === "P0" ? 0.50 : 0.60;
}

function mergeFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = dedupeKey(finding);
    const bucket = groups.get(key) ?? [];
    bucket.push(finding);
    groups.set(key, bucket);
  }

  const kept = [];
  const dropped = [];

  for (const group of groups.values()) {
    const base = pickHighestSeverity(group);
    let confidence = Math.max(...group.map((item) => Number(item.confidence)));
    if (group.length >= 2) confidence = Math.min(1, confidence + 0.10);
    const merged = {
      ...base,
      confidence,
      fingerprint: base.fingerprint || dedupeKey(base),
      reviewers: [...new Set(group.map((item) => item.reviewer))],
      reviewerCount: group.length,
    };
    const threshold = confidenceThreshold(merged.severity);
    if (confidence < threshold) {
      dropped.push({
        ...merged,
        dropReason: `confidence ${confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}`,
      });
    } else {
      kept.push(merged);
    }
  }

  const blocking = kept.filter((item) => item.severity === "P0" || item.severity === "P1");
  const safe_auto = kept.filter((item) => item.severity !== "P0" && item.severity !== "P1" && item.autofix_class === "safe_auto");
  const residual = kept.filter((item) => item.severity !== "P0" && item.severity !== "P1" && (item.autofix_class === "gated_auto" || item.autofix_class === "manual"));

  return {
    inputCount: findings.length,
    mergedCount: kept.length,
    droppedCount: dropped.length,
    blocking,
    safe_auto,
    residual,
    dropped,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Merged review report",
    "",
    `Input findings: ${report.inputCount}; kept: ${report.mergedCount}; dropped: ${report.droppedCount}`,
    "",
  ];
  for (const [title, items] of [
    ["Blocking (P0/P1)", report.blocking],
    ["Safe auto-fix", report.safe_auto],
    ["Residual todos", report.residual],
    ["Dropped", report.dropped],
  ]) {
    lines.push(`## ${title}`, "");
    if (items.length === 0) {
      lines.push("_none_", "");
      continue;
    }
    for (const item of items) {
      lines.push(`- **${item.severity}** \`${item.file}:${item.line}\` — ${item.summary} (confidence ${item.confidence.toFixed(2)}, reviewers: ${item.reviewers.join(", ")})`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

const findings = loadFindings();
const report = mergeFindings(findings);

if (markdownMode) {
  process.stdout.write(renderMarkdown(report));
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.blocking.length > 0 ? 1 : 0);
