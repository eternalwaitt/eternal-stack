#!/usr/bin/env node
import { readFileSync } from "node:fs";

const DOC_SKILL = "documentation-health";
const TERMINAL_DISPOSITIONS = new Set([
  "fixed",
  "false_positive_with_evidence",
  "accepted_risk_with_owner",
  "blocked",
]);
const NON_TERMINAL_DISPOSITIONS = new Set(["open", "later", "todo", "follow-up", "follow_up", ""]);
const BASELINE_PATH_RE = /(^|\/)(?:docs\/policy\/[^/\n]*baseline[^/\n]*|scripts\/docs\/[^/\n]*baseline[^/\n]*|[^/\n]*(?:comment|documentation|docs?)[^/\n]*baseline[^/\n]*)\.(?:json|md|mjs|cjs|js|ts|tsx)$/i;
const BASELINE_WRITE_COMMAND_RE = /\b--write-baseline\b|(^|[\s;&|])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?[^\s;&|]*baseline\b|(^|[\/\s])comment-health-baseline\.(?:mjs|cjs|js|ts)(?=.*\b--write-baseline\b)/i;
const BASELINE_REPORT_RE = /\b(?:baseline (?:written|created|generated|refreshed)|(?:wrote|created|generated|refreshed) (?:a )?(?:new )?baseline|must not increase|--write-baseline|docs:comments:baseline|comment[-_ ]health[-_ ]baseline)\b/i;
const BASELINE_NEGATED_RE = /\b(?:no|not|never|without|did not|didn't)\b.{0,60}\bbaseline\b|\bbaseline\b.{0,60}\b(?:not|never)\b/i;

function readInput() {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) return { state: {}, message: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.state) {
      return {
        state: parsed.state,
        message: String(parsed.message || ""),
      };
    }
    return { state: parsed, message: String(parsed.lastAssistantMessage || "") };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid documentation health input JSON: ${detail}`);
  }
}

function norm(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/^skill\(/, "")
    .replace(/\)$/, "")
    .replace(/^eternal-control-/, "")
    .replace(/^etrnl-/, "")
    .replace(/\s+/g, "-");
  const aliases = new Map([
    ["docs-health", DOC_SKILL],
    ["doc-health", DOC_SKILL],
    ["documentation-audit", DOC_SKILL],
    ["docs-audit", DOC_SKILL],
    ["documentation-drift", DOC_SKILL],
    ["docs-drift", DOC_SKILL],
  ]);
  return aliases.get(normalized) || normalized;
}

function stamp(item) {
  return String(item?.at || "");
}

function parseStamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function latestDocHealthRequest(state) {
  const times = (state.requestedSkills || [])
    .filter((item) => norm(item?.value) === DOC_SKILL)
    .map((item) => parseStamp(stamp(item)))
    .filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : 0;
}

function valuesAfter(items, timestamp) {
  return (items || [])
    .filter((item) => {
      const itemStamp = parseStamp(stamp(item));
      return Number.isFinite(itemStamp) && itemStamp >= timestamp;
    })
    .map((item) => String(item?.value || item?.command || ""));
}

function hasInvalidTimestampsAfter(items, timestamp) {
  return (items || []).some((item) => {
    const raw = stamp(item);
    if (!raw) return false;
    const itemStamp = parseStamp(raw);
    return !Number.isFinite(itemStamp);
  });
}

function recordStamp(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return String(value.at || value.timestamp || value.updatedAt || value.time || "");
}

function mapKeysAfter(records, timestamp) {
  if (!records || typeof records !== "object") return [];
  return Object.entries(records)
    .filter(([, value]) => {
      const raw = recordStamp(value);
      if (!raw) return true;
      const parsed = parseStamp(raw);
      return !Number.isFinite(parsed) || parsed >= timestamp;
    })
    .map(([key]) => key);
}

function hasInventory(commands) {
  return commands.some((command) => (
    /(^|[\/\s])code-health-inventory\.mjs(?=\s|$)/.test(command)
    && /\s--json(?=\s|$)/.test(command)
    && /\s--include-untracked(?=\s|$)/.test(command)
  ));
}

function hasValidation(commands) {
  return commands.some((command) => (
    /documentation-health-ledger-check\.mjs|markdownlint|cspell|vale|lychee|linkinator|markdown-link-check|skill-contract-check\.mjs|tests\/test-hooks\.sh|scripts\/doctor\.sh|doctor-control-plane\.sh/.test(command)
  ));
}

function hasCommentHealth(commands) {
  return commands.some((command) => /documentation-comment-health\.mjs/.test(command));
}

function hasAny(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

function hasAll(message, patterns) {
  return patterns.every((pattern) => pattern.test(message));
}

function counterValue(message, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.match(new RegExp(`^${escaped}:\\s*(\\d+)\\b`, "im"));
  return match ? Number.parseInt(match[1], 10) : null;
}

function scoreValue(message) {
  const match = message.match(/^FINAL_DOC_HEALTH_SCORE:\s*(\d+)\/100\b/im);
  return match ? Number.parseInt(match[1], 10) : null;
}

function hasNumericCounters(message, labels) {
  return labels.every((label) => Number.isInteger(counterValue(message, label)));
}

function hasPositiveCounter(message, label) {
  const value = counterValue(message, label);
  return Number.isInteger(value) && value > 0;
}

function normalizeDisposition(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function tableRowsAfterLedgerHeading(message) {
  const ledgerIndex = message.search(/findings ledger/i);
  if (ledgerIndex < 0) return [];
  const afterLedger = message.slice(ledgerIndex);
  const nextHeading = afterLedger.slice(1).search(/^##\s+/m);
  const ledgerSection = nextHeading >= 0 ? afterLedger.slice(0, nextHeading + 1) : afterLedger;
  return ledgerSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .filter((line) => !/^\|\s*-+/.test(line))
    .filter((line) => !/\|\s*(id|severity)\s*\|/i.test(line));
}

function ledgerStatus(message) {
  if (!/findings ledger/i.test(message)) return "missing-ledger";
  if (!hasAll(message, [/severity/i, /disposition/i, /verification/i])) return "missing-ledger";
  const rows = tableRowsAfterLedgerHeading(message);
  if (rows.length === 0) return "missing-ledger-rows";
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const disposition = normalizeDisposition(cells.find((cell) => {
      const normalized = normalizeDisposition(cell);
      return TERMINAL_DISPOSITIONS.has(normalized) || NON_TERMINAL_DISPOSITIONS.has(normalized);
    }) || cells.at(-2) || cells.at(-1) || "");
    if (NON_TERMINAL_DISPOSITIONS.has(disposition)) return "open-findings";
    if (!TERMINAL_DISPOSITIONS.has(disposition)) return "invalid-disposition";
    if (disposition === "accepted_risk_with_owner" && !/\b(owner|accepted by|risk owner)\b/i.test(row)) {
      return "accepted-risk-missing-owner";
    }
  }
  return "";
}

function baselineExplicitlyRequested(state) {
  return /\bbaseline\b|\bratchet\b/i.test(String(state.lastPrompt || ""));
}

function baselineHasTerminalRiskDisposition(message) {
  const baselineRows = tableRowsAfterLedgerHeading(message).filter((row) => BASELINE_REPORT_RE.test(row));
  if (baselineRows.length === 0) return false;
  return baselineRows.some((row) => {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const disposition = normalizeDisposition(cells.find((cell) => {
      const normalized = normalizeDisposition(cell);
      return TERMINAL_DISPOSITIONS.has(normalized) || NON_TERMINAL_DISPOSITIONS.has(normalized);
    }) || cells.at(-2) || cells.at(-1) || "");
    if (disposition === "blocked") return true;
    return disposition === "accepted_risk_with_owner" && /\b(owner|accepted by|risk owner)\b/i.test(row);
  });
}

function reportsBaselineClosure(message) {
  return message
    .split(/\r?\n/)
    .some((line) => BASELINE_REPORT_RE.test(line) && !BASELINE_NEGATED_RE.test(line));
}

function baselineEvidenceStatus(state, message, commands, requestedAt) {
  const changedPaths = [
    ...mapKeysAfter(state.edits, requestedAt),
    ...mapKeysAfter(state.newSourceFiles, requestedAt),
  ];
  const touchedBaseline = changedPaths.some((path) => BASELINE_PATH_RE.test(path));
  const wroteBaseline = commands.some((command) => BASELINE_WRITE_COMMAND_RE.test(command));
  const reportedBaselineClosure = reportsBaselineClosure(message);
  if (!touchedBaseline && !wroteBaseline && !reportedBaselineClosure) return "";
  if (baselineExplicitlyRequested(state) && baselineHasTerminalRiskDisposition(message)) return "";
  return "baseline-without-remediation";
}

function freshnessStatus(message) {
  const freshnessRequired = [
    "RECENT_COMMITS_REVIEWED",
    "RECENT_PRS_REVIEWED",
    "RECENT_CHANGE_DOC_IMPACT_CHECKS",
    "DOC_CLAIMS_CHECKED",
    "SOURCE_TRUTH_MAPPINGS_REVIEWED",
    "STALE_REFERENCE_SEARCHES_RUN",
    "OUTDATED_DOC_CLAIMS_FOUND",
    "OUTDATED_DOC_CLAIMS_REMAINING",
    "STALE_DOCS_FOUND",
    "STALE_DOCS_REMAINING",
    "MISLEADING_DOCS_FOUND",
    "MISLEADING_DOCS_REMAINING",
    "ACTIVE_PLAN_QUEUE_DOCS_REVIEWED",
    "ACTIVE_PLAN_QUEUE_DOCS_STALE",
  ];
  if (!hasNumericCounters(message, freshnessRequired)) return "missing-freshness-counters";
  if (!hasPositiveCounter(message, "RECENT_COMMITS_REVIEWED")) return "no-recent-commits-reviewed";
  // Require hasPositiveCounter("RECENT_PRS_REVIEWED") or explicit hasAny skip text matching no PRs reviewed, PRs review skipped, or skip PRs review.
  if (!hasPositiveCounter(message, "RECENT_PRS_REVIEWED") && !hasAny(message, [/no\s*pr?s\s*review(?:ed)?/i, /pr?s review skipped/i, /skip pr?s review/i])) {
    return "no-recent-prs-reviewed";
  }
  if (!hasPositiveCounter(message, "RECENT_CHANGE_DOC_IMPACT_CHECKS")) return "no-recent-change-doc-impact-checks";
  if (!hasPositiveCounter(message, "DOC_CLAIMS_CHECKED")) return "no-doc-claims-checked";
  if (!hasPositiveCounter(message, "SOURCE_TRUTH_MAPPINGS_REVIEWED")) return "no-source-truth-mappings";
  if (!hasPositiveCounter(message, "STALE_REFERENCE_SEARCHES_RUN")) return "missing-stale-reference-searches";
  if (!hasAny(message, [/freshness (?:and|&)? drift/i, /drift sweep/i, /stale reference search/i])) {
    return "missing-freshness-drift-section";
  }

  const remainingDrift = [
    "OUTDATED_DOC_CLAIMS_REMAINING",
    "STALE_DOCS_REMAINING",
    "MISLEADING_DOCS_REMAINING",
    "ACTIVE_PLAN_QUEUE_DOCS_STALE",
  ].some((label) => (counterValue(message, label) || 0) > 0);
  if (scoreValue(message) === 100 && remainingDrift) return "score-100-with-open-drift";
  return "";
}

function reportStatus(message) {
  if (!message.trim()) return "missing-report";
  if (!hasNumericCounters(message, ["DOCS_FILES_TOTAL", "DOCS_FILES_REVIEWED"])) {
    return "missing-coverage-counters";
  }
  if (!hasAny(message, [/SOURCE_FILES_TOTAL_APPLICABLE:/, /SOURCE_FILES_SAMPLED_OR_REVIEWED:/])) {
    return "missing-coverage-counters";
  }
  if (!/CHECKS_SKIPPED:/i.test(message) || !/^FINAL_DOC_HEALTH_SCORE:\s*\d+\/100\b/im.test(message)) {
    return "missing-coverage-counters";
  }

  const commentHealthNotApplicable = /COMMENT_HEALTH_NOT_APPLICABLE:/i.test(message);
  const commentHealthRequired = [
    "TSDOC_JSDOC_FILES_SCANNED",
    "COMMENT_TARGETS_REVIEWED",
    "COMMENT_TARGETS_DOCUMENTED",
    "COMMENT_TARGETS_MISSING_DOCS",
    "COMMENT_TARGETS_WRONG_FORMAT",
  ];
  if (!commentHealthNotApplicable && !hasNumericCounters(message, commentHealthRequired)) {
    return "missing-comment-health-counters";
  }
  const aiContextNotApplicable = /AI_CONTEXT_NOT_APPLICABLE:/i.test(message);
  const aiContextRequired = [
    "AI_CONTEXT_FILES_REVIEWED",
    "AI_CONTEXT_DRIFT_FINDINGS",
    "AI_CONTEXT_DUPLICATE_RULE_OWNERS",
    "AI_CONTEXT_HOT_PATH_LEAKS",
  ];
  if (!aiContextNotApplicable && !hasNumericCounters(message, aiContextRequired)) {
    return "missing-ai-context-counters";
  }

  const sourceTruth = [/source[_ -]of[_ -]truth/i, /source of truth/i];
  if (!hasAny(message, sourceTruth)) return "missing-source-truth";

  const freshness = freshnessStatus(message);
  if (freshness) return freshness;
  const docsTotal = counterValue(message, "DOCS_FILES_TOTAL");
  const docsReviewed = counterValue(message, "DOCS_FILES_REVIEWED");
  if (
    scoreValue(message) === 100
    && Number.isInteger(docsTotal)
    && Number.isInteger(docsReviewed)
    && docsReviewed < docsTotal
  ) {
    return "score-100-with-unreviewed-docs";
  }

  const ledger = ledgerStatus(message);
  if (ledger) return ledger;

  const scorecardRequired = [/scorecard/i, /overall documentation health|overall health/i];
  if (!hasAll(message, scorecardRequired)) return "missing-scorecard";

  if (!hasAny(message, [/TSDoc\/JSDoc/i, /Comment Health/i, /comment health/i])) {
    return "missing-comment-health-section";
  }

  const inventoryRequired = [/canonical/i, /secondary|stale|misleading|archive|generated|duplicate|delete_candidate|missing/i];
  if (!hasAll(message, inventoryRequired)) return "missing-inventory-classification";

  if (!hasAll(message, [/action items/i, /resolution plan|remediation plan|immediate fixes/i])) {
    return "missing-action-resolution-plan";
  }

  return "";
}

function docHealthGateStatus(state, message) {
  const requestedAt = latestDocHealthRequest(state);
  if (!requestedAt) return "";
  if (hasInvalidTimestampsAfter(state.successfulCommands, requestedAt) || hasInvalidTimestampsAfter(state.verificationRuns, requestedAt)) {
    return "invalid-timestamp";
  }

  const commands = [
    ...valuesAfter(state.successfulCommands, requestedAt),
    ...valuesAfter(state.verificationRuns, requestedAt),
  ];

  if (!hasInventory(commands)) return "missing-inventory";
  const status = reportStatus(message);
  if (status) return status;
  const baselineStatus = baselineEvidenceStatus(state, message, commands, requestedAt);
  if (baselineStatus) return baselineStatus;
  if (!/COMMENT_HEALTH_NOT_APPLICABLE:/i.test(message) && !hasCommentHealth(commands)) {
    return "missing-comment-health-check";
  }
  if (!hasValidation(commands)) return "missing-validation";
  return "";
}

try {
  const { state, message } = readInput();
  process.stdout.write(docHealthGateStatus(state, message));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`documentation-health-ledger-check failed: ${detail}`);
  process.exit(2);
}
