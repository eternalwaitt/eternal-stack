#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { argValue } from "./lib/cli-args.mjs";
import { cleanSessionId, readEvents, stateRoot, worktreeHash } from "./lib/etrnl-state-core.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const jsonMode = args.includes("--json");

const claudeHome = process.env.CLAUDE_HOME || path.join(homedir(), ".claude");

function retroLessonsPath() {
  return process.env.ETRNL_RETRO_LESSONS
    || path.join(claudeHome, "etrnl", "retro-lessons.jsonl");
}

function steeringAckPath() {
  return path.join(stateRoot(), "steering-acks.json");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function writeAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, value, { mode: 0o600 });
  renameSync(tmp, file);
}

function appendLesson(lesson) {
  const file = retroLessonsPath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(lesson)}\n`, { flag: "a", mode: 0o600 });
}

function commandFamily(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const bySeq = Number(left.eventSeq || 0) - Number(right.eventSeq || 0);
    if (bySeq !== 0) return bySeq;
    return Date.parse(left.at || "") - Date.parse(right.at || "");
  });
}

function resolveSessionId(events, requested) {
  const target = String(requested || "latest").trim();
  if (target && target !== "latest") return target;
  const latest = [...events].sort((left, right) => Date.parse(right.at || "") - Date.parse(left.at || ""))[0];
  return latest?.sessionId || "";
}

function verificationTreeHashFromEvent(event) {
  if (!event || typeof event !== "object") return "";
  if (event.eventKind === "doctor_green") return String(event.data?.treeHash || "");
  if (event.eventKind === "check") return String(event.data?.treeHash || "");
  return "";
}

function isVerificationCheck(event) {
  return event.eventKind === "check"
    && (event.data?.category === "verification" || event.data?.verification === true);
}

function compactStaleMetrics(sessionEvents) {
  const ordered = sortEvents(sessionEvents);
  let compactCount = 0;
  let compactStaleEvents = 0;
  let latestVerificationTreeHash = "";
  for (const event of ordered) {
    const verificationTreeHash = verificationTreeHashFromEvent(event);
    if (verificationTreeHash) latestVerificationTreeHash = verificationTreeHash;
    if (event.eventKind !== "compact_pre" && event.eventKind !== "compact_post") continue;
    compactCount += 1;
    if (event.eventKind !== "compact_post") continue;
    const treeHashAtCompact = String(event.data?.treeHashAtCompact || "");
    const explicitStale = event.data?.verificationStale === true;
    if (explicitStale) {
      compactStaleEvents += 1;
      continue;
    }
    if (treeHashAtCompact && latestVerificationTreeHash && treeHashAtCompact !== latestVerificationTreeHash) {
      compactStaleEvents += 1;
    } else if (treeHashAtCompact && !latestVerificationTreeHash) {
      compactStaleEvents += 1;
    }
  }
  return { compactCount, compactStaleEvents };
}

function lessonKey(type, seed) {
  return createHash("sha256").update(`${type}:${seed}`).digest("hex").slice(0, 16);
}

function buildEnvRemedyLessons(sessionEvents, sessionId, treeHash) {
  const lessons = [];
  const checks = sortEvents(sessionEvents).filter((event) => event.eventKind === "check" && event.data?.command);
  const byCommand = new Map();
  for (const event of checks) {
    const family = commandFamily(event.data.command);
    if (!family) continue;
    const bucket = byCommand.get(family) || { failedAt: "", passedAt: "", failedSeq: 0, passedSeq: 0 };
    const status = String(event.data.status || "").toLowerCase();
    const seq = Number(event.eventSeq || 0);
    if (status === "failed" && !bucket.failedAt) {
      bucket.failedAt = event.at || "";
      bucket.failedSeq = seq;
    }
    if (status === "passed" && seq > bucket.failedSeq) {
      bucket.passedAt = event.at || "";
      bucket.passedSeq = seq;
    }
    byCommand.set(family, bucket);
  }
  for (const [family, bucket] of byCommand.entries()) {
    if (!bucket.failedAt || !bucket.passedAt) continue;
    const verified = bucket.passedSeq > bucket.failedSeq;
    lessons.push({
      ts: nowIso(),
      type: "env_remedy",
      key: lessonKey("env_remedy", family),
      insight: `Command "${family}" failed then passed in-session; preserve the env/config remedy instead of re-diagnosing.`,
      confidence: verified ? 0.9 : 0.4,
      source: "distill",
      signal: family,
      sessionId,
      treeHash,
    });
  }
  return lessons;
}

function buildRedundantVerificationLessons(sessionEvents, sessionId, treeHash) {
  const lessons = [];
  const groups = new Map();
  for (const event of sessionEvents) {
    if (!isVerificationCheck(event)) continue;
    const family = commandFamily(event.data?.command || event.data?.name || "");
    const hash = String(event.data?.treeHash || treeHash || "");
    if (!family || !hash) continue;
    const key = `${family}|${hash}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  for (const [key, count] of groups.entries()) {
    if (count < 3) continue;
    const [family, hash] = key.split("|");
    lessons.push({
      ts: nowIso(),
      type: "redundant_verification",
      key: lessonKey("redundant_verification", key),
      insight: `Gate "${family}" ran ${count}x at unchanged tree hash; rerun only after meaningful code changes.`,
      confidence: 0.9,
      source: "distill",
      signal: `${family}@${hash.slice(0, 8)}`,
      sessionId,
      treeHash: hash,
    });
  }
  return lessons;
}

function buildCompactionLessons(sessionEvents, sessionId, treeHash) {
  const { compactCount, compactStaleEvents } = compactStaleMetrics(sessionEvents);
  if (compactCount < 2 || compactStaleEvents < 2) return [];
  return [{
    ts: nowIso(),
    type: "compaction_stale",
    key: lessonKey("compaction_stale", `${sessionId}:${compactStaleEvents}`),
    insight: `${compactCount} compactions reset stale verification ${compactStaleEvents}x; rerun targeted gates after compact before claiming done.`,
    confidence: 0.9,
    source: "distill",
    signal: `compactions=${compactCount};staleResets=${compactStaleEvents}`,
    sessionId,
    treeHash,
  }];
}

function eventFingerprint(event) {
  const data = event.data || {};
  return String(data.fingerprint || data.reviewerFingerprint || data.findingFingerprint || "");
}

function buildRecurringDefectLessons(sessionEvents, sessionId, treeHash) {
  const counts = new Map();
  const samples = new Map();
  for (const event of sessionEvents) {
    const fp = eventFingerprint(event);
    if (!fp) continue;
    const taskKey = String(event.runId || event.data?.taskId || event.data?.task || "session");
    const bucket = counts.get(fp) || new Set();
    bucket.add(taskKey);
    counts.set(fp, bucket);
    samples.set(fp, event);
  }
  const lessons = [];
  for (const [fp, tasks] of counts.entries()) {
    if (tasks.size < 2) continue;
    const sample = samples.get(fp);
    const summary = String(sample?.data?.summary || sample?.data?.finding || fp);
    lessons.push({
      ts: nowIso(),
      type: "recurring_defect",
      key: lessonKey("recurring_defect", fp),
      insight: `Reviewer fingerprint "${fp}" recurred across ${tasks.size} tasks (${summary.slice(0, 120)}).`,
      confidence: 0.9,
      source: "distill",
      signal: fp,
      sessionId,
      treeHash,
    });
  }
  return lessons;
}

function distill() {
  const sessionArg = argValue(args, "--session", "latest");
  const stateDir = argValue(args, "--state-dir");
  const events = readEvents(stateDir || stateRoot());
  const sessionId = resolveSessionId(events, sessionArg);
  if (!sessionId) {
    const payload = { ok: true, command: "distill", sessionId: "", lessons: [] };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.log("retroDistill session=none lessons=0");
    return;
  }
  const sessionEvents = events.filter((event) => event.sessionId === sessionId);
  const cwdEvent = [...sessionEvents].reverse().find((event) => event.cwd);
  const treeHash = worktreeHash(cwdEvent?.cwd || process.cwd());
  const candidates = [
    ...buildEnvRemedyLessons(sessionEvents, sessionId, treeHash),
    ...buildRedundantVerificationLessons(sessionEvents, sessionId, treeHash),
    ...buildCompactionLessons(sessionEvents, sessionId, treeHash),
    ...buildRecurringDefectLessons(sessionEvents, sessionId, treeHash),
  ];
  const existingKeys = new Set(parseJsonl(retroLessonsPath()).map((lesson) => `${lesson.type}:${lesson.key}`));
  const appended = [];
  for (const lesson of candidates) {
    const dedupe = `${lesson.type}:${lesson.key}`;
    if (existingKeys.has(dedupe)) continue;
    appendLesson(lesson);
    existingKeys.add(dedupe);
    appended.push(lesson);
  }
  const payload = { ok: true, command: "distill", sessionId, lessons: appended };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(`retroDistill session=${sessionId} lessons=${appended.length}`);
}

function scoreLesson(lesson) {
  const confidence = Number(lesson.confidence || 0);
  const ageMs = Date.now() - Date.parse(String(lesson.ts || ""));
  const recency = Number.isFinite(ageMs) ? Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000)) : 0;
  return confidence * (0.5 + 0.5 * recency);
}

function hints() {
  const maxChars = Number.parseInt(argValue(args, "--max-chars", process.env.ETRNL_LEARNING_HINT_MAX_CHARS || "500"), 10);
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 500;
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const lessons = parseJsonl(retroLessonsPath())
    .filter((lesson) => Number(lesson.confidence || 0) >= 0.3)
    .sort((left, right) => scoreLesson(right) - scoreLesson(left))
    .slice(0, 3);
  if (lessons.length === 0) return;
  const lines = ["Retro lessons:"];
  for (const lesson of lessons) {
    const line = `- [${lesson.type}] ${lesson.insight}`;
    const candidate = `${lines.join("\n")}\n${line}`;
    if ([...candidate].length > limit) break;
    lines.push(line);
  }
  if (lines.length === 1) return;
  const output = lines.join("\n");
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, command: "hints", text: output, count: lines.length - 1 }, null, 2));
    return;
  }
  console.log(output);
}

function prune() {
  const file = retroLessonsPath();
  const entries = parseJsonl(file);
  const byKey = new Map();
  for (const entry of entries) {
    const dedupe = `${entry.type}:${entry.key}`;
    const existing = byKey.get(dedupe);
    if (!existing || Date.parse(entry.ts || "") >= Date.parse(existing.ts || "")) {
      byKey.set(dedupe, entry);
    }
  }
  const decayed = [...byKey.values()].map((entry) => {
    const ageDays = (Date.now() - Date.parse(String(entry.ts || ""))) / (24 * 60 * 60 * 1000);
    const decaySteps = Math.floor(Math.max(ageDays, 0) / 30);
    const confidence = Math.max(0, Number(entry.confidence || 0) - decaySteps * 0.01);
    return { ...entry, confidence };
  });
  const active = decayed
    .filter((entry) => Number(entry.confidence || 0) >= 0.3)
    .sort((left, right) => scoreLesson(right) - scoreLesson(left))
    .slice(0, 500);
  const archived = decayed.length - active.length;
  writeAtomic(file, active.length > 0 ? `${active.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "");
  const payload = { ok: true, command: "prune", active: active.length, archived };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(`retroPrune active=${active.length} archived=${archived}`);
}

function loadHindsightConfig() {
  const configPath = path.join(process.env.HINDSIGHT_HOME || path.join(homedir(), ".hindsight"), "claude-code.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function canaryGreen() {
  const canary = path.resolve(path.dirname(new URL(import.meta.url).pathname), "canary-hindsight.sh");
  const result = spawnSync(canary, ["--json"], { encoding: "utf8", timeout: 5000 });
  if (result.status !== 0) return false;
  try {
    return JSON.parse(result.stdout).ok === true;
  } catch {
    return false;
  }
}

function projectBankId(cwd) {
  const base = path.basename(path.resolve(cwd || process.cwd())) || "project";
  return `etrnl/${base.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
}

function hindsightRetainPayload(cwd, lessons, dryRun = false) {
  const bank = projectBankId(cwd);
  const items = lessons.map((lesson) => ({
    content: lesson.insight,
    document_id: `etrnl/retro/${lesson.type}/${lesson.key}`,
    context: "etrnl",
    metadata: {
      kind: lesson.type,
      confidence: lesson.confidence,
      signal: lesson.signal,
      sessionId: lesson.sessionId,
      treeHash: lesson.treeHash,
      retention_policy: "retro_distilled_lesson",
    },
    tags: ["etrnl", "retro", lesson.type],
  }));
  return { bank, items, dryRun };
}

function hindsightRetain() {
  if (process.env.CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON === "1") {
    if (jsonMode) console.log(JSON.stringify({ ok: true, command: "hindsight-retain", retained: 0, skipped: "disabled" }));
    return;
  }
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const dryRun = args.includes("--dry-run");
  const lessons = parseJsonl(retroLessonsPath())
    .filter((lesson) => ["env_remedy", "recurring_defect"].includes(String(lesson.type)))
    .sort((left, right) => scoreLesson(right) - scoreLesson(left))
    .slice(0, 3);
  if (lessons.length === 0 || (!dryRun && !canaryGreen())) {
    if (jsonMode) console.log(JSON.stringify({ ok: true, command: "hindsight-retain", retained: 0, skipped: "unavailable" }));
    return;
  }
  const config = loadHindsightConfig();
  const apiUrl = String(config?.hindsightApiUrl || "").replace(/\/$/, "");
  if (!dryRun && !apiUrl) {
    if (jsonMode) console.log(JSON.stringify({ ok: true, command: "hindsight-retain", retained: 0, skipped: "no-api" }));
    return;
  }
  const { bank, items } = hindsightRetainPayload(cwd, lessons, dryRun);
  if (dryRun) {
    const payload = { ok: true, command: "hindsight-retain", retained: items.length, reflectAttempted: false, bank, items, dryRun: true };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.log(`retroHindsightRetain dryRun retained=${items.length}`);
    return;
  }
  const body = JSON.stringify({ items, async: true });
  const retainResult = spawnSync("curl", ["-fsS", "--max-time", "3", "-X", "POST", `${apiUrl}/v1/default/banks/${encodeURIComponent(bank)}/memories`, "-H", "Content-Type: application/json", ...(config?.hindsightApiToken ? ["-H", `Authorization: Bearer ${config.hindsightApiToken}`] : []), "--data", body], { encoding: "utf8" });
  let reflectAttempted = false;
  const reflectUrl = `${apiUrl}/v1/default/banks/${encodeURIComponent(bank)}/reflect`;
  if (retainResult.status === 0) {
    const reflectResult = spawnSync("curl", ["-fsS", "--max-time", "3", "-X", "POST", reflectUrl, "-H", "Content-Type: application/json", ...(config?.hindsightApiToken ? ["-H", `Authorization: Bearer ${config.hindsightApiToken}`] : []), "--data", "{}"], { encoding: "utf8" });
    reflectAttempted = reflectResult.status === 0;
  }
  const payload = {
    ok: true,
    command: "hindsight-retain",
    retained: retainResult.status === 0 ? items.length : 0,
    reflectAttempted,
    bank,
  };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(`retroHindsightRetain retained=${payload.retained} reflect=${reflectAttempted}`);
}

function resolveWorklogPath(cwd, explicit = "") {
  if (explicit) return path.resolve(explicit);
  for (const candidate of [".etrnl/worklog.md", ".etrnl/WORKLOG.md"]) {
    const full = path.join(cwd, candidate);
    if (existsSync(full)) return full;
  }
  return "";
}

function snapshotSession() {
  const sessionArg = argValue(args, "--session", "latest");
  const stateDir = argValue(args, "--state-dir");
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const worklogArg = argValue(args, "--worklog");
  const root = stateDir || stateRoot();
  const events = readEvents(root);
  const sessionId = resolveSessionId(events, sessionArg);
  if (!sessionId) {
    const payload = { ok: true, command: "snapshot", sessionId: "", sessionSnapshotPath: "", worklogPath: "" };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const sessionEvents = events.filter((event) => event.sessionId === sessionId);
  const snapDir = path.join(root, "snapshots");
  const snapFile = path.join(snapDir, `${cleanSessionId(sessionId)}.jsonl`);
  writeAtomic(snapFile, sessionEvents.length > 0 ? `${sessionEvents.map((event) => JSON.stringify(event)).join("\n")}\n` : "");
  const worklogFull = resolveWorklogPath(cwd, worklogArg);
  const worklogPath = worklogFull ? path.relative(cwd, worklogFull) || path.basename(worklogFull) : "";
  const payload = {
    ok: true,
    command: "snapshot",
    sessionId,
    sessionSnapshotPath: path.relative(root, snapFile) || path.basename(snapFile),
    worklogPath,
  };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(`retroSnapshot session=${sessionId} events=${sessionEvents.length}`);
}

function snapshotMeta() {
  const sessionArg = argValue(args, "--session", "latest");
  const stateDir = argValue(args, "--state-dir");
  const events = readEvents(stateDir || stateRoot());
  const sessionId = resolveSessionId(events, sessionArg);
  const latestPre = [...events]
    .filter((event) => event.sessionId === sessionId && event.eventKind === "compact_pre")
    .sort((left, right) => {
      const bySeq = Number(right.eventSeq || 0) - Number(left.eventSeq || 0);
      if (bySeq !== 0) return bySeq;
      return Date.parse(right.at || "") - Date.parse(left.at || "");
    })[0];
  const data = latestPre?.data || {};
  const payload = {
    ok: true,
    command: "snapshot-meta",
    sessionId,
    sessionSnapshotPath: String(data.sessionSnapshotPath || ""),
    worklogPath: String(data.worklogPath || ""),
  };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(`retroSnapshotMeta session=${sessionId || "none"}`);
}

function formatSnapshotHint(meta) {
  const parts = [];
  if (meta.sessionSnapshotPath) parts.push(`session history=${path.basename(meta.sessionSnapshotPath)}`);
  if (meta.worklogPath) parts.push(`worklog=${path.basename(meta.worklogPath)}`);
  return parts.length > 0 ? `Lossless compact history: ${parts.join("; ")}.` : "";
}

function steeringHint() {
  const cwd = path.resolve(argValue(args, "--cwd", process.cwd()));
  const steeringFile = path.join(cwd, ".etrnl", "STEERING.md");
  if (!existsSync(steeringFile)) return "";
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(steeringFile).mtimeMs;
  } catch {
    return "";
  }
  let acks = {};
  const ackFile = steeringAckPath();
  if (existsSync(ackFile)) {
    try {
      acks = JSON.parse(readFileSync(ackFile, "utf8"));
    } catch {
      acks = {};
    }
  }
  const projectKey = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  const lastAck = Number(acks[projectKey] || 0);
  if (mtimeMs <= lastAck) return "";
  acks[projectKey] = Date.now();
  writeAtomic(ackFile, `${JSON.stringify(acks, null, 2)}\n`);
  return "Steering file has updates: complete its items before resuming the plan.";
}

function help() {
  console.error(`usage: etrnl-retro.mjs distill|hints|prune|snapshot|snapshot-meta|hindsight-retain|steering-hint [--session <id|latest>] [--max-chars <n>] [--cwd <path>] [--state-dir <path>] [--worklog <path>] [--dry-run] [--json]`);
  process.exit(2);
}

if (command === "distill") distill();
else if (command === "hints") hints();
else if (command === "prune") prune();
else if (command === "snapshot") snapshotSession();
else if (command === "snapshot-meta") snapshotMeta();
else if (command === "hindsight-retain") hindsightRetain();
else if (command === "steering-hint") {
  const hint = steeringHint();
  if (jsonMode) console.log(JSON.stringify({ ok: true, command: "steering-hint", text: hint }, null, 2));
  else if (hint) console.log(hint);
}
else if (command === "snapshot-hint") {
  const sessionArg = argValue(args, "--session", "latest");
  const stateDir = argValue(args, "--state-dir");
  const events = readEvents(stateDir || stateRoot());
  const sessionId = resolveSessionId(events, sessionArg);
  const latestPre = [...events]
    .filter((event) => event.sessionId === sessionId && event.eventKind === "compact_pre")
    .sort((left, right) => Number(right.eventSeq || 0) - Number(left.eventSeq || 0))[0];
  const text = formatSnapshotHint({
    sessionSnapshotPath: String(latestPre?.data?.sessionSnapshotPath || ""),
    worklogPath: String(latestPre?.data?.worklogPath || ""),
  });
  if (jsonMode) console.log(JSON.stringify({ ok: true, command: "snapshot-hint", text }, null, 2));
  else if (text) console.log(text);
}
else help();
