#!/usr/bin/env node
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const DEFAULT_STORE_RETENTION_MS = 86_400_000;
const DEFAULT_LOCK_MAX_ATTEMPTS = 200;
const DEFAULT_LOCK_BASE_DELAY_MS = 25;
const DEFAULT_LOCK_MAX_DELAY_MS = 250;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_MAX_ISSUED_PER_SESSION = 100;
const DEFAULT_MAX_STORE_BYTES = 262_144;
const STORE_HASH_KEY_PATTERN = /^[a-f0-9]{64}$/;

function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const storeRetentionMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_STORE_RETENTION_MS", DEFAULT_STORE_RETENTION_MS);
const maxIssuedPerSession = parsePositiveIntegerEnv(
  "CLAUDE_GUARD_OVERRIDE_MAX_ISSUED_PER_SESSION",
  DEFAULT_MAX_ISSUED_PER_SESSION,
);
const maxStoreBytes = parsePositiveIntegerEnv(
  "CLAUDE_GUARD_OVERRIDE_MAX_STORE_BYTES",
  DEFAULT_MAX_STORE_BYTES,
);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
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
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`override store malformed (${file}): ${detail}`);
  }
}

function writeJson(file, payload) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

function createHashBucket() {
  return Object.create(null);
}

function isStoreHashKey(value) {
  return typeof value === "string" && STORE_HASH_KEY_PATTERN.test(value);
}

function assertStoreHashKey(value, label) {
  if (!isStoreHashKey(value)) {
    fail(`${label} hash is malformed.`);
  }
}

function normalizeHashBucket(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createHashBucket();
  const normalized = createHashBucket();
  for (const [hash, meta] of Object.entries(value)) {
    if (isStoreHashKey(hash)) {
      normalized[hash] = meta;
    }
  }
  return normalized;
}

function pruneStore(store, nowMs) {
  const pruned = {
    issuedHashes: createHashBucket(),
    usedHashes: createHashBucket(),
  };
  const issued = normalizeHashBucket(store?.issuedHashes);
  const used = normalizeHashBucket(store?.usedHashes);
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

function storeSizeBytes(store) {
  return Buffer.byteLength(JSON.stringify(store), "utf8");
}

function trimIssuedHashesToCap(store, cap) {
  const issuedEntries = Object.entries(store?.issuedHashes ?? {});
  if (issuedEntries.length < cap) return;
  const sorted = issuedEntries
    .map(([hash, meta]) => {
      const atMs = Date.parse(String(meta?.at ?? ""));
      return { hash, atMs: Number.isFinite(atMs) ? atMs : 0 };
    })
    .sort((left, right) => left.atMs - right.atMs);
  while (sorted.length >= cap) {
    const removed = sorted.shift();
    if (removed) delete store.issuedHashes[removed.hash];
  }
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
  const tmpPath = `${pidPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, `${JSON.stringify({ pid: process.pid, lockId, createdAtMs: Date.now() })}\n`, { mode: 0o600 });
  renameSync(tmpPath, pidPath);
}

async function withStoreLock(session, callback) {
  ensureDir();
  const lockPath = tokenStoreLockPath(session);
  const pidPath = path.join(lockPath, "pid");
  const lockId = randomBytes(8).toString("hex");
  const maxAttempts = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_MAX_ATTEMPTS", DEFAULT_LOCK_MAX_ATTEMPTS);
  const baseDelayMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_BASE_DELAY_MS", DEFAULT_LOCK_BASE_DELAY_MS);
  const maxDelayMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_MAX_DELAY_MS", DEFAULT_LOCK_MAX_DELAY_MS);
  const staleLockMs = parsePositiveIntegerEnv("CLAUDE_GUARD_OVERRIDE_LOCK_STALE_MS", DEFAULT_LOCK_STALE_MS);
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
      const maxExponent = Math.max(0, Math.floor(Math.log2(maxDelayMs / baseDelayMs)));
      const exponent = Math.min(attempt, maxExponent);
      const backoffMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exponent));
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
  const session = argValue(args, "--session");
  const commandFingerprint = argValue(args, "--command-fingerprint");
  const reason = argValue(args, "--reason");
  if (!session.trim()) fail("--session is required.");
  if (!commandFingerprint.trim()) fail("--command-fingerprint is required.");
  if (!reason.trim()) fail("--reason is required.");
  const issuedAtMs = Number(argValue(args, "--issued-at-ms", String(Date.now())));
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) {
    fail("--issued-at-ms must be a positive number.");
  }
  const issuedAtSkewMs = 5 * 60 * 1000;
  const now = Date.now();
  if (issuedAtMs < now - issuedAtSkewMs || issuedAtMs > now + issuedAtSkewMs) {
    fail("--issued-at-ms must be within 5 minutes of current time.");
  }
  const expiresAtArg = argValue(args, "--expires-at-ms", "");
  const ttl = Number(argValue(args, "--ttl", "300"));
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
  assertStoreHashKey(tokenHash, "override token");
  await withStoreLock(session, () => {
    const storePath = tokenStorePath(session);
    const store = pruneStore(
      readJson(storePath, { usedHashes: createHashBucket(), issuedHashes: createHashBucket() }),
      Date.now(),
    );
    trimIssuedHashesToCap(store, maxIssuedPerSession);
    if (Object.keys(store.issuedHashes).length >= maxIssuedPerSession) {
      fail(`Override token issue limit reached for session ${session}; prune or wait for retention cleanup.`);
    }
    if (storeSizeBytes(store) > maxStoreBytes) {
      fail(`Override token store too large (${storeSizeBytes(store)} bytes > ${maxStoreBytes}).`);
    }
    store.issuedHashes[tokenHash] = { at: new Date(issuedAtMs).toISOString(), reason, commandFingerprint };
    if (storeSizeBytes(store) > maxStoreBytes) {
      fail(`Override token store would exceed max size after issue (${maxStoreBytes} bytes).`);
    }
    writeJson(storePath, store);
  });
  console.log(JSON.stringify({ token, expiresAtMs: payload.expiresAtMs }));
}

async function verify() {
  const session = argValue(args, "--session");
  const commandFingerprint = argValue(args, "--command-fingerprint");
  const token = argValue(args, "--token", process.env.CLAUDE_GUARD_OVERRIDE_TOKEN || "");
  if (!session.trim()) fail("--session is required.");
  if (!commandFingerprint.trim()) fail("--command-fingerprint is required.");
  if (!token.trim()) fail("--token is required (or set CLAUDE_GUARD_OVERRIDE_TOKEN).");
  const now = Date.now();
  const verified = verifyToken(token);
  if (!verified.ok) fail(verified.reason);
  const payload = verified.payload;
  if (payload.session !== session) fail("Override token session mismatch.");
  if (payload.commandFingerprint !== commandFingerprint) fail("Override token fingerprint mismatch.");
  // Expiration is inclusive: expiresAtMs equal to now is treated as expired.
  if (payload.expiresAtMs <= now) fail("Override token is expired.");

  const tokenHash = sha256(token);
  assertStoreHashKey(tokenHash, "override token");
  await withStoreLock(session, () => {
    const storePath = tokenStorePath(session);
    const store = pruneStore(
      readJson(storePath, { usedHashes: createHashBucket(), issuedHashes: createHashBucket() }),
      Date.now(),
    );
    if (Object.prototype.hasOwnProperty.call(store.usedHashes, tokenHash)) fail("Override token was already used.");
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
        "  guard-override-token verify --session <id> --command-fingerprint <sha> [--token <token> | CLAUDE_GUARD_OVERRIDE_TOKEN]",
      ].join("\n"),
      2,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
