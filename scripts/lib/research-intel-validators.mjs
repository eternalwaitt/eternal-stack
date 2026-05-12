const README_RE = /(^|\/)readme(\.[^/]+)?$/i;

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function validateManifestRow(row, index, errors) {
  const prefix = `competitors[${index}]`;
  if (!isObject(row)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  assert(typeof row.id === "string" && row.id.length > 0, `${prefix}.id is required`, errors);
  assert(typeof row.repoUrl === "string" && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(row.repoUrl), `${prefix}.repoUrl must be GitHub URL`, errors);
  assert(typeof row.commitSha === "string" && /^[A-Fa-f0-9]{40}$/.test(row.commitSha), `${prefix}.commitSha must be full SHA`, errors);
  assert(typeof row.license === "string" && row.license.length > 0, `${prefix}.license is required`, errors);
  assert(Array.isArray(row.analyzedPaths) && row.analyzedPaths.length > 0, `${prefix}.analyzedPaths must have entries`, errors);
  assert(typeof row.collectedAt === "string" && row.collectedAt.length > 0, `${prefix}.collectedAt is required`, errors);
}

export function validateManifest(manifest) {
  const errors = [];
  assert(typeof manifest === "object" && manifest !== null, "manifest must be an object", errors);
  assert(Array.isArray(manifest.competitors), "manifest.competitors must be an array", errors);
  if (!Array.isArray(manifest.competitors)) return errors;
  manifest.competitors.forEach((row, index) => validateManifestRow(row, index, errors));
  return errors;
}

function validateStalenessPolicy(policy, errors) {
  assert(
    Number.isInteger(policy.refreshCadenceDays) && policy.refreshCadenceDays > 0,
    "stalenessPolicy.refreshCadenceDays must be integer > 0",
    errors,
  );
  assert(
    typeof policy.nextScan === "string" && policy.nextScan.length > 0,
    "stalenessPolicy.nextScan is required",
    errors,
  );
}

function validateEvidenceItem(item, itemPrefix, errors) {
  if (!isObject(item)) {
    errors.push(`${itemPrefix} must be an object`);
    return;
  }
  assert(typeof item.file === "string" && item.file.length > 0, `${itemPrefix}.file required`, errors);
  assert(!README_RE.test(item.file), `${itemPrefix}.file must not be README`, errors);
  if (item.kind === "negative_scan") {
    assert(Number.isInteger(item.line) && item.line === 0, `${itemPrefix}.line must be 0 for negative_scan`, errors);
    assert(typeof item.reason === "string" && item.reason.length > 0, `${itemPrefix}.reason required for negative_scan`, errors);
  } else {
    assert(Number.isInteger(item.line) && item.line >= 1, `${itemPrefix}.line must be >= 1`, errors);
  }
  assert(typeof item.snippet === "string" && item.snippet.length > 0, `${itemPrefix}.snippet required`, errors);
  assert(typeof item.lastValidated === "string" && item.lastValidated.length > 0, `${itemPrefix}.lastValidated required`, errors);
}

function validateEvidenceRow(row, rowIndex, errors) {
  const prefix = `rows[${rowIndex}]`;
  if (!isObject(row)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  assert(typeof row.competitorId === "string" && row.competitorId.length > 0, `${prefix}.competitorId required`, errors);
  assert(typeof row.capability === "string" && row.capability.length > 0, `${prefix}.capability required`, errors);
  assert(["present", "partial", "absent"].includes(row.status), `${prefix}.status must be present|partial|absent`, errors);
  assert(
    ["prompt_only", "script_enforced", "hook_enforced", "test_enforced", "none"].includes(row.enforcementLevel),
    `${prefix}.enforcementLevel invalid`,
    errors,
  );
  assert(Array.isArray(row.evidence) && row.evidence.length > 0, `${prefix}.evidence must be non-empty`, errors);
  if (!Array.isArray(row.evidence)) return;
  row.evidence.forEach((item, evIndex) => validateEvidenceItem(item, `${prefix}.evidence[${evIndex}]`, errors));
}

export function validateEvidence(evidenceDoc) {
  const errors = [];
  assert(typeof evidenceDoc === "object" && evidenceDoc !== null, "evidence document must be object", errors);
  assert(typeof evidenceDoc.generatedAt === "string" && evidenceDoc.generatedAt.length > 0, "generatedAt is required", errors);
  assert(typeof evidenceDoc.stalenessPolicy === "object" && evidenceDoc.stalenessPolicy !== null, "stalenessPolicy is required", errors);
  if (typeof evidenceDoc.stalenessPolicy === "object" && evidenceDoc.stalenessPolicy !== null) {
    validateStalenessPolicy(evidenceDoc.stalenessPolicy, errors);
  }
  assert(Array.isArray(evidenceDoc.rows), "evidence.rows must be array", errors);
  if (!Array.isArray(evidenceDoc.rows)) return errors;
  evidenceDoc.rows.forEach((row, rowIndex) => validateEvidenceRow(row, rowIndex, errors));
  return errors;
}

function validateGap(gap, gapPrefix, knownEvidenceRows, errors) {
  assert(typeof gap.capability === "string" && gap.capability.length > 0, `${gapPrefix}.capability required`, errors);
  assert(typeof gap.target === "string" && gap.target.length > 0, `${gapPrefix}.target required`, errors);
  assert(typeof gap.ownerSurface === "string" && gap.ownerSurface.length > 0, `${gapPrefix}.ownerSurface required`, errors);
  assert(Array.isArray(gap.sourceRows) && gap.sourceRows.length > 0, `${gapPrefix}.sourceRows must be non-empty`, errors);
  if (!Array.isArray(gap.sourceRows) || knownEvidenceRows === null) return;
  gap.sourceRows.forEach((sourceRow) => {
    if (!knownEvidenceRows.has(sourceRow)) errors.push(`${gapPrefix}.sourceRows contains unknown evidence row ${sourceRow}`);
  });
}

function validateScorecardEntry(entry, index, opts) {
  const { knownEvidenceRows, errors } = opts;
  const prefix = `scorecards[${index}]`;
  assert(typeof entry.etrnlSkill === "string" && entry.etrnlSkill.length > 0, `${prefix}.etrnlSkill required`, errors);
  assert(typeof entry.capabilityScores === "object" && entry.capabilityScores !== null, `${prefix}.capabilityScores required`, errors);
  assert(Array.isArray(entry.gaps), `${prefix}.gaps must be array`, errors);
  assert(typeof entry.priority === "string" && entry.priority.length > 0, `${prefix}.priority required`, errors);
  assert(typeof entry.targetMilestone === "string" && entry.targetMilestone.length > 0, `${prefix}.targetMilestone required`, errors);
  if (!Array.isArray(entry.gaps)) return;
  entry.gaps.forEach((gap, gapIndex) => validateGap(gap, `${prefix}.gaps[${gapIndex}]`, knownEvidenceRows, errors));
}

export function validateScorecard(scorecard, ownedSkills, knownEvidenceRows = null) {
  const errors = [];
  assert(Array.isArray(scorecard.scorecards), "scorecards array is required", errors);
  if (!Array.isArray(scorecard.scorecards)) return errors;
  const bySkill = new Map(scorecard.scorecards.map((entry) => [entry.etrnlSkill, entry]));
  ownedSkills.forEach((skill) => {
    if (!bySkill.has(skill)) errors.push(`missing scorecard for ${skill}`);
  });
  scorecard.scorecards.forEach((entry, index) => validateScorecardEntry(entry, index, { knownEvidenceRows, errors }));
  return errors;
}
