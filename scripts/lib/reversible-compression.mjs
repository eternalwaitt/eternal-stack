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
 * Verify a receipt against the artifact on disk. Re-reads the artifact bytes,
 * re-hashes them, and reports whether the stored evidence still matches the
 * receipt's content hash. Detects tampering (content changed -> hash mismatch)
 * and fails closed on read errors rather than returning a trusted result.
 */
export function verifyArtifact(receipt, options = {}) {
  if (!receipt || typeof receipt !== "object") {
    return { ok: false, verified: false, reason: "receipt is required" };
  }
  const artifactPath = String(receipt.artifactPath || "");
  const expectedHash = String(receipt.contentHash || "");
  if (!artifactPath) return { ok: false, verified: false, reason: "receipt is missing artifactPath" };
  if (!expectedHash) return { ok: false, verified: false, reason: "receipt is missing contentHash" };
  if (!fs.existsSync(artifactPath)) {
    return { ok: false, verified: false, reason: "artifact does not exist", artifactPath };
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
    ...(options.includeRoot ? { root: artifactRoot(options.root) } : {}),
  };
}
