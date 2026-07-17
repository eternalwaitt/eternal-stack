#!/usr/bin/env node
// P7 token accounting: consume the per-subagent output-token records that the
// execution ledger writes (see recordSubagent() in execution-ledger.mjs) and
// report per-agentType cost, findings, tokens-per-finding, and net-negative
// contracts (tokens spent, zero findings surfaced). Fully deterministic: no
// wall-clock and no randomness in the math or the holdout selection, so a given
// set of ledgers always produces the same report.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { argValue as readArgValue } from "./lib/cli-args.mjs";
import { safeId } from "./lib/evidence-trace.mjs";

const SCHEMA_VERSION = 1;
const DEFAULT_HOLDOUT_PERCENT = 10;
const DEFAULT_NET_NEGATIVE_THRESHOLD = 1500;

// Mirror execution-ledger.mjs runsDir()/pointerPath()/currentLedgerPath() so a
// bare `report` with no path resolves the same session ledger the ledger writes.
function runsDir() {
  return process.env.ETRNL_RUNS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "runs");
}

function pointerPath(sessionId) {
  return path.join(runsDir(), `current-${safeId(sessionId)}.json`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function currentLedgerPath(sessionId) {
  const pointer = pointerPath(sessionId);
  if (!existsSync(pointer)) return "";
  const data = readJson(pointer);
  return data.path || "";
}

/**
 * Stable per-record holdout selection: sum of char codes of the agent id, mod
 * 100, compared against the holdout percent. No wall-clock, no randomness, so a
 * given id lands in (or out of) the holdout identically on every run.
 *
 * @param {string} id Agent record id.
 * @param {number} holdoutPercent Percent (0-100) of records to hold out.
 * @returns {boolean} True when the record is in the holdout sample.
 */
export function isHoldout(id, holdoutPercent) {
  if (holdoutPercent <= 0) return false;
  if (holdoutPercent >= 100) return true;
  const key = String(id || "");
  let sum = 0;
  for (let index = 0; index < key.length; index += 1) {
    sum += key.charCodeAt(index);
  }
  return (sum % 100) < holdoutPercent;
}

/**
 * Resolve one or more ledger file paths from the requested source. Explicit
 * paths that are unreadable are surfaced (caller exits 2); an unresolved
 * session simply yields an empty list (zero-state, not an error).
 *
 * @param {{ ledger?: string, session?: string, dir?: string }} source
 * @returns {string[]} Absolute ledger file paths (may be empty).
 */
export function resolveLedgerPaths(source) {
  const { ledger, session, dir } = source;
  if (ledger) return [ledger];
  if (dir) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`ledger dir not found: ${dir}`);
    }
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json") && !file.startsWith("current-"))
      .sort()
      .map((file) => path.join(dir, file));
  }
  const resolved = currentLedgerPath(session || process.env.CLAUDE_SESSION_ID || "default");
  return resolved ? [resolved] : [];
}

/**
 * Load agent records that carry outputTokens across the given ledger files.
 * Reads are resilient by default: a malformed ledger file is skipped unless it
 * was explicitly requested (strict), matching the CLI's exit-2-only-on-request
 * contract.
 *
 * @param {string[]} files Ledger file paths.
 * @param {{ strict?: boolean }} [options]
 * @returns {Array<object>} Agent records with numeric outputTokens.
 */
export function collectAgentRecords(files, options = {}) {
  const records = [];
  for (const file of files) {
    let ledger;
    try {
      ledger = readJson(file);
    } catch (error) {
      if (options.strict) throw new Error(`${file}: ${error.message}`);
      continue;
    }
    for (const agent of Array.isArray(ledger.agents) ? ledger.agents : []) {
      if (typeof agent.outputTokens === "number" && Number.isFinite(agent.outputTokens)) {
        records.push(agent);
      }
    }
  }
  return records;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Compute the deterministic token-savings report from agent records.
 *
 * Holdout records are reported separately and EXCLUDED from every savings/cost
 * total and per-agent aggregate. Net-negative records spent tokens
 * (outputTokens >= threshold) but surfaced zero findings.
 *
 * @param {Array<object>} records Agent records with outputTokens.
 * @param {{ holdoutPercent: number, netNegativeThreshold: number }} options
 * @returns {object} Structured, deterministic report.
 */
export function computeReport(records, options) {
  const holdoutPercent = options.holdoutPercent;
  const netNegativeThreshold = options.netNegativeThreshold;

  const scored = [];
  const holdoutRecords = [];
  for (const record of records) {
    if (isHoldout(record.id, holdoutPercent)) {
      holdoutRecords.push(record);
    } else {
      scored.push(record);
    }
  }

  const perAgentMap = new Map();
  const netNegative = [];
  let totalTokens = 0;
  let totalFindings = 0;

  for (const record of scored) {
    const agentType = record.agentType || record.role || "unknown";
    const outputTokens = record.outputTokens;
    const findingsCount = Number.isFinite(record.findingsCount) ? record.findingsCount : 0;
    totalTokens += outputTokens;
    totalFindings += findingsCount;

    let bucket = perAgentMap.get(agentType);
    if (!bucket) {
      bucket = { agentType, recordCount: 0, totalTokens: 0, totalFindings: 0 };
      perAgentMap.set(agentType, bucket);
    }
    bucket.recordCount += 1;
    bucket.totalTokens += outputTokens;
    bucket.totalFindings += findingsCount;

    if (outputTokens >= netNegativeThreshold && findingsCount === 0) {
      netNegative.push({
        id: record.id || null,
        agentType,
        outputTokens,
        findingsCount,
        taskId: record.taskId || null,
        reason: `spent ${outputTokens} tokens with 0 findings`,
      });
    }
  }

  const perAgent = [...perAgentMap.values()]
    .map((bucket) => ({
      agentType: bucket.agentType,
      recordCount: bucket.recordCount,
      totalOutputTokens: bucket.totalTokens,
      meanOutputTokens: bucket.recordCount > 0 ? round(bucket.totalTokens / bucket.recordCount) : 0,
      totalFindings: bucket.totalFindings,
      tokensPerFinding: bucket.totalFindings > 0 ? round(bucket.totalTokens / bucket.totalFindings) : null,
      netNegative: bucket.totalTokens >= netNegativeThreshold && bucket.totalFindings === 0,
    }))
    .sort((a, b) => (b.totalOutputTokens - a.totalOutputTokens) || a.agentType.localeCompare(b.agentType));

  const holdoutTokens = holdoutRecords.reduce((sum, record) => sum + record.outputTokens, 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    perAgent,
    netNegative,
    holdout: {
      count: holdoutRecords.length,
      excludedTokens: holdoutTokens,
      holdoutPercent,
    },
    totals: {
      recordCount: scored.length,
      totalOutputTokens: totalTokens,
      totalFindings: totalFindings,
      tokensPerFinding: totalFindings > 0 ? round(totalTokens / totalFindings) : null,
      netNegativeAgentTypes: perAgent.filter((entry) => entry.netNegative).length,
      netNegativeRecords: netNegative.length,
      netNegativeThreshold,
    },
  };
}

function formatSummary(report) {
  const lines = [];
  lines.push("Token savings report");
  if (report.totals.recordCount === 0 && report.holdout.count === 0) {
    lines.push("  no agent output-token records found (zero state)");
    return lines.join("\n");
  }
  lines.push(
    `  scored records=${report.totals.recordCount} tokens=${report.totals.totalOutputTokens} `
    + `findings=${report.totals.totalFindings} tokens-per-finding=${report.totals.tokensPerFinding ?? "n/a"}`,
  );
  lines.push("  per-agentType:");
  if (report.perAgent.length === 0) {
    lines.push("    (none)");
  }
  for (const entry of report.perAgent) {
    lines.push(
      `    ${entry.agentType}: count=${entry.recordCount} tokens=${entry.totalOutputTokens} `
      + `mean=${entry.meanOutputTokens} findings=${entry.totalFindings} `
      + `tokens/finding=${entry.tokensPerFinding ?? "n/a"}${entry.netNegative ? " NET-NEGATIVE" : ""}`,
    );
  }
  lines.push(`  net-negative contracts: ${report.netNegative.length}`);
  for (const entry of report.netNegative) {
    lines.push(`    ${entry.agentType} (${entry.id ?? "?"}): ${entry.reason}`);
  }
  lines.push(
    `  holdout: count=${report.holdout.count} excludedTokens=${report.holdout.excludedTokens} `
    + `(percent=${report.holdout.holdoutPercent}, excluded from savings totals)`,
  );
  return lines.join("\n");
}

function parsePositiveInt(raw, fallback, flag) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${flag} must be a non-negative integer, got: ${raw}`);
    process.exit(2);
  }
  return value;
}

function reportCommand(args) {
  const argValue = (flag, fallback = "") => readArgValue(args, flag, fallback);
  const asJson = args.includes("--json");
  const ledger = argValue("--ledger");
  const session = argValue("--session");
  const dir = argValue("--dir");
  const holdoutPercent = parsePositiveInt(
    argValue("--holdout-percent", String(DEFAULT_HOLDOUT_PERCENT)),
    DEFAULT_HOLDOUT_PERCENT,
    "--holdout-percent",
  );
  if (holdoutPercent > 100) {
    console.error("--holdout-percent must be between 0 and 100");
    process.exit(2);
  }
  const netNegativeThreshold = parsePositiveInt(
    argValue("--net-negative-threshold", String(DEFAULT_NET_NEGATIVE_THRESHOLD)),
    DEFAULT_NET_NEGATIVE_THRESHOLD,
    "--net-negative-threshold",
  );

  // Explicitly requested paths are strict: an unreadable/malformed ledger is a
  // hard error (exit 2). Session/dir discovery stays resilient (skip + continue).
  const explicit = Boolean(ledger || dir);
  let files;
  try {
    files = resolveLedgerPaths({ ledger, session, dir });
  } catch (error) {
    console.error(`token-savings: ${error.message}`);
    process.exit(2);
  }

  let records;
  try {
    records = collectAgentRecords(files, { strict: explicit });
  } catch (error) {
    console.error(`token-savings: ${error.message}`);
    process.exit(2);
  }

  const report = computeReport(records, { holdoutPercent, netNegativeThreshold });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSummary(report));
  }
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  if (command === "report") {
    reportCommand(args.slice(1));
    return;
  }
  console.error(
    "usage: token-savings.mjs report [--ledger <path> | --session <id> | --dir <dir>] "
    + "[--json] [--holdout-percent <n>] [--net-negative-threshold <tokens>]",
  );
  process.exit(2);
}

main();
