// Cross-process JSON store primitives shared by every writer of a file that a
// second agent lane can write at the same time. A directory create is the atomic
// primitive available on every filesystem the stack targets, and rename() is the
// only way to replace a file without a window where readers see a truncated one.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_STALE_MS = 120000;

function sleepMs(ms) {
  Atomics.wait(LOCK_SLEEP, 0, 0, ms);
}

export function acquireFileLock(file, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const label = options.label ?? "file";
  const lockDir = `${file}.lock`;
  const startedAt = Date.now();
  let attempts = 0;
  while (true) {
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      writeFileSync(path.join(lockDir, "owner"), `${process.pid} ${new Date().toISOString()}\n`, { mode: 0o600 });
      return () => rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      attempts += 1;
      try {
        const stats = statSync(lockDir);
        if (Date.now() - stats.mtimeMs > staleMs) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for ${label} lock: ${lockDir}`);
      }
      sleepMs(Math.min(250, 25 + attempts * 10));
    }
  }
}

export function withFileLock(file, callback, options = {}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const release = acquireFileLock(file, options);
  try {
    return callback();
  } finally {
    release();
  }
}

// `mode` stays optional: a tracked repo store keeps the umask default it was
// created with, while a private run artifact asks for 0600.
export function writeJsonAtomic(file, value, options = {}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (options.mode === undefined) writeFileSync(tmp, body);
  else writeFileSync(tmp, body, { mode: options.mode });
  renameSync(tmp, file);
}

// Read-modify-write as one critical section: the read happens inside the lock so
// a concurrent lane's rows cannot be overwritten by a stale in-memory copy.
export function updateJsonUnderLock(file, { read, update, mode, ...lockOptions }) {
  return withFileLock(file, () => {
    const current = read ? read(file) : JSON.parse(readFileSync(file, "utf8"));
    const next = update(current) ?? current;
    writeJsonAtomic(file, next, { mode });
    return next;
  }, lockOptions);
}
