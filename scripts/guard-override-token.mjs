#!/usr/bin/env node
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const DEFAULT_STORE_RETENTION_MS = 86_400_000;
const DEFAULT_LOCK_MAX_ATTEMPTS = 200;
const DEFAULT_LOCK_BASE_DELAY_MS = 25;
const DEFAULT_LOCK_MAX_DELAY_MS = 250;

function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const storeRetentionMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_STORE_RETENTION_MS", DEFAULT_STORE_RETENTION_MS);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function argValue(flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${flag} requires a value.`);
  }
  return value;
}

function stateDir() {
  return process.env.CLAUDE_GUARD_STATE_DIR || os.tmpdir();
}

function tokenStorePath(session) {
  return path.join(stateDir(), `claude-guard-override-${session}.json`);
}

function tokenStoreLockPath(session) {
  return path.join(stateDir(), `claude-guard-override-${session}.lock`);
}

function secretPath() {
  return path.join(stateDir(), ".claude-guard-override-secret");
}

function ensureDir() {
  mkdirSync(stateDir(), { recursive: true });
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`claude-guard warning: override store malformed (${file}): ${error.message}; using fallback store`);
    return fallback;
  }
}

function writeJson(file, payload) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

function pruneStore(store, nowMs) {
  const pruned = {
    issuedHashes: {},
    usedHashes: {},
  };
  const issued = store?.issuedHashes ?? {};
  const used = store?.usedHashes ?? {};
  for (const [hash, meta] of Object.entries(issued)) {
    const atMs = Date.parse(String(meta?.at ?? ""));
    if (Number.isFinite(atMs) && nowMs - atMs <= storeRetentionMs) {
      pruned.issuedHashes[hash] = meta;
    }
  }
  for (const [hash, meta] of Object.entries(used)) {
    const atMs = Date.parse(String(meta?.at ?? ""));
    if (Number.isFinite(atMs) && nowMs - atMs <= storeRetentionMs) {
      pruned.usedHashes[hash] = meta;
    }
  }
  return pruned;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(value) {
  return Buffer.from(value, "base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function getSecret() {
  const envSecret = process.env.CLAUDE_GUARD_OVERRIDE_SECRET;
  if (envSecret) return envSecret;
  ensureDir();
  const file = secretPath();
  if (existsSync(file)) {
    const mode = statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      chmodSync(file, 0o600);
    }
    return readFileSync(file, "utf8").trim();
  }
  const generated = randomBytes(32).toString("hex");
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

function signPayload(payload) {
  const secret = getSecret();
  const raw = JSON.stringify(payload);
  const encoded = base64url(raw);
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const secret = getSecret();
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false, reason: "Invalid override token format." };
  const [encoded, signature] = parts;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  let left;
  let right;
  try {
    left = Buffer.from(signature, "base64url");
  } catch {
    return { ok: false, reason: "Override token signature malformed." };
  }
  try {
    right = Buffer.from(expected, "base64url");
  } catch {
    return { ok: false, reason: "Override token signature malformed." };
  }
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "Override token signature mismatch." };
  }
  let payload;
  try {
    payload = JSON.parse(fromBase64url(encoded).toString("utf8"));
  } catch {
    return { ok: false, reason: "Override token payload is not valid JSON." };
  }
  return { ok: true, payload };
}

function sleepMs(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLockMetadata(pidPath) {
  try {
    const parsed = JSON.parse(readFileSync(pidPath, "utf8"));
    const pid = Number.parseInt(String(parsed?.pid ?? ""), 10);
    const lockId = String(parsed?.lockId ?? "");
    const createdAtMs = Number(parsed?.createdAtMs ?? 0);
    if (!Number.isInteger(pid) || pid <= 0 || lockId.length < 16 || !Number.isFinite(createdAtMs) || createdAtMs <= 0) {
      return null;
    }
    return { pid, lockId, createdAtMs };
  } catch {
    return null;
  }
}

function writeLockMetadata(pidPath, lockId) {
  writeFileSync(pidPath, `${JSON.stringify({ pid: process.pid, lockId, createdAtMs: Date.now() })}\n`, { mode: 0o600 });
}

async function withStoreLock(session, callback) {
  ensureDir();
  const lockPath = tokenStoreLockPath(session);
  const pidPath = path.join(lockPath, "pid");
  const lockId = randomBytes(8).toString("hex");
  const maxAttempts = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_MAX_ATTEMPTS", DEFAULT_LOCK_MAX_ATTEMPTS);
  const baseDelayMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_BASE_DELAY_MS", DEFAULT_LOCK_BASE_DELAY_MS);
  const maxDelayMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_MAX_DELAY_MS", DEFAULT_LOCK_MAX_DELAY_MS);
  const staleLockMs = 30_000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      mkdirSync(lockPath);
      try {
        writeLockMetadata(pidPath, lockId);
      } catch (writeError) {
        rmSync(lockPath, { recursive: true, force: true });
        throw writeError;
      }
      break;
    } catch (error) {
      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs;
        const metadata = readLockMetadata(pidPath);
        const ownerAlive = metadata ? pidIsAlive(metadata.pid) : false;
        const metadataAgeMs = metadata ? Date.now() - metadata.createdAtMs : Number.POSITIVE_INFINITY;
        if (ageMs > staleLockMs && (!ownerAlive || metadataAgeMs > staleLockMs)) {
          await sleepMs(30);
          if (!existsSync(lockPath) || !existsSync(pidPath)) {
            continue;
          }
          const lockStatAfter = statSync(lockPath);
          const metadataAfter = readLockMetadata(pidPath);
          if (!metadataAfter) {
            continue;
          }
          if (metadata && metadataAfter.pid !== metadata.pid) {
            continue;
          }
          const ageAfterMs = Date.now() - lockStatAfter.mtimeMs;
          const ownerAliveAfter = pidIsAlive(metadataAfter.pid);
          const metadataAgeAfterMs = Date.now() - metadataAfter.createdAtMs;
          if (ageAfterMs > staleLockMs && (!ownerAliveAfter || metadataAgeAfterMs > staleLockMs)) {
            rmSync(lockPath, { recursive: true, force: true });
            continue;
          }
        }
      } catch {
        // If stat/remove fails, continue with normal retry behavior.
      }
      if (attempt === maxAttempts - 1) {
        fail(`Timed out acquiring override token lock: ${lockPath}`);
      }
      const backoffMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.min(attempt, 4)));
      const jitterMs = randomBytes(1)[0] % 25;
      await sleepMs(backoffMs + jitterMs);
    }
  }
  try {
    return callback();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

async function issue() {
  const session = argValue("--session");
  const commandFingerprint = argValue("--command-fingerprint");
  const reason = argValue("--reason");
  if (!session.trim()) fail("--session is required.");
  if (!commandFingerprint.trim()) fail("--command-fingerprint is required.");
  if (!reason.trim()) fail("--reason is required.");
  const issuedAtMs = Number(argValue("--issued-at-ms", String(Date.now())));
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) {
    fail("--issued-at-ms must be a positive number.");
  }
  const issuedAtSkewMs = 5 * 60 * 1000;
  const now = Date.now();
  if (issuedAtMs < now - issuedAtSkewMs || issuedAtMs > now + issuedAtSkewMs) {
    fail("--issued-at-ms must be within 5 minutes of current time.");
  }
  const expiresAtArg = argValue("--expires-at-ms", "");
  const ttl = Number(argValue("--ttl", "300"));
  if (!expiresAtArg && (!Number.isFinite(ttl) || ttl <= 0 || ttl > 3600)) {
    fail("--ttl must be a number between 1 and 3600 seconds.");
  }
  const expiresAtMs = expiresAtArg ? Number(expiresAtArg) : issuedAtMs + ttl * 1000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    fail("--expires-at-ms must be a positive number.");
  }
  const payload = {
    session,
    commandFingerprint,
    reason,
    nonce: randomBytes(12).toString("hex"),
    issuedAtMs,
    expiresAtMs,
  };
  const token = signPayload(payload);
  const tokenHash = sha256(token);
  await withStoreLock(session, () => {
    const storePath = tokenStorePath(session);
    const store = pruneStore(readJson(storePath, { usedHashes: {}, issuedHashes: {} }), Date.now());
    store.issuedHashes[tokenHash] = { at: new Date(issuedAtMs).toISOString(), reason, commandFingerprint };
    writeJson(storePath, store);
  });
  console.log(JSON.stringify({ token, expiresAtMs: payload.expiresAtMs }));
}

async function verify() {
  const session = argValue("--session");
  const commandFingerprint = argValue("--command-fingerprint");
  const token = argValue("--token");
  if (!session.trim()) fail("--session is required.");
  if (!commandFingerprint.trim()) fail("--command-fingerprint is required.");
  if (!token.trim()) fail("--token is required.");
  const now = Date.now();
  const verified = verifyToken(token);
  if (!verified.ok) fail(verified.reason);
  const payload = verified.payload;
  if (payload.session !== session) fail("Override token session mismatch.");
  if (payload.commandFingerprint !== commandFingerprint) fail("Override token fingerprint mismatch.");
  if (payload.expiresAtMs < now) fail("Override token is expired.");

  const tokenHash = sha256(token);
  await withStoreLock(session, () => {
    const storePath = tokenStorePath(session);
    const store = pruneStore(readJson(storePath, { usedHashes: {}, issuedHashes: {} }), Date.now());
    if (store.usedHashes[tokenHash]) fail("Override token was already used.");
    store.usedHashes[tokenHash] = {
      at: new Date(now).toISOString(),
      commandFingerprint,
      reason: payload.reason,
    };
    writeJson(storePath, store);
  });
  console.log(JSON.stringify({ ok: true, reason: payload.reason }));
}

try {
  if (command === "issue") {
    await issue();
  } else if (command === "verify") {
    await verify();
  } else {
    fail(
      [
        "usage:",
        "  guard-override-token issue --session <id> --command-fingerprint <sha> --reason <text> [--ttl <seconds>] [--issued-at-ms <epoch-ms>] [--expires-at-ms <epoch-ms>]",
        "  guard-override-token verify --session <id> --command-fingerprint <sha> --token <token>",
      ].join("\n"),
      2,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
