#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const fixtureRoot = argValue(args, "--fixture");
const root = argValue(args, "--root", fixtureRoot || "");
const claudeRoot = expandHome(argValue(args, "--claude-root", root || "~/.claude/projects"));
const codexRoot = expandHome(argValue(args, "--codex-root", root || "~/.codex/sessions"));
const sinceDays = Number(argValue(args, "--since-days", fixtureRoot ? "0" : "10")) || 0;
const cutoffMs = sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : 0;

const SECRET_PATTERN = /sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{20,}|\b(?:AKIA|ASIA|OCI)[A-Z0-9]{12,}\b|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const PRIVATE_PATH_PATTERN = /(?:\/Users\/[^/"\s]+|\/home\/[^/"\s]+|\/root(?:\/|["\s]|$)|[A-Za-z]:\\\\Users\\\\[^\\/"\s]+)/;
const REDACT_PATH_PATTERN = /(?:\/Users\/[^/"\s]+(?:\/[^"'\s]*)?|\/home\/[^/"\s]+(?:\/[^"'\s]*)?|\/root(?:\/[^"'\s]*)?|[A-Za-z]:\\\\Users\\\\[^\\/"\s]+(?:\\\\[^"'\s]*)?)/g;
const RAW_TEXT_FIELD_PATTERN = /"(?:promptText|rawPrompt|transcriptText|toolResultBody|messageText)"\s*:/;

function expandHome(value) {
  if (!value.startsWith("~")) return value;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || "/tmp";
  return `${home}${value.slice(1)}`;
}
function usage() {
  console.error("usage: session-deep-dive.mjs [--fixture <dir>|--root <dir>|--claude-root <dir> --codex-root <dir>] [--since-days N] [--json]");
  process.exit(2);
}
function redactPrivate(value) {
  return String(value || "").replace(REDACT_PATH_PATTERN, "<private-path>");
}
function listFiles(dir, out = []) {
  if (!dir || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile() && /\.(jsonl|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}
function recentEnough(file) {
  if (!cutoffMs) return true;
  try {
    return statSync(file).mtimeMs >= cutoffMs;
  } catch {
    return false;
  }
}
function parseFile(file) {
  const raw = readFileSync(file, "utf8");
  if (file.endsWith(".jsonl")) {
    return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return { value: JSON.parse(line), line: index + 1 };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`invalid JSONL row ${index + 1}: ${detail}`);
      }
    });
  }
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [parsed];
    return rows.map((value, index) => ({ value, line: index + 1 }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON file: ${detail}`);
  }
}
function sourceFor(file, raw) {
  const explicit = String(raw.source || raw.agent || "").toLowerCase();
  if (explicit.includes("claude")) return "claude";
  if (explicit.includes("codex")) return "codex";
  const normalized = file.split(path.sep).join("/");
  if (/\/claude\//i.test(normalized)) return "claude";
  if (/\/codex\//i.test(normalized)) return "codex";
  return "unknown";
}
function sessionIdFor(file, raw) {
  return String(raw.session_id || raw.sessionId || raw.conversation_id || raw.conversationId || path.basename(file));
}
function timestampFor(raw) {
  return raw.timestamp || raw.created_at || raw.createdAt || raw.at || raw.time || "";
}
function commandFrom(raw, contentItem = null) {
  const input = contentItem?.input || raw.tool_input || raw.toolInput || raw.input || raw.arguments || {};
  return String(raw.command || raw.cmd || input.command || input.cmd || "");
}
function toolNames(raw) {
  const names = [];
  for (const value of [raw.tool_name, raw.toolName, raw.tool, raw.name, raw.function?.name]) {
    if (typeof value === "string" && value.trim()) names.push(value.trim());
  }
  const content = Array.isArray(raw.message?.content) ? raw.message.content : [];
  for (const item of content) {
    if (item?.type === "tool_use" && typeof item.name === "string") names.push(item.name);
  }
  return [...new Set(names)];
}
function hasPrivateMaterial(raw) {
  const text = JSON.stringify(raw);
  return SECRET_PATTERN.test(text) || PRIVATE_PATH_PATTERN.test(text) || RAW_TEXT_FIELD_PATTERN.test(text);
}
function toolEvent(raw, file, seq, contentItem = null) {
  const names = contentItem?.name ? [contentItem.name] : toolNames(raw);
  const toolName = names[0] || "";
  const command = commandFrom(raw, contentItem);
  const haystack = `${toolName} ${command}`;
  const lower = haystack.toLowerCase();
  const isTool = Boolean(toolName || command || raw.type === "function_call" || raw.type === "tool_use");
  const isCodegraph = /codegraph/.test(lower);
  const isBeads = /\bbeads?\b/.test(lower) || /\bbd\s+/.test(` ${lower} `);
  const isHindsight = /hindsight/.test(lower) || /hindsight/i.test(String(raw.type || raw.eventKind || raw.name || ""));
  const isEdit = /\b(edit|multiedit|write|apply_patch|create_text_file|replace_content|insert_after_symbol|insert_before_symbol|replace_symbol_body)\b/i.test(toolName)
    || /\b(apply_patch|>\s*["']?[^|&;]+|tee\s+)/.test(command);
  const isSearch = /\b(grep|glob|rg|ripgrep|fd|find_symbol|search_for_pattern|codegraph_search)\b/i.test(toolName)
    || /\b(rg|fd)\b/.test(command);
  const isRead = /\b(read|read_file|bat|cat|sed|nl|head|tail|git show|rg --files)\b/i.test(toolName)
    || /\b(bat|cat|sed|nl|head|tail)\b|\brg\s+--files\b|\bgit\s+show\b/.test(command);
  return {
    source: sourceFor(file, raw),
    sessionId: sessionIdFor(file, raw),
    timestamp: timestampFor(raw),
    seq,
    kind: "event",
    isTool,
    isEdit,
    isRead,
    isSearch,
    isCodegraph,
    isBeads,
    isHindsight,
    isHook: false,
    isStopBlock: false,
    stopCategory: "",
    isTextOnly: isTextOnly(raw),
    privateInput: hasPrivateMaterial(raw),
  };
}
function isTextOnly(raw) {
  if (toolNames(raw).length > 0 || commandFrom(raw)) return false;
  if (["assistant", "user", "message"].includes(String(raw.type || "").toLowerCase())) return true;
  const content = raw.message?.content;
  return Array.isArray(content) && content.some((item) => item?.type === "text");
}
function stopReason(raw) {
  return String(raw.reason || raw.message || raw.error || raw.blockingError?.blockingError || raw.blockingError?.message || raw.hookSpecificOutput?.permissionDecisionReason || "");
}
function stopCategory(reason) {
  if (/verif|test|lint|typecheck|build|check/i.test(reason)) return "verification";
  if (/skill|reviewer|review|tdd|simplifier/i.test(reason)) return "skill";
  if (/privacy|secret|credential|private/i.test(reason)) return "privacy";
  if (/ledger|plan|phase|scope/i.test(reason)) return "execution";
  return "other";
}
function hookEvent(raw, file, seq) {
  const hook = String(raw.hook || raw.hookName || raw.eventKind || raw.type || "");
  const reason = stopReason(raw);
  const isStop = /stop/i.test(hook);
  const isBlocked = /block|deny/i.test(String(raw.status || raw.decision || raw.outcome || reason));
  return {
    source: sourceFor(file, raw),
    sessionId: sessionIdFor(file, raw),
    timestamp: timestampFor(raw),
    seq,
    kind: "event",
    isTool: false,
    isEdit: false,
    isRead: false,
    isSearch: false,
    isCodegraph: false,
    isBeads: false,
    isHindsight: /hindsight/i.test(hook),
    isHook: true,
    isStopBlock: isStop && isBlocked,
    stopCategory: isStop && isBlocked ? stopCategory(reason) : "",
    isTextOnly: false,
    privateInput: hasPrivateMaterial(raw),
  };
}
function eventsFromRow(raw, file, seq) {
  if (raw.hook || /hook|stop/i.test(String(raw.type || raw.eventKind || ""))) return [hookEvent(raw, file, seq)];
  const content = Array.isArray(raw.message?.content) ? raw.message.content : [];
  const toolUses = content.filter((item) => item?.type === "tool_use" && item.name);
  if (toolUses.length > 0) return toolUses.map((item, index) => toolEvent(raw, file, seq + index / 100, item));
  return [toolEvent(raw, file, seq)];
}
function loadEvents() {
  const roots = fixtureRoot ? [fixtureRoot] : [claudeRoot, codexRoot];
  const files = [...new Set(roots.flatMap((dir) => listFiles(dir)).filter(recentEnough))].sort();
  const events = [];
  let rowsScanned = 0;
  for (const file of files) {
    for (const row of parseFile(file)) {
      rowsScanned += 1;
      const parsed = Date.parse(timestampFor(row.value));
      if (cutoffMs && Number.isFinite(parsed) && parsed > 0 && parsed < cutoffMs) continue;
      events.push(...eventsFromRow(row.value, file, events.length + 1));
    }
  }
  return { events, filesScanned: files.length, rowsScanned };
}
function emptySession(source) {
  return { source, events: [], edits: 0, reads: 0, searches: 0, codegraphCalls: 0, beadsCalls: 0, hindsightSignals: 0, hooks: 0, stopBlocks: 0 };
}
function summarize() {
  const loaded = loadEvents();
  const sessions = new Map();
  const stopCategories = {};
  let privateRows = 0;
  for (const event of loaded.events) {
    if (!sessions.has(event.sessionId)) sessions.set(event.sessionId, emptySession(event.source));
    const session = sessions.get(event.sessionId);
    session.events.push(event);
    if (event.privateInput) privateRows += 1;
    if (event.isEdit) session.edits += 1;
    if (event.isRead) session.reads += 1;
    if (event.isSearch) session.searches += 1;
    if (event.isCodegraph) session.codegraphCalls += 1;
    if (event.isBeads) session.beadsCalls += 1;
    if (event.isHindsight) session.hindsightSignals += 1;
    if (event.isHook) session.hooks += 1;
    if (event.isStopBlock) {
      session.stopBlocks += 1;
      stopCategories[event.stopCategory] = (stopCategories[event.stopCategory] || 0) + 1;
    }
  }
  const totals = { sessionCount: sessions.size, codeEligibleSessions: 0, edits: 0, reads: 0, searches: 0, codegraphCalls: 0, beadsCalls: 0, hindsightSignals: 0, hooks: 0, stopBlocks: 0, highWorkNoCodeGraphSessions: 0 };
  const beforeFirstEdit = { codegraph: 0, beads: 0, hindsight: 0, anyTool: 0 };
  const immediateFollowUp = { tool: 0, textOnly: 0, none: 0 };
  for (const session of sessions.values()) {
    session.events.sort((left, right) => (Date.parse(left.timestamp) || 0) - (Date.parse(right.timestamp) || 0) || left.seq - right.seq);
    for (const key of ["edits", "reads", "searches", "codegraphCalls", "beadsCalls", "hindsightSignals", "hooks", "stopBlocks"]) totals[key] += session[key];
    const codeEligible = session.edits > 0 || session.reads + session.searches >= 2 || session.codegraphCalls > 0;
    if (codeEligible) totals.codeEligibleSessions += 1;
    if (codeEligible && session.edits > 0 && session.codegraphCalls === 0 && session.reads + session.searches >= 3) totals.highWorkNoCodeGraphSessions += 1;
    const firstEditIndex = session.events.findIndex((event) => event.isEdit);
    if (firstEditIndex >= 0) {
      const before = session.events.slice(0, firstEditIndex);
      if (before.some((event) => event.isCodegraph)) beforeFirstEdit.codegraph += 1;
      if (before.some((event) => event.isBeads)) beforeFirstEdit.beads += 1;
      if (before.some((event) => event.isHindsight)) beforeFirstEdit.hindsight += 1;
      if (before.some((event) => event.isTool)) beforeFirstEdit.anyTool += 1;
    }
    session.events.forEach((event, index) => {
      if (!event.isStopBlock) return;
      const next = session.events[index + 1];
      if (!next) immediateFollowUp.none += 1;
      else if (next.isTool) immediateFollowUp.tool += 1;
      else if (next.isTextOnly) immediateFollowUp.textOnly += 1;
      else immediateFollowUp.none += 1;
    });
  }
  const report = {
    schemaVersion: 1,
    command: "session-deep-dive",
    sinceDays,
    sources: {
      filesScanned: loaded.filesScanned,
      rowsScanned: loaded.rowsScanned,
      eventsScanned: loaded.events.length,
    },
    totals,
    stopCategories,
    immediateFollowUp,
    beforeFirstEdit,
    privacy: {
      outputSafe: true,
      inputRowsWithPrivateMaterial: privateRows,
    },
  };
  assertOutputSafe(report);
  return report;
}
function assertOutputSafe(report) {
  const text = JSON.stringify(report);
  if (SECRET_PATTERN.test(text) || PRIVATE_PATH_PATTERN.test(text) || RAW_TEXT_FIELD_PATTERN.test(text)) {
    throw new Error("session deep-dive output failed privacy guard");
  }
}

try {
  if (args.includes("--help")) usage();
  const report = summarize();
  if (jsonMode) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`session-deep-dive sessions=${report.totals.sessionCount} codeEligible=${report.totals.codeEligibleSessions}`);
    console.log(`tools codegraph=${report.totals.codegraphCalls} beads=${report.totals.beadsCalls} hindsight=${report.totals.hindsightSignals}`);
    console.log(`stopBlocks=${report.totals.stopBlocks} textOnlyRetries=${report.immediateFollowUp.textOnly}`);
  }
} catch (error) {
  const detail = redactPrivate(error instanceof Error ? error.message : String(error));
  if (jsonMode) console.log(JSON.stringify({ ok: false, error: detail }, null, 2));
  else console.error(`session-deep-dive error: ${detail}`);
  process.exit(2);
}
