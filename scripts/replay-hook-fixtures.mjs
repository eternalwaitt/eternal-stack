#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "hooks", "fixtures", "events", "replay");
let stateDir = "";
const hookTimeoutMs = (() => {
  const parsed = Number.parseInt(String(process.env.CLAUDE_GUARD_REPLAY_TIMEOUT_MS || "10000"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10_000;
  return Math.min(parsed, 60_000);
})();

function fail(message) {
  throw new Error(message);
}

function sanitizeOutput(value, maxLen = 320, preRedactionMaxLen = 2000) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "<empty>";
  const preTruncated = compact.length > preRedactionMaxLen
    ? `${compact.slice(0, preRedactionMaxLen)}... [pre-truncated ${compact.length} chars]`
    : compact;
  let redacted = preTruncated.replace(
    /((api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*)(["']?)[^\s"',}]+/gi,
    "$1$3[redacted]",
  );
  redacted = redacted.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted]");
  redacted = redacted.replace(/\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._-]+/gi, "authorization: bearer [redacted]");
  redacted = redacted.replace(/\bbearer\s+[A-Za-z0-9._-]+/gi, "bearer [redacted]");
  redacted = redacted.replace(/\bgh[porsu]_[A-Za-z0-9_]{12,}\b/gi, "[redacted]");
  redacted = redacted.replace(/\bglpat-[A-Za-z0-9_-]{12,}\b/gi, "[redacted]");
  redacted = redacted.replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/gi, "[redacted]");
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]");
  redacted = redacted.replace(/(\b(?:_authToken|_auth)\b\s*[:=]\s*)(["']?)[^\s"',}]+/gi, "$1$2[redacted]");
  redacted = redacted.replace(/([?&]sig=)[^&\s]+/gi, "$1[redacted]");
  redacted = redacted.replace(/((?:postgres|mysql|mongodb|jdbc:[a-z0-9]+):\/\/[^:@\s]+:)[^@\s]+(@)/gi, "$1[redacted]$2");
  redacted = redacted.replace(/\b(?:AKIA|ASIA|OCI)[A-Z0-9]{12,}\b/g, "[redacted]");
  redacted = redacted.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[redacted]");
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}... [truncated ${redacted.length} chars]` : redacted;
}

function runHook(hook, payload) {
  const hooksDir = path.resolve(root, "hooks");
  const hookPath = path.resolve(hooksDir, hook);
  const relativeHookPath = path.relative(hooksDir, hookPath);
  if (relativeHookPath.startsWith("..") || path.isAbsolute(relativeHookPath)) {
    throw new Error(`hook path escapes hooks directory: ${hook}`);
  }
  if (!existsSync(hookPath)) {
    throw new Error(`hook not found: ${hookPath}`);
  }
  const child = spawnSync(hookPath, {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: hookTimeoutMs,
    killSignal: "SIGTERM",
    env: {
      ...process.env,
      CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON: "1",
      CLAUDE_GUARD_STATE_DIR: stateDir,
    },
  });
  if (child.error) {
    const stderr = sanitizeOutput(child.stderr);
    const stdout = sanitizeOutput(child.stdout);
    throw new Error(`hook spawn failed: ${child.error.message}; stderr=${stderr} stdout=${stdout}`);
  }
  if (child.status !== 0) {
    const stderr = sanitizeOutput(child.stderr);
    const stdout = sanitizeOutput(child.stdout);
    throw new Error(`hook exited with status ${child.status}: stderr=${stderr} stdout=${stdout}`);
  }
  const raw = (child.stdout || "").trim();
  if (!raw) {
    return { __empty_output__: true };
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`hook output is not JSON: ${error.message}\nOutput: ${sanitizeOutput(raw, 120)}`);
  }
}

const VALID_KINDS = new Set(["allow", "deny", "block", "warn"]);

function assertExpectation(output, expected) {
  const kind = expected.kind;
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`unknown expected kind: ${JSON.stringify(kind)}; allowed: ${[...VALID_KINDS].join(", ")}`);
  }
  if (output?.__empty_output__) {
    if (kind === "allow" && expected.allowEmptyOutput === true) return;
    throw new Error(
      `hook produced no output for expected kind=${kind}; set expected.allowEmptyOutput=true to permit this fixture path`,
    );
  }
  if (kind === "allow") {
    if (output.continue !== true) throw new Error("expected allow");
  } else if (kind === "deny") {
    if (output?.hookSpecificOutput?.permissionDecision !== "deny") throw new Error("expected deny");
  } else if (kind === "block") {
    if (output.decision !== "block") throw new Error("expected block");
  } else if (kind === "warn") {
    if (!output?.hookSpecificOutput?.additionalContext) throw new Error("expected warning context");
  }
  if (expected.contains !== undefined) {
    if (typeof expected.contains !== "string") {
      throw new Error("expected.contains must be a string");
    }
    const outputText = JSON.stringify(output);
    if (!outputText.includes(expected.contains)) {
      throw new Error(`expected output to contain: ${expected.contains}`);
    }
  }
}

let passed = 0;
let exitCode = 0;
try {
  stateDir = mkdtempSync(path.join(os.tmpdir(), "claude-guard-replay-"));
  if (!existsSync(fixturesDir)) {
    fail(`Replay fixture directory not found: ${fixturesDir}`);
  }
  const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith(".json")).sort();
  if (fixtureFiles.length === 0) {
    fail(`No replay fixtures found in ${fixturesDir} (expected at least one *.json fixture).`);
  }
  for (const file of fixtureFiles) {
    const fullPath = path.join(fixturesDir, file);
    let fixture;
    try {
      fixture = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch (error) {
      const detail = error instanceof Error ? (error.stack || error.message) : String(error);
      throw new Error(`failed to parse fixture ${fullPath}: ${detail}`);
    }
    const { hook, expected, ...rest } = fixture;
    if (!hook || !expected || !expected.kind) {
      throw new Error(`Fixture ${file} is missing hook or expected.kind`);
    }
    const payload = Object.prototype.hasOwnProperty.call(fixture, "payload") ? fixture.payload : rest;
    const output = runHook(hook, payload);
    assertExpectation(output, expected);
    console.log(`ok ${file}`);
    passed += 1;
  }
  console.log(`replay fixtures passed: ${passed}`);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (stateDir) {
    rmSync(stateDir, { recursive: true, force: true });
  }
}
if (exitCode !== 0) process.exit(exitCode);
