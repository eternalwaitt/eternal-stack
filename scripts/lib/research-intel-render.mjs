import { CAPABILITY_DEFS } from "./research-intel-core.mjs";

const REGEN_COMMENT =
  "<!-- Regenerate: node scripts/research-competitor-intel.mjs generate --manifest docs/research/top10-lock.json --evidence docs/research/capability-evidence.json --scorecard docs/research/parity-scorecard.json --out-dir docs/research -->";

function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function statusLabel(status) {
  if (status === "present") return "does";
  if (status === "partial") return "partial";
  return "does-not";
}

function prioritySortValue(priority) {
  const value = String(priority ?? "").trim().toUpperCase();
  const milestone = value.match(/\bP(\d+)\b/);
  if (milestone) return Number.parseInt(milestone[1], 10);
  const numericPrefix = value.match(/^-?\d+(?:\.\d+)?/);
  const numeric = numericPrefix ? Number.parseFloat(numericPrefix[0]) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

export function markerRows(manifest, evidenceDoc) {
  const knownCompetitors = new Set(manifest.competitors.map((c) => c.id));
  const rowsByCompetitor = new Map();
  const orphans = new Set();
  for (const row of evidenceDoc.rows) {
    if (!knownCompetitors.has(row.competitorId)) {
      orphans.add(row.competitorId);
      continue;
    }
    if (!rowsByCompetitor.has(row.competitorId)) rowsByCompetitor.set(row.competitorId, []);
    rowsByCompetitor.get(row.competitorId).push(row);
  }
  if (orphans.size > 0) {
    console.warn(`research-competitor-intel warning: evidence rows reference unknown competitor ids: ${[...orphans].sort().join(", ")}`);
  }
  return manifest.competitors.map((competitor) => {
    const rows = rowsByCompetitor.get(competitor.id) ?? [];
    const byCapability = Object.fromEntries(rows.map((row) => [row.capability, row]));
    const cells = Object.fromEntries(
      Object.values(byCapability).map((row) => [row.capability, `${statusLabel(row.status)}/${row.enforcementLevel}`]),
    );
    return { id: competitor.id, rows: byCapability, cells };
  });
}

export function renderMatrix(markers) {
  const header = ["Competitor", ...CAPABILITY_DEFS.map((cap) => escapeTableCell(cap.id))];
  const lines = [
    "# Capability Matrix",
    "",
    "<!-- Generated file. Do not edit manually. -->",
    REGEN_COMMENT,
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
    const row = [escapeTableCell(marker.id), ...CAPABILITY_DEFS.map((cap) => escapeTableCell(marker.cells[cap.id] ?? "does-not/none"))];
    lines.push(`| ${row.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderDoesDoesnt(markers) {
  const lines = ["# Does / Doesn't by Competitor", "", "<!-- Generated file. Do not edit manually. -->", REGEN_COMMENT, ""];
  for (const marker of markers) {
    lines.push(`## ${marker.id}`);
    lines.push("");
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

export function renderParityBacklog(scorecard) {
  const lines = [
    "# ETRNL Parity Backlog",
    "",
    "<!-- Generated file. Do not edit manually. -->",
    REGEN_COMMENT,
    "",
    "| Skill | Priority | Milestone | Gaps |",
    "| --- | --- | --- | --- |",
  ];
  const sorted = [...scorecard.scorecards].sort((a, b) => {
    // Sort numerically by `P#`/numeric priority first, then lexicographically as a stable tie-breaker.
    const left = prioritySortValue(a.priority);
    const right = prioritySortValue(b.priority);
    if (left !== right) return left - right;
    return String(a.priority ?? "").localeCompare(String(b.priority ?? ""));
  });
  for (const row of sorted) {
    const gaps = row.gaps.map((gap) => `${gap.capability}:${gap.target}`).join("; ");
    lines.push(`| ${row.etrnlSkill} | ${row.priority} | ${row.targetMilestone} | ${gaps || "none"} |`);
  }
  return `${lines.join("\n")}\n`;
}
