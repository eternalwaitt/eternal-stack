import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

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

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function fileSha256(file) {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compute SHA256 for ${file}: ${detail}`, { cause: error });
  }
}

export function packetHash(packet) {
  return sha256Hex(canonicalJson(packet));
}

export function isFreshIso(value, maxAgeMs, nowMs = Date.now()) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed <= maxAgeMs && parsed - nowMs <= 60_000;
}

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
