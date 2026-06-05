import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const EVENT_KINDS = new Set([
  "session",
  "run",
  "run_event",
  "check",
  "artifact",
  "context_entry",
  "compact_pre",
  "compact_post",
  "handoff",
  "tool_signal",
  "settings_observation",
  "lesson",
  "bead_link",
  "projection_error",
]);

const FORBIDDEN_KEYS = new Set([
  "lastPrompt",
  "prompt",
  "promptText",
  "rawPrompt",
  "transcript_path",
  "transcriptPath",
  "transcriptText",
  "toolResultBody",
  "messageText",
]);
const EVENT_VALUE_FLAGS = new Set(["--fixture", "--state-dir", "--session", "--run", "--cwd", "--event-kind", "--max-chars", "--input"]);
const DEFAULT_PRIVATE_PROJECT_NAMES = ["tcg-collector", "agency-tbd", "core-suite", "openclaw-etrnl", "metacards-admin"];
const configuredPrivateProjectNames = (process.env.ETRNL_STATE_PRIVATE_PROJECT_NAMES || DEFAULT_PRIVATE_PROJECT_NAMES.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const privateProjectPattern = configuredPrivateProjectNames.length > 0
  ? new RegExp(`\\b(${configuredPrivateProjectNames.map(escapeRegex).join("|")})\\b`)
  : null;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function flagValue(args, flag, fallback = "") {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1) || fallback;
  }
  return fallback;
}

export function collectPositionals(args) {
  const out = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && EVENT_VALUE_FLAGS.has(arg)) index += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

export function stateRoot(explicit = "") {
  return path.resolve(explicit || process.env.ETRNL_STATE_DIR || process.env.CLAUDE_CONTROL_PLANE_STATE_DIR || path.join(process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude"), "control-plane", "state"));
}

export function statePaths(root = stateRoot()) {
  return {
    root,
    events: path.join(root, "events.jsonl"),
    views: path.join(root, "views"),
    compactView: path.join(root, "views", "compact-handoff.json"),
    lock: path.join(root, ".events.lock"),
  };
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 16);
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function jsonError(code, message, action, extra = {}) {
  return {
    ok: false,
    code,
    message,
    action,
    diagnosticCommand: "node scripts/etrnl-state.mjs doctor --compact --explain",
    ...extra,
  };
}

export function cleanSessionId(value = "") {
  return String(value || process.env.CLAUDE_SESSION_ID || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
}

export function readEvents(root = stateRoot()) {
  const file = statePaths(root).events;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function writeAtomic(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, value, { mode });
  fs.renameSync(tmp, file);
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy-wait keeps this lock helper synchronous without Atomics.wait.
  }
}

export function withLock(root, fn) {
  const { lock } = statePaths(root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  let acquired = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      sleepSync(25);
    }
  }
  if (!acquired) throw Object.assign(new Error("ETRNL state lock timed out"), { code: "StateLockTimeout" });
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function privacyReject(value, trail = []) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `forbidden field ${[...trail, key].join(".")}`;
      const nested = privacyReject(child, [...trail, key]);
      if (nested) return nested;
    }
    return "";
  }
  if (typeof value !== "string") return "";
  if (/sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(value)) return "secret-looking token";
  if (/\.codex\/sessions|\.claude\/projects/.test(value)) return "private transcript path";
  if (/\/Users\/[^/\s]+/.test(value)) return "private absolute home path";
  if (privateProjectPattern?.test(value)) return "private project name";
  return "";
}

function eventData(raw) {
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? { ...raw.data } : {};
  for (const [key, value] of Object.entries(raw)) {
    if (["schemaVersion", "eventKind", "kind", "eventId", "eventSeq", "sessionId", "session_id", "runId", "run_id", "at", "cwd", "data"].includes(key)) continue;
    data[key] = value;
  }
  return data;
}

export function normalizeEvent(raw, options = {}) {
  const eventKind = String(raw.eventKind || raw.kind || options.eventKind || "").trim();
  if (!EVENT_KINDS.has(eventKind)) {
    return { ok: false, error: jsonError("SchemaValidationError", `Unsupported eventKind: ${eventKind || "<missing>"}`, "Use one of the documented ETRNL event kinds.") };
  }
  const data = eventData(raw);
  if (Array.isArray(data.changedFiles) && data.changedFiles.some((file) => path.isAbsolute(String(file)))) {
    return { ok: false, error: jsonError("PrivacyRejectError", "changedFiles must contain relative paths only.", "Store only repo-relative paths or counts in ETRNL state.") };
  }
  const reject = privacyReject(data);
  if (reject) {
    return { ok: false, error: jsonError("PrivacyRejectError", `Rejected event before write: ${reject}.`, "Remove raw prompts, transcripts, secrets, private paths, and private project names before appending state.") };
  }
  const sessionId = cleanSessionId(raw.sessionId || raw.session_id || options.session);
  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventId: raw.eventId || `${eventKind}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    eventSeq: Number(raw.eventSeq || 0),
    eventKind,
    sessionId,
    runId: String(raw.runId || raw.run_id || options.run || ""),
    projectFingerprint: raw.projectFingerprint || (raw.cwd || options.cwd ? stableHash(path.resolve(String(raw.cwd || options.cwd))) : ""),
    at: raw.at || nowIso(),
    data,
  };
  return { ok: true, event };
}

function nextEventSeq(events, event) {
  return events
    .filter((item) => item.sessionId === event.sessionId && (event.runId ? item.runId === event.runId : true))
    .reduce((max, item) => Math.max(max, Number(item.eventSeq || 0)), 0) + 1;
}

export function appendEvent(raw, options = {}) {
  const root = stateRoot(options.stateDir);
  const normalized = normalizeEvent(raw, options);
  if (!normalized.ok) return normalized;
  return withLock(root, () => {
    const paths = statePaths(root);
    const events = readEvents(root);
    const event = { ...normalized.event, eventSeq: normalized.event.eventSeq || nextEventSeq(events, normalized.event) };
    if (!options.dryRun) {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      fs.appendFileSync(paths.events, `${JSON.stringify(event)}\n`, { mode: 0o600 });
      rebuildViews(root, [...events, event]);
    }
    return { ok: true, event, statePath: paths.events, dryRun: Boolean(options.dryRun) };
  });
}

function latestEvent(events, predicate) {
  return events.filter(predicate).sort((left, right) => {
    const byTime = Date.parse(right.at || "") - Date.parse(left.at || "");
    if (Number.isFinite(byTime) && byTime !== 0) return byTime;
    return Number(right.eventSeq || 0) - Number(left.eventSeq || 0);
  })[0] || null;
}

export function compactHandoff(options = {}) {
  const root = stateRoot(options.stateDir);
  const events = options.events || readEvents(root);
  const selected = options.latest
    ? events
    : events.filter((event) => !options.session || event.sessionId === cleanSessionId(options.session));
  const latestCompact = latestEvent(selected, (event) => event.eventKind === "compact_pre" || event.eventKind === "compact_post");
  if (!latestCompact) {
    return { ok: true, found: false, handoff: null, text: "", statePath: statePaths(root).events };
  }
  const sessionId = latestCompact.sessionId;
  const sessionEvents = events.filter((event) => event.sessionId === sessionId);
  const latestPre = latestEvent(sessionEvents, (event) => event.eventKind === "compact_pre");
  const latestPost = latestEvent(sessionEvents, (event) => event.eventKind === "compact_post");
  const latestCheck = latestEvent(sessionEvents, (event) => event.eventKind === "check" && (event.data.category === "verification" || event.data.verification === true || event.data.command));
  const compactSeq = Math.max(Number(latestPre?.eventSeq || 0), Number(latestPost?.eventSeq || 0));
  const checkSeq = Number(latestCheck?.eventSeq || 0);
  const summary = latestPost?.data.compactSummary || latestPost?.data.summary || "summary_missing";
  const nextAction = latestPre?.data.nextAction || latestPost?.data.nextAction || "resume from the compact handoff";
  const task = latestPre?.data.task || latestPost?.data.task || latestPre?.data.plan || "active ETRNL work";
  const handoff = {
    sessionId,
    compactEventSeq: compactSeq,
    latestVerificationEventSeq: checkSeq,
    verificationStale: compactSeq > checkSeq,
    task,
    nextAction,
    summary,
    lastCompactAt: latestPost?.at || latestPre?.at || "",
  };
  const text = boundText(`Compact recovery: task=${task} next=${nextAction} verification_stale=${handoff.verificationStale} summary=${summary}`, options.maxChars || 1200);
  return { ok: true, found: true, handoff, text, statePath: statePaths(root).events };
}

export function stopStatus(options = {}) {
  const handoff = compactHandoff(options);
  const stale = Boolean(handoff.handoff?.verificationStale);
  return {
    ok: true,
    staleVerificationAfterCompact: stale,
    blockReason: stale ? "Verification is stale after compact. Rerun the relevant verification gate before claiming completion." : "",
    handoff: handoff.handoff,
  };
}

export function rebuildViews(root = stateRoot(), events = readEvents(root)) {
  const latest = compactHandoff({ stateDir: root, events, latest: true });
  writeAtomic(statePaths(root).compactView, `${JSON.stringify(latest, null, 2)}\n`);
}

export function boundText(value, maxChars = 1200) {
  return Array.from(String(value || "")).slice(0, Number(maxChars) || 1200).join("");
}

export function validateFixtureDir(dir) {
  const errors = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort() : [];
  for (const file of files) {
    const full = path.join(dir, file);
    const fixture = JSON.parse(fs.readFileSync(full, "utf8"));
    const event = fixture.event || fixture;
    const result = normalizeEvent(event);
    if (fixture.expectReject && result.ok) errors.push(`${file}: expected privacy/schema rejection`);
    if (!fixture.expectReject && !result.ok) errors.push(`${file}: ${result.error.message}`);
  }
  return { ok: errors.length === 0, files: files.length, errors };
}

export function beadLinkDryRun(options = {}) {
  const events = readEvents(stateRoot(options.stateDir));
  const candidates = events.filter((event) => event.eventKind === "context_entry" && ["blocker", "dependency", "follow_up", "claim"].includes(event.data.entryType));
  const noise = events.filter((event) => event.eventKind === "context_entry" && event.data.entryType === "active_execution").length;
  return { ok: true, dryRun: true, backlogCandidates: candidates.length, activeExecutionNoise: noise, wouldRunBd: false };
}

export function beadPrimeAudit(text = "") {
  const body = String(text || "");
  const prohibited = [
    { id: "beads-default-task-tracking", pattern: /\b(default|all)\s+task\s+tracking\b/i },
    { id: "beads-todowrite-doctrine", pattern: /\b(do not use|avoid|instead of)\s+TodoWrite\b/i },
    { id: "beads-session-close-protocol", pattern: /\bsession[-\s]+close\s+(protocol|checklist)\b/i },
    { id: "raw-beads-setup-hooks", pattern: /\bbd\s+setup\s+(claude|codex)\b/i },
  ].filter((rule) => rule.pattern.test(body));
  return {
    ok: true,
    allowed: prohibited.length === 0,
    command: "bead-prime-audit",
    prohibited: prohibited.map((rule) => rule.id),
    reason: prohibited.length > 0
      ? "Raw Beads startup doctrine is prohibited in this control plane; use ETRNL bead-link dry-run candidates only."
      : "No raw Beads startup doctrine detected.",
  };
}
