#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";
import { parseBashArray } from "./lib/bash-array-parser.mjs";
import {
  CATEGORY_REGISTRY_VERSION,
  KNOWN_UNIMPLEMENTED_CATEGORIES,
  REGISTERED_DEEP_AUDIT_CATEGORIES,
  findCategory,
  registeredCategoryIds,
} from "./lib/deep-audit-categories.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";
const jsonOutput = args.includes("--json");

const VALID_FIXTURES = [
  "tests/fixtures/deep-audit/report.valid.json",
  "tests/fixtures/deep-audit/report.production-valid.json",
  "tests/fixtures/deep-audit/report.performance-valid.json",
  "tests/fixtures/deep-audit/report.source-limited.json",
];

const INVALID_FIXTURES = [
  ["tests/fixtures/deep-audit/report.missing-confirmed-clean.json", "CHECK_WITHOUT_EVIDENCE"],
  ["tests/fixtures/deep-audit/report.required-worklist-missing.json", "REQUIRED_WORKLIST_MISSING"],
  ["tests/fixtures/deep-audit/report.consumed-hash-mismatch.json", "CONSUMED_WORKLIST_HASH_MISMATCH"],
  ["tests/fixtures/deep-audit/report.invalid-check-status.json", "CHECK_STATUS_INVALID"],
  ["tests/fixtures/deep-audit/report.hidden-finding-clean-synthesis.json", "FINDING_HIDDEN_UNDER_CLEAN"],
  ["tests/fixtures/deep-audit/report.invalid-lane-status.json", "LANE_RECEIPT_STATUS_INVALID"],
  ["tests/fixtures/deep-audit/report.registry-snapshot-drift.json", "KNOWN_UNIMPLEMENTED_CATEGORY_MISSING"],
  ["tests/fixtures/deep-audit/report.missing-lane-receipt.json", "LANE_RECEIPT_MISSING"],
  ["tests/fixtures/deep-audit/report.private-path.json", "PRIVATE_STRING"],
  ["tests/fixtures/deep-audit/report.missing-coverage-statement.json", "COVERAGE_STATEMENT_INCOMPLETE"],
  ["tests/fixtures/deep-audit/report.invalid-category.json", "CATEGORY_UNKNOWN"],
  ["tests/fixtures/deep-audit/report.omitted-check.json", "CHECK_OMITTED"],
  ["tests/fixtures/deep-audit/report.unknown-check-id.json", "CHECK_UNKNOWN"],
  ["tests/fixtures/deep-audit/report.duplicate-check-id.json", "CHECK_DUPLICATE"],
  ["tests/fixtures/deep-audit/report.invalid-category-local-inventory.json", "CATEGORY_LOCAL_INVENTORY"],
];

const REQUIRED_ARTIFACT_FIELDS = [
  "schemaVersion",
  "auditId",
  "categoryRegistryVersion",
  "registeredCategories",
  "knownUnimplementedCategories",
  "coverageStatement",
  "targetLabel",
  "targetFingerprint",
  "requestedCategories",
  "runArtifactLabel",
  "worklists",
  "categoryReports",
  "laneReceipts",
  "confirmedClean",
  "checksSkipped",
  "findings",
  "sourceLimitedBlockers",
  "synthesis",
  "verification",
];

const VALID_CHECK_STATUSES = new Set(["finding", "confirmed_clean", "skipped", "not_applicable", "source_limited"]);
const VALID_LANE_STATUSES = new Set(["completed", "source_limited", "blocked"]);

function usage() {
  console.error([
    "usage: deep-audit-artifact-check.mjs <command> [options]",
    "",
    "commands:",
    "  validate --artifact <file> [--json]",
    "  validate-fixtures [--json]",
    "  validate-registry --root <repo> [--json]",
    "  validate-synthetic-fixtures --fixture <dir> --templates <dir> [--json]",
  ].join("\n"));
  process.exit(2);
}

function diagnostic(errorCode, artifactPath, problem, cause, fix, jsonPath = "$") {
  return { errorCode, artifactPath, jsonPath, problem, cause, fix };
}

function report(errors, artifactPath = "") {
  if (errors.length === 0) {
    const payload = { ok: true, artifactPath };
    if (jsonOutput) console.log(JSON.stringify(payload, null, 2));
    else console.log(`ok: deep-audit artifact validation passed${artifactPath ? ` for ${artifactPath}` : ""}`);
    return;
  }
  if (jsonOutput) {
    console.log(JSON.stringify({ ok: false, errors }, null, 2));
  } else {
    for (const error of errors) {
      console.error(`${error.errorCode}: ${error.artifactPath}`);
      console.error(`problem: ${error.problem}`);
      console.error(`cause: ${error.cause}`);
      console.error(`fix: ${error.fix}`);
    }
  }
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw diagnostic("INVALID_JSON", file, "Artifact is not valid JSON.", error.message, "Fix the JSON syntax before validating the artifact.");
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function hasPrivateString(value) {
  const patterns = [
    /\/Users\//,
    /\/home\//,
    /\/Volumes\//,
    /~\//,
    /\/tmp\//,
    /\/var\/folders\//,
    /[A-Za-z]:\\/,
    /\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+/,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b(sk|pk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/,
    /\b[A-Z0-9_]*(TOKEN|API_KEY|SECRET|PASSWORD)[A-Z0-9_]*=/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  return typeof value === "string" && patterns.some((pattern) => pattern.test(value));
}

function walkStrings(value, visit, jsonPath = "$") {
  if (typeof value === "string") {
    visit(value, jsonPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, `${jsonPath}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walkStrings(item, visit, `${jsonPath}.${key}`);
  }
}

function selectedCategories(artifact, errors, artifactPath) {
  const validIds = registeredCategoryIds();
  if (artifact.requestedCategories === "all_registered") return validIds;
  if (!Array.isArray(artifact.requestedCategories)) {
    errors.push(diagnostic("REQUESTED_CATEGORIES_INVALID", artifactPath, "requestedCategories must be all_registered or an array.", "The artifact cannot establish the selected category set.", "Set requestedCategories to all_registered or a list of registered category ids.", "$.requestedCategories"));
    return [];
  }
  for (const categoryId of artifact.requestedCategories) {
    if (!validIds.includes(categoryId)) {
      errors.push(diagnostic("CATEGORY_UNKNOWN", artifactPath, `Unknown category id ${JSON.stringify(categoryId)}.`, "The artifact references a category that is not exported by REGISTERED_DEEP_AUDIT_CATEGORIES.", `Use one of: ${validIds.join(", ")}.`, "$.requestedCategories"));
    }
  }
  return artifact.requestedCategories.filter((categoryId) => validIds.includes(categoryId));
}

function worklistHashes(artifact) {
  return Object.fromEntries(objectEntries(artifact.worklists).map(([id, worklist]) => [id, worklist?.sha256 || worklist?.hash || ""]));
}

function validateConsumedHashes(item, category, artifact, artifactPath, errors, jsonPath) {
  const consumed = item?.consumedWorklistHashes;
  if (!consumed || typeof consumed !== "object" || Array.isArray(consumed)) {
    errors.push(diagnostic("CONSUMED_WORKLIST_HASHES_MISSING", artifactPath, `${jsonPath} lacks consumedWorklistHashes.`, "Category reports and lane receipts must prove they consumed shared worklists.", "Copy the shared worklist hashes into consumedWorklistHashes.", jsonPath));
    return;
  }
  const hashes = worklistHashes(artifact);
  const worklists = artifact.worklists && typeof artifact.worklists === "object" ? artifact.worklists : {};
  for (const worklistId of category.requiredWorklists) {
    if (!hasOwn(worklists, worklistId)) {
      errors.push(diagnostic("REQUIRED_WORKLIST_MISSING", artifactPath, `${jsonPath} cannot find required shared worklist ${worklistId}.`, "Selected categories must consume every required worklist from the orchestrator inventory.", `Add ${worklistId} to worklists with sha256 and artifactLabel.`, `$.worklists.${worklistId}`));
      continue;
    }
    if (!hashes[worklistId]) {
      errors.push(diagnostic("WORKLIST_HASH_MISSING", artifactPath, `${worklistId} lacks a shared hash.`, "Category reports and lane receipts cannot prove shared inventory consumption without hashes.", `Add sha256 for ${worklistId}.`, `$.worklists.${worklistId}`));
      continue;
    }
    if (!hasOwn(consumed, worklistId)) {
      errors.push(diagnostic("CONSUMED_WORKLIST_HASH_MISSING", artifactPath, `${jsonPath} does not consume required worklist ${worklistId}.`, "Category reports and lane receipts must prove they consumed every required shared worklist.", `Copy worklists.${worklistId}.sha256 into consumedWorklistHashes.${worklistId}.`, `${jsonPath}.consumedWorklistHashes.${worklistId}`));
      continue;
    }
    if (consumed[worklistId] !== hashes[worklistId]) {
      errors.push(diagnostic("CONSUMED_WORKLIST_HASH_MISMATCH", artifactPath, `${jsonPath} consumedWorklistHashes.${worklistId} does not match the shared worklist hash.`, "The category report appears to come from a different or local inventory.", "Use the orchestrator-created shared worklist hash for this category.", `${jsonPath}.consumedWorklistHashes.${worklistId}`));
    }
  }
}

function validateCheckEntry(check, artifactPath, errors, jsonPath) {
  const status = check.status;
  const findings = asArray(check.findings);
  if (!VALID_CHECK_STATUSES.has(status)) {
    errors.push(diagnostic("CHECK_STATUS_INVALID", artifactPath, `${check.checkId} uses invalid status ${JSON.stringify(status)}.`, "The artifact contract only permits registered check statuses.", "Use finding, confirmed_clean, skipped, not_applicable, or source_limited.", `${jsonPath}.status`));
    return;
  }
  if (status === "finding" && findings.length === 0) {
    errors.push(diagnostic("CHECK_WITHOUT_EVIDENCE", artifactPath, `${check.checkId} is marked finding without findings.`, "Completed checks need a finding or clean/skipped/not-applicable/source-limited evidence.", "Add at least one finding or change the check status with the required rationale.", jsonPath));
  }
  if (status === "confirmed_clean" && !String(check.confirmedClean || "").includes("CONFIRMED_CLEAN")) {
    errors.push(diagnostic("CHECK_WITHOUT_EVIDENCE", artifactPath, `${check.checkId} is clean without CONFIRMED_CLEAN evidence.`, "Clean checks cannot disappear into summary prose.", "Set confirmedClean to a non-empty string containing CONFIRMED_CLEAN.", jsonPath));
  }
  if (status === "skipped" && !check.skippedReason) {
    errors.push(diagnostic("SKIPPED_CHECK_WITHOUT_REASON", artifactPath, `${check.checkId} is skipped without a reason.`, "Skipped checks must explain the source-limited or context-limited blocker.", "Add skippedReason.", jsonPath));
  }
  if (status === "not_applicable" && !check.notApplicableReason) {
    errors.push(diagnostic("NOT_APPLICABLE_WITHOUT_REASON", artifactPath, `${check.checkId} is not_applicable without rationale.`, "Applicability gates must explain why the check does not apply.", "Add notApplicableReason.", jsonPath));
  }
  if (status === "source_limited" && !check.sourceLimitedBlocker) {
    errors.push(diagnostic("SOURCE_LIMITED_WITHOUT_BLOCKER", artifactPath, `${check.checkId} is source_limited without a blocker.`, "Source-limited checks must stay visible in final synthesis.", "Add sourceLimitedBlocker.", jsonPath));
  }
}

function validateSecurityCheckEntry(check, artifactPath, errors, jsonPath) {
  if (check.status === "finding") {
    const required = ["source", "sink", "missingControl", "exploit", "reachability", "confidence", "impact", "remediation"];
    for (const [findingIndex, finding] of asArray(check.findings).entries()) {
      for (const field of required) {
        if (!String(finding?.[field] || "").trim()) {
          errors.push(diagnostic("SECURITY_FINDING_FIELD_MISSING", artifactPath, `${check.checkId} finding ${findingIndex} lacks ${field}.`, "Security findings must prove exploitability instead of listing generic hardening advice.", `Add ${field} to the security finding.`, `${jsonPath}.findings[${findingIndex}].${field}`));
        }
      }
      if (finding.confidence && !["high", "medium", "low"].includes(String(finding.confidence))) {
        errors.push(diagnostic("SECURITY_FINDING_CONFIDENCE_INVALID", artifactPath, `${check.checkId} finding ${findingIndex} uses invalid confidence.`, "Security confidence must be machine-readable.", "Use high, medium, or low.", `${jsonPath}.findings[${findingIndex}].confidence`));
      }
    }
  }
  if (check.status === "confirmed_clean") {
    const nonFindings = check.nonFindings;
    if (!nonFindings || typeof nonFindings !== "object" || Array.isArray(nonFindings)) {
      errors.push(diagnostic("SECURITY_NON_FINDINGS_MISSING", artifactPath, `${check.checkId} is confirmed clean without explicit non-findings.`, "Security clean claims need checked source/sink/control/reachability evidence.", "Add nonFindings with checkedSources, checkedSinks, controlsObserved, unreachableReason, and validationEvidence.", `${jsonPath}.nonFindings`));
      return;
    }
    for (const field of ["checkedSources", "checkedSinks", "controlsObserved", "unreachableReason", "validationEvidence"]) {
      const value = nonFindings[field];
      const present = Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0;
      if (!present) {
        errors.push(diagnostic("SECURITY_NON_FINDING_FIELD_MISSING", artifactPath, `${check.checkId} nonFindings lacks ${field}.`, "Security non-findings must show exactly what was checked and why it is not exploitable.", `Add nonFindings.${field}.`, `${jsonPath}.nonFindings.${field}`));
      }
    }
  }
}

function validateRequiredFields(artifact, artifactPath, errors) {
  for (const field of REQUIRED_ARTIFACT_FIELDS) {
    if (!(field in artifact)) {
      errors.push(diagnostic("REQUIRED_FIELD_MISSING", artifactPath, `Missing required field ${field}.`, "The artifact envelope is incomplete.", `Add ${field} to the audit artifact.`, `$.${field}`));
    }
  }
}

function validateRegistrySnapshot(artifact, artifactPath, errors, registryIds) {
  if (artifact.categoryRegistryVersion !== CATEGORY_REGISTRY_VERSION) {
    errors.push(diagnostic("REGISTRY_VERSION_MISMATCH", artifactPath, "categoryRegistryVersion does not match the registry.", "The artifact may have been produced by stale category definitions.", `Set categoryRegistryVersion to ${CATEGORY_REGISTRY_VERSION}.`, "$.categoryRegistryVersion"));
  }
  const registered = asArray(artifact.registeredCategories);
  for (const categoryId of registryIds) {
    if (!registered.includes(categoryId)) {
      errors.push(diagnostic("REGISTERED_CATEGORY_MISSING", artifactPath, `${categoryId} is missing from registeredCategories.`, "The artifact registry snapshot is incomplete.", "Copy every registered category id into registeredCategories.", "$.registeredCategories"));
    }
  }
  for (const categoryId of registered) {
    if (!registryIds.includes(categoryId)) {
      errors.push(diagnostic("REGISTERED_CATEGORY_UNKNOWN", artifactPath, `${categoryId} is not exported by the registry.`, "The artifact registry snapshot contains an unregistered category.", "Remove unknown registeredCategories entries or register the category in scripts/lib/deep-audit-categories.mjs.", "$.registeredCategories"));
    }
  }
  const known = asArray(artifact.knownUnimplementedCategories);
  for (const categoryId of KNOWN_UNIMPLEMENTED_CATEGORIES) {
    if (!known.includes(categoryId)) {
      errors.push(diagnostic("KNOWN_UNIMPLEMENTED_CATEGORY_MISSING", artifactPath, `${categoryId} is missing from knownUnimplementedCategories.`, "Coverage statements can overclaim when known unimplemented domains disappear.", "Copy every KNOWN_UNIMPLEMENTED_CATEGORIES entry into knownUnimplementedCategories.", "$.knownUnimplementedCategories"));
    }
  }
  for (const categoryId of known) {
    if (!KNOWN_UNIMPLEMENTED_CATEGORIES.includes(categoryId)) {
      errors.push(diagnostic("KNOWN_UNIMPLEMENTED_CATEGORY_UNKNOWN", artifactPath, `${categoryId} is not in KNOWN_UNIMPLEMENTED_CATEGORIES.`, "The artifact snapshot contains a stale or invented unimplemented category.", "Remove the unknown value or update scripts/lib/deep-audit-categories.mjs.", "$.knownUnimplementedCategories"));
    }
  }
}

function validateCoverageStatement(artifact, artifactPath, errors, selected, registryIds) {
  if (artifact.requestedCategories === "all_registered") {
    for (const categoryId of registryIds) {
      if (!selected.includes(categoryId)) {
        errors.push(diagnostic("ALL_REGISTERED_OMITS_CATEGORY", artifactPath, `${categoryId} is omitted from all_registered selection.`, "all_registered must run every registered category.", "Use registeredCategoryIds() to derive all_registered selections.", "$.requestedCategories"));
      }
    }
  }
  const coverageStatement = String(artifact.coverageStatement || "");
  for (const categoryId of selected) {
    if (!coverageStatement.includes(categoryId)) {
      errors.push(diagnostic("COVERAGE_STATEMENT_INCOMPLETE", artifactPath, `coverageStatement omits ${categoryId}.`, "The final report can overclaim coverage when selected categories are not named.", "Include every selected category in coverageStatement.", "$.coverageStatement"));
    }
  }
  for (const categoryId of KNOWN_UNIMPLEMENTED_CATEGORIES) {
    if (!coverageStatement.includes(categoryId)) {
      errors.push(diagnostic("COVERAGE_STATEMENT_INCOMPLETE", artifactPath, `coverageStatement omits known unimplemented domain ${categoryId}.`, "The final report can be mistaken for every possible audit domain.", "List all known not-yet-registered audit domains in coverageStatement.", "$.coverageStatement"));
    }
  }
}

function validateWorklists(artifact, artifactPath, errors) {
  for (const [worklistId, worklist] of objectEntries(artifact.worklists)) {
    if (worklist.count !== undefined && !(worklist.sha256 || worklist.hash)) {
      errors.push(diagnostic("WORKLIST_HASH_MISSING", artifactPath, `${worklistId} has count without a hash.`, "Worklist consumers cannot prove they used the shared inventory.", "Add sha256 for this worklist.", `$.worklists.${worklistId}`));
    }
    if (worklist.count !== undefined && !worklist.artifactLabel) {
      errors.push(diagnostic("WORKLIST_LABEL_MISSING", artifactPath, `${worklistId} has count without artifactLabel.`, "Tracked artifacts need a label without exposing local paths.", "Add artifactLabel for this worklist.", `$.worklists.${worklistId}`));
    }
  }
}

function validateCategoryReport(report, reportIndex, artifact, artifactPath, registryIds, errors) {
  const category = findCategory(report.categoryId);
  const reportPath = `$.categoryReports[${reportIndex}]`;
  if (!category) {
    errors.push(diagnostic("CATEGORY_UNKNOWN", artifactPath, `Unknown category report ${JSON.stringify(report.categoryId)}.`, "The report references a category outside REGISTERED_DEEP_AUDIT_CATEGORIES.", `Use one of: ${registryIds.join(", ")}.`, `${reportPath}.categoryId`));
    return;
  }
  if (report.localInventoryCreated || report.localInventory || report.createdLocalInventory) {
    errors.push(diagnostic("CATEGORY_LOCAL_INVENTORY", artifactPath, `${report.categoryId} created local inventory after shared worklists existed.`, "Category agents must consume orchestrator worklists instead of rescanning independently.", "Remove local inventory and consume the shared worklist hashes.", reportPath));
  }
  validateConsumedHashes(report, category, artifact, artifactPath, errors, reportPath);
  const seen = new Set();
  const covered = new Set();
  asArray(report.checks).forEach((check, checkIndex) => {
    const checkPath = `${reportPath}.checks[${checkIndex}]`;
    if (seen.has(check.checkId)) {
      errors.push(diagnostic("CHECK_DUPLICATE", artifactPath, `${check.checkId} appears more than once.`, "Duplicate check ids can inflate completion counts.", "Keep exactly one row per registered check id.", checkPath));
    }
    seen.add(check.checkId);
    if (!category.checks.some((registeredCheck) => registeredCheck.checkId === check.checkId)) {
      errors.push(diagnostic("CHECK_UNKNOWN", artifactPath, `${check.checkId} is not registered for ${category.categoryId}.`, "Category reports cannot invent check ids.", "Use a registered checkId from scripts/lib/deep-audit-categories.mjs.", checkPath));
    } else {
      covered.add(check.checkId);
    }
    validateCheckEntry(check, artifactPath, errors, checkPath);
    if (category.categoryId === "security") {
      validateSecurityCheckEntry(check, artifactPath, errors, checkPath);
    }
  });
  for (const registeredCheck of category.checks) {
    if (!covered.has(registeredCheck.checkId)) {
      errors.push(diagnostic("CHECK_OMITTED", artifactPath, `${registeredCheck.checkId} is missing from ${category.categoryId}.`, "No-sampling requires every registered check to be represented.", "Add a finding, confirmed_clean, skipped, not_applicable, or source_limited row for this check.", reportPath));
    }
  }
}

function validateCategoryReports(artifact, artifactPath, errors, selected, registryIds) {
  const reports = asArray(artifact.categoryReports);
  for (const categoryId of selected) {
    if (!reports.some((report) => report.categoryId === categoryId)) {
      errors.push(diagnostic("CATEGORY_REPORT_MISSING", artifactPath, `${categoryId} has no category report.`, "Selected categories must produce reports before synthesis.", "Add a category report for the selected category.", "$.categoryReports"));
    }
  }
  reports.forEach((item, index) => validateCategoryReport(item, index, artifact, artifactPath, registryIds, errors));
}

function validateLaneReceipts(artifact, artifactPath, errors, selected) {
  const receipts = asArray(artifact.laneReceipts);
  for (const category of REGISTERED_DEEP_AUDIT_CATEGORIES.filter((item) => selected.includes(item.categoryId))) {
    for (const lane of category.lanes) {
      const receipt = receipts.find((item) => item.categoryId === category.categoryId && item.laneId === lane.laneId);
      if (!receipt) {
        errors.push(diagnostic("LANE_RECEIPT_MISSING", artifactPath, `${category.categoryId}/${lane.laneId} has no lane receipt.`, "Fanout work must return completion receipts before synthesis.", "Add a lane receipt with consumedWorklistHashes and summary.", "$.laneReceipts"));
      } else {
        const receiptPath = `$.laneReceipts[${receipts.indexOf(receipt)}]`;
        if (!VALID_LANE_STATUSES.has(receipt.status)) {
          errors.push(diagnostic("LANE_RECEIPT_STATUS_INVALID", artifactPath, `${category.categoryId}/${lane.laneId} has invalid receipt status ${JSON.stringify(receipt.status)}.`, "Lane receipts must distinguish completed, blocked, and source-limited work.", "Use completed, source_limited, or blocked.", `${receiptPath}.status`));
        }
        if (!receipt.summary) {
          errors.push(diagnostic("LANE_RECEIPT_SUMMARY_MISSING", artifactPath, `${category.categoryId}/${lane.laneId} has no summary.`, "Fanout receipts need a human-readable completion summary before synthesis.", "Add a non-empty summary.", `${receiptPath}.summary`));
        }
        validateConsumedHashes(receipt, category, artifact, artifactPath, errors, receiptPath);
      }
    }
  }
}

function validateOutcomeConsistency(artifact, artifactPath, errors) {
  let hasFindingRows = false;
  for (const [reportIndex, report] of asArray(artifact.categoryReports).entries()) {
    const reportFindings = asArray(report.checks).some((check) => check.status === "finding" || asArray(check.findings).length > 0);
    if (!reportFindings) continue;
    hasFindingRows = true;
    if (report.status === "clean") {
      errors.push(diagnostic("CATEGORY_FINDING_HIDDEN_UNDER_CLEAN", artifactPath, `${report.categoryId} has finding rows but category status is clean.`, "Category status must not hide confirmed findings.", "Set category status to findings_present or another non-clean terminal status.", `$.categoryReports[${reportIndex}].status`));
    }
  }
  if (!hasFindingRows) return;
  if (asArray(artifact.findings).length === 0) {
    errors.push(diagnostic("FINDINGS_SUMMARY_MISSING", artifactPath, "Check-level findings are present but top-level findings is empty.", "Synthesis cannot surface confirmed findings when the final findings list is empty.", "Copy each check-level finding into top-level findings.", "$.findings"));
  }
  if (artifact.synthesis?.status === "clean") {
    errors.push(diagnostic("FINDING_HIDDEN_UNDER_CLEAN", artifactPath, "Check-level findings are present while synthesis.status is clean.", "Final synthesis must not hide confirmed findings.", "Set synthesis.status to findings_present and summarize the findings.", "$.synthesis.status"));
  }
}

function validateArtifact(artifact, artifactPath) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    const typeName = Array.isArray(artifact) ? "array" : typeof artifact;
    errors.push(diagnostic("INVALID_ARTIFACT_TYPE", artifactPath, `Artifact must be a JSON object, got ${typeName}.`, "The deep-audit artifact validator expects an object with audit envelope fields.", "Supply a JSON object containing the required audit artifact fields."));
    return errors;
  }
  const registryIds = registeredCategoryIds();
  validateRequiredFields(artifact, artifactPath, errors);
  validateRegistrySnapshot(artifact, artifactPath, errors, registryIds);
  walkStrings(artifact, (value, jsonPath) => {
    if (hasPrivateString(value)) {
      errors.push(diagnostic("PRIVATE_STRING", artifactPath, `Private or local string found at ${jsonPath}.`, "Tracked audit artifacts cannot expose local paths, emails, tokens, or key material.", "Replace the value with a label, content hash, or repo fingerprint.", jsonPath));
    }
  });
  const selected = selectedCategories(artifact, errors, artifactPath);
  validateCoverageStatement(artifact, artifactPath, errors, selected, registryIds);
  validateWorklists(artifact, artifactPath, errors);
  validateCategoryReports(artifact, artifactPath, errors, selected, registryIds);
  validateLaneReceipts(artifact, artifactPath, errors, selected);
  validateOutcomeConsistency(artifact, artifactPath, errors);
  if (asArray(artifact.sourceLimitedBlockers).length > 0 && artifact.synthesis?.status === "clean") {
    errors.push(diagnostic("SOURCE_LIMITED_HIDDEN_UNDER_CLEAN", artifactPath, "sourceLimitedBlockers are present while synthesis.status is clean.", "Source-limited blockers cannot be counted as clean completion.", "Set synthesis.status to source_limited or findings_present and list the blockers.", "$.synthesis.status"));
  }
  return errors;
}

function runValidate() {
  const artifactPath = argValue(args, "--artifact");
  if (!artifactPath) usage();
  try {
    report(validateArtifact(readJson(artifactPath), artifactPath), artifactPath);
  } catch (error) {
    const isDiagnostic = error && typeof error === "object" && (error.errorCode || error.problem);
    const normalized = isDiagnostic
      ? error
      : diagnostic("UNEXPECTED_ERROR", artifactPath, error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack || error.message : "Unexpected validator error.", "Inspect the artifact and validator input.");
    report([normalized], artifactPath);
  }
}

function runValidateFixtures() {
  const errors = [];
  for (const fixture of VALID_FIXTURES) {
    const fixtureErrors = validateArtifact(readJson(fixture), fixture);
    errors.push(...fixtureErrors.map((error) => diagnostic("VALID_FIXTURE_FAILED", fixture, `Valid fixture failed with ${error.errorCode}.`, error.problem, error.fix, error.jsonPath)));
  }
  for (const [fixture, expectedCode] of INVALID_FIXTURES) {
    const fixtureErrors = validateArtifact(readJson(fixture), fixture);
    if (!fixtureErrors.some((error) => error.errorCode === expectedCode)) {
      errors.push(diagnostic("INVALID_FIXTURE_DID_NOT_FAIL", fixture, `Invalid fixture did not fail with ${expectedCode}.`, "The regression fixture no longer proves its validation rule.", `Adjust the fixture or validator so ${expectedCode} is emitted.`));
    }
    for (const error of fixtureErrors) {
      for (const field of ["errorCode", "artifactPath", "problem", "cause", "fix"]) {
        if (!error[field]) {
          errors.push(diagnostic("DIAGNOSTIC_FIELD_MISSING", fixture, `Diagnostic is missing ${field}.`, "Validator failures must be useful to maintainers and machines.", `Populate ${field} on every diagnostic.`));
        }
      }
    }
  }
  report(errors);
}

function readText(root, relativePath, errors) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    errors.push(diagnostic("REGISTRY_SURFACE_MISSING", file, `${relativePath} is missing.`, "Registry validation needs this surface to prove category wiring.", `Create ${relativePath}.`));
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function validateRegistryInstallSurfaces(skillLists, install, errors) {
  const criticalScripts = parseBashArray(skillLists, "CRITICAL_SCRIPTS");
  const installScripts = parseBashArray(skillLists, "INSTALL_SCRIPTS");
  if (!criticalScripts.includes("deep-audit-artifact-check.mjs")) {
    errors.push(diagnostic("REGISTRY_INSTALL_DRIFT", "scripts/lib/skill-lists.sh", "CRITICAL_SCRIPTS omits deep-audit-artifact-check.mjs.", "Install verification will not prove the validator exists.", "Add deep-audit-artifact-check.mjs to CRITICAL_SCRIPTS."));
  }
  if (!criticalScripts.includes("lib/deep-audit-categories.mjs")) {
    errors.push(diagnostic("REGISTRY_INSTALL_DRIFT", "scripts/lib/skill-lists.sh", "CRITICAL_SCRIPTS omits lib/deep-audit-categories.mjs.", "Install verification will not prove the registry helper exists.", "Add lib/deep-audit-categories.mjs to CRITICAL_SCRIPTS."));
  }
  if (!installScripts.includes("deep-audit-artifact-check.mjs")) {
    errors.push(diagnostic("REGISTRY_INSTALL_DRIFT", "scripts/lib/skill-lists.sh", "INSTALL_SCRIPTS omits deep-audit-artifact-check.mjs.", "The validator may pass source gates without being installed.", "Add deep-audit-artifact-check.mjs to INSTALL_SCRIPTS and scripts/install.sh copy commands."));
  }
  const installsScriptLib = install.includes('copy_dir_contents "$ROOT/scripts/lib" "$target_home/scripts/lib"');
  if (!installScripts.includes("lib/deep-audit-categories.mjs") && !installsScriptLib) {
    errors.push(diagnostic("REGISTRY_INSTALL_DRIFT", "scripts/install.sh", "scripts/install.sh does not install lib/deep-audit-categories.mjs.", "Installed deep-audit-artifact-check.mjs imports the registry helper and will crash if the helper is absent.", "Copy scripts/lib into the install target or add lib/deep-audit-categories.mjs to INSTALL_SCRIPTS."));
  }
  if (!install.includes("deep-audit-artifact-check.mjs") && !install.includes('for script in "${INSTALL_SCRIPTS[@]}"')) {
    errors.push(diagnostic("REGISTRY_INSTALL_DRIFT", "scripts/install.sh", "scripts/install.sh does not copy INSTALL_SCRIPTS.", "Installed Claude state can drift from source validation.", "Copy scripts from INSTALL_SCRIPTS or add an explicit deep-audit-artifact-check.mjs copy command."));
  }
}

function validateRegisteredCategorySurface(category, root, docs, triggerText, ownedSkills, errors) {
  if (!ownedSkills.includes(category.skillName)) {
    errors.push(diagnostic("REGISTRY_OWNED_SKILL_MISSING", "scripts/lib/skill-lists.sh", `${category.skillName} is missing from OWNED_SKILLS.`, "The skill will not install or route as repo-owned.", `Add ${category.skillName} to OWNED_SKILLS.`));
  }
  if (!docs.includes(`/${category.skillName}`)) {
    errors.push(diagnostic("REGISTRY_DOCS_MISSING", "docs/skills.md", `${category.skillName} is missing from docs/skills.md.`, "Maintainers cannot discover the skill.", `Document /${category.skillName}.`));
  }
  if (!triggerText.includes(category.skillName)) {
    errors.push(diagnostic("REGISTRY_TRIGGER_FIXTURE_MISSING", "tests/fixtures/skill-triggering/cases.json", `${category.skillName} is missing from trigger cases.`, "Skill behavior smoke cannot prove routing.", `Add a trigger fixture expecting ${category.skillName}.`));
  }
  if (!fs.existsSync(path.join(root, "skills", category.skillName, "SKILL.md"))) {
    errors.push(diagnostic("REGISTRY_SKILL_DIR_MISSING", `skills/${category.skillName}/SKILL.md`, `${category.skillName} SKILL.md is missing.`, "The registry points at a skill that does not exist.", `Create skills/${category.skillName}/SKILL.md.`));
  }
  if (!fs.existsSync(path.join(root, category.referencePath))) {
    errors.push(diagnostic("REGISTRY_REFERENCE_MISSING", category.referencePath, `${category.referencePath} is missing.`, "The category detail reference cannot be loaded.", `Create ${category.referencePath}.`));
  }
}

function validateOrchestratorSurface(docs, triggerText, ownedSkills, errors) {
  if (!ownedSkills.includes("etrnl-audit")) {
    errors.push(diagnostic("REGISTRY_ORCHESTRATOR_MISSING", "scripts/lib/skill-lists.sh", "etrnl-audit is missing from OWNED_SKILLS.", "The orchestrator will not install as repo-owned.", "Add etrnl-audit to OWNED_SKILLS."));
  }
  if (!docs.includes("/etrnl-audit")) {
    errors.push(diagnostic("REGISTRY_DOCS_MISSING", "docs/skills.md", "etrnl-audit is missing from docs/skills.md.", "Maintainers cannot discover the orchestrator.", "Document /etrnl-audit."));
  }
  if (!triggerText.includes("etrnl-audit")) {
    errors.push(diagnostic("REGISTRY_TRIGGER_FIXTURE_MISSING", "tests/fixtures/skill-triggering/cases.json", "etrnl-audit is missing from trigger cases.", "Skill behavior smoke cannot prove orchestrator routing.", "Add a trigger fixture expecting etrnl-audit."));
  }
}

function runValidateRegistry() {
  const root = argValue(args, "--root", ".");
  const errors = [];
  const skillLists = readText(root, "scripts/lib/skill-lists.sh", errors);
  const docs = readText(root, "docs/skills.md", errors);
  const triggerCasesRaw = readText(root, "tests/fixtures/skill-triggering/cases.json", errors);
  const ownedSkills = parseBashArray(skillLists, "OWNED_SKILLS");
  const install = readText(root, "scripts/install.sh", errors);
  validateRegistryInstallSurfaces(skillLists, install, errors);
  let triggerCases = [];
  try {
    triggerCases = JSON.parse(triggerCasesRaw);
  } catch {
    errors.push(diagnostic("REGISTRY_TRIGGER_FIXTURE_INVALID", "tests/fixtures/skill-triggering/cases.json", "Trigger fixture JSON cannot be parsed.", "Skill behavior smoke cannot prove routing.", "Fix tests/fixtures/skill-triggering/cases.json."));
  }
  const triggerText = JSON.stringify(triggerCases);
  for (const category of REGISTERED_DEEP_AUDIT_CATEGORIES) {
    validateRegisteredCategorySurface(category, root, docs, triggerText, ownedSkills, errors);
  }
  validateOrchestratorSurface(docs, triggerText, ownedSkills, errors);
  report(errors);
}

function runValidateSyntheticFixtures() {
  const fixtureDir = argValue(args, "--fixture");
  const templatesDir = argValue(args, "--templates");
  if (!fixtureDir || !templatesDir) usage();
  const errors = [];
  const requiredFixtureFiles = ["README.md", "route-matrix.json", "auth-blockers.json", "not-applicable.json"];
  const requiredTemplates = ["direct-category-report.json", "source-limited-report.json", "route-matrix-row.json", "confirmed-clean-row.json", "skipped-check-row.json", "not-applicable-row.json"];
  for (const file of requiredFixtureFiles) {
    if (!fs.existsSync(path.join(fixtureDir, file))) {
      errors.push(diagnostic("SYNTHETIC_FIXTURE_MISSING", path.join(fixtureDir, file), `Synthetic fixture is missing ${file}.`, "The fixture cannot prove realistic report authoring.", `Add ${file} with deterministic synthetic evidence.`));
    }
  }
  for (const file of requiredTemplates) {
    if (!fs.existsSync(path.join(templatesDir, file))) {
      errors.push(diagnostic("SYNTHETIC_TEMPLATE_MISSING", path.join(templatesDir, file), `Synthetic template is missing ${file}.`, "The fixture cannot teach the expected report row shape.", `Add ${file}.`));
    }
  }
  const labels = ["ROUTE_MATRIX", "AUTH_BLOCKER", "NOT_APPLICABLE", "CONFIRMED_CLEAN", "CHECKS_SKIPPED", "SOURCE_LIMITED"];
  const combined = [...requiredFixtureFiles.map((file) => path.join(fixtureDir, file)), ...requiredTemplates.map((file) => path.join(templatesDir, file))]
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const label of labels) {
    if (!combined.includes(label)) {
      errors.push(diagnostic("SYNTHETIC_ROW_TYPE_MISSING", fixtureDir, `Synthetic fixtures do not include ${label}.`, "Synthetic authoring must cover every required report row type.", `Add a fixture or template containing ${label}.`));
    }
  }
  report(errors);
}

if (command === "validate") runValidate();
else if (command === "validate-fixtures") runValidateFixtures();
else if (command === "validate-registry") runValidateRegistry();
else if (command === "validate-synthetic-fixtures") runValidateSyntheticFixtures();
else usage();
