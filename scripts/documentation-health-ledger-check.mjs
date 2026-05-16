#!/usr/bin/env node
import { readFileSync } from "node:fs";

const DOC_SKILL = "documentation-health";

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

function latestDocHealthRequest(state) {
  return (state.requestedSkills || [])
    .filter((item) => norm(item?.value) === DOC_SKILL)
    .map(stamp)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function valuesAfter(items, timestamp) {
  return (items || [])
    .filter((item) => stamp(item) >= timestamp)
    .map((item) => String(item?.value || ""));
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

function hasAny(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

function hasAll(message, patterns) {
  return patterns.every((pattern) => pattern.test(message));
}

function reportStatus(message) {
  if (!message.trim()) return "missing-report";
  const coverageRequired = [
    /DOCS_FILES_REVIEWED:/,
    /SOURCE_FILES_SAMPLED_OR_REVIEWED:/,
    /CHECKS_SKIPPED:/,
    /FINAL_DOC_HEALTH_SCORE:/,
  ];
  if (!hasAll(message, coverageRequired)) return "missing-coverage-counters";

  const sourceTruth = [/source[_ -]of[_ -]truth/i, /source of truth/i];
  if (!hasAny(message, sourceTruth)) return "missing-source-truth";

  const ledgerRequired = [/findings ledger/i, /severity/i, /disposition/i, /verification/i];
  if (!hasAll(message, ledgerRequired)) return "missing-ledger";

  const scorecardRequired = [/scorecard/i, /overall documentation health|overall health/i];
  if (!hasAll(message, scorecardRequired)) return "missing-scorecard";

  const inventoryRequired = [/canonical/i, /secondary|stale|misleading|archive|generated|duplicate|delete_candidate|missing/i];
  if (!hasAll(message, inventoryRequired)) return "missing-inventory-classification";

  return "";
}

function docHealthGateStatus(state, message) {
  const requestedAt = latestDocHealthRequest(state);
  if (!requestedAt) return "";

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
  process.stdout.write(docHealthGateStatus(state, message));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`documentation-health-ledger-check failed: ${detail}`);
  process.exit(2);
}
