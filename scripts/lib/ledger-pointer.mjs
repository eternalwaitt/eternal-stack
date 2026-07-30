import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { safeId } from "./evidence-trace.mjs";

// Hosts that do not export a session id leave `--session "$CLAUDE_SESSION_ID"` empty,
// which every caller resolves to this one label. That made the bucket machine-wide:
// concurrent sessions in unrelated repositories resolved each other's run ledger
// through `current-default.json` and appended tasks, phases, and checks to it. The
// shared label is therefore qualified by the worktree it was resolved from, so the
// collapse is per-worktree instead of per-machine and cross-project writes cannot
// address one another's ledger at all.
const SHARED_BUCKET = "default";
const WORKTREE_KEY_LENGTH = 12;
// git rev-parse is cheap but this runs on every ledger command, and a single process
// resolves the same directory repeatedly (bucket, pointer read, ownership check).
const worktreeKeyCache = new Map();

/** Resolve the directory holding run ledgers and their `current-*` pointers. */
export function runsDir() {
  return process.env.ETRNL_RUNS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "runs");
}

/**
 * Stable identity for the worktree a path belongs to. Git decides the boundary, so
 * a subdirectory resolves to the same key as its repository root and a linked
 * worktree resolves to itself rather than to the main checkout. A path outside any
 * repository has no boundary to read, so it keys on itself; that over-separates
 * sibling directories of a non-git project, which is the safe direction to err.
 *
 * @param {string} cwd Directory to identify.
 * @returns {string} Short hex key, stable across processes.
 */
export function worktreeKey(cwd = process.cwd()) {
  const resolved = realPath(path.resolve(String(cwd || process.cwd())));
  const cached = worktreeKeyCache.get(resolved);
  if (cached) return cached;
  let root = resolved;
  try {
    // stderr is discarded: outside a repository git writes "fatal: not a git
    // repository", and callers such as the hook helpers merge stderr into output.
    const options = { cwd: resolved, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] };
    root = realPath(execFileSync("git", ["rev-parse", "--show-toplevel"], options).trim() || resolved);
  } catch {
    root = resolved;
  }
  const key = createHash("sha256").update(root).digest("hex").slice(0, WORKTREE_KEY_LENGTH);
  worktreeKeyCache.set(resolved, key);
  return key;
}

// A path reached through a symlink must key the same as the path itself, or the
// bucket a command writes and the bucket the next command reads can differ:
// process.cwd() reports the resolved path while an explicit --cwd may not.
function realPath(value) {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

/**
 * Resolve the pointer bucket a session writes to. An explicit session id is its own
 * bucket and is left alone: naming one session across several worktrees is a choice
 * the caller can legitimately make. Only the unnamed fallback is worktree-scoped.
 *
 * @param {string} sessionId Session id as supplied by the caller or the host.
 * @param {string} cwd Directory the command is acting on.
 * @returns {string} Bucket label used for pointer and run file names.
 */
export function sessionBucket(sessionId, cwd = process.cwd()) {
  const safe = safeId(sessionId);
  if (safe !== SHARED_BUCKET) return safe;
  return `${SHARED_BUCKET}-${worktreeKey(cwd)}`;
}

/** True when a bucket is a worktree-scoped form of the shared default label. */
export function isScopedDefaultBucket(bucket) {
  return String(bucket || "").startsWith(`${SHARED_BUCKET}-`);
}

/** Path of the pointer file naming the active ledger for a bucket. */
export function pointerPath(bucket, dir = runsDir()) {
  return path.join(dir, `current-${safeId(bucket)}.json`);
}

/** Path of the pre-scoping shared pointer, still read for in-flight sessions. */
export function legacyPointerPath(dir = runsDir()) {
  return path.join(dir, `current-${SHARED_BUCKET}.json`);
}

function readPointerTarget(pointer) {
  if (!existsSync(pointer)) return "";
  try {
    const target = JSON.parse(readFileSync(pointer, "utf8")).path || "";
    return target && existsSync(target) ? target : "";
  } catch {
    return "";
  }
}

/** True when a ledger file records a cwd inside the same worktree as `cwd`. */
export function ledgerOwnedByWorktree(ledgerFile, cwd = process.cwd()) {
  try {
    const ledgerCwd = JSON.parse(readFileSync(ledgerFile, "utf8")).cwd || "";
    return Boolean(ledgerCwd) && worktreeKey(ledgerCwd) === worktreeKey(cwd);
  } catch {
    return false;
  }
}

/**
 * Resolve the active ledger for a session, or "" when the session has none.
 *
 * A session that predates worktree scoping still has only the shared pointer, so
 * that pointer is honoured — but only when the ledger behind it belongs to the
 * caller's own worktree. A shared pointer aimed at another project's ledger reads
 * as "no active ledger", which is what stops the cross-project write.
 *
 * @param {string} sessionId Session id as supplied by the caller or the host.
 * @param {{cwd?: string, dir?: string}} options Directory overrides for tests.
 * @returns {string} Ledger file path or "".
 */
export function currentLedgerPath(sessionId, options = {}) {
  const cwd = options.cwd || process.cwd();
  const dir = options.dir || runsDir();
  const bucket = sessionBucket(sessionId, cwd);
  const scoped = readPointerTarget(pointerPath(bucket, dir));
  if (scoped) return scoped;
  if (!isScopedDefaultBucket(bucket)) return "";
  const legacy = readPointerTarget(legacyPointerPath(dir));
  if (!legacy) return "";
  return ledgerOwnedByWorktree(legacy, cwd) ? legacy : "";
}
