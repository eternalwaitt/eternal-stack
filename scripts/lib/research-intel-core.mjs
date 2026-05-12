import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseBashArray } from "./bash-array-parser.mjs";

export const CAPABILITY_DEFS = [
  {
    id: "tdd_enforcement",
    label: "TDD enforcement",
    patterns: [/test[- ]driven/i, /\bTDD\b/i, /failing test/i, /red[- ]green[- ]refactor/i, /write the test first/i],
  },
  {
    id: "planning_depth",
    label: "Planning depth",
    patterns: [/implementation plan/i, /\bplan readiness\b/i, /task group/i, /\bphases?\b/i, /\bdesign review\b/i],
  },
  {
    id: "research_flow",
    label: "Research flow",
    patterns: [/\bresearch\b/i, /\binvestigat/i, /\banaly(?:sis|ze)\b/i, /\bbenchmark\b/i, /compare( against| to)?/i],
  },
  {
    id: "subagent_orchestration",
    label: "Subagent orchestration",
    patterns: [/\bsubagent\b/i, /\bdelegate\b/i, /\bspawn[_ -]?agent\b/i, /\bagent task packet\b/i],
  },
  {
    id: "parallelism_safety",
    label: "Parallelism safety",
    patterns: [/\bparallel\b/i, /file overlap/i, /\bconflict\b/i, /\bworktree\b/i, /\bwave execution\b/i],
  },
  {
    id: "verification_gates",
    label: "Verification gates",
    patterns: [/\bverification gate\b/i, /\bmust pass\b/i, /\bblocker\b/i, /\bfail[- ]closed\b/i, /process\.exit\(1\)/i, /\bdoctor\b/i],
  },
  {
    id: "rollback_guardrails",
    label: "Rollback and guardrails",
    patterns: [/\brollback\b/i, /\bguardrail\b/i, /\bbackup\b/i, /\brestore\b/i, /\bkill switch\b/i],
  },
  {
    id: "telemetry_proactive",
    label: "Telemetry and proactive behavior",
    patterns: [/\btelemetry\b/i, /\bheartbeat\b/i, /\bmonitor\b/i, /\bmetric\b/i, /\balert\b/i, /\bobserver\b/i],
  },
];

const RELEVANT_SEGMENTS = ["skill", "hook", "command", "workflow", "script", "agent", "test"];
const TEXT_EXTENSIONS = new Set([".md", ".sh", ".mjs", ".js", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".ini", ".hcl", ".py", ".txt"]);
export const RAW_EVIDENCE_LIMIT = 6;
export const FINAL_EVIDENCE_LIMIT = 3;

export function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${filePath}: ${detail}`, error instanceof Error ? { cause: error } : undefined);
  }
}

export function writeJson(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function isReadmePath(relPath) {
  return /(^|\/)readme(\.[^/]+)?$/i.test(relPath);
}

function isRelevantPath(relPath) {
  const lower = relPath.toLowerCase();
  if (isReadmePath(lower)) return false;
  const ext = path.extname(lower);
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  return RELEVANT_SEGMENTS.some((segment) => lower.includes(segment));
}

function filePriority(relPath) {
  const lower = relPath.toLowerCase();
  if (/(^|\/)skills?\//.test(lower) || /skill\.md$/.test(lower)) return 0;
  if (/(^|\/)hooks?\//.test(lower)) return 1;
  if (/(^|\/)(commands?|workflows?|scripts?)\//.test(lower)) return 2;
  if (/(^|\/)(tests?|__tests__)\//.test(lower) || /\.(test|spec)\./.test(lower)) return 3;
  if (/(^|\/)agents?\//.test(lower)) return 4;
  if (/(^|\/)\.github\//.test(lower)) return 7;
  return 5;
}

function listFilesRecursive(rootDir, prefix = "", visited = new Set()) {
  if (visited.has(rootDir)) return [];
  visited.add(rootDir);
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`research-intel-core warning: cannot read directory ${rootDir}: ${detail}`);
    return [];
  }
  return entries.flatMap((entry) => {
    const nextPrefix = prefix ? path.join(prefix, entry.name) : entry.name;
    const abs = path.join(rootDir, entry.name);
    let stats;
    try {
      stats = lstatSync(abs);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`research-intel-core warning: cannot stat path ${abs}: ${detail}`);
      return [];
    }
    if (stats.isSymbolicLink()) return [];
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") return [];
      return listFilesRecursive(abs, nextPrefix, visited);
    }
    return [nextPrefix];
  });
}

function fileEnforcementWeight(relPath) {
  const lower = relPath.toLowerCase();
  if (/(^|\/)(tests?|__tests__)\//.test(lower) || /\.(test|spec)\./.test(lower)) return "test_enforced";
  if (/(^|\/)hooks?\//.test(lower)) return "hook_enforced";
  if (/(^|\/)(scripts?|commands?|workflows?)\//.test(lower)) return "script_enforced";
  if (/(^|\/)agents?\//.test(lower)) return "agent_contract";
  return "prompt_only";
}

function strongestEnforcement(evidenceItems) {
  const order = ["none", "prompt_only", "agent_contract", "script_enforced", "hook_enforced", "test_enforced"];
  return evidenceItems.reduce((best, item) => {
    const score = order.indexOf(item.enforcementHint || "prompt_only");
    const bestScore = order.indexOf(best);
    return score > bestScore ? order[score] : best;
  }, "none");
}

function collectEvidenceForCapability(repoRoot, relFiles, capability) {
  const prioritized = [...relFiles].sort((left, right) => {
    const scoreDiff = filePriority(left) - filePriority(right);
    return scoreDiff !== 0 ? scoreDiff : left.localeCompare(right);
  });
  const patternsByFlags = capability.patterns.reduce((map, pattern) => {
    const normalizedFlags = Array.from(
      new Set(pattern.flags.split("").filter((flag) => flag !== "g" && flag !== "y")),
    ).sort().join("");
    const grouped = map.get(normalizedFlags) ?? [];
    grouped.push(pattern);
    map.set(normalizedFlags, grouped);
    return map;
  }, new Map());
  const combinedPatterns = [...patternsByFlags.entries()].map(([flags, patterns]) =>
    new RegExp(patterns.map((pattern) => `(?:${pattern.source})`).join("|"), flags),
  );
  const evidence = [];
  for (const relPath of prioritized) {
    const absPath = path.join(repoRoot, relPath);
    let lines;
    try {
      lines = readFileSync(absPath, "utf8").split(/\r?\n/);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`research-intel-core warning: cannot read file ${absPath}: ${detail}`);
      continue;
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!combinedPatterns.some((pattern) => pattern.test(line))) continue;
      evidence.push({
        file: normalizePath(relPath),
        line: index + 1,
        snippet: line.trim().slice(0, 180),
        enforcementHint: fileEnforcementWeight(relPath),
      });
      if (evidence.length >= RAW_EVIDENCE_LIMIT) return evidence;
    }
  }
  return evidence;
}

function dedupeEvidence(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = `${item.file}:${item.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function buildAbsentEvidenceItem(capability, relFiles, extractedAt) {
  const fallbackFile = relFiles.find((f) => f.toLowerCase().includes(capability.id.toLowerCase())) ?? "_negative_scan_placeholder";
  return {
    file: fallbackFile,
    line: 0,
    snippet: `No matching capability evidence found across ${relFiles.length} implementation files for ${capability.id}`,
    kind: "negative_scan",
    lastValidated: extractedAt,
    reason: `No matching capability evidence found for ${capability.id}`,
  };
}

function buildAbsentRow(competitorId, capability, relFiles, extractedAt) {
  return {
    competitorId,
    capability: capability.id,
    status: "absent",
    enforcementLevel: "none",
    evidence: [buildAbsentEvidenceItem(capability, relFiles, extractedAt)],
  };
}

export function extractCompetitor(repoRoot, competitorId) {
  if (!existsSync(repoRoot)) {
    throw new Error(`repo root missing for ${competitorId}: ${repoRoot}`);
  }
  const relFiles = listFilesRecursive(repoRoot).map(normalizePath).filter(isRelevantPath).sort((a, b) => a.localeCompare(b));
  const extractedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const rows = CAPABILITY_DEFS.map((capability) => {
    const rawEvidence = collectEvidenceForCapability(repoRoot, relFiles, capability);
    const evidence = dedupeEvidence(rawEvidence).slice(0, FINAL_EVIDENCE_LIMIT);
    const status = evidence.length >= 2 ? "present" : evidence.length === 1 ? "partial" : "absent";
    if (status === "absent") return buildAbsentRow(competitorId, capability, relFiles, extractedAt);
    const normalizedEvidence = evidence.map((item) => ({
      file: item.file,
      line: item.line,
      snippet: item.snippet,
      kind: "code_ref",
      lastValidated: item.lastValidated || extractedAt,
    }));
    return {
      competitorId,
      capability: capability.id,
      status,
      enforcementLevel: strongestEnforcement(evidence),
      evidence: normalizedEvidence,
    };
  });
  const analyzedPaths = Array.from(
    new Set(rows.flatMap((row) => row.evidence.map((item) => item.file))),
  ).sort((left, right) => left.localeCompare(right));
  return { analyzedPaths, rows };
}

export function parseOwnedSkills(skillListPath) {
  let source;
  try {
    source = readFileSync(skillListPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Intentional empty fallback: an absent skills file is treated as zero owned skills
    // (e.g. during first-install or CI without the full skill tree). The warning surfaces
    // the path so callers can distinguish misconfiguration from a genuine empty state.
    console.warn(`research-intel-core warning: cannot read owned skills file ${skillListPath}: ${detail}`);
    return [];
  }
  return parseBashArray(source, "OWNED_SKILLS");
}

export { validateManifest, validateEvidence, validateScorecard } from "./research-intel-validators.mjs";

export function ensureDirectory(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function writeText(filePath, text) {
  ensureDirectory(path.dirname(filePath));
  writeFileSync(filePath, text, "utf8");
}
