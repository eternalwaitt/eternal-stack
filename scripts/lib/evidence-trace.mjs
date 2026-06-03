import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const MAX_FUTURE_SKEW_MS = 60_000;

/**
 * Returns a compact UTC ISO timestamp without milliseconds for stable ledger
 * and artifact comparisons.
 */
export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Converts arbitrary task or artifact identifiers into filesystem-safe labels,
 * falling back to a deterministic default when the input is empty.
 */
export function safeId(value, fallback = "default") {
  const raw = String(value || fallback);
  return raw.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

/**
 * Serializes values with object keys sorted recursively so hash comparisons are
 * stable across equivalent JSON object ordering.
 */
export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

/**
 * Computes the SHA-256 hex digest for a text value used in evidence fingerprints
 * and packet identity checks.
 */
export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

/**
 * Computes a file SHA-256 digest and fails with path-specific context instead
 * of silently treating unreadable files as empty evidence.
 */
export function fileSha256(file) {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compute SHA256 for ${file}: ${detail}`, { cause: error });
  }
}

/**
 * Produces the canonical packet fingerprint used to bind task packets, reviews,
 * and execution-ledger evidence.
 */
export function packetHash(packet) {
  return sha256Hex(canonicalJson(packet));
}

/**
 * Checks whether an ISO timestamp is recent enough for quality gates while
 * rejecting unparsable values and allowing up to one minute of future clock skew.
 * @throws {TypeError} When maxAgeMs is not finite.
 */
export function isFreshIso(value, maxAgeMs, nowMs = Date.now()) {
  if (!Number.isFinite(maxAgeMs)) {
    throw new TypeError("isFreshIso requires a finite maxAgeMs");
  }
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed <= maxAgeMs && parsed - nowMs <= MAX_FUTURE_SKEW_MS;
}

/**
 * Reads basic file metadata without following symlink status away, returning a
 * non-throwing absent-file shape for report validators.
 */
export function fileInfo(file) {
  if (!existsSync(file)) return { exists: false, size: 0, isFile: false, isSymlink: false };
  const lstat = lstatSync(file);
  const stat = statSync(file);
  return {
    exists: true,
    size: stat.size,
    isFile: stat.isFile(),
    isSymlink: lstat.isSymbolicLink(),
    realpath: realpathSync(file),
  };
}

/**
 * Resolves a candidate artifact path under a trusted root and rejects missing,
 * escaping, or symlink-resolved paths outside that root.
 */
export function resolveContainedPath(root, candidate) {
  const base = realpathSync(path.resolve(root));
  const raw = String(candidate || "").trim();
  if (!raw) {
    return { ok: false, error: "path is required", path: "", realpath: "", root: base };
  }
  const resolved = path.resolve(base, raw);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, error: "path escapes artifact root", path: resolved, realpath: "", root: base };
  }
  if (!existsSync(resolved)) {
    return { ok: false, error: "path does not exist", path: resolved, realpath: "", root: base };
  }
  const real = realpathSync(resolved);
  const realRelative = path.relative(base, real);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    return { ok: false, error: "real path escapes artifact root", path: resolved, realpath: real, root: base };
  }
  return { ok: true, path: resolved, realpath: real, root: base };
}
