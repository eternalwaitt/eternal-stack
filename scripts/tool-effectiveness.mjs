#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "help";
const jsonMode = args.includes("--json");
const VALID_COMMANDS = new Set(["validate-fixtures", "baseline", "import-codex", "summarize", "doctor"]);
const VALID_VERDICTS = new Set(["keep", "enforce", "repo-specific", "remove-watch", "insufficient-data"]);
const DEFAULT_EVENTS_FILE = path.join(process.env.CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR || path.join(homedir(), ".claude", "control-plane", "artifacts"), "tool-effectiveness", "events.jsonl");
const DEFAULT_FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "tool-effectiveness");
const sinceDays = Number(flagValue("--since-days", "0"));
const cwdFilter = flagValue("--cwd");
const projectFilter = flagValue("--project");
const projectsConfigPath = flagValue("--projects-config");

if (!VALID_COMMANDS.has(command)) usage();

function usage() {
  console.error("usage: tool-effectiveness.mjs validate-fixtures|baseline|import-codex|summarize|doctor [--fixtures <dir>] [--since-days N] [--cwd <path>] [--project <id>] [--projects-config <path>] [--tool <name>] [--all] [--json]");
  process.exit(2);
}

function flagValue(name, fallback = "") {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1) || fallback;
  }
  return fallback;
}

function emit(value) {
  if (jsonMode || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function allFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "codex" ? [] : allFiles(full);
    return [full];
  });
}

function parseJsonFile(file) {
  const raw = readFileSync(file, "utf8");
  if (file.endsWith(".jsonl")) {
    return raw.split(/\n/).filter(Boolean).map((line, index) => ({ value: JSON.parse(line), file, line: index + 1 }));
  }
  const value = JSON.parse(raw);
  return [{ value, file, line: 1 }];
}

function privacyReason(value) {
  const text = JSON.stringify(value);
  if (/(promptText|rawPrompt|transcriptText|toolResultBody|messageText)"/.test(text)) return "raw-text-field";
  if (/sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(text)) return "secret-looking-token";
  if (/\/Users\/victorpenter\b/.test(text)) return "private-home-path";
  if (/\.codex\/sessions|\.claude\/projects/.test(text)) return "private-transcript-path";
  if (/\b(tcg-collector|agency-tbd|core-suite|openclaw-etrnl|metacards-admin)\b/.test(text)) return "private-project-name";
  return "";
}

function sanitizeProjectHash(input = "") {
  return createHash("sha256").update(String(input || "unknown")).digest("hex").slice(0, 16);
}

function projectConfigEntries() {
  if (!projectsConfigPath || !existsSync(projectsConfigPath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(projectsConfigPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid --projects-config ${projectsConfigPath}: ${detail}`);
  }
  return Array.isArray(parsed.projects) ? parsed.projects : [];
}

function configuredProjectHashes() {
  const hashes = new Set();
  for (const project of projectConfigEntries()) {
    if (!projectFilter || project.alias === projectFilter || project.id === projectFilter || project.path === projectFilter) {
      if (project.path) hashes.add(sanitizeProjectHash(path.resolve(project.path)));
      if (project.alias) hashes.add(sanitizeProjectHash(project.alias));
      if (project.id) hashes.add(sanitizeProjectHash(project.id));
    }
  }
  return hashes;
}

function normalizeEvent(raw, source = "fixture") {
  const rejectReason = privacyReason(raw);
  if (rejectReason) return { rejected: true, reason: rejectReason, raw };
  const tool = String(raw.tool || raw.toolId || raw.name || "").trim();
  if (!tool) return { rejected: true, reason: "missing-tool", raw };
  return {
    schemaVersion: 1,
    source: raw.source || source,
    caseId: raw.caseId || "",
    project: raw.project || "",
    projectHash: raw.projectHash || sanitizeProjectHash(raw.cwd || raw.project || "fixture"),
    tool,
    toolKind: raw.toolKind || tool,
    eligible: raw.eligible !== false,
    toolUsed: raw.toolUsed !== false,
    usedBeforeFirstEdit: Boolean(raw.usedBeforeFirstEdit),
    usefulWork: Boolean(raw.usefulWork),
    downstreamArtifact: Boolean(raw.downstreamArtifact),
    verificationRecovered: Boolean(raw.verificationRecovered),
    readSearchCount: Number(raw.readSearchCount || 0),
    baselineReadSearchCount: Number(raw.baselineReadSearchCount || raw.readSearchCount || 0),
    repeatedEdits: Number(raw.repeatedEdits || 0),
    baselineRepeatedEdits: Number(raw.baselineRepeatedEdits || raw.repeatedEdits || 0),
    noise: Boolean(raw.noise),
    duplicateTruthState: Boolean(raw.duplicateTruthState),
    privacyFailure: Boolean(raw.privacyFailure),
    at: raw.at || new Date(0).toISOString(),
  };
}

function applyEventFilters(source) {
  const projectHashes = configuredProjectHashes();
  const cwdHash = cwdFilter ? sanitizeProjectHash(path.resolve(cwdFilter)) : "";
  const cutoff = Number.isFinite(sinceDays) && sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : 0;
  const keepByTime = (event) => {
    if (!cutoff) return true;
    const parsed = Date.parse(event.at || "");
    return !Number.isFinite(parsed) || parsed <= 0 || parsed >= cutoff;
  };
  const keepByProject = (event) => {
    if (cwdHash && event.projectHash !== cwdHash) return false;
    if (projectFilter) {
      if (event.project === projectFilter || event.projectHash === projectFilter) return true;
      if (projectHashes.size > 0) return projectHashes.has(event.projectHash);
      return sanitizeProjectHash(projectFilter) === event.projectHash;
    }
    return true;
  };
  const keep = (event) => keepByTime(event) && keepByProject(event);
  return {
    ...source,
    events: source.events.filter(keep),
    rejected: source.rejected.filter((row) => !row.tool || !flagValue("--tool") || row.tool === flagValue("--tool")),
  };
}

function eventsFromFixtureDir(dir) {
  const rejected = [];
  const events = [];
  const expected = {};
  const expectedPrivacyRejects = [];
  for (const file of allFiles(dir).filter((item) => item.endsWith(".json") || item.endsWith(".jsonl"))) {
    for (const item of parseJsonFile(file)) {
      const root = item.value;
      const rawEvents = Array.isArray(root) ? root : Array.isArray(root.events) ? root.events : [root];
      Object.assign(expected, root.expectedVerdicts || {});
      for (const raw of rawEvents) {
        const normalized = normalizeEvent(raw, "fixture");
        if (normalized.rejected) {
          rejected.push({ file, line: item.line, reason: normalized.reason, tool: raw.tool || raw.toolId || raw.name || "" });
          if (root.expectPrivacyReject) expectedPrivacyRejects.push(file);
        } else {
          events.push(normalized);
        }
      }
    }
  }
  return { events, rejected, expected, expectedPrivacyRejects };
}

function eventsFromLive() {
  const events = [];
  const rejected = [];
  if (existsSync(DEFAULT_EVENTS_FILE)) {
    for (const item of parseJsonFile(DEFAULT_EVENTS_FILE)) {
      const normalized = normalizeEvent(item.value, "live");
      if (normalized.rejected) rejected.push({ file: item.file, line: item.line, reason: normalized.reason, tool: item.value.tool || item.value.toolId || item.value.name || "" });
      else events.push(normalized);
    }
  }
  const stateDir = process.env.CLAUDE_GUARD_STATE_DIR || "";
  if (stateDir && existsSync(stateDir)) {
    for (const file of readdirSync(stateDir).filter((name) => /^claude-guard-.*\.json$/.test(name))) {
      const statePath = path.join(stateDir, file);
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      for (const signal of state.toolSignals || []) {
        const normalized = normalizeEvent({ ...signal, projectHash: sanitizeProjectHash(state.cwd || file), eligible: false }, "claude-hook");
        if (!normalized.rejected) events.push(normalized);
      }
    }
  }
  return { events, rejected, expected: {}, expectedPrivacyRejects: [] };
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function summarizeEvents(events, rejected = []) {
  const toolFilter = flagValue("--tool");
  const groups = new Map();
  for (const event of events) {
    if (toolFilter && event.tool !== toolFilter && event.toolKind !== toolFilter) continue;
    if (!groups.has(event.tool)) groups.set(event.tool, []);
    groups.get(event.tool).push(event);
  }
  const tools = {};
  for (const [tool, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const eligible = rows.filter((row) => row.eligible);
    const used = eligible.filter((row) => row.toolUsed);
    const autonomous = used.filter((row) => row.usedBeforeFirstEdit).length / Math.max(eligible.length, 1);
    const beforeUseful = used.filter((row) => row.usedBeforeFirstEdit && row.usefulWork).length / Math.max(used.length, 1);
    const explorationDelta = Math.max(0, (median(used.map((row) => row.baselineReadSearchCount)) - median(used.map((row) => row.readSearchCount))) / Math.max(median(used.map((row) => row.baselineReadSearchCount)), 1));
    const reworkDelta = Math.max(0, (median(used.map((row) => row.baselineRepeatedEdits)) - median(used.map((row) => row.repeatedEdits))) / Math.max(median(used.map((row) => row.baselineRepeatedEdits)), 1));
    const verificationRecoveryRate = used.filter((row) => row.verificationRecovered).length / Math.max(used.length, 1);
    const usefulArtifactRate = used.filter((row) => row.downstreamArtifact || row.usefulWork).length / Math.max(used.length, 1);
    const noiseRate = used.filter((row) => row.noise || (!row.usefulWork && !row.downstreamArtifact && !row.verificationRecovered)).length / Math.max(used.length, 1);
    const privacyRejectCount = rejected.filter((row) => row.tool === tool || row.toolKind === tool).length;
    const privacyFailure = used.some((row) => row.privacyFailure) || privacyRejectCount > 0;
    const duplicateTruthState = used.some((row) => row.duplicateTruthState);
    const score = Math.round(Math.max(0, Math.min(100,
      25 * autonomous + 20 * beforeUseful + 20 * explorationDelta + 15 * reworkDelta + 10 * verificationRecoveryRate + 10 * usefulArtifactRate - 30 * noiseRate - (privacyFailure ? 100 : 0),
    )));
    const verdict = verdictFor({ eligible: eligible.length, score, noiseRate, privacyFailure, duplicateTruthState, autonomous });
    tools[tool] = {
      verdict,
      score,
      evidence: {
        eligibleSessions: eligible.length,
        toolUsedSessions: used.length,
        autonomousUseRate: Number(autonomous.toFixed(3)),
        beforeFirstEditRate: Number((used.filter((row) => row.usedBeforeFirstEdit).length / Math.max(used.length, 1)).toFixed(3)),
        explorationDelta: Number(explorationDelta.toFixed(3)),
        reworkDelta: Number(reworkDelta.toFixed(3)),
        verificationRecoveryRate: Number(verificationRecoveryRate.toFixed(3)),
        usefulArtifactRate: Number(usefulArtifactRate.toFixed(3)),
        noiseRate: Number(noiseRate.toFixed(3)),
        privacyRejectCount,
      },
    };
  }
  return { schemaVersion: 1, command: "summarize", tools, totals: { events: events.length, rejected: rejected.length } };
}

function verdictFor({ eligible, score, noiseRate, privacyFailure, duplicateTruthState, autonomous }) {
  if (privacyFailure || duplicateTruthState || score < 50 || noiseRate > 0.4) return "remove-watch";
  if (eligible < 5) return "insufficient-data";
  if (score >= 70 && noiseRate <= 0.25 && autonomous < 0.6) return "enforce";
  if (score >= 70 && noiseRate <= 0.25) return "keep";
  return "repo-specific";
}

function baseline(events) {
  const byTool = {};
  for (const [tool, rows] of Object.entries(summarizeEvents(events).tools)) {
    byTool[tool] = {
      verdict: rows.verdict,
      medianReadSearchCount: median(events.filter((event) => event.tool === tool).map((event) => event.readSearchCount)),
      medianRepeatedEdits: median(events.filter((event) => event.tool === tool).map((event) => event.repeatedEdits)),
    };
  }
  return { schemaVersion: 1, command: "baseline", events: events.length, byTool };
}

function loadSource() {
  const fixtures = flagValue("--fixtures", command === "validate-fixtures" && existsSync(DEFAULT_FIXTURES_DIR) ? DEFAULT_FIXTURES_DIR : "");
  return applyEventFilters(fixtures ? eventsFromFixtureDir(fixtures) : eventsFromLive());
}

function codexToolKind(toolName, commandText) {
  if (/codegraph/i.test(toolName)) return "codegraph";
  if (/\b(beads|bd)\b/i.test(`${toolName} ${commandText}`)) return "beads";
  return "other";
}

function validateFixtures() {
  const source = loadSource();
  const summary = summarizeEvents(source.events, source.rejected);
  const errors = [];
  for (const [tool, expected] of Object.entries(source.expected)) {
    if (!VALID_VERDICTS.has(expected)) errors.push(`invalid expected verdict for ${tool}: ${expected}`);
    if (summary.tools[tool]?.verdict !== expected) errors.push(`${tool} expected ${expected} got ${summary.tools[tool]?.verdict || "missing"}`);
  }
  if (source.expectedPrivacyRejects.length > 0 && source.rejected.length === 0) errors.push("privacy reject fixture did not reject any event");
  if (source.events.length === 0) errors.push("no effectiveness fixture events loaded");
  if (errors.length > 0) {
    emit({ ok: false, errors, summary });
    process.exit(1);
  }
  emit(jsonMode ? { ok: true, summary, rejected: source.rejected } : "ok: tool-effectiveness fixtures validated");
}

function importCodex() {
  const dryRun = args.includes("--dry-run");
  const input = flagValue("--fixtures", flagValue("--input"));
  const files = existsSync(input) && statSync(input).isDirectory() ? allFiles(input).filter((file) => file.endsWith(".jsonl") || file.endsWith(".json")) : (input ? [input] : []);
  const events = [];
  const rejected = [];
  for (const file of files) {
    for (const item of parseJsonFile(file)) {
      const toolName = item.value.tool_name || item.value.toolName || item.value.tool || "";
      const tool = codexToolKind(toolName, item.value.command || "");
      if (tool === "other") continue;
      const normalized = normalizeEvent({
        tool,
        source: "codex",
        toolUsed: item.value.toolUsed === true,
        eligible: item.value.eligible === true,
        usedBeforeFirstEdit: Boolean(item.value.usedBeforeFirstEdit),
        usefulWork: Boolean(item.value.usefulWork),
        downstreamArtifact: Boolean(item.value.downstreamArtifact),
        readSearchCount: Number(item.value.readSearchCount || 0),
        baselineReadSearchCount: Number(item.value.baselineReadSearchCount || item.value.readSearchCount || 0),
        cwd: item.value.cwd || "",
        at: item.value.timestamp || item.value.at || "",
      }, "codex");
      if (normalized.rejected) rejected.push({ file, line: item.line, reason: normalized.reason, tool });
      else events.push(normalized);
    }
  }
  emit({ schemaVersion: 1, command: "import-codex", dryRun, eventsImported: events.length, rejected, ...(dryRun ? { events } : {}) });
}

try {
  if (command === "validate-fixtures") validateFixtures();
  else if (command === "baseline") emit(baseline(loadSource().events));
  else if (command === "import-codex") importCodex();
  else if (command === "summarize") {
    const source = loadSource();
    emit(summarizeEvents(source.events, source.rejected));
  }
  else if (command === "doctor") {
    const source = loadSource();
    emit({ schemaVersion: 1, command: "doctor", malformed: 0, privacyRejected: source.rejected.length, stalePilotWindows: 0, nextAction: "none" });
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (jsonMode) emit({ ok: false, error: detail });
  else console.error(`tool-effectiveness error: ${detail}`);
  process.exit(2);
}
