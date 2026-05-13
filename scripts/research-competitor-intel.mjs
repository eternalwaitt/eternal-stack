#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPABILITY_DEFS,
  ensureDirectory,
  extractCompetitor,
  parseOwnedSkills,
  readJson,
  validateEvidence,
  validateManifest,
  validateScorecard,
  writeJson,
  writeText,
} from "./lib/research-intel-core.mjs";
import { argValue } from "./lib/cli-args.mjs";
import { markerRows, renderDoesDoesnt, renderMatrix, renderParityBacklog } from "./lib/research-intel-render.mjs";

const args = process.argv.slice(2);
const command = args[0];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log("usage:");
  console.log("  research-competitor-intel.mjs validate-manifest --manifest <file>");
  console.log("  research-competitor-intel.mjs validate-evidence --evidence <file>");
  console.log("  research-competitor-intel.mjs validate-scorecard --scorecard <file> [--skills-file <file>] [--evidence <file>]");
  console.log(
    "  research-competitor-intel.mjs extract --manifest <file> --repos-root <dir> --out <file> [--manifest-out <file>] [--write-manifest] [--refresh-cadence-days <days>]",
  );
  console.log("  research-competitor-intel.mjs generate --manifest <file> --evidence <file> --scorecard <file> --out-dir <dir>");
}

function fail(message) {
  console.error(`research-competitor-intel: ${message}`);
  process.exit(1);
}

function nowIsoNoMillis() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function plusDaysIsoNoMillis(baseIso, days) {
  const next = new Date(baseIso);
  // Use UTC date arithmetic so day-rollovers do not drift with local DST shifts.
  // If wall-clock local-time precision is ever required, switch to a timezone-aware library.
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function requireArg(flag, fallback = "") {
  const value = argValue(args, flag, fallback);
  if (!value) fail(`${flag} is required`);
  return value;
}

function positiveIntArg(flag, fallback) {
  const raw = argValue(args, flag, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${flag} must be a positive integer`);
  return parsed;
}

function reportErrors(errors) {
  if (errors.length === 0) return;
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}



function runValidateManifest() {
  const manifestPath = requireArg("--manifest");
  const manifest = readJson(path.resolve(manifestPath));
  const errors = validateManifest(manifest);
  reportErrors(errors);
  console.log(`ok: manifest valid (${manifest.competitors.length} competitors)`);
}

function runValidateEvidence() {
  const evidencePath = requireArg("--evidence");
  const evidenceDoc = readJson(path.resolve(evidencePath));
  const errors = validateEvidence(evidenceDoc);
  reportErrors(errors);
  console.log(`ok: evidence valid (${evidenceDoc.rows.length} rows)`);
}

function runValidateScorecard() {
  const scorecardPath = requireArg("--scorecard");
  const evidencePath = argValue(args, "--evidence");
  const skillsFile = path.resolve(argValue(args, "--skills-file", path.join(scriptDir, "lib", "skill-lists.sh")));
  const scorecard = readJson(path.resolve(scorecardPath));
  const ownedSkills = parseOwnedSkills(skillsFile);
  const knownEvidenceRows = evidencePath
    ? new Set(readJson(path.resolve(evidencePath)).rows.map((row) => `${row.competitorId}:${row.capability}`))
    : null;
  const errors = validateScorecard(scorecard, ownedSkills, knownEvidenceRows);
  reportErrors(errors);
  console.log(`ok: scorecard valid (${scorecard.scorecards.length} entries, ${ownedSkills.length} owned skills)`);
}

function applyItemFreshness(item, capability, generatedAt) {
  const extra = item.kind === "negative_scan" ? { reason: `No matching capability evidence found for ${capability}` } : {};
  return { ...item, lastValidated: generatedAt, validationMethod: "auto-scan", ...extra };
}

function applyRowFreshness(row, generatedAt) {
  return { ...row, evidence: row.evidence.map((item) => applyItemFreshness(item, row.capability, generatedAt)) };
}

function processCompetitorEntry(competitor, reposRoot, generatedAt) {
  const repoDir = path.resolve(reposRoot, competitor.localPath || competitor.id);
  const repoDirRelative = path.relative(reposRoot, repoDir);
  if (repoDirRelative.startsWith("..") || path.isAbsolute(repoDirRelative)) {
    fail(`competitor ${competitor.id} localPath escapes --repos-root: ${competitor.localPath || competitor.id}`);
  }
  if (!existsSync(repoDir)) fail(`competitor repo directory not found: ${repoDir}`);
  const extracted = extractCompetitor(repoDir, competitor.id);
  const copy = { ...competitor, analyzedPaths: extracted.analyzedPaths };
  if (!copy.collectedAt) copy.collectedAt = nowIsoNoMillis();
  return { copy, rows: extracted.rows };
}

function runExtract() {
  const manifestPath = path.resolve(requireArg("--manifest"));
  const reposRoot = path.resolve(requireArg("--repos-root"));
  const outputPath = path.resolve(requireArg("--out"));
  if (!existsSync(reposRoot)) fail(`repos-root directory not found: ${reposRoot}`);
  const manifestOut = argValue(args, "--manifest-out");
  const writeManifest = args.includes("--write-manifest");
  if (manifestOut && writeManifest) fail("--manifest-out and --write-manifest are mutually exclusive.");
  const manifest = readJson(manifestPath);
  reportErrors(validateManifest(manifest));
  const generatedAt = nowIsoNoMillis();
  const refreshCadenceDays = positiveIntArg("--refresh-cadence-days", 30);
  const maxRefreshCadenceDays = 3650;
  if (refreshCadenceDays > maxRefreshCadenceDays) {
    fail(`--refresh-cadence-days must be <= ${maxRefreshCadenceDays}`);
  }
  const rows = [];
  const enriched = {
    ...manifest,
    selectionPolicy: {
      ...(manifest.selectionPolicy || {}),
      collectionTimestampPolicy: "per_repo_collection_time",
    },
    competitors: [],
  };
  for (const competitor of manifest.competitors) {
    const { copy, rows: compRows } = processCompetitorEntry(competitor, reposRoot, generatedAt);
    enriched.competitors.push(copy);
    rows.push(...compRows);
  }
  if (manifestOut) writeJson(path.resolve(manifestOut), enriched);
  else if (writeManifest) writeJson(manifestPath, enriched);
  const rowsWithFreshness = rows.map((row) => applyRowFreshness(row, generatedAt));
  const extractedEvidence = {
    generatedAt,
    stalenessPolicy: { refreshCadenceDays, nextScan: plusDaysIsoNoMillis(generatedAt, refreshCadenceDays) },
    capabilities: CAPABILITY_DEFS.map((cap) => cap.id),
    rows: rowsWithFreshness,
  };
  reportErrors(validateEvidence(extractedEvidence));
  writeJson(outputPath, extractedEvidence);
  console.log(`ok: extracted ${rowsWithFreshness.length} capability rows`);
}

function runGenerate() {
  const manifestPath = path.resolve(requireArg("--manifest"));
  const evidencePath = path.resolve(requireArg("--evidence"));
  const scorecardPath = path.resolve(requireArg("--scorecard"));
  const outDir = path.resolve(requireArg("--out-dir"));
  const manifest = readJson(manifestPath);
  const evidenceDoc = readJson(evidencePath);
  const scorecard = readJson(scorecardPath);
  const skillsFile = path.resolve(argValue(args, "--skills-file", path.join(scriptDir, "lib", "skill-lists.sh")));
  reportErrors(validateManifest(manifest));
  reportErrors(validateEvidence(evidenceDoc));
  const ownedSkills = parseOwnedSkills(skillsFile);
  const knownEvidenceRows = new Set(evidenceDoc.rows.map((row) => `${row.competitorId}:${row.capability}`));
  reportErrors(validateScorecard(scorecard, ownedSkills, knownEvidenceRows));
  const markers = markerRows(manifest, evidenceDoc);
  ensureDirectory(outDir);
  writeText(path.join(outDir, "capability-matrix.md"), renderMatrix(markers));
  writeText(path.join(outDir, "does-doesnt-by-competitor.md"), renderDoesDoesnt(markers));
  writeText(path.join(outDir, "etrnl-parity-backlog.md"), renderParityBacklog(scorecard));
  console.log(`ok: generated docs in ${outDir}`);
}

if (command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}
if (!command) {
  usage();
  process.exit(2);
}

try {
  if (command === "validate-manifest") runValidateManifest();
  else if (command === "validate-evidence") runValidateEvidence();
  else if (command === "validate-scorecard") runValidateScorecard();
  else if (command === "extract") runExtract();
  else if (command === "generate") runGenerate();
  else fail(`unknown command ${command}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
