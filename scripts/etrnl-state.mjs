#!/usr/bin/env node
// Exit codes: 0 success, 1 stale verification after compact, 2 invalid input/runtime error.
import fs from "node:fs";
import path from "node:path";
import {
  appendEvent,
  beadPrimeAudit,
  beadLinkDryRun,
  collectPositionals,
  compactHandoff,
  flagValue,
  jsonError,
  readEvents,
  rebuildViews,
  statePaths,
  stateRoot,
  stopStatus,
  validateFixtureDir,
} from "./lib/etrnl-state-core.mjs";
import { readStdinRaw } from "./lib/read-stdin.mjs";

const args = process.argv.slice(2);
const command = collectPositionals(args)[0] || "help";
const jsonMode = args.includes("--json");
const stateDir = flagValue(args, "--state-dir");
const cwdFlag = flagValue(args, "--cwd");
const cwd = cwdFlag || process.cwd();
const session = flagValue(args, "--session");
const run = flagValue(args, "--run");
const eventKind = flagValue(args, "--event-kind");
const USAGE = "usage: etrnl-state.mjs append|validate|compact-handoff|doctor|stop-status|export|import-legacy|bead-link|bead-prime-audit|purge [--json]";

function emit(value) {
  if (jsonMode || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function fail(error, status = 1) {
  const payload = error && error.ok === false
    ? error
    : jsonError(error?.code || "EtrnlStateError", error?.message || String(error), "Run compact doctor and inspect the referenced state path.");
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.error(`${payload.code}: ${payload.message}\nAction: ${payload.action}\nDiagnostic: ${payload.diagnosticCommand}`);
  process.exit(status);
}

function readStdin() {
  try {
    return readStdinRaw();
  } catch (error) {
    fail(jsonError("StdinReadError", "Failed to read JSON from stdin.", error instanceof Error ? error.message : String(error)), 2);
  }
}

function readEventInput() {
  const fixture = flagValue(args, "--fixture", flagValue(args, "--input"));
  if (fixture) {
    try {
      return JSON.parse(fs.readFileSync(fixture, "utf8"));
    } catch (error) {
      fail(jsonError("InvalidFixtureJSON", `Failed to parse fixture file: ${fixture}`, error instanceof Error ? error.message : String(error)), 2);
    }
  }
  const raw = readStdin();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      fail(jsonError("InvalidStdinJSON", "Failed to parse JSON from stdin.", error instanceof Error ? error.message : String(error)), 2);
    }
  }
  if (!eventKind) {
    fail(jsonError("MissingEventInput", "append requires --fixture, stdin JSON, or --event-kind.", "Pass a fixture or pipe a JSON event."), 2);
  }
  return { eventKind };
}

function commandAppend() {
  const event = readEventInput();
  const result = appendEvent(event.event || event, {
    stateDir,
    dryRun: args.includes("--dry-run"),
    session,
    run,
    cwd,
    eventKind,
  });
  if (!result.ok) fail(result.error);
  emit(jsonMode ? result : `ok: appended ${result.event.eventKind} seq=${result.event.eventSeq}`);
}

function commandValidate() {
  const fixtures = flagValue(args, "--fixtures");
  const result = fixtures
    ? validateFixtureDir(fixtures)
    : (() => {
      rebuildViews(stateRoot(stateDir));
      return { ok: true, files: 0, errors: [] };
    })();
  if (!result.ok) fail(jsonError("FixtureValidationError", result.errors.join("; "), "Fix invalid ETRNL state fixtures or schema inputs.", { errors: result.errors }));
  emit(jsonMode ? result : `ok: etrnl-state validation passed (${result.files} fixtures)`);
}

function commandCompactHandoff() {
  const maxCharsCandidate = Number(flagValue(args, "--max-chars", "1200"));
  const maxChars = Number.isFinite(maxCharsCandidate) && maxCharsCandidate > 0 ? maxCharsCandidate : 1200;
  const result = compactHandoff({
    stateDir,
    session,
    latest: args.includes("--latest") || !session,
    maxChars,
  });
  emit(jsonMode ? result : result.text);
}

function commandDoctor() {
  const paths = statePaths(stateRoot(stateDir));
  const events = readEvents(stateRoot(stateDir));
  const handoff = compactHandoff({ stateDir, latest: true });
  const compactEvents = events.filter((event) => event.eventKind === "compact_pre" || event.eventKind === "compact_post");
  const status = stopStatus({ stateDir, latest: true });
  const result = {
    ok: true,
    schemaVersion: 1,
    command: "doctor",
    compact: {
      events: compactEvents.length,
      latest: handoff.handoff,
      preview: handoff.text,
      staleVerification: status.staleVerificationAfterCompact,
    },
    statePath: paths.events,
    viewPath: paths.compactView,
    nextCommand: status.staleVerificationAfterCompact
      ? "rerun the relevant verification command, then append a check event"
      : "none",
  };
  if (jsonMode) emit(result);
  else {
    const lines = [
      `etrnlState compactEvents=${result.compact.events} staleVerification=${result.compact.staleVerification}`,
      `etrnlState latest=${result.compact.latest ? `session=${result.compact.latest.sessionId} seq=${result.compact.latest.compactEventSeq}` : "none"}`,
      `etrnlState preview=${result.compact.preview || "none"}`,
      `etrnlState nextCommand=${result.nextCommand}`,
    ];
    if (args.includes("--explain")) lines.push(`etrnlState statePath=${result.statePath}`);
    console.log(lines.join("\n"));
  }
}

function commandStopStatus() {
  const result = stopStatus({ stateDir, session, latest: args.includes("--latest") || !session });
  emit(jsonMode ? result : result.blockReason);
  if (result.staleVerificationAfterCompact) fail("stale verification after compact", 1);
}

function commandExport() {
  emit({ ok: true, events: readEvents(stateRoot(stateDir)) });
}

function commandImportLegacy() {
  const input = flagValue(args, "--input", flagValue(args, "--file"));
  if (!input) fail(jsonError("MissingLegacyInput", "import-legacy requires --input <file>.", "Pass a legacy guard-state JSON file."), 2);
  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(input, "utf8"));
  } catch (error) {
    fail(jsonError("InvalidLegacyJSON", `Failed to parse legacy file: ${input}`, error instanceof Error ? error.message : String(error)), 2);
  }
  const legacyCwd = cwdFlag || (typeof legacy.cwd === "string" && legacy.cwd.trim() ? legacy.cwd : process.cwd());
  const event = {
    eventKind: "context_entry",
    sessionId: session || legacy.sessionId || "legacy",
    cwd: legacyCwd,
    data: {
      entryType: "legacy_guard_summary",
      verificationRuns: Array.isArray(legacy.verificationRuns) ? legacy.verificationRuns.length : 0,
      compactCount: Number(legacy.compactCount || 0),
      activePlan: legacy.activePlanPath ? path.basename(String(legacy.activePlanPath)) : "",
    },
  };
  const result = appendEvent(event, { stateDir, dryRun: args.includes("--dry-run"), session, cwd: legacyCwd });
  if (!result.ok) fail(result.error);
  emit(jsonMode ? result : `ok: imported legacy guard summary seq=${result.event.eventSeq}`);
}

function commandBeadLink() {
  const result = beadLinkDryRun({ stateDir });
  emit(jsonMode ? result : `beadLink dryRun=true backlogCandidates=${result.backlogCandidates} activeExecutionNoise=${result.activeExecutionNoise}`);
}

function commandBeadPrimeAudit() {
  const input = readStdin();
  const result = beadPrimeAudit(input);
  emit(jsonMode ? result : `beadPrimeAudit allowed=${result.allowed} prohibited=${result.prohibited.join(",") || "none"}`);
  if (!result.allowed) process.exit(1);
}

function commandPurge() {
  const result = {
    ok: true,
    dryRun: args.includes("--dry-run"),
    action: "manual-review-required",
    statePath: statePaths(stateRoot(stateDir)).events,
    message: "Privacy purge is a rewrite operation. Review matching event ids, back up events.jsonl, then rewrite outside hook hot paths.",
  };
  emit(result);
}

try {
  if (command === "append") commandAppend();
  else if (command === "validate") commandValidate();
  else if (command === "compact-handoff") commandCompactHandoff();
  else if (command === "doctor") commandDoctor();
  else if (command === "stop-status") commandStopStatus();
  else if (command === "export") commandExport();
  else if (command === "import-legacy") commandImportLegacy();
  else if (command === "bead-link") commandBeadLink();
  else if (command === "bead-prime-audit") commandBeadPrimeAudit();
  else if (command === "purge") commandPurge();
  else if (command === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  else {
    console.error(USAGE);
    process.exit(2);
  }
} catch (error) {
  fail(error);
}
