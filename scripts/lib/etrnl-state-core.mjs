import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Current durable ETRNL state event schema version written to local JSONL state. */
export const SCHEMA_VERSION = 1;
/** Event kinds accepted by the ETRNL state normalizer before append. */
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
  "doctor_green",
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
const DEFAULT_LOCK_STALE_MS = 120_000;
const configuredPrivateProjectNames = (process.env.ETRNL_STATE_PRIVATE_PROJECT_NAMES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const privateProjectPattern = configuredPrivateProjectNames.length > 0
  ? new RegExp(`\\b(${configuredPrivateProjectNames.map(escapeRegex).join("|")})\\b`)
  : null;
const SECRET_PATTERNS = [
  /sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /npm_[A-Za-z0-9]{20,}/,
  /AKIA[A-Z0-9]{16}/,
  /BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY/,
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read a CLI flag value from argv-style tokens, supporting `--flag value` and `--flag=value`. */
export function flagValue(args, flag, fallback = "") {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1) || fallback;
  }
  return fallback;
}

/** Collect positional CLI arguments while skipping known flags that consume values. */
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

/** Resolve the local ETRNL state root from an explicit path, environment, or Claude home default. */
export function stateRoot(explicit = "") {
  return path.resolve(explicit || process.env.ETRNL_STATE_DIR || path.join(process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude"), "etrnl", "state"));
}

/** Build all filesystem paths owned by the local ETRNL state store for a root. */
export function statePaths(root = stateRoot()) {
  return {
    root,
    events: path.join(root, "events.jsonl"),
    views: path.join(root, "views"),
    compactView: path.join(root, "views", "compact-handoff.json"),
    lock: path.join(root, ".events.lock"),
  };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Produce a short stable hash for privacy-preserving project and packet fingerprints. */
export function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 16);
}

/** Return a stable fingerprint of the git worktree at cwd, or "" when unknown. */
export function worktreeHash(cwd = process.cwd()) {
  try {
    const resolved = path.resolve(String(cwd || process.cwd()));
    // stderr must be discarded: a non-git cwd makes git print "fatal: not a git
    // repository", which would leak into callers that merge stderr into JSON output.
    // 2s timeout: git status/diff on a large dirty tree under parallel suite load
    // regularly exceeds 200ms; a timeout here returns "" and poisons freshness
    // comparisons into false "stale verification" failures. The 5MB maxBuffer
    // matters for the same reason: a dirty tree whose diff exceeds the buffer
    // throws ENOBUFS, returns "", and fakes a stale verification (one lockfile
    // regeneration is enough to exceed the old 512KB cap).
    const opts = { cwd: resolved, encoding: "utf8", maxBuffer: 5 * 1024 * 1024, timeout: 2000, stdio: ["ignore", "pipe", "ignore"] };
    const headTree = execSync("git rev-parse HEAD^{tree}", opts).trim();
    const status = execSync("git status --porcelain=v1", opts);
    const diff = execSync("git diff", opts);
    const diffCached = execSync("git diff --cached", opts);
    return crypto.createHash("sha256").update(`${headTree}\n${status}\n${diff}\n${diffCached}`).digest("hex");
  } catch {
    return "";
  }
}

/** Return an ISO timestamp without millisecond noise for stable event records. */
export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Build a machine-readable ETRNL state error with a diagnostic command. */
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

/** Normalize a session id so it is safe for local event records and lookup keys. */
export function cleanSessionId(value = "") {
  return String(value || process.env.CLAUDE_SESSION_ID || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
}

/** Read and parse the append-only event log, skipping corrupt JSONL lines.
 * A crash or disk-full mid-append leaves a truncated final line; throwing here
 * would permanently brick every reader AND every future append (appendEvent
 * reads before writing), so malformed lines are skipped and counted instead. */
export function readEvents(root = stateRoot()) {
  const file = statePaths(root).events;
  if (!fs.existsSync(file)) return [];
  const events = [];
  let malformed = 0;
  for (const [index, line] of fs.readFileSync(file, "utf8").split(/\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      malformed += 1;
      if (malformed === 1) {
        process.stderr.write(`etrnl-state warning: skipping malformed JSONL at ${file}:${index + 1}\n`);
      }
    }
  }
  if (malformed > 1) {
    process.stderr.write(`etrnl-state warning: skipped ${malformed} malformed JSONL lines in ${file}\n`);
  }
  return events;
}

function writeAtomic(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, value, { mode });
  fs.renameSync(tmp, file);
}

function sleepSync(ms) {
  // Atomics.wait blocks the thread without burning a core, unlike a busy spin.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockWaitBudgetMs() {
  const raw = Number(process.env.ETRNL_STATE_LOCK_WAIT_MS || 10_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}

function lockStaleMs() {
  const raw = Number(process.env.ETRNL_STATE_LOCK_STALE_MS || DEFAULT_LOCK_STALE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOCK_STALE_MS;
}

function removeStaleLock(lock) {
  try {
    const stat = fs.statSync(lock);
    if (Date.now() - stat.mtimeMs < lockStaleMs()) return false;
    const owner = readJson(path.join(lock, "owner.json"), null);
    const pid = Number(owner?.pid || 0);
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        fs.utimesSync(lock, new Date(), new Date());
        return false;
      } catch (error) {
        if (!error || typeof error !== "object" || !["ESRCH", "EPERM"].includes(error.code)) throw error;
        if (error.code === "EPERM") return false;
      }
    }
    fs.rmSync(lock, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return true;
    throw error;
  }
}

/** Run a synchronous critical section under the state store lock directory. */
export function withLock(root, fn) {
  const { lock } = statePaths(root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  let acquired = false;
  // Elapsed-time budget (default 10s, ETRNL_STATE_LOCK_WAIT_MS): a competing
  // writer legitimately holds this lock for seconds (full log parse plus git
  // subprocesses), so a short fixed attempt count times out spuriously under
  // load and silently drops events.
  const deadline = Date.now() + lockWaitBudgetMs();
  let sleepMs = 25;
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      try {
        fs.writeFileSync(path.join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid, at: nowIso() })}\n`, { mode: 0o600 });
      } catch (ownerError) {
        // An ownerless lock directory would block every later withLock caller,
        // so release the just-created lock before propagating the failure.
        fs.rmSync(lock, { recursive: true, force: true });
        throw ownerError;
      }
      acquired = true;
      break;
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      if (removeStaleLock(lock)) continue;
      sleepSync(sleepMs);
      sleepMs = Math.min(sleepMs * 2, 250);
    }
  }
  if (!acquired) throw Object.assign(new Error("ETRNL state lock timed out"), { code: "StateLockTimeout" });
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function hasPrivateAbsolutePathString(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return /^~($|\/)/.test(normalized) ||
    /^\/(?:Users|home|mnt|Volumes|private|tmp|var)\//i.test(normalized) ||
    /^[A-Za-z]:\//.test(normalized);
}

function hasAbsoluteChangedFile(value) {
  if (Array.isArray(value)) return value.some(hasAbsoluteChangedFile);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => hasPrivateAbsolutePathString(key) || hasAbsoluteChangedFile(child));
  }
  return typeof value === "string" && hasPrivateAbsolutePathString(value);
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
  if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) return "secret-looking token";
  if (/\.codex\/sessions|\.claude\/projects/.test(value)) return "private transcript path";
  if (hasPrivateAbsolutePathString(value)) return "private absolute path";
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

/** Validate, privacy-check, and normalize a raw event before append. */
export function normalizeEvent(raw, options = {}) {
  const eventKind = String(raw.eventKind || raw.kind || options.eventKind || "").trim();
  if (!EVENT_KINDS.has(eventKind)) {
    return { ok: false, error: jsonError("SchemaValidationError", `Unsupported eventKind: ${eventKind || "<missing>"}`, "Use one of the documented ETRNL event kinds.") };
  }
  const data = eventData(raw);
  if (hasAbsoluteChangedFile(data.changedFiles)) {
    return { ok: false, error: jsonError("PrivacyRejectError", "changedFiles must contain relative paths only.", "Store only repo-relative paths or counts in ETRNL state.") };
  }
  const reject = privacyReject(data);
  if (reject) {
    return { ok: false, error: jsonError("PrivacyRejectError", `Rejected event before write: ${reject}.`, "Remove raw prompts, transcripts, secrets, private paths, and private project names before appending state.") };
  }
  const metadataReject = privacyReject({
    eventId: raw.eventId,
    runId: raw.runId || raw.run_id,
    at: raw.at,
    projectFingerprint: raw.projectFingerprint,
  });
  if (metadataReject) {
    return { ok: false, error: jsonError("PrivacyRejectError", `Rejected event metadata before write: ${metadataReject}.`, "Keep event identifiers, timestamps, and fingerprints token-free and path-free.") };
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
  if (eventKind === "check" && (data.category === "verification" || data.verification === true) && !data.treeHash) {
    const hashCwd = raw.cwd || options.cwd;
    if (hashCwd) data.treeHash = worktreeHash(path.resolve(String(hashCwd)));
  }
  event.data = data;
  return { ok: true, event };
}

function nextEventSeq(events, event) {
  return events
    .filter((item) => item.sessionId === event.sessionId && (event.runId ? item.runId === event.runId : true))
    .reduce((max, item) => Math.max(max, Number(item.eventSeq || 0)), 0) + 1;
}

// Only these kinds feed the compact-handoff view; rebuilding it for every
// tool_signal/context_entry append is pure overhead inside the lock.
const VIEW_EVENT_KINDS = new Set(["compact_pre", "compact_post", "check"]);

function rotateKeepDays() {
  const raw = Number(process.env.ETRNL_STATE_ROTATE_KEEP_DAYS || 14);
  return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

function rotateThresholdBytes() {
  const raw = Number(process.env.ETRNL_STATE_ROTATE_BYTES || 5 * 1024 * 1024);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * 1024 * 1024;
}

/** Rotate the event log when it exceeds the size threshold: recent events stay
 * hot, older ones move to a dated archive file in the same directory. Must be
 * called while holding the state lock. Hot readers only need recent events
 * (latest session / compact handoff), and eventSeq is per-session, so no index
 * migration is needed. Without rotation, every append re-parses an ever-growing
 * log and total append cost grows quadratically with age. */
function rotateEventsLocked(root, paths, events) {
  let size = 0;
  try {
    size = fs.statSync(paths.events).size;
  } catch {
    return events;
  }
  if (size < rotateThresholdBytes()) return events;
  const cutoff = Date.now() - rotateKeepDays() * 86_400_000;
  const keep = [];
  const archive = [];
  for (const event of events) {
    const at = Date.parse(event.at || "");
    (Number.isFinite(at) && at >= cutoff ? keep : archive).push(event);
  }
  if (archive.length === 0) return events;
  const archiveFile = path.join(root, `events-archive-${new Date().toISOString().slice(0, 10)}.jsonl`);
  fs.appendFileSync(archiveFile, `${archive.map((event) => JSON.stringify(event)).join("\n")}\n`, { mode: 0o600 });
  writeAtomic(paths.events, keep.length > 0 ? `${keep.map((event) => JSON.stringify(event)).join("\n")}\n` : "");
  return keep;
}

/** Append a normalized event to local state and rebuild derived views unless dry-run is set. */
export function appendEvent(raw, options = {}) {
  const root = stateRoot(options.stateDir);
  const normalized = normalizeEvent(raw, options);
  if (!normalized.ok) return normalized;
  return withLock(root, () => {
    const paths = statePaths(root);
    let events = readEvents(root);
    const event = { ...normalized.event, eventSeq: normalized.event.eventSeq || nextEventSeq(events, normalized.event) };
    if (!options.dryRun) {
      events = rotateEventsLocked(root, paths, events);
      const nextEvents = [...events, event];
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      if (VIEW_EVENT_KINDS.has(event.eventKind)) rebuildViews(root, nextEvents);
      fs.appendFileSync(paths.events, `${JSON.stringify(event)}\n`, { mode: 0o600 });
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

function isVerificationCheckEvent(event) {
  return event.eventKind === "check"
    && (event.data?.category === "verification" || event.data?.verification === true)
    && event.data?.status !== "failed";
}

function verificationStaleAfterCompact(compactSeq, checkSeq, currentHash, checkTreeHash) {
  if (compactSeq <= checkSeq) return false;
  if (!currentHash || !checkTreeHash) return true;
  return currentHash !== checkTreeHash;
}

/** Build the latest compact handoff packet and verification-staleness signal. */
export function compactHandoff(options = {}) {
  const root = stateRoot(options.stateDir);
  const events = options.events || readEvents(root);
  const requestedSession = cleanSessionId(options.session);
  const selected = options.latest
    ? events
    : events.filter((event) => requestedSession && event.sessionId === requestedSession);
  const latestCompact = latestEvent(selected, (event) => event.eventKind === "compact_pre" || event.eventKind === "compact_post");
  if (!latestCompact) {
    return { ok: true, found: false, handoff: null, text: "", statePath: statePaths(root).events };
  }
  const sessionId = latestCompact.sessionId;
  const sessionEvents = events.filter((event) => event.sessionId === sessionId);
  const latestPre = latestEvent(sessionEvents, (event) => event.eventKind === "compact_pre");
  const latestPost = latestEvent(sessionEvents, (event) => event.eventKind === "compact_post");
  const latestCheck = latestEvent(sessionEvents, isVerificationCheckEvent);
  const latestCompactForSession = Number(latestPre?.eventSeq || 0) > Number(latestPost?.eventSeq || 0) ? latestPre : latestPost;
  const compactSeq = Number(latestCompactForSession?.eventSeq || 0);
  const checkSeq = Number(latestCheck?.eventSeq || 0);
  const hashCwd = options.cwd || process.cwd();
  const latestVerificationTreeHash = String(latestCheck?.data?.treeHash || "");
  // worktreeHash spawns 4 git subprocesses (up to 2s each); only pay that when
  // the staleness comparison actually needs the current hash. When the latest
  // verification is newer than the compact, freshness is decided by sequence.
  const currentTreeHash = compactSeq > checkSeq ? worktreeHash(hashCwd) : "";
  const verificationStale = verificationStaleAfterCompact(compactSeq, checkSeq, currentTreeHash, latestVerificationTreeHash);
  const summary = latestCompactForSession?.data.compactSummary || latestCompactForSession?.data.summary || "summary_missing";
  const nextAction = latestCompactForSession?.data.nextAction || "resume from the compact handoff";
  const task = latestCompactForSession?.data.task || latestCompactForSession?.data.plan || "active ETRNL work";
  const handoff = {
    sessionId,
    compactEventSeq: compactSeq,
    latestVerificationEventSeq: checkSeq,
    verificationStale,
    currentTreeHash,
    latestVerificationTreeHash,
    treeHashAtCompact: String(latestPost?.data?.treeHashAtCompact || latestCompactForSession?.data?.treeHashAtCompact || ""),
    task,
    nextAction,
    summary,
    lastCompactAt: latestCompactForSession?.at || "",
  };
  const text = boundText(`Compact recovery: task=${task} next=${nextAction} verification_stale=${handoff.verificationStale} summary=${summary}`, options.maxChars || 1200);
  return { ok: true, found: true, handoff, latestCompact, text, statePath: statePaths(root).events };
}

/** Return the Stop-hook status derived from compact handoff verification freshness. */
export function stopStatus(options = {}) {
  const handoff = compactHandoff(options);
  const stale = Boolean(handoff.handoff?.verificationStale);
  return {
    ok: true,
    staleVerificationAfterCompact: stale,
    blockReason: stale ? "Verification is stale after compact. Rerun the relevant verification gate before claiming completion." : "",
    handoff: handoff.handoff,
    currentTreeHash: handoff.handoff?.currentTreeHash || "",
    latestVerificationTreeHash: handoff.handoff?.latestVerificationTreeHash || "",
  };
}

/** Rebuild derived state views from the append-only event log. */
export function rebuildViews(root = stateRoot(), events = readEvents(root)) {
  const latest = compactHandoff({ stateDir: root, events, latest: true });
  writeAtomic(statePaths(root).compactView, `${JSON.stringify(latest, null, 2)}\n`);
}

/** Bound text by Unicode code points for compact handoff and hook output. */
export function boundText(value, maxChars = 1200) {
  return Array.from(String(value || "")).slice(0, Number(maxChars) || 1200).join("");
}

/** Validate every JSON fixture in a directory against state event normalization rules. */
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

/** Count ETRNL context events that would be projected into Beads backlog state. */
export function beadLinkDryRun(options = {}) {
  const events = readEvents(stateRoot(options.stateDir));
  const candidates = events.filter((event) => event.eventKind === "context_entry" && ["blocker", "dependency", "follow_up", "claim"].includes(event.data.entryType));
  const noise = events.filter((event) => event.eventKind === "context_entry" && event.data.entryType === "active_execution").length;
  return { ok: true, dryRun: true, backlogCandidates: candidates.length, activeExecutionNoise: noise, wouldRunBd: false };
}

/** Detect raw Beads startup doctrine that must not be injected into ETRNL sessions. */
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
      ? "Raw Beads startup doctrine is prohibited in the Eternal Stack; use ETRNL bead-link dry-run candidates only."
      : "No raw Beads startup doctrine detected.",
  };
}
