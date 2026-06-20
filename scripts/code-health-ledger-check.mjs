#!/usr/bin/env node
import { readStdinJson } from "./lib/read-stdin.mjs";

const CODE_HEALTH_SKILL = "code-health";
const FULL_CODEBASE_AUDIT_PATTERN = /\b(code[- ]health|repo[- ]health|codebase[- ]health|no\s+skips|whole\s+codebase\s+audit|entire\s+codebase\s+audit)\b/;
const TERMINAL_DISPOSITIONS = new Set([
  "fixed",
  "false_positive_with_evidence",
  "accepted_risk_with_owner",
  "blocked",
]);
const NON_TERMINAL_DISPOSITIONS = new Set(["open", "later", "todo", "follow-up", "follow_up", ""]);

function readInput() {
  const parsed = readStdinJson({
    emptyValue: null,
    onInvalidJson: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid code health input JSON: ${detail}`);
    },
    onReadError: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid code health input JSON: ${detail}`);
    },
  });
  if (parsed === null) return { state: {}, message: "" };
  if (parsed && typeof parsed === "object" && parsed.state) {
    return {
      state: parsed.state,
      message: String(parsed.message || ""),
    };
  }
  return { state: parsed, message: String(parsed.lastAssistantMessage || "") };
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
    ["audit-code", CODE_HEALTH_SKILL],
    ["repo-health", CODE_HEALTH_SKILL],
    ["codebase-health", CODE_HEALTH_SKILL],
    ["health", CODE_HEALTH_SKILL],
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

function latestCodeHealthRequest(state) {
  const times = (state.requestedSkills || [])
    .filter((item) => norm(item?.value) === CODE_HEALTH_SKILL)
    .map((item) => parseStamp(stamp(item)))
    .filter(Number.isFinite);
  const prompt = String(state.lastPrompt || "").toLowerCase();
  if (FULL_CODEBASE_AUDIT_PATTERN.test(prompt)) {
    const startedAt = parseStamp(state.startedAt);
    if (Number.isFinite(startedAt)) {
      times.push(startedAt);
    }
  }
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

function hasInventory(commands) {
  return commands.some((command) => (
    /(^|[\/\s])code-health-inventory\.mjs(?=\s|$)/.test(command)
    && /\s--json(?=\s|$)/.test(command)
    && /\s--include-untracked(?=\s|$)/.test(command)
  ));
}

function hasValidation(commands) {
  return commands.some((command) => (
    /tests\/test-hooks\.sh|tests\/test-workflow-tools\.sh|scripts\/doctor\.sh|doctor-etrnl\.sh|pnpm\s+(run\s+)?(typecheck|lint|test|build)|npm\s+(run\s+)?(typecheck|lint|test|build)|yarn\s+(run\s+)?(typecheck|lint|test|build)|bun\s+(run\s+)?(typecheck|lint|test|build)|cargo\s+(test|clippy|build|check)|go\s+test|pytest|ruff|mypy|pyright/i.test(command)
  ));
}

function counterValue(message, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.match(new RegExp(`^${escaped}:\\s*(\\d+)\\b`, "im"));
  return match ? Number.parseInt(match[1], 10) : null;
}

function hasNumericCounters(message, labels) {
  return labels.every((label) => Number.isInteger(counterValue(message, label)));
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
  if (!/severity/i.test(message) || !/disposition/i.test(message) || !/verification/i.test(message)) {
    return "missing-ledger";
  }
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

function reportStatus(message) {
  if (!message.trim()) return "missing-report";
  const requiredCounters = [
    "CODE_HEALTH_FILES_TOTAL",
    "CODE_HEALTH_FILES_AUDITED",
    "ACTION_ITEMS_TOTAL",
    "ACTION_ITEMS_OPEN",
    "ACTION_ITEMS_TERMINAL",
  ];
  if (!hasNumericCounters(message, requiredCounters)) return "missing-coverage-counters";
  if (!/CHECKS_SKIPPED:/i.test(message) || !/^FINAL_CODE_HEALTH_SCORE:\s*\d+\/100\b/im.test(message)) {
    return "missing-coverage-counters";
  }
  if (counterValue(message, "ACTION_ITEMS_OPEN") !== 0) return "open-action-items";
  const terminal = counterValue(message, "ACTION_ITEMS_TERMINAL");
  const total = counterValue(message, "ACTION_ITEMS_TOTAL");
  if (Number.isInteger(terminal) && Number.isInteger(total) && terminal !== total) {
    return "unreconciled-action-items";
  }
  const ledger = ledgerStatus(message);
  if (ledger) return ledger;
  if (!/coverage map/i.test(message)) return "missing-coverage-map";
  if (!/action items/i.test(message)) return "missing-action-items";
  if (!/resolution plan|remediation plan/i.test(message)) return "missing-resolution-plan";
  if (!/final gate status|verification gate|health stack/i.test(message)) return "missing-final-gate-status";
  return "";
}

function codeHealthGateStatus(state, message) {
  const requestedAt = latestCodeHealthRequest(state);
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
  if (!hasValidation(commands)) return "missing-validation";
  return "";
}

try {
  const { state, message } = readInput();
  process.stdout.write(codeHealthGateStatus(state, message));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`code-health-ledger-check failed: ${detail}`);
  process.exit(2);
}
