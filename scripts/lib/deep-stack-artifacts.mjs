import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const HIGH_SEVERITIES = new Set(["blocker", "critical", "high", "p0", "p1"]);
const TERMINAL_FINDING_STATUSES = new Set(["fixed", "closed", "resolved", "disproven", "false-positive", "false_positive", "accepted"]);
const VALID_SKILL_STATUSES = new Set(["required", "optional", "not_applicable", "missing", "blocker"]);
const VALID_COMPLETION = new Set(["DONE", "PARTIAL", "NOT_DONE", "CHANGED", "BLOCKED"]);
const REVIEW_PHASES = ["ceo", "engineering", "dx", "adversarial", "specialist", "reuse", "simplifier"];
const VALID_REVIEW_PHASE_STATUSES = new Set(["passed", "not_applicable", "blocked"]);
const VALID_TDD_STATUSES = new Set(["red_green_verified", "not_test_first_possible_with_reason", "not_applicable"]);
const VALID_INSTALL_STAGE_STATUSES = new Set(["passed", "not_applicable", "blocked"]);
const INSTALL_PROOF_STAGES = ["sourceGate", "stagedInstall", "stagedDoctor", "rollbackVerification", "liveInstallDecision", "postUpgradeCanary"];
const ADVANCED_TS_SURFACES = new Set([
  "exported-types",
  "public-types",
  "api-contracts",
  "runtime-validation",
  "schema-generated-types",
  "state-machines",
  "discriminated-unions",
  "branded-ids",
  "domain-ids",
  "reusable-type-utilities",
  "dto-domain-boundaries",
  "cross-layer-boundaries",
]);
export function parseDeepStackMetadata(planText) {
  const match = planText.match(/^Deep stack artifacts:[ \t]*(.*)$/im);
  if (!match) return null;
  return match[1].trim();
}

export function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const parseError = new Error(`Artifact is not valid JSON: ${message}`);
    parseError.code = "DEEP_ARTIFACT_INVALID_JSON";
    parseError.artifactPath = filePath;
    parseError.originalMessage = message;
    throw parseError;
  }
}

export function createSkeleton(planPath, outDir) {
  mkdirSync(outDir, { recursive: true, mode: 0o755 });
  const artifactPath = path.join(outDir, "deep-stack-artifacts.json");
  const artifact = {
    schemaVersion: 1,
    artifactType: "deep-stack-plan",
    planPath,
    deepReview: {
      status: "pending",
      phases: REVIEW_PHASES,
      completedAt: new Date().toISOString(),
    },
    reviewPhases: REVIEW_PHASES.map((role) => ({
      role,
      status: "blocked",
      checkedInputs: [],
      findingsCount: 0,
      openHighCount: 0,
      disposition: "pending review",
      completedAt: new Date().toISOString(),
    })),
    sourceManifest: {
      sources: [{
        sourceId: "repo",
        version: "current",
        commit: "",
        hash: "",
        capturedAt: new Date().toISOString(),
        refreshCommand: "node scripts/deep-stack-check.mjs create --plan <plan> --out <dir>",
        requiredFiles: ["scripts/plan-readiness-check.mjs"],
      }],
    },
    skillMatrix: [
      {
        skill: "code-simplifier",
        status: "required",
        trigger: "changed source",
        evidence: "source diff planned",
      },
      {
        skill: "typescript-advanced-types",
        status: "not_applicable",
        trigger: "TypeScript detected without advanced type surfaces",
        evidence: "ordinary TypeScript verification still required",
        notApplicableRationale: "No exported/public types, API contracts, runtime validation, generated types, state machines, branded IDs, reusable type utilities, or cross-layer DTO/domain boundaries are touched.",
      },
    ],
    reuseInventory: {
      searchedPaths: ["scripts", "skills", "docs"],
      existingAnalogs: [],
      candidateHelpers: [],
      candidateTests: [],
      decisions: [],
    },
    findings: [],
    completionAudit: [],
    tddEvidence: [],
    completionReconciliation: [],
    reuseBindings: [],
    typeTriggerEvidence: [],
    installProof: {
      sourceGate: { status: "not_applicable", evidence: "source-only planning artifact" },
      stagedInstall: { status: "not_applicable", evidence: "staged install not requested yet" },
      stagedDoctor: { status: "not_applicable", evidence: "staged doctor not requested yet" },
      rollbackVerification: { status: "not_applicable", evidence: "rollback proof not requested yet" },
      liveInstallDecision: { status: "not_applicable", evidence: "live install requires explicit Victor request" },
      postUpgradeCanary: { status: "not_applicable", evidence: "canary not requested yet" },
    },
    riskTier: {
      tier: 2,
      deepReviewPassed: false,
      reason: "Default for multi-file source workflow after deep review.",
      requiredArtifacts: ["sourceManifest", "skillMatrix", "reuseInventory", "findings", "completionAudit", "reviewPhases", "tddEvidence", "completionReconciliation", "reuseBindings", "typeTriggerEvidence", "installProof"],
      verificationGate: "tests/test-workflow-tools.sh",
      acceptedRisks: [],
    },
    typescript: {
      ordinaryVerification: "project TypeScript check or not applicable",
      advancedTypes: {
        status: "not_applicable",
        triggerEvidence: [],
        applicableSurfaces: [],
        notApplicableRationale: "No advanced TypeScript surfaces touched.",
      },
    },
  };
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return artifactPath;
}
export function validateDeepStackPlanFile(planPath, options = {}) {
  const planText = readFileSync(planPath, "utf8");
  return validateDeepStackPlanText(planText, { ...options, planPath });
}

export function validateDeepStackPlanText(planText, options = {}) {
  const planPath = options.planPath || "<plan>";
  const metadata = parseDeepStackMetadata(planText);
  if (metadata === null) {
    if (options.requireDeepStack === true) {
      return {
        ok: false,
        transitional: false,
        artifactPath: "",
        errors: [error(
          "DEEP_ARTIFACT_REQUIRED",
          "<artifact>",
          "Deep stack artifacts",
          "Final deep-stack plans must link a validated artifact bundle; transitional readiness is not enough.",
          "Create the bundle and add `Deep stack artifacts: <relative-path>` before finalization.",
          `node scripts/deep-stack-check.mjs create --plan ${planPath} --out <artifact-dir>`,
        )],
      };
    }
    return { ok: true, transitional: true, artifactPath: "", errors: [] };
  }
  if (metadata.length === 0) {
    return {
      ok: false,
      transitional: false,
      artifactPath: "",
      errors: [error("DEEP_ARTIFACT_PATH_EMPTY", "<artifact>", "Deep stack artifacts", "Deep stack artifacts metadata is present but empty.", "Set Deep stack artifacts: to a non-empty relative artifact path.")],
    };
  }
  const artifactCandidates = path.isAbsolute(metadata)
    ? [metadata]
    : [path.resolve(path.dirname(planPath), metadata), path.resolve(metadata)];
  const artifactPath = artifactCandidates.find((candidate) => existsSync(candidate)) || artifactCandidates[0];
  if (!existsSync(artifactPath)) {
    return {
      ok: false,
      transitional: false,
      artifactPath,
      errors: [error("DEEP_ARTIFACT_MISSING", artifactPath, metadata, "Deep stack metadata points at a file that does not exist.", `Run: node scripts/deep-stack-check.mjs create --plan ${planPath} --out ${path.dirname(artifactPath) || "."}`)],
    };
  }
  let artifact;
  try {
    artifact = readJsonFile(artifactPath);
  } catch (err) {
    return {
      ok: false,
      transitional: false,
      artifactPath,
      errors: [error("DEEP_ARTIFACT_INVALID_JSON", artifactPath, "$", `Artifact is not valid JSON: ${err.message}`, "Fix the JSON syntax in the artifact file.")],
    };
  }
  return validateBundle(artifact, { ...options, artifactPath, planPath });
}
export function validateBundle(artifact, options = {}) {
  const errors = [];
  const context = {
    artifactPath: options.artifactPath || "<artifact>",
    planPath: options.planPath || artifact?.planPath || "",
    requiredAcceptor: options.requiredAcceptor || "Victor",
  };
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { ok: false, errors: [error("DEEP_ARTIFACT_INVALID_JSON", context.artifactPath, "$", "Artifact must be a JSON object.", "Replace it with a deep-stack artifact object.")] };
  }
  if (artifact.schemaVersion !== 1) errors.push(error("DEEP_SCHEMA_VERSION", context.artifactPath, "schemaVersion", "schemaVersion must be 1.", "Set schemaVersion to 1."));
  if (artifact.artifactType !== "deep-stack-plan") errors.push(error("DEEP_ARTIFACT_TYPE", context.artifactPath, "artifactType", "artifactType must be deep-stack-plan.", "Set artifactType to deep-stack-plan."));
  validateDeepReview(artifact.deepReview, context, errors);
  validateSources(artifact.sourceManifest, context, errors);
  validateSkills(artifact.skillMatrix, artifact.typescript, context, errors);
  validateReuse(artifact.reuseInventory, context, errors);
  validateFindings(artifact.findings, context, errors);
  validateCompletion(artifact.completionAudit, context, errors);
  validateRiskTier(artifact.riskTier, { ...context, installProof: artifact.installProof }, errors);
  validateReviewPhases(artifact.reviewPhases, artifact.riskTier, context, errors);
  validateTddEvidence(artifact.tddEvidence, artifact.riskTier, context, errors);
  validateCompletionReconciliation(artifact.completionReconciliation, artifact.riskTier, context, errors);
  validateReuseBindings(artifact.reuseBindings, artifact.riskTier, context, errors);
  validateTypeTriggerEvidence(artifact.typeTriggerEvidence, artifact.riskTier, context, errors);
  validateInstallProof(artifact.installProof, artifact.riskTier, context, errors);
  return { ok: errors.length === 0, errors, artifactPath: context.artifactPath };
}
export function validateSources(sourceManifest, context = {}, errors = []) {
  const sources = sourceManifest?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(error("SOURCE_MANIFEST_EMPTY", context.artifactPath, "sourceManifest.sources", "Source manifest must list at least one source.", "Add sanitized source rows with sourceId, version, commit, hash, refreshCommand, and requiredFiles."));
    return errors;
  }
  sources.forEach((source, index) => {
    for (const field of ["sourceId", "version", "commit", "hash", "capturedAt", "refreshCommand"]) {
      requireString(source?.[field], `sourceManifest.sources[${index}].${field}`, "SOURCE_FIELD_MISSING", context, errors);
    }
    if (!Array.isArray(source?.requiredFiles) || source.requiredFiles.length === 0) {
      errors.push(error("SOURCE_REQUIRED_FILES", context.artifactPath, `sourceManifest.sources[${index}].requiredFiles`, "Each source must list required files.", "Add requiredFiles with relative/public source file paths."));
    }
    rejectPrivateStrings(source, `sourceManifest.sources[${index}]`, context, errors);
  });
  return errors;
}

export function validateSkills(skillMatrix, typescript, context = {}, errors = []) {
  if (!Array.isArray(skillMatrix) || skillMatrix.length === 0) {
    errors.push(error("SKILL_MATRIX_EMPTY", context.artifactPath, "skillMatrix", "Skill activation matrix must not be empty.", "Add skill rows with skill, status, trigger, and evidence."));
    return errors;
  }
  for (const [index, row] of skillMatrix.entries()) {
    requireString(row?.skill, `skillMatrix[${index}].skill`, "SKILL_FIELD_MISSING", context, errors);
    if (!VALID_SKILL_STATUSES.has(row?.status)) {
      errors.push(error("SKILL_STATUS_INVALID", context.artifactPath, `skillMatrix[${index}].status`, "Skill status is invalid.", "Use required, optional, not_applicable, missing, or blocker."));
    }
    requireString(row?.trigger, `skillMatrix[${index}].trigger`, "SKILL_TRIGGER_MISSING", context, errors);
    requireString(row?.evidence, `skillMatrix[${index}].evidence`, "SKILL_EVIDENCE_MISSING", context, errors);
    if (row?.status === "missing" || row?.status === "blocker") {
      errors.push(error("SKILL_BLOCKER", context.artifactPath, `skillMatrix[${index}]`, `Skill ${row.skill || index} is ${row.status}.`, "Install the skill, mark it not_applicable with rationale, or record explicit user risk acceptance."));
    }
  }
  const advancedRow = skillMatrix.find((row) => row?.skill === "typescript-advanced-types");
  validateTypescriptPolicy(advancedRow, typescript, context, errors);
  return errors;
}

export function validateReuse(reuseInventory, context = {}, errors = []) {
  if (!reuseInventory || typeof reuseInventory !== "object" || Array.isArray(reuseInventory)) {
    errors.push(error("REUSE_INVENTORY_MISSING", context.artifactPath, "reuseInventory", "Reuse inventory is required.", "Add searchedPaths, existingAnalogs, candidateHelpers, candidateTests, and decisions."));
    return errors;
  }
  if (!Array.isArray(reuseInventory.searchedPaths) || reuseInventory.searchedPaths.length === 0) {
    errors.push(error("REUSE_SEARCHED_PATHS", context.artifactPath, "reuseInventory.searchedPaths", "Reuse inventory must list searched paths.", "Search existing scripts, skills, docs, helpers, and tests before creating new surfaces."));
  }
  for (const [field, code] of [
    ["existingAnalogs", "REUSE_EXISTING_ANALOGS"],
    ["candidateHelpers", "REUSE_CANDIDATE_HELPERS"],
    ["candidateTests", "REUSE_CANDIDATE_TESTS"],
  ]) {
    if (!Array.isArray(reuseInventory[field])) {
      errors.push(error(code, context.artifactPath, `reuseInventory.${field}`, `Reuse inventory must include ${field} as an array.`, `Add reuseInventory.${field}; use [] only after recording searched paths and decisions.`));
    }
  }
  const decisions = Array.isArray(reuseInventory.decisions) ? reuseInventory.decisions : [];
  decisions.forEach((decision, index) => {
    if (decision?.newSurface === true && !decision.newSurfaceJustification) {
      errors.push(error("REUSE_NEW_SURFACE_JUSTIFICATION", context.artifactPath, `reuseInventory.decisions[${index}].newSurfaceJustification`, "New surfaces need a reuse decision.", "Add the existing analogs considered and why creating a new surface is still correct."));
    }
  });
  return errors;
}

export function validateFindings(findings, context = {}, errors = []) {
  if (!Array.isArray(findings)) {
    errors.push(error("FINDINGS_INVALID", context.artifactPath, "findings", "Findings ledger must be an array.", "Use [] when no findings remain."));
    return errors;
  }
  findings.forEach((finding, index) => {
    const severity = String(finding?.severity || "").toLowerCase();
    const status = String(finding?.status || "open").toLowerCase();
    if (HIGH_SEVERITIES.has(severity) && !TERMINAL_FINDING_STATUSES.has(status)) {
      errors.push(error("FINDING_OPEN_HIGH", context.artifactPath, `findings[${index}]`, "High/blocker findings cannot remain open.", "Fix, disprove, close, or record explicit Victor risk acceptance."));
    }
    const requiredAcceptor = context.requiredAcceptor || "Victor";
    const acceptedBy = String(finding?.acceptedBy || "").toLowerCase();
    if (status === "accepted" && !acceptedBy.includes(requiredAcceptor.toLowerCase())) {
      errors.push(error("FINDING_ACCEPTANCE_OWNER", context.artifactPath, `findings[${index}].acceptedBy`, `Accepted findings require explicit ${requiredAcceptor} acceptance.`, `Set acceptedBy to ${requiredAcceptor} with evidence of the decision.`));
    }
  });
  return errors;
}

export function validateCompletion(completionAudit, context = {}, errors = []) {
  if (!Array.isArray(completionAudit)) {
    errors.push(error("COMPLETION_INVALID", context.artifactPath, "completionAudit", "Completion audit must be an array.", "Use [] before execution or add plan item audit rows."));
    return errors;
  }
  completionAudit.forEach((item, index) => {
    if (!VALID_COMPLETION.has(item?.classification)) {
      errors.push(error("COMPLETION_CLASSIFICATION", context.artifactPath, `completionAudit[${index}].classification`, "Completion classification is invalid.", "Use DONE, PARTIAL, NOT_DONE, or CHANGED."));
    }
    const highImpact = String(item?.impact || "").toLowerCase() === "high";
    const requiredAcceptor = context.requiredAcceptor || "Victor";
    const acceptedBy = String(item?.acceptedBy || "").toLowerCase();
    if (highImpact && ["PARTIAL", "NOT_DONE"].includes(item?.classification) && !acceptedBy.includes(requiredAcceptor.toLowerCase())) {
      errors.push(error("COMPLETION_HIGH_IMPACT_OPEN", context.artifactPath, `completionAudit[${index}]`, `High-impact PARTIAL/NOT_DONE items require ${requiredAcceptor} acceptance.`, `Complete the plan item or record acceptedBy: ${requiredAcceptor} with accepted risk evidence.`));
    }
  });
  return errors;
}

export function validateRiskTier(riskTier, context = {}, errors = []) {
  if (!riskTier || typeof riskTier !== "object" || Array.isArray(riskTier)) {
    errors.push(error("RISK_TIER_MISSING", context.artifactPath, "riskTier", "Hybrid execution requires a risk-tier artifact.", "Add tier, deepReviewPassed, reason, requiredArtifacts, verificationGate, and acceptedRisks."));
    return errors;
  }
  if (!Number.isInteger(riskTier.tier) || riskTier.tier < 0 || riskTier.tier > 3) {
    errors.push(error("RISK_TIER_INVALID", context.artifactPath, "riskTier.tier", "Risk tier must be 0, 1, 2, or 3.", "Set tier according to Hybrid execution scope."));
  }
  if (riskTier.deepReviewPassed !== true) {
    errors.push(error("RISK_TIER_BEFORE_DEEP_REVIEW", context.artifactPath, "riskTier.deepReviewPassed", "Execution tier cannot be used before deep review passes.", "Run deep plan/autoplan/review and set deepReviewPassed: true only after it passes."));
  }
  requireString(riskTier.reason, "riskTier.reason", "RISK_TIER_REASON", context, errors);
  if (!Array.isArray(riskTier.requiredArtifacts)) errors.push(error("RISK_TIER_ARTIFACTS", context.artifactPath, "riskTier.requiredArtifacts", "Risk tier must list required artifacts.", "Add requiredArtifacts as an array."));
  requireString(riskTier.verificationGate, "riskTier.verificationGate", "RISK_TIER_VERIFICATION", context, errors);
  if (riskTier.tier === 3) {
    for (const [field, code] of [["stagedInstall", "RISK_TIER3_STAGED_INSTALL"], ["rollbackVerification", "RISK_TIER3_ROLLBACK"]]) {
      if (riskTier?.[field]?.status !== "passed" && context.installProof?.[field]?.status !== "passed") {
        errors.push(error(code, context.artifactPath, `riskTier.${field}.status`, "Tier 3 requires staged install and rollback verification.", "Run staged install, staged doctor/canary, and rollback verification before live install."));
      }
    }
  }
  return errors;
}

function validateDeepReview(deepReview, context, errors) {
  const phases = deepReview?.phases;
  if (deepReview?.status !== "passed") errors.push(error("DEEP_REVIEW_NOT_PASSED", context.artifactPath, "deepReview.status", "Deep review must pass before execution tiers apply.", "Run CEO, engineering, DX, adversarial, specialist, reuse, simplifier, and findings convergence."));
  for (const phase of REVIEW_PHASES) {
    if (!Array.isArray(phases) || !phases.includes(phase)) {
      errors.push(error("DEEP_REVIEW_PHASE_MISSING", context.artifactPath, "deepReview.phases", `Missing deep review phase: ${phase}.`, `Add ${phase} review evidence or mark the plan blocked.`));
    }
  }
}

function sectionRequired(riskTier, artifactName) {
  return Array.isArray(riskTier?.requiredArtifacts) && riskTier.requiredArtifacts.includes(artifactName);
}

export function validateReviewPhases(reviewPhases, riskTier = {}, context = {}, errors = []) {
  if (reviewPhases === undefined && !sectionRequired(riskTier, "reviewPhases")) return errors;
  if (!Array.isArray(reviewPhases) || reviewPhases.length === 0) {
    errors.push(error("REVIEW_PHASES_REQUIRED", context.artifactPath, "reviewPhases", "Deep review phase records are required.", "Add reviewPhases[] rows with role, status, checkedInputs, findingsCount, openHighCount, disposition, and completedAt."));
    return errors;
  }
  const byRole = new Set(reviewPhases.map((row) => row?.role));
  for (const role of REVIEW_PHASES) {
    if (!byRole.has(role)) {
      errors.push(error("REVIEW_PHASE_MISSING", context.artifactPath, "reviewPhases", `Missing review phase record: ${role}.`, `Add a reviewPhases[] row for ${role} with disposition and checked inputs.`));
    }
  }
  reviewPhases.forEach((row, index) => {
    requireString(row?.role, `reviewPhases[${index}].role`, "REVIEW_PHASE_FIELD_MISSING", context, errors);
    if (!VALID_REVIEW_PHASE_STATUSES.has(row?.status)) {
      errors.push(error("REVIEW_PHASE_STATUS", context.artifactPath, `reviewPhases[${index}].status`, "Review phase status is invalid.", "Use passed, not_applicable, or blocked."));
    }
    if (!Array.isArray(row?.checkedInputs) || row.checkedInputs.length === 0) {
      errors.push(error("REVIEW_PHASE_INPUTS", context.artifactPath, `reviewPhases[${index}].checkedInputs`, "Review phase records must list checked inputs.", "Add checkedInputs with the plan, artifact, diff, or source files reviewed."));
    }
    if (!Number.isInteger(row?.findingsCount) || row.findingsCount < 0) {
      errors.push(error("REVIEW_PHASE_FINDINGS_COUNT", context.artifactPath, `reviewPhases[${index}].findingsCount`, "findingsCount must be a non-negative integer.", "Set findingsCount to the number of findings from this phase."));
    }
    if (!Number.isInteger(row?.openHighCount) || row.openHighCount < 0) {
      errors.push(error("REVIEW_PHASE_OPEN_HIGH_COUNT", context.artifactPath, `reviewPhases[${index}].openHighCount`, "openHighCount must be a non-negative integer.", "Set openHighCount to 0 before execution or mark the plan blocked."));
    } else if (row.openHighCount > 0 && row.status !== "blocked") {
      errors.push(error("REVIEW_PHASE_OPEN_HIGH", context.artifactPath, `reviewPhases[${index}]`, "Open high/blocker review findings cannot be marked executable.", "Resolve high findings or set this review phase status to blocked."));
    }
    requireString(row?.disposition, `reviewPhases[${index}].disposition`, "REVIEW_PHASE_DISPOSITION", context, errors);
    requireString(row?.completedAt, `reviewPhases[${index}].completedAt`, "REVIEW_PHASE_COMPLETED_AT", context, errors);
    rejectPrivateStrings(row, `reviewPhases[${index}]`, context, errors);
  });
  return errors;
}

export function validateTddEvidence(tddEvidence, riskTier = {}, context = {}, errors = []) {
  if (tddEvidence === undefined && !sectionRequired(riskTier, "tddEvidence")) return errors;
  if (!Array.isArray(tddEvidence) || tddEvidence.length === 0) {
    errors.push(error("TDD_EVIDENCE_REQUIRED", context.artifactPath, "tddEvidence", "Source execution needs TDD evidence or an explicit not-applicable rationale.", "Add tddEvidence[] rows with taskId, sourceFiles, red/green command evidence, and rationale when test-first is impossible."));
    return errors;
  }
  tddEvidence.forEach((row, index) => {
    requireString(row?.taskId, `tddEvidence[${index}].taskId`, "TDD_TASK_ID", context, errors);
    if (!Array.isArray(row?.sourceFiles) || row.sourceFiles.length === 0) {
      errors.push(error("TDD_SOURCE_FILES", context.artifactPath, `tddEvidence[${index}].sourceFiles`, "TDD evidence must list source files.", "Add sourceFiles with the implementation files covered by this row."));
    }
    if (!VALID_TDD_STATUSES.has(row?.status)) {
      errors.push(error("TDD_STATUS", context.artifactPath, `tddEvidence[${index}].status`, "TDD evidence status is invalid.", "Use red_green_verified, not_test_first_possible_with_reason, or not_applicable."));
    }
    if (row?.status === "red_green_verified") {
      requireString(row?.redCommand, `tddEvidence[${index}].redCommand`, "TDD_RED_COMMAND", context, errors);
      requireString(row?.redFailure, `tddEvidence[${index}].redFailure`, "TDD_RED_FAILURE", context, errors);
      requireString(row?.greenCommand, `tddEvidence[${index}].greenCommand`, "TDD_GREEN_COMMAND", context, errors);
      if (row?.redStatus !== "failed") {
        errors.push(error("TDD_RED_STATUS", context.artifactPath, `tddEvidence[${index}].redStatus`, "Red test status must show an expected failure.", "Set redStatus to failed and record the expected failure text."));
      }
      if (row?.greenStatus !== "passed") {
        errors.push(error("TDD_GREEN_STATUS", context.artifactPath, `tddEvidence[${index}].greenStatus`, "Green test status must show the passing verification.", "Set greenStatus to passed after the implementation is verified."));
      }
    } else {
      requireString(row?.rationaleWhenNotTestFirst, `tddEvidence[${index}].rationaleWhenNotTestFirst`, "TDD_RATIONALE_REQUIRED", context, errors);
    }
    rejectPrivateStrings(row, `tddEvidence[${index}]`, context, errors);
  });
  return errors;
}

export function validateCompletionReconciliation(completionReconciliation, riskTier = {}, context = {}, errors = []) {
  if (completionReconciliation === undefined && !sectionRequired(riskTier, "completionReconciliation")) return errors;
  if (!Array.isArray(completionReconciliation) || completionReconciliation.length === 0) {
    errors.push(error("COMPLETION_RECONCILIATION_REQUIRED", context.artifactPath, "completionReconciliation", "No-loose-ends plans need item-by-item reconciliation.", "Add completionReconciliation[] rows for every requested plan item."));
    return errors;
  }
  completionReconciliation.forEach((row, index) => {
    requireString(row?.planItemId, `completionReconciliation[${index}].planItemId`, "COMPLETION_RECONCILIATION_ITEM", context, errors);
    requireString(row?.requestedOutcome, `completionReconciliation[${index}].requestedOutcome`, "COMPLETION_RECONCILIATION_OUTCOME", context, errors);
    if (!VALID_COMPLETION.has(row?.classification)) {
      errors.push(error("COMPLETION_RECONCILIATION_CLASSIFICATION", context.artifactPath, `completionReconciliation[${index}].classification`, "Completion reconciliation classification is invalid.", "Use DONE, PARTIAL, NOT_DONE, CHANGED, or BLOCKED."));
    }
    requireString(row?.evidence, `completionReconciliation[${index}].evidence`, "COMPLETION_RECONCILIATION_EVIDENCE", context, errors);
    const highImpact = String(row?.impact || "").toLowerCase() === "high";
    if (highImpact && ["PARTIAL", "NOT_DONE", "BLOCKED"].includes(row?.classification)) {
      const acceptedBy = String(row?.acceptedBy || "").toLowerCase();
      const requiredAcceptor = context.requiredAcceptor || "Victor";
      if (!acceptedBy.includes(requiredAcceptor.toLowerCase())) {
        errors.push(error("COMPLETION_RECONCILIATION_HIGH_IMPACT_OPEN", context.artifactPath, `completionReconciliation[${index}]`, `High-impact incomplete reconciliation rows require ${requiredAcceptor} acceptance.`, `Complete the item or record acceptedBy: ${requiredAcceptor} with explicit risk acceptance.`));
      }
    }
    rejectPrivateStrings(row, `completionReconciliation[${index}]`, context, errors);
  });
  return errors;
}

export function validateReuseBindings(reuseBindings, riskTier = {}, context = {}, errors = []) {
  if (reuseBindings === undefined && !sectionRequired(riskTier, "reuseBindings")) return errors;
  if (!Array.isArray(reuseBindings) || reuseBindings.length === 0) {
    errors.push(error("REUSE_BINDING_REQUIRED", context.artifactPath, "reuseBindings", "Write tasks need bounded reuse binding records.", "Add reuseBindings[] rows with taskId, searchedPaths, analogs, decision, and newSurfaceJustification when creating a new surface."));
    return errors;
  }
  reuseBindings.forEach((row, index) => {
    requireString(row?.taskId, `reuseBindings[${index}].taskId`, "REUSE_BINDING_TASK", context, errors);
    if (typeof row?.createsNewSurface !== "boolean") {
      errors.push(error("REUSE_BINDING_SURFACE_FLAG", context.artifactPath, `reuseBindings[${index}].createsNewSurface`, "createsNewSurface must be a boolean.", "Set createsNewSurface true or false for this task."));
    }
    if (!Array.isArray(row?.searchedPaths) || row.searchedPaths.length === 0) {
      errors.push(error("REUSE_BINDING_SEARCHED_PATHS", context.artifactPath, `reuseBindings[${index}].searchedPaths`, "Reuse binding must list searched paths.", "Record the existing components, helpers, scripts, docs, or tests searched."));
    }
    if (!Array.isArray(row?.analogs)) {
      errors.push(error("REUSE_BINDING_ANALOGS", context.artifactPath, `reuseBindings[${index}].analogs`, "Reuse binding must include analogs as an array.", "Use [] only after recording searched paths and decision evidence."));
    }
    requireString(row?.decision, `reuseBindings[${index}].decision`, "REUSE_BINDING_DECISION", context, errors);
    if (row?.createsNewSurface === true) {
      requireString(row?.newSurfaceJustification, `reuseBindings[${index}].newSurfaceJustification`, "REUSE_BINDING_JUSTIFICATION", context, errors);
    }
    rejectPrivateStrings(row, `reuseBindings[${index}]`, context, errors);
  });
  return errors;
}

export function validateTypeTriggerEvidence(typeTriggerEvidence, riskTier = {}, context = {}, errors = []) {
  if (typeTriggerEvidence === undefined && !sectionRequired(riskTier, "typeTriggerEvidence")) return errors;
  if (!Array.isArray(typeTriggerEvidence)) {
    errors.push(error("TS_TRIGGER_EVIDENCE_INVALID", context.artifactPath, "typeTriggerEvidence", "Type trigger evidence must be an array.", "Use [] only when no TypeScript trigger surfaces were touched."));
    return errors;
  }
  typeTriggerEvidence.forEach((row, index) => {
    requireString(row?.file, `typeTriggerEvidence[${index}].file`, "TS_TRIGGER_FILE", context, errors);
    requireString(row?.triggerSurface, `typeTriggerEvidence[${index}].triggerSurface`, "TS_TRIGGER_SURFACE", context, errors);
    requireString(row?.ordinaryVerification, `typeTriggerEvidence[${index}].ordinaryVerification`, "TS_TRIGGER_ORDINARY_VERIFICATION", context, errors);
    requireString(row?.advancedReviewStatus, `typeTriggerEvidence[${index}].advancedReviewStatus`, "TS_TRIGGER_ADVANCED_STATUS", context, errors);
    if (row?.advancedReviewStatus === "required" || row?.advancedReviewStatus === "blocked") {
      requireString(row?.advancedReviewEvidence, `typeTriggerEvidence[${index}].advancedReviewEvidence`, "TS_TRIGGER_ADVANCED_REQUIRED", context, errors);
    }
    rejectPrivateStrings(row, `typeTriggerEvidence[${index}]`, context, errors);
  });
  return errors;
}

export function validateInstallProof(installProof, riskTier = {}, context = {}, errors = []) {
  if (installProof === undefined && !sectionRequired(riskTier, "installProof") && riskTier?.tier !== 3) return errors;
  if (!installProof || typeof installProof !== "object" || Array.isArray(installProof)) {
    errors.push(error("INSTALL_PROOF_REQUIRED", context.artifactPath, "installProof", "Control-plane changes need source/staged/live install proof records.", "Add installProof with sourceGate, stagedInstall, stagedDoctor, rollbackVerification, liveInstallDecision, and postUpgradeCanary."));
    return errors;
  }
  for (const stage of INSTALL_PROOF_STAGES) {
    const row = installProof[stage];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(error("INSTALL_PROOF_STAGE_REQUIRED", context.artifactPath, `installProof.${stage}`, `Install proof stage ${stage} is missing.`, `Add installProof.${stage} with status and evidence.`));
      continue;
    }
    if (!VALID_INSTALL_STAGE_STATUSES.has(row.status)) {
      errors.push(error("INSTALL_PROOF_STAGE_STATUS", context.artifactPath, `installProof.${stage}.status`, "Install proof stage status is invalid.", "Use passed, not_applicable, or blocked."));
    }
    requireString(row.evidence, `installProof.${stage}.evidence`, "INSTALL_PROOF_STAGE_EVIDENCE", context, errors);
    rejectPrivateStrings(row, `installProof.${stage}`, context, errors);
  }
  if (riskTier?.tier === 3) {
    for (const stage of ["sourceGate", "stagedInstall", "stagedDoctor", "rollbackVerification"]) {
      if (installProof?.[stage]?.status !== "passed") {
        errors.push(error("INSTALL_PROOF_TIER3_STAGE", context.artifactPath, `installProof.${stage}.status`, "Tier 3 changes require passed source, staged, doctor, and rollback proof.", "Run the staged install, doctor/canary, and rollback gates before marking Tier 3 executable."));
      }
    }
  }
  return errors;
}

function validateTypescriptPolicy(advancedRow, typescript, context, errors) {
  if (!advancedRow) return;
  const advanced = typescript?.advancedTypes;
  if (!typescript?.ordinaryVerification) {
    errors.push(error("TS_ORDINARY_VERIFICATION", context.artifactPath, "typescript.ordinaryVerification", "TypeScript rows require ordinary TS verification.", "Add tsc --noEmit or the project-standard TypeScript check."));
  }
  if (advancedRow.status === "required") {
    if (advanced?.status !== "required") errors.push(error("TS_ADVANCED_REQUIRED", context.artifactPath, "typescript.advancedTypes.status", "Skill matrix requires advanced TypeScript review.", "Set advancedTypes.status to required and list trigger evidence."));
    const surfaces = Array.isArray(advanced?.applicableSurfaces) ? advanced.applicableSurfaces : [];
    if (surfaces.length === 0 || !surfaces.every((surface) => ADVANCED_TS_SURFACES.has(surface))) {
      errors.push(error("TS_ADVANCED_SURFACES", context.artifactPath, "typescript.advancedTypes.applicableSurfaces", "Advanced TypeScript review needs concrete applicable surfaces.", `Use known surfaces: ${[...ADVANCED_TS_SURFACES].join(", ")}.`));
    }
    if (!Array.isArray(advanced?.triggerEvidence) || advanced.triggerEvidence.length === 0) {
      errors.push(error("TS_ADVANCED_TRIGGER_EVIDENCE", context.artifactPath, "typescript.advancedTypes.triggerEvidence", "Advanced TypeScript review needs trigger evidence.", "Cite changed files or plan sections that touch contracts, state, validation, generated types, or reusable type utilities."));
    }
  }
  if (advancedRow.status === "not_applicable" && !advancedRow.notApplicableRationale && !advanced?.notApplicableRationale) {
    errors.push(error("TS_ADVANCED_NOT_APPLICABLE_RATIONALE", context.artifactPath, "typescript.advancedTypes.notApplicableRationale", "Not-applicable advanced TypeScript needs rationale.", "Explain why no exported/public types, contracts, validation, generated types, state machines, branded IDs, reusable type utilities, or cross-layer boundaries are touched."));
  }
}

function rejectPrivateStrings(value, fieldPath, context, errors, depth = 0) {
  if (depth > 100) {
    errors.push(error("DEEP_NESTING_LIMIT", context.artifactPath, fieldPath, "Artifact nesting exceeds the validator safety limit.", "Flatten the artifact structure before tracking it."));
    return;
  }
  // Matches temp/home paths plus common token/key shapes: sk-, ghp_, AKIA, and PEM private-key headers.
  const privatePattern = /(?:\/tmp\/|\/var\/folders\/|\/Users\/[^/\s]+\/|~\/|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{12,}|(?:^|[^A-Za-z0-9])ghp_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/;
  if (typeof value === "string" && privatePattern.test(value)) {
    errors.push(error("SOURCE_PRIVATE_VALUE", context.artifactPath, fieldPath, "Tracked source manifest contains private, ephemeral, or secret-looking material.", "Replace with sanitized source IDs, versions, hashes, and refresh commands."));
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => rejectPrivateStrings(item, `${fieldPath}[${index}]`, context, errors, depth + 1));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => rejectPrivateStrings(item, `${fieldPath}.${key}`, context, errors, depth + 1));
  }
}

function requireString(value, field, code, context, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(error(code, context.artifactPath, field, `${field} must be a non-empty string.`, `Fill ${field} with concrete evidence.`));
  }
}

export function error(code, artifact, pathName, whyItMatters, exactFix, exampleCommand = "") {
  const command = exampleCommand || exampleCommandFor(code);
  return {
    code,
    artifact: artifact || "<artifact>",
    path: pathName,
    missingField: pathName,
    whyItMatters,
    exactFix,
    ...(command ? { exampleCommand: command } : {}),
  };
}

function exampleCommandFor(code) {
  if (code.startsWith("SOURCE_")) return "node scripts/deep-stack-check.mjs validate-sources --artifact <artifact-path>";
  if (code.startsWith("SKILL_") || code.startsWith("TS_")) return "node scripts/deep-stack-check.mjs validate-skills --artifact <artifact-path>";
  if (code.startsWith("REUSE_")) return "node scripts/deep-stack-check.mjs validate-reuse --artifact <artifact-path>";
  if (code.startsWith("FINDING_") || code.startsWith("FINDINGS_")) return "node scripts/deep-stack-check.mjs validate-findings --artifact <artifact-path>";
  if (code.startsWith("COMPLETION_RECONCILIATION_")) return "node scripts/deep-stack-check.mjs validate-completion-reconciliation --artifact <artifact-path>";
  if (code.startsWith("COMPLETION_")) return "node scripts/deep-stack-check.mjs validate-completion --artifact <artifact-path>";
  if (code.startsWith("REVIEW_PHASE_") || code.startsWith("REVIEW_PHASES_")) return "node scripts/deep-stack-check.mjs validate-review-phases --artifact <artifact-path>";
  if (code.startsWith("TDD_")) return "node scripts/deep-stack-check.mjs validate-tdd --artifact <artifact-path>";
  if (code.startsWith("TS_TRIGGER_")) return "node scripts/deep-stack-check.mjs validate-type-triggers --artifact <artifact-path>";
  if (code.startsWith("INSTALL_PROOF_") || code.startsWith("INSTALL_")) return "node scripts/deep-stack-check.mjs validate-install-proof --artifact <artifact-path>";
  if (code.startsWith("RISK_")) return "node scripts/deep-stack-check.mjs validate-risk-tier --artifact <artifact-path>";
  if (code.startsWith("DEEP_")) return "node scripts/deep-stack-check.mjs validate-artifact --artifact <artifact-path>";
  return "";
}
