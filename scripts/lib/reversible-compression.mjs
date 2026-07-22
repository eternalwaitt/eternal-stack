import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stableHash } from "./etrnl-state-core.mjs";

/**
 * Headroom CCR (context compression ratio) contract for read-only agents.
 *
 * A read-only agent writes its FULL evidence to an artifact on disk and returns
 * only a receipt of { summary, artifactPath, contentHash }. The parent verifies
 * the content hash before trusting cached evidence and re-reads the raw artifact
 * only when a finding needs the detail. This bounds context growth without
 * losing evidence.
 *
 * The content hash is content-addressed only: it hashes the evidence bytes and
 * never mixes in wall-clock time, so identical evidence yields an identical hash
 * and tampering is detectable by re-hashing the file.
 */

const DEFAULT_SUMMARY_CHARS = 280;
const DEFAULT_LOG_TAIL_LINES = 20;
const DEFAULT_SEARCH_TOP_K = 10;
const DEFAULT_FAILURE_LINE_PATTERN = /\b(error|fail(?:ed|ure)?|exception|panic|fatal|stderr)\b/i;

/** Resolve the root directory that holds reversible-compression evidence artifacts. */
export function artifactRoot(explicit = "") {
  return path.resolve(
    explicit ||
      process.env.ETRNL_ARTIFACT_DIR ||
      path.join(
        process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude"),
        "etrnl",
        "artifacts",
      ),
  );
}

/** Convert an arbitrary agent id into a filesystem-safe label without collapsing to empty. */
function safeAgentId(agentId) {
  const raw = String(agentId || "").replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^_+|_+$/g, "");
  return raw || "agent";
}

/** Content-address evidence text with the shared 16-char SHA-256 helper (no wall-clock input). */
export function evidenceHash(evidenceText) {
  return stableHash(String(evidenceText));
}

/** First non-empty line of the evidence, bounded, used as a receipt summary hint. */
function summaryHint(evidenceText, maxChars = DEFAULT_SUMMARY_CHARS) {
  const firstLine = String(evidenceText).split(/\r?\n/).find((line) => line.trim()) || "";
  return Array.from(firstLine.trim()).slice(0, Math.max(1, Number(maxChars) || DEFAULT_SUMMARY_CHARS)).join("");
}

/** Compute the deterministic artifact path for an agent id and content hash. */
export function artifactPathFor(agentId, contentHash, root = artifactRoot()) {
  return path.join(root, safeAgentId(agentId), `${contentHash}.evidence.txt`);
}

/**
 * Write full evidence to a content-addressed artifact and return the receipt the
 * read-only agent hands back to its parent. Fails closed: any write error is
 * surfaced to the caller instead of being swallowed behind a default receipt.
 */
export function writeEvidenceArtifact(agentId, evidenceText, options = {}) {
  const evidence = String(evidenceText);
  const contentHash = evidenceHash(evidence);
  const root = artifactRoot(options.root);
  const artifactPath = artifactPathFor(agentId, contentHash, root);
  try {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });
    const tmp = `${artifactPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, evidence, { mode: 0o600 });
    fs.renameSync(tmp, artifactPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write evidence artifact for ${safeAgentId(agentId)} at ${artifactPath}: ${detail}`, {
      cause: error,
    });
  }
  return {
    agentId: safeAgentId(agentId),
    artifactPath,
    contentHash,
    summary: summaryHint(evidence, options.summaryChars),
    bytes: Buffer.byteLength(evidence),
  };
}

/**
 * Build a receipt for an agent's evidence and write the artifact. This is the
 * named contract helper: makeArtifactReceipt(agentId, evidenceText) ->
 * { agentId, artifactPath, contentHash, summary, bytes }.
 */
export function makeArtifactReceipt(agentId, evidenceText, options = {}) {
  return writeEvidenceArtifact(agentId, evidenceText, options);
}

/**
 * Headroom log-tail compaction: keep failure-marked lines plus the last N lines.
 * Returns compacted text and a receipt for the full evidence artifact.
 */
export function compactLogTail(evidenceText, options = {}) {
  const tailLines = Math.max(1, Number(options.tailLines) || DEFAULT_LOG_TAIL_LINES);
  const failurePattern = options.failurePattern ?? DEFAULT_FAILURE_LINE_PATTERN;
  const lines = String(evidenceText).split(/\r?\n/);
  const keepIndexes = new Set();

  lines.forEach((line, index) => {
    if (failurePattern.test(line)) keepIndexes.add(index);
  });
  const tailStart = Math.max(0, lines.length - tailLines);
  for (let index = tailStart; index < lines.length; index += 1) {
    keepIndexes.add(index);
  }

  const compacted = [...keepIndexes]
    .sort((left, right) => left - right)
    .map((index) => lines[index])
    .join("\n");
  const receipt = writeEvidenceArtifact(options.agentId || "log-tail", evidenceText, options);

  return {
    mode: "log-tail",
    compacted,
    receipt,
    keptLines: keepIndexes.size,
    omittedLines: Math.max(0, lines.length - keepIndexes.size),
    totalLines: lines.length,
  };
}

/**
 * Headroom search-results compaction: keep the top-K non-empty hit lines.
 * Returns compacted text and a receipt for the full evidence artifact.
 */
export function compactSearchResults(evidenceText, options = {}) {
  const topK = Math.max(1, Number(options.topK) || DEFAULT_SEARCH_TOP_K);
  const lines = String(evidenceText).split(/\r?\n/).filter((line) => line.trim().length > 0);
  const compacted = lines.slice(0, topK).join("\n");
  const receipt = writeEvidenceArtifact(options.agentId || "search-results", evidenceText, options);

  return {
    mode: "search-results",
    compacted,
    receipt,
    keptLines: Math.min(topK, lines.length),
    omittedLines: Math.max(0, lines.length - topK),
    totalLines: lines.length,
  };
}

/**
 * Verify a receipt against the artifact on disk. Re-reads the artifact bytes,
 * re-hashes them, and reports whether the stored evidence still matches the
 * receipt's content hash. Detects tampering (content changed -> hash mismatch)
 * and fails closed on read errors rather than returning a trusted result.
 */
export function verifyArtifact(receipt, options = {}) {
  if (!receipt || typeof receipt !== "object") {
    return { ok: false, verified: false, reason: "receipt is required" };
  }
  const receiptPath = String(receipt.artifactPath || "");
  const expectedHash = String(receipt.contentHash || "");
  if (!receiptPath) return { ok: false, verified: false, reason: "receipt is missing artifactPath" };
  if (!expectedHash) return { ok: false, verified: false, reason: "receipt is missing contentHash" };
  // The content hash is a 16-char lowercase hex slice of SHA-256. Reject anything
  // else before it can be used to derive a path, so a crafted receipt cannot smuggle
  // path separators or traversal segments into the derived location.
  if (!/^[0-9a-f]{16}$/.test(expectedHash)) {
    return { ok: false, verified: false, reason: "receipt contentHash is not a 16-char hex content hash", expectedHash };
  }
  // Derive the only path this receipt's identity (agentId + contentHash) may point at.
  // Never trust receipt.artifactPath directly: a subagent could aim it at any readable
  // file outside the evidence root and have the parent consume that content as "verified".
  const root = artifactRoot(options.root);
  const expectedPath = artifactPathFor(receipt.agentId, expectedHash, root);
  const artifactPath = path.resolve(expectedPath);
  if (path.resolve(receiptPath) !== artifactPath) {
    return {
      ok: false,
      verified: false,
      reason: "artifactPath does not match receipt identity",
      artifactPath: receiptPath,
      expectedPath,
    };
  }
  if (!fs.existsSync(artifactPath)) {
    return { ok: false, verified: false, reason: "artifact does not exist", artifactPath };
  }
  // Canonicalize both the root and the artifact's parent directory before trusting
  // the lexical identity match. path.resolve is purely lexical, so a symlinked PARENT
  // directory (e.g. a symlinked agent dir) can redirect the real artifact location
  // OUTSIDE the evidence root while the final path component still appears to be a
  // regular file. realpathSync resolves every intermediate symlink, so we can require
  // the artifact's real parent to be the canonical root or a directory beneath it.
  let canonicalRoot = "";
  let realParent = "";
  try {
    canonicalRoot = fs.realpathSync(root);
    realParent = fs.realpathSync(path.dirname(artifactPath));
  } catch (error) {
    // A missing component (root or parent) is treated as a non-existent artifact
    // rather than a thrown error, matching the not-exist/failure behavior above.
    if (error && error.code === "ENOENT") {
      return { ok: false, verified: false, reason: "artifact does not exist", artifactPath };
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resolve evidence artifact path at ${artifactPath}: ${detail}`, { cause: error });
  }
  // Require the real parent to be the canonical root itself, or a directory strictly
  // beneath it (canonical root + a path separator prefix). A symlinked parent that
  // escapes the root fails this containment check before any bytes are read.
  const isContained =
    realParent === canonicalRoot || realParent.startsWith(canonicalRoot + path.sep);
  if (!isContained) {
    return {
      ok: false,
      verified: false,
      reason: "artifact real parent directory escapes the evidence root",
      artifactPath,
    };
  }
  // Only read regular files. A symlink, directory, device, or FIFO at the derived
  // path must never be dereferenced into "verified" evidence.
  let stat;
  try {
    stat = fs.lstatSync(artifactPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to stat evidence artifact at ${artifactPath}: ${detail}`, { cause: error });
  }
  if (!stat.isFile()) {
    return { ok: false, verified: false, reason: "artifact is not a regular file", artifactPath };
  }
  let actualHash = "";
  try {
    const evidence = fs.readFileSync(artifactPath, "utf8");
    actualHash = evidenceHash(evidence);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read evidence artifact at ${artifactPath}: ${detail}`, { cause: error });
  }
  const verified = actualHash === expectedHash;
  return {
    ok: verified,
    verified,
    artifactPath,
    expectedHash,
    actualHash,
    reason: verified ? "content hash matches stored evidence" : "content hash mismatch: artifact was tampered with",
    ...(options.includeRoot ? { root } : {}),
  };
}
