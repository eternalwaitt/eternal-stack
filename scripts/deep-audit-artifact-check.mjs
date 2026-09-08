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
  orchestratorCategoryIds,
  registeredCategoryIds,
} from "./lib/deep-audit-categories.mjs";
import { UX_FINDING_STATUS_SET, UX_FINDING_STATUSES, UX_SEVERITIES, UX_SEVERITY_SET } from "./lib/ux-finding-taxonomy.mjs";
import { hasPrivateString } from "./lib/private-strings.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";
const jsonOutput = args.includes("--json");

const VALID_FIXTURES = [
  "tests/fixtures/deep-audit/report.valid.json",
  "tests/fixtures/deep-audit/report.production-valid.json",
  "tests/fixtures/deep-audit/report.performance-valid.json",
  "tests/fixtures/deep-audit/report.ux-valid.json",
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
  ["tests/fixtures/deep-audit/report.unexpected-local-inventory-flag.json", "CATEGORY_LOCAL_INVENTORY"],
  ["tests/fixtures/deep-audit/report.ux-coverage-incomplete.json", "UX_COVERAGE_INCOMPLETE"],
  ["tests/fixtures/deep-audit/report.ux-finding-field-missing.json", "UX_FINDING_FIELD_MISSING"],
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
const UX_CATEGORY_ID = "ui-ux-product";
const UX_FINDING_FIELDS = ["route", "viewport", "symptom", "evidence", "baseline", "severity", "status", "remediation"];
const UX_NON_FINDING_FIELDS = ["routesCovered", "viewportsCovered", "statesExercised", "baselineCompared", "evidenceType"];
const UX_COVERAGE_COUNTERS = [
  "routesTotal",
  "routesCovered",
  "surfacesTotal",
  "surfacesCovered",
  "stateCellsTotal",
  "stateCellsCovered",
];
const PERFORMANCE_CATEGORY_ID = "performance";
const RUNTIME_INCIDENT_STATUSES = new Set(["open", "blocked_external", "resolved"]);
const PROVIDER_INTAKE_STATUSES = new Set(["queried", "unavailable", "not_applicable"]);

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
  if (artifact.requestedCategories === "all_registered") return orchestratorCategoryIds();
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

function validateUxCheckEntry(check, artifactPath, errors, jsonPath) {
  if (check.status === "finding") {
    for (const [findingIndex, finding] of asArray(check.findings).entries()) {
      for (const field of UX_FINDING_FIELDS) {
        if (!String(finding?.[field] || "").trim()) {
          errors.push(diagnostic("UX_FINDING_FIELD_MISSING", artifactPath, `${check.checkId} finding ${findingIndex} lacks ${field}.`, "UI/UX findings must describe what a user hits on a named surface against a named baseline.", `Add ${field} to the UI/UX finding.`, `${jsonPath}.findings[${findingIndex}].${field}`));
        }
      }
      if (finding?.severity && !UX_SEVERITY_SET.has(String(finding.severity))) {
        errors.push(diagnostic("UX_SEVERITY_INVALID", artifactPath, `${check.checkId} finding ${findingIndex} uses severity ${JSON.stringify(finding.severity)}.`, "UI/UX severities must stay machine-readable and keep an improvement tier.", `Use one of: ${UX_SEVERITIES.join(", ")}.`, `${jsonPath}.findings[${findingIndex}].severity`));
      }
      if (finding?.status && !UX_FINDING_STATUS_SET.has(String(finding.status))) {
        errors.push(diagnostic("UX_FINDING_STATUS_INVALID", artifactPath, `${check.checkId} finding ${findingIndex} uses status ${JSON.stringify(finding.status)}.`, "A finding whose disposition is unreadable cannot be tracked to closure or counted as accepted risk.", `Use one of: ${UX_FINDING_STATUSES.join(", ")}.`, `${jsonPath}.findings[${findingIndex}].status`));
      }
    }
  }
  if (check.status === "confirmed_clean") {
    const nonFindings = check.nonFindings;
    if (!nonFindings || typeof nonFindings !== "object" || Array.isArray(nonFindings)) {
      errors.push(diagnostic("UX_NON_FINDING_FIELD_MISSING", artifactPath, `${check.checkId} is confirmed clean without explicit non-findings.`, "A clean UI/UX check must state what it covered and what it compared against.", `Add nonFindings with ${UX_NON_FINDING_FIELDS.join(", ")}.`, `${jsonPath}.nonFindings`));
    } else {
      for (const field of UX_NON_FINDING_FIELDS) {
        const value = nonFindings[field];
        const present = Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0;
        if (!present) {
          errors.push(diagnostic("UX_NON_FINDING_FIELD_MISSING", artifactPath, `${check.checkId} nonFindings lacks ${field}.`, "Clean UI/UX rows cannot hide sampled coverage behind a summary sentence.", `Add nonFindings.${field}.`, `${jsonPath}.nonFindings.${field}`));
        }
      }
    }
  }
  if (["finding", "confirmed_clean"].includes(check.status)) {
    const score = check.uxHealthScore;
    const value = Number(score?.score);
    if (!score || typeof score !== "object" || Array.isArray(score) || !Number.isFinite(value) || value < 0 || value > 10) {
      errors.push(diagnostic("UX_HEALTH_SCORE_MISSING", artifactPath, `${check.checkId} lacks a 0-10 uxHealthScore.`, "An audited UI check must score shipped quality, not only defect presence.", "Add uxHealthScore with a numeric score between 0 and 10 and a whatMakesTen string.", `${jsonPath}.uxHealthScore`));
    } else if (!String(score.whatMakesTen || "").trim()) {
      errors.push(diagnostic("UX_HEALTH_SCORE_MISSING", artifactPath, `${check.checkId} uxHealthScore lacks whatMakesTen.`, "A score without the specific gap to a 10 gives no improvement path.", "Add uxHealthScore.whatMakesTen naming the concrete change that reaches 10.", `${jsonPath}.uxHealthScore.whatMakesTen`));
    }
  }
}

function uxCoverageException(report, kind) {
  return asArray(report.coverageExceptions)
    .filter((entry) => entry?.kind === kind && String(entry?.reason || "").trim().length > 0)
    .reduce((total, entry) => total + (Number.isInteger(entry.count) ? entry.count : 0), 0);
}

function validateUxCategoryReport(report, artifactPath, errors, reportPath) {
  const coverage = report.coverage;
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    errors.push(diagnostic("UX_COVERAGE_INCOMPLETE", artifactPath, "ui-ux-product report has no coverage counters.", "Without a denominator a UI/UX run cannot prove it audited more than a shortlist.", `Add a coverage object with ${UX_COVERAGE_COUNTERS.join(", ")} and axesCovered.`, `${reportPath}.coverage`));
    return;
  }
  for (const counter of UX_COVERAGE_COUNTERS) {
    if (!Number.isInteger(coverage[counter])) {
      errors.push(diagnostic("UX_COVERAGE_INCOMPLETE", artifactPath, `coverage.${counter} is missing or not an integer.`, "Coverage counters are the denominator that blocks silent sampling.", `Set coverage.${counter} from the ux-inventory worklist counts.`, `${reportPath}.coverage.${counter}`));
    }
  }
  for (const [kind, totalField, coveredField] of [
    ["routes", "routesTotal", "routesCovered"],
    ["surfaces", "surfacesTotal", "surfacesCovered"],
    ["state-cells", "stateCellsTotal", "stateCellsCovered"],
  ]) {
    const total = coverage[totalField];
    const covered = coverage[coveredField];
    if (!Number.isInteger(total) || !Number.isInteger(covered)) continue;
    if (covered + uxCoverageException(report, kind) < total) {
      errors.push(diagnostic("UX_COVERAGE_INCOMPLETE", artifactPath, `${covered} of ${total} ${kind} are dispositioned.`, "Unaudited UI surfaces cannot disappear from the report.", `Audit the remaining ${kind} or add coverageExceptions rows of kind ${kind} with reason and count.`, `${reportPath}.coverage.${coveredField}`));
    }
  }
  if (!Array.isArray(report.quickWins)) {
    errors.push(diagnostic("UX_QUICK_WINS_MISSING", artifactPath, "ui-ux-product report has no quickWins array.", "Low-cost improvements are the output users act on first; an absent list hides them.", "Add a quickWins array; an empty array states no quick win survived triage.", `${reportPath}.quickWins`));
  }
  if (!Array.isArray(report.systemicFindings)) {
    errors.push(diagnostic("UX_QUICK_WINS_MISSING", artifactPath, "ui-ux-product report has no systemicFindings array.", "Repeated defects collapse into a shortlist unless they are filed once with an instance count.", "Add a systemicFindings array with pattern, instanceCount, and instance evidence.", `${reportPath}.systemicFindings`));
  }
}

function requireIncidentStrings(incident, artifactPath, errors, incidentPath) {
  for (const field of ["incidentId", "environment", "symptom", "evidenceLabel", "producingPathStatus"]) {
    if (!String(incident?.[field] || "").trim()) {
      errors.push(diagnostic("RUNTIME_INCIDENT_FIELD_MISSING", artifactPath, `Runtime incident lacks ${field}.`, "Provider incidents need stable, sanitized evidence and attribution state.", `Add runtimeIncidents[].${field}.`, `${incidentPath}.${field}`));
    }
  }
  if (incident?.evidenceKind !== "provider_runtime") {
    errors.push(diagnostic("RUNTIME_INCIDENT_EVIDENCE_INVALID", artifactPath, "Provider runtime incident does not use provider_runtime evidence.", "Build, bundle, and source evidence cannot substitute for an observed runtime incident.", "Set evidenceKind to provider_runtime.", `${incidentPath}.evidenceKind`));
  }
  if (incident?.metricDomain !== "runtime_memory") {
    errors.push(diagnostic("RUNTIME_MEMORY_METRIC_SUBSTITUTION", artifactPath, `Runtime incident uses ${JSON.stringify(incident?.metricDomain)} as its metric domain.`, "Build memory and client bytes do not prove server runtime-memory behavior.", "Use runtime_memory and retain other metrics in separate rows.", `${incidentPath}.metricDomain`));
  }
  if (incident?.observedMetric) {
    validateMetricObject(incident.observedMetric, artifactPath, errors, `${incidentPath}.observedMetric`);
  } else if (!String(incident?.unavailableMetricReason || "").trim()) {
    errors.push(diagnostic("RUNTIME_METRIC_STATUS_MISSING", artifactPath, "Runtime incident neither records the provider metric nor explains why it is unavailable.", "Provider evidence must remain useful without fabricating a peak-memory value.", "Add observedMetric with name/value/unit or unavailableMetricReason.", incidentPath));
  }
  if (incident?.producingPathStatus && !["known", "unknown"].includes(incident.producingPathStatus)) {
    errors.push(diagnostic("RUNTIME_PRODUCING_PATH_STATUS_INVALID", artifactPath, `Runtime incident uses invalid producingPathStatus ${JSON.stringify(incident.producingPathStatus)}.`, "Attribution must distinguish a known code path from a concrete unresolved dependency.", "Use known or unknown.", `${incidentPath}.producingPathStatus`));
  }
  if (!RUNTIME_INCIDENT_STATUSES.has(incident?.status)) {
    errors.push(diagnostic("RUNTIME_INCIDENT_STATUS_INVALID", artifactPath, `Runtime incident uses invalid status ${JSON.stringify(incident?.status)}.`, "Incidents must stay open, identify a concrete external dependency, or carry closure evidence.", "Use open, blocked_external, or resolved.", `${incidentPath}.status`));
  }
}

function validateMetricObject(metric, artifactPath, errors, metricPath) {
  const value = metric?.value;
  if (!String(metric?.name || "").trim() || !Number.isFinite(value) || !String(metric?.unit || "").trim()) {
    errors.push(diagnostic("RUNTIME_METRIC_INVALID", artifactPath, "Runtime memory metric lacks name, finite numeric value, or unit.", "Truthy placeholders are not measurement evidence.", "Record the exact provider metric or replace it with an unavailable reason.", metricPath));
  }
}

function validateRuntimeDependency(incident, artifactPath, errors, incidentPath) {
  if (incident?.producingPathStatus === "known" && !String(incident?.producingPath || "").trim()) {
    errors.push(diagnostic("RUNTIME_PRODUCING_PATH_MISSING", artifactPath, "Known runtime producing path is unnamed.", "A known hot path cannot be deferred behind missing heap instrumentation.", "Add the page -> procedure -> query/relation producing path.", `${incidentPath}.producingPath`));
  }
  if (incident?.producingPathStatus === "unknown" || incident?.status === "blocked_external") {
    const dependency = incident?.concreteDependency;
    for (const field of ["owner", "action", "evidenceNeeded"]) {
      if (!String(dependency?.[field] || "").trim()) {
        errors.push(diagnostic("RUNTIME_DEPENDENCY_INCOMPLETE", artifactPath, `Runtime incident dependency lacks ${field}.`, "An unresolved incident needs one concrete dependency rather than a generic source-limited label.", `Add concreteDependency.${field}.`, `${incidentPath}.concreteDependency.${field}`));
      }
    }
  }
}

function validateRuntimeReplay(verification, artifactPath, errors, verificationPath) {
  const requiredTrue = ["actualRuntime", "postDeployment", "sameJourney", "overlappingRequests", "responseBodiesConsumed", "providerRecurrenceChecked"];
  for (const field of requiredTrue) {
    if (verification?.[field] !== true) errors.push(diagnostic("RUNTIME_CLOSURE_COVERAGE_INCOMPLETE", artifactPath, `Resolved runtime incident requires runtimeVerification.${field}=true.`, "Partial or non-overlapping evidence cannot close the affected journey.", `Set ${field} only after the named evidence is captured.`, `${verificationPath}.${field}`));
  }
  for (const [totalField, coveredField] of [["pagesTotal", "pagesExercised"], ["proceduresTotal", "proceduresExercised"]]) {
    const total = Number(verification?.[totalField]);
    if (!Number.isInteger(total) || total < 1 || verification?.[coveredField] !== total) {
      errors.push(diagnostic("RUNTIME_AFFECTED_JOURNEY_COVERAGE_INCOMPLETE", artifactPath, `Resolved runtime incident does not cover every affected ${totalField === "pagesTotal" ? "page" : "procedure"}.`, "Incident closure is scoped to the complete affected journey.", `Set ${totalField} and matching ${coveredField}.`, verificationPath));
    }
  }
  if (!Array.isArray(verification?.concurrencyLevels) || !verification.concurrencyLevels.some((value) => Number(value) > 1)) {
    errors.push(diagnostic("RUNTIME_CONCURRENCY_COVERAGE_INCOMPLETE", artifactPath, "Resolved runtime incident lacks representative concurrent replay.", "Sequential success cannot reproduce the provider-observed overlapping request shape.", "Add a concurrencyLevels value greater than 1 from actual-runtime replay.", `${verificationPath}.concurrencyLevels`));
  }
  if (verification?.metricDomain !== "runtime_memory") {
    errors.push(diagnostic("RUNTIME_MEMORY_METRIC_SUBSTITUTION", artifactPath, `Runtime closure uses ${JSON.stringify(verification?.metricDomain)} evidence.`, "Build memory and client bytes cannot close a server runtime-memory incident.", "Use runtime_memory and keep build/client metrics separate.", `${verificationPath}.metricDomain`));
  }
  for (const field of ["journeyGraphArtifact", "outcomeEvidence", "latencyEvidence", "bodyVolumeEvidence"]) {
    if (!String(verification?.[field] || "").trim()) errors.push(diagnostic("RUNTIME_CLOSURE_EVIDENCE_MISSING", artifactPath, `Resolved runtime incident lacks runtimeVerification.${field}.`, "Closure must retain actual-runtime outcomes, latency, and body volume.", `Add runtimeVerification.${field}.`, `${verificationPath}.${field}`));
  }
  if (verification?.peakMemory) validateMetricObject(verification.peakMemory, artifactPath, errors, `${verificationPath}.peakMemory`);
  else if (!String(verification?.peakMemoryUnavailableReason || "").trim()) {
    errors.push(diagnostic("RUNTIME_PEAK_MEMORY_STATUS_MISSING", artifactPath, "Resolved runtime incident neither records peak memory nor explains why it is unavailable.", "Evidence must stay honest without inventing provider metrics.", "Add peakMemory or peakMemoryUnavailableReason.", verificationPath));
  }
}

function validateRuntimeClosure(incident, artifactPath, errors, incidentPath) {
  if (incident?.status !== "resolved") return;
  if (incident?.producingPathStatus !== "known") {
    errors.push(diagnostic("RUNTIME_PRODUCING_PATH_UNRESOLVED", artifactPath, "Resolved runtime incident does not have a known producing path.", "An external dependency can keep an incident blocked, but cannot support causal closure.", "Set resolved only after the producing path is known and verified.", `${incidentPath}.producingPathStatus`));
  }
  const receipt = incident?.remediationReceipt;
  for (const field of ["producingPath", "change", "correctnessGates", "regressionGuard"]) {
    if (!String(receipt?.[field] || "").trim()) errors.push(diagnostic("RUNTIME_REMEDIATION_RECEIPT_INCOMPLETE", artifactPath, `Resolved runtime incident lacks remediationReceipt.${field}.`, "Resolution requires the causal fix and its deterministic guard.", `Add remediationReceipt.${field}.`, `${incidentPath}.remediationReceipt.${field}`));
  }
  const cardinality = incident?.cardinalityVerification;
  for (const field of ["rootCollections", "nestedRelations", "regressionTest"]) {
    if (!String(cardinality?.[field] || "").trim()) errors.push(diagnostic("RUNTIME_CARDINALITY_COVERAGE_INCOMPLETE", artifactPath, `Resolved runtime incident lacks cardinalityVerification.${field}.`, "Root and nested relation cardinality must be checked independently.", `Add cardinalityVerification.${field}.`, `${incidentPath}.cardinalityVerification.${field}`));
  }
  validateRuntimeReplay(incident?.runtimeVerification, artifactPath, errors, `${incidentPath}.runtimeVerification`);
}

function validateProviderIncidentIds(worklist, incidents, artifactPath, errors, reportPath) {
  const count = Number(worklist?.count);
  const worklistIds = asArray(worklist?.incidentIds);
  const reportIds = incidents.map((incident) => incident?.incidentId).filter(Boolean);
  if (!Number.isInteger(count) || count < 0 || worklistIds.length !== count || new Set(worklistIds).size !== worklistIds.length) {
    errors.push(diagnostic("PROVIDER_INCIDENT_WORKLIST_INVALID", artifactPath, "Provider incident worklist count does not match unique incidentIds.", "A count alone cannot prove every discovered incident reached synthesis.", "Record one unique incidentIds entry per worklist row.", "$.worklists.perf_provider_incidents.incidentIds"));
  }
  if (new Set(reportIds).size !== reportIds.length) errors.push(diagnostic("PROVIDER_INCIDENT_DUPLICATE", artifactPath, "Performance report repeats a runtime incident id.", "Duplicate ids can hide an omitted incident.", "Keep each runtime incident id exactly once.", `${reportPath}.runtimeIncidents`));
  for (const incidentId of worklistIds) {
    if (!reportIds.includes(incidentId)) errors.push(diagnostic("PROVIDER_INCIDENT_EVIDENCE_OMITTED", artifactPath, `Provider incident ${incidentId} is absent from the performance report.`, "Every discovered provider incident needs its own disposition.", "Add the missing runtimeIncidents entry.", `${reportPath}.runtimeIncidents`));
  }
  for (const incidentId of reportIds) {
    if (!worklistIds.includes(incidentId)) errors.push(diagnostic("PROVIDER_INCIDENT_NOT_IN_WORKLIST", artifactPath, `Runtime incident ${incidentId} is absent from the provider worklist.`, "Report-only ids bypass intake reconciliation and worklist provenance.", "Add the id to perf_provider_incidents or remove the stale report row.", `${reportPath}.runtimeIncidents`));
  }
}

function validateProviderIncidentIntake(worklist, artifactPath, errors) {
  const intakePath = "$.worklists.perf_provider_incidents";
  if (!PROVIDER_INTAKE_STATUSES.has(worklist?.intakeStatus)) {
    errors.push(diagnostic("PROVIDER_INCIDENT_INTAKE_MISSING", artifactPath, "Provider incident worklist lacks an intake status.", "An untouched empty file cannot prove provider incidents were checked.", "Set intakeStatus to queried, unavailable, or not_applicable.", `${intakePath}.intakeStatus`));
  }
  if (!Array.isArray(worklist?.intakeSources) || worklist.intakeSources.length === 0) {
    errors.push(diagnostic("PROVIDER_INCIDENT_INTAKE_MISSING", artifactPath, "Provider incident worklist lacks intakeSources.", "Known issue links, provider alerts, prior unresolved incidents, and access failures must be reconciled before zero/clean.", "Record at least one sanitized intake source.", `${intakePath}.intakeSources`));
  }
  if (worklist?.intakeStatus === "unavailable" && (!Array.isArray(worklist?.accessFailures) || worklist.accessFailures.length === 0)) {
    errors.push(diagnostic("PROVIDER_INCIDENT_ACCESS_FAILURE_MISSING", artifactPath, "Unavailable provider intake lacks an exact access failure.", "A generic source-limited label does not identify the external dependency.", "Add accessFailures with the failed source and reason.", `${intakePath}.accessFailures`));
  }
}

function validateWholeRepositoryRuntimeCoverage(coverage, artifactPath, errors, coveragePath) {
  if (!coverage) return;
  const total = Number(coverage.pagesTotal);
  if (coverage.scope !== "all_pages_accumulated" || !Number.isInteger(total) || total < 1 || coverage.pagesExercised !== total || coverage.responseBodiesConsumed !== true || coverage.actualRuntime !== true) {
    errors.push(diagnostic("RUNTIME_ALL_PAGES_COVERAGE_INCOMPLETE", artifactPath, "Whole-repository runtime coverage is partial or malformed.", "Broad accumulated-process claims require every discovered page, response body consumption, and actual-runtime evidence.", "Complete the all-pages coverage fields or omit the broad claim.", coveragePath));
  }
  if (!Array.isArray(coverage.concurrencyLevels) || !coverage.concurrencyLevels.some((value) => Number(value) > 1)) {
    errors.push(diagnostic("RUNTIME_CONCURRENCY_COVERAGE_INCOMPLETE", artifactPath, "Whole-repository runtime coverage lacks representative overlap.", "Sequential requests alone do not exercise concurrent memory pressure.", "Add a measured concurrency level greater than 1.", `${coveragePath}.concurrencyLevels`));
  }
  if (coverage.sharedIsolateObserved !== true && !String(coverage.isolateIdentityUnavailableReason || "").trim()) {
    errors.push(diagnostic("RUNTIME_ISOLATE_IDENTITY_STATUS_MISSING", artifactPath, "Whole-repository runtime coverage neither proves shared-isolate reuse nor explains why identity is unavailable.", "Managed runtimes can hide isolate identity, so the broader claim must stay limited.", "Set sharedIsolateObserved=true only with evidence, otherwise add isolateIdentityUnavailableReason.", coveragePath));
  }
}

function validatePerformanceCategoryReport(report, artifact, artifactPath, errors, reportPath) {
  const incidents = asArray(report.runtimeIncidents);
  const providerWorklist = artifact.worklists?.perf_provider_incidents;
  const providerCount = Number(providerWorklist?.count || 0);
  validateProviderIncidentIntake(providerWorklist, artifactPath, errors);
  validateProviderIncidentIds(providerWorklist, incidents, artifactPath, errors, reportPath);
  if (providerCount > 0 && incidents.length === 0) {
    errors.push(diagnostic("PROVIDER_INCIDENT_EVIDENCE_OMITTED", artifactPath, "Provider incident worklist is non-empty but performance report has no runtimeIncidents.", "Known runtime failures cannot disappear into clean or source-limited synthesis.", "Add one runtimeIncidents entry per provider incident.", `${reportPath}.runtimeIncidents`));
  }
  const runtimeCheck = asArray(report.checks).find((check) => check.checkId === "perf-06-infrastructure-network");
  const hasUnresolved = incidents.some((incident) => incident?.status !== "resolved");
  if (hasUnresolved && runtimeCheck?.status !== "finding") {
    errors.push(diagnostic("PROVIDER_INCIDENT_FALSE_CLOSURE", artifactPath, "Provider runtime incident exists but perf-06 is not a finding.", "A provider failure is actionable primary evidence even without a local heap trace.", "Mark perf-06 as finding and retain the incident until closure evidence passes.", `${reportPath}.checks`));
  }
  if (hasUnresolved && (report.status === "clean" || artifact.synthesis?.status === "clean")) {
    errors.push(diagnostic("PROVIDER_INCIDENT_FALSE_CLOSURE", artifactPath, "Unresolved provider runtime incident is hidden under a clean status.", "Missing instrumentation is not clean evidence.", "Use findings_present and keep the incident open or name its concrete dependency.", reportPath));
  }
  incidents.forEach((incident, index) => {
    const incidentPath = `${reportPath}.runtimeIncidents[${index}]`;
    requireIncidentStrings(incident, artifactPath, errors, incidentPath);
    validateRuntimeDependency(incident, artifactPath, errors, incidentPath);
    validateRuntimeClosure(incident, artifactPath, errors, incidentPath);
  });
  validateWholeRepositoryRuntimeCoverage(report.wholeRepositoryRuntimeCoverage, artifactPath, errors, `${reportPath}.wholeRepositoryRuntimeCoverage`);
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
    const orchestratorIds = orchestratorCategoryIds();
    for (const categoryId of orchestratorIds) {
      if (!selected.includes(categoryId)) {
        errors.push(diagnostic("ALL_REGISTERED_OMITS_CATEGORY", artifactPath, `${categoryId} is omitted from all_registered selection.`, "all_registered must run every orchestrator-included category.", "Use orchestratorCategoryIds() to derive all_registered selections.", "$.requestedCategories"));
      }
    }
    for (const categoryId of selected) {
      if (!orchestratorIds.includes(categoryId)) {
        errors.push(diagnostic("ALL_REGISTERED_EXTRA_CATEGORY", artifactPath, `${categoryId} is not orchestrator-included but appears in all_registered selection.`, "Standalone categories such as ui-ux-product must run through their own skill.", "Remove standalone categories from all_registered or route through etrnl-deep-audit-ux.", "$.requestedCategories"));
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
    if (category.categoryId === UX_CATEGORY_ID) {
      validateUxCheckEntry(check, artifactPath, errors, checkPath);
    }
  });
  if (category.categoryId === UX_CATEGORY_ID) {
    validateUxCategoryReport(report, artifactPath, errors, reportPath);
  }
  if (category.categoryId === PERFORMANCE_CATEGORY_ID) {
    validatePerformanceCategoryReport(report, artifact, artifactPath, errors, reportPath);
  }
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
        validateConsumedHashes(receipt, { ...category, requiredWorklists: lane.allowedWorklists }, artifact, artifactPath, errors, receiptPath);
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
  const bundled = category.bundled === true;
  if (!bundled) {
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
  }
  if (!fs.existsSync(path.join(root, category.referencePath))) {
    errors.push(diagnostic("REGISTRY_REFERENCE_MISSING", category.referencePath, `${category.referencePath} is missing.`, "The category detail reference cannot be loaded.", `Create ${category.referencePath}.`));
  }
}

function validateOrchestratorSurface(docs, triggerText, ownedSkills, root, errors) {
  const orchestrator = "etrnl-deep-audit";
  if (!ownedSkills.includes(orchestrator)) {
    errors.push(diagnostic("REGISTRY_ORCHESTRATOR_MISSING", "scripts/lib/skill-lists.sh", `${orchestrator} is missing from OWNED_SKILLS.`, "The orchestrator will not install as repo-owned.", `Add ${orchestrator} to OWNED_SKILLS.`));
  }
  if (!docs.includes(`/${orchestrator}`)) {
    errors.push(diagnostic("REGISTRY_DOCS_MISSING", "docs/skills.md", `${orchestrator} is missing from docs/skills.md.`, "Maintainers cannot discover the orchestrator.", `Document /${orchestrator}.`));
  }
  if (!triggerText.includes(orchestrator)) {
    errors.push(diagnostic("REGISTRY_TRIGGER_FIXTURE_MISSING", "tests/fixtures/skill-triggering/cases.json", `${orchestrator} is missing from trigger cases.`, "Skill behavior smoke cannot prove orchestrator routing.", `Add a trigger fixture expecting ${orchestrator}.`));
  }
  if (!fs.existsSync(path.join(root, "skills", orchestrator, "SKILL.md"))) {
    errors.push(diagnostic("REGISTRY_SKILL_DIR_MISSING", `skills/${orchestrator}/SKILL.md`, `${orchestrator} SKILL.md is missing.`, "The orchestrator skill does not exist.", `Create skills/${orchestrator}/SKILL.md.`));
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
  validateOrchestratorSurface(docs, triggerText, ownedSkills, root, errors);
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
