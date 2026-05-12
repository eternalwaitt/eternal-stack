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

const args = process.argv.slice(2);
const command = args[0];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log("usage:");
  console.log("  research-competitor-intel.mjs validate-manifest --manifest <file>");
  console.log("  research-competitor-intel.mjs validate-evidence --evidence <file>");
  console.log("  research-competitor-intel.mjs validate-scorecard --scorecard <file> [--skills-file <file>] [--evidence <file>]");
  console.log(
    "  research-competitor-intel.mjs extract --manifest <file> --repos-root <dir> --out <file> [--manifest-out <file>] [--write-manifest]",
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
  return new Date(Date.parse(baseIso) + days * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function requireArg(flag, fallback = "") {
  const value = argValue(args, flag, fallback);
  if (!value) fail(`${flag} is required`);
  return value;
}

function reportErrors(errors) {
  if (errors.length === 0) return;
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function renderMatrix(markers) {
  const header = ["Competitor", ...CAPABILITY_DEFS.map((cap) => escapeTableCell(cap.id))];
  const lines = [
    "# Capability Matrix",
    "",
    "<!-- Generated file. Do not edit manually. -->",
    "<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->",
    "",
    "## Vocabulary",
    "",
    "- `does/prompt_only`: present via instructions/prompts only.",
    "- `does/script_enforced`: present with script-level enforcement.",
    "- `does/hook_enforced`: present with hook-level enforcement.",
    "- `does/test_enforced`: present and validated by tests.",
    "- `partial/*`: partially implemented at the listed enforcement level.",
    "- `does-not/none`: capability not present in this competitor snapshot.",
    "",
    "Canonical location: this generated artifact is maintained at `docs/research/capability-matrix.md` and rebuilt via the command above.",
    "",
    "| " + header.join(" | ") + " |",
    "| " + header.map(() => "---").join(" | ") + " |",
  ];
  for (const marker of markers) {
    const row = [escapeTableCell(marker.id), ...CAPABILITY_DEFS.map((cap) => escapeTableCell(marker.cells[cap.id] || "does-not/none"))];
    lines.push(`| ${row.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function statusEmoji(status) {
  if (status === "present") return "does";
  if (status === "partial") return "partial";
  return "does-not";
}

function renderDoesDoesnt(markers) {
  const lines = [
    "# Does / Doesn't by Competitor",
    "",
    "<!-- Generated file. Do not edit manually. -->",
    "<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->",
    "",
  ];
  for (const marker of markers) {
    lines.push(`## ${marker.id}`);
    const does = [];
    const partial = [];
    const doesnt = [];
    for (const capability of CAPABILITY_DEFS) {
      const row = marker.rows[capability.id];
      if (!row) continue;
      const label = `${capability.id} (${row.enforcementLevel})`;
      if (row.status === "present") does.push(label);
      else if (row.status === "partial") partial.push(label);
      else doesnt.push(label);
    }
    lines.push(`- does: ${does.join(", ") || "none"}`);
    lines.push(`- partial: ${partial.join(", ") || "none"}`);
    lines.push(`- does-not: ${doesnt.join(", ") || "none"}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderParityBacklog(scorecard) {
  const lines = [
    "# ETRNL Parity Backlog",
    "",
    "<!-- Generated file. Do not edit manually. -->",
    "<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->",
    "",
    "| Skill | Priority | Milestone | Gaps |",
    "| --- | --- | --- | --- |",
  ];
  const sorted = [...scorecard.scorecards].sort((left, right) => String(left.priority ?? "").localeCompare(String(right.priority ?? "")));
  for (const row of sorted) {
    const gaps = row.gaps.map((gap) => `${gap.capability}:${gap.target}`).join("; ");
    lines.push(`| ${row.etrnlSkill} | ${row.priority} | ${row.targetMilestone} | ${gaps || "none"} |`);
  }
  return `${lines.join("\n")}\n`;
}

function markerRows(manifest, evidenceDoc) {
  const knownCompetitors = new Set(manifest.competitors.map((competitor) => competitor.id));
  const rowsByCompetitor = new Map();
  const orphanCompetitorIds = new Set();
  for (const row of evidenceDoc.rows) {
    if (!knownCompetitors.has(row.competitorId)) {
      orphanCompetitorIds.add(row.competitorId);
      continue;
    }
    if (!rowsByCompetitor.has(row.competitorId)) rowsByCompetitor.set(row.competitorId, []);
    rowsByCompetitor.get(row.competitorId).push(row);
  }
  if (orphanCompetitorIds.size > 0) {
    console.warn(
      `research-competitor-intel warning: evidence rows reference unknown competitor ids: ${[
        ...orphanCompetitorIds,
      ].sort().join(", ")}`,
    );
  }
  return manifest.competitors.map((competitor) => {
    const rows = rowsByCompetitor.get(competitor.id) || [];
    const byCapability = Object.fromEntries(rows.map((row) => [row.capability, row]));
    const cells = Object.fromEntries(
      Object.values(byCapability).map((row) => [row.capability, `${statusEmoji(row.status)}/${row.enforcementLevel}`]),
    );
    return { id: competitor.id, rows: byCapability, cells };
  });
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

function runExtract() {
  const manifestPath = path.resolve(requireArg("--manifest"));
  const reposRoot = path.resolve(requireArg("--repos-root"));
  const outputPath = path.resolve(requireArg("--out"));
  if (!existsSync(reposRoot)) {
    fail(`repos-root directory not found: ${reposRoot}`);
  }
  const manifestOut = argValue(args, "--manifest-out");
  const writeManifest = args.includes("--write-manifest");
  if (manifestOut && writeManifest) {
    fail("--manifest-out and --write-manifest are mutually exclusive.");
  }
  const manifest = readJson(manifestPath);
  const manifestErrors = validateManifest(manifest);
  reportErrors(manifestErrors);
  const generatedAt = nowIsoNoMillis();
  const refreshCadenceDays = 30;
  const rows = [];
  const enriched = {
    ...manifest,
    competitors: [],
  };
  for (const competitor of manifest.competitors) {
    const competitorCopy = { ...competitor };
    const repoDir = path.resolve(reposRoot, competitorCopy.localPath || competitorCopy.id);
    const extracted = extractCompetitor(repoDir, competitorCopy.id);
    competitorCopy.analyzedPaths = extracted.analyzedPaths;
    if (!competitorCopy.collectedAt) competitorCopy.collectedAt = generatedAt;
    enriched.competitors.push(competitorCopy);
    rows.push(...extracted.rows);
  }
  const rowsWithFreshness = rows.map((row) => ({
    ...row,
    evidence: row.evidence.map((item) => ({
      ...item,
      lastValidated: generatedAt,
      validationMethod: "auto-scan",
      ...(item.kind === "negative_scan" ? { reason: `No matching capability evidence found for ${row.capability}` } : {}),
    })),
  }));
  if (manifestOut) {
    writeJson(path.resolve(manifestOut), enriched);
  } else if (writeManifest) {
    writeJson(manifestPath, enriched);
  }
  writeJson(outputPath, {
    generatedAt,
    stalenessPolicy: {
      refreshCadenceDays,
      nextScan: plusDaysIsoNoMillis(generatedAt, refreshCadenceDays),
    },
    capabilities: CAPABILITY_DEFS.map((cap) => cap.id),
    rows: rowsWithFreshness,
  });
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
