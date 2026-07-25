// Cross-process JSON store primitives shared by every writer of a file that a
// second agent lane can write at the same time. A directory create is the atomic
// primitive available on every filesystem the stack targets, and rename() is the
// only way to replace a file without a window where readers see a truncated one.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_STALE_MS = 120000;

function sleepMs(ms) {
  Atomics.wait(LOCK_SLEEP, 0, 0, ms);
}

// Validated here rather than at each call site: an env-var override reaches these
// numbers as a string, and `Number("abc")` is NaN, which makes every `elapsed >
// limit` comparison false — a typo would disable the timeout and the staleness
// reclaim instead of failing fast.
function positiveMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Release only what this call still owns. A critical section that overruns
// `staleMs` gets its lock reclaimed by a waiter, and an unconditional rmSync
// would then delete the new owner's lock directory. Comparing the owner token
// narrows that to the window between this read and the rmSync below; the real
// remedy for an overrun is a `staleMs` larger than the longest critical section.
function releaseIfOwned(lockDir, token) {
  try {
    if (readFileSync(path.join(lockDir, "owner"), "utf8").trim() !== token) return false;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  rmSync(lockDir, { recursive: true, force: true });
  return true;
}

function readLockOwner(lockDir) {
  try {
    return readFileSync(path.join(lockDir, "owner"), "utf8").trim();
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// Removing a lock this process does not own is only safe if the staleness check
// that justified it cannot be invalidated before the removal lands. Reading the
// mtime and then deleting the path does not clear that bar: several waiters read
// one stale mtime, the first deletes it and creates its own lock, and every later
// delete lands on that fresh lock instead — so the whole queue ends up running
// inside the critical section together.
//
// A reclaim marker excludes rival reclaimers, and comparing the owner token — the
// same check releaseIfOwned uses — refuses deletion when the real owner released
// and a new acquirer replaced the lock mid-reclaim. That narrows the window to the
// gap between the token re-read and rmSync; it does not eliminate it, because POSIX
// offers no atomic compare-and-delete for a directory. The real remedy for a
// critical section that outruns staleMs is a staleMs larger than the longest
// critical section.
//
// Returns true only when this call removed the lock, so a caller that was refused
// falls through to its wait and timeout instead of spinning on a refusal.
function reclaimStaleLock(lockDir, staleMs, staleToken) {
  try {
    mkdirSync(reclaimMarker(lockDir), { mode: 0o700 });
  } catch (error) {
    // Another waiter is mid-reclaim. It removes the stale lock or leaves it for the
    // next pass; either way this waiter re-reads the state on the next iteration.
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    const stats = statLock(lockDir);
    if (!stats || Date.now() - stats.mtimeMs <= staleMs) return false;
    const currentToken = readLockOwner(lockDir);
    if (!currentToken || currentToken !== staleToken) return false;
    rmSync(lockDir, { recursive: true, force: true });
    return true;
  } finally {
    rmSync(reclaimMarker(lockDir), { recursive: true, force: true });
  }
}

const reclaimMarker = (lockDir) => `${lockDir}.reclaim`;

function statLock(lockDir) {
  try {
    return statSync(lockDir);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// Exported for the reclaim tests only: they inject a replaced owner token, which no
// timing-based test can do deterministically. Acquire a lock through acquireFileLock —
// calling this directly deletes another holder's lock without taking one.
export { reclaimStaleLock };

export function acquireFileLock(file, options = {}) {
  const timeoutMs = positiveMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const staleMs = positiveMs(options.staleMs, DEFAULT_STALE_MS);
  const label = options.label ?? "file";
  const lockDir = `${file}.lock`;
  const startedAt = Date.now();
  let attempts = 0;
  while (true) {
    // The lock directory is derived from the file path, so every writer of one
    // store contends on one directory. `label` only names the store in the
    // timeout message; it has no part in mutual exclusion.
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      const token = `${process.pid} ${randomUUID()}`;
      writeFileSync(path.join(lockDir, "owner"), `${token}\n`, { mode: 0o600 });
      return () => releaseIfOwned(lockDir, token);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      attempts += 1;
      const stats = statLock(lockDir);
      if (!stats) continue;
      // Retry straight away only when the reclaim actually freed the lock. A refused
      // reclaim must fall through to the wait below, or an orphaned marker would spin
      // here at full speed and never reach the timeout.
      if (Date.now() - stats.mtimeMs > staleMs) {
        const staleToken = readLockOwner(lockDir);
        if (staleToken && reclaimStaleLock(lockDir, staleMs, staleToken)) continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        // The reclaim marker is held for three syscalls, so one that outlives this
        // wait was orphaned by a process killed mid-reclaim. Nothing reclaims a
        // stale lock while it stands, which fails closed rather than risking two
        // holders — name it so an operator knows what to remove.
        const orphan = statLock(reclaimMarker(lockDir)) ? ` (stale reclaim marker present: ${reclaimMarker(lockDir)})` : "";
        throw new Error(`Timed out waiting for ${label} lock: ${lockDir}${orphan}`);
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

// `mode` stays optional: a private run artifact asks for 0600, and every other
// caller keeps whatever the store already had. rename() replaces the destination
// with the temp file's own mode, so an existing file's permissions have to be
// carried across explicitly or a 0600 store would silently widen to the umask
// default on the first rewrite by a caller that omits `mode`. Only a file that
// does not exist yet takes the umask default. chmod after the write because
// writeFileSync's `mode` is itself masked by the umask, which would otherwise
// narrow a preserved 0644 under a restrictive umask.
export function writeJsonAtomic(file, value, options = {}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const mode = options.mode ?? currentMode(file);
  if (mode === undefined) {
    writeFileSync(tmp, body);
  } else {
    writeFileSync(tmp, body, { mode });
    chmodSync(tmp, mode);
  }
  renameSync(tmp, file);
}

function currentMode(file) {
  try {
    return statSync(file).mode & 0o777;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
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
