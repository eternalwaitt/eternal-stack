import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.resolve(here, "../../../scripts/lib/reversible-compression.mjs");
const {
  writeEvidenceArtifact,
  makeArtifactReceipt,
  verifyArtifact,
  evidenceHash,
  artifactPathFor,
} = await import(libPath);

function freshRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-revcomp-"));
}

const EVIDENCE = [
  "FINDING: tenant filter missing on packages/db/reports.ts:42",
  "  where clause omits tenantId; cross-tenant read possible",
  "  fix: add where: { tenantId } to the findMany call",
].join("\n");

test("receipt content hash matches a re-hash of the artifact file", () => {
  const root = freshRoot();
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });
    assert.equal(receipt.agentId, "etrnl-quality-reviewer");
    assert.ok(receipt.artifactPath, "receipt carries an artifact path");
    assert.ok(receipt.contentHash, "receipt carries a content hash");
    assert.ok(receipt.summary, "receipt carries a summary hint");

    const onDisk = fs.readFileSync(receipt.artifactPath, "utf8");
    assert.equal(onDisk, EVIDENCE, "full evidence is persisted verbatim");

    // Re-hash the file with the shared 16-char SHA-256 convention independently.
    const rehash = crypto.createHash("sha256").update(onDisk).digest("hex").slice(0, 16);
    assert.equal(receipt.contentHash, rehash, "content hash equals a re-hash of the file");
    assert.equal(receipt.contentHash, evidenceHash(EVIDENCE), "hash is content-addressed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("content hash excludes wall-clock time (identical evidence -> identical hash)", () => {
  const first = writeEvidenceArtifact("agent-a", EVIDENCE, { root: freshRoot() });
  const second = writeEvidenceArtifact("agent-b", EVIDENCE, { root: freshRoot() });
  assert.equal(first.contentHash, second.contentHash, "same bytes hash to the same value across time and agents");
});

test("verifyArtifact confirms an untampered artifact", () => {
  const root = freshRoot();
  try {
    const receipt = makeArtifactReceipt("etrnl-spec-reviewer", EVIDENCE, { root });
    const result = verifyArtifact(receipt);
    assert.equal(result.ok, true);
    assert.equal(result.verified, true);
    assert.equal(result.actualHash, receipt.contentHash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtifact detects tampering when the artifact content changes", () => {
  const root = freshRoot();
  try {
    const receipt = writeEvidenceArtifact("etrnl-spec-reviewer", EVIDENCE, { root });

    // Tamper: rewrite the artifact bytes while keeping the stale receipt hash.
    fs.writeFileSync(receipt.artifactPath, `${EVIDENCE}\n  INJECTED: false all-clear`, { mode: 0o600 });

    const result = verifyArtifact(receipt);
    assert.equal(result.verified, false, "tampered content fails verification");
    assert.equal(result.ok, false);
    assert.notEqual(result.actualHash, receipt.contentHash, "re-hash differs from the receipt hash");
    assert.match(result.reason, /mismatch/, "reason names a hash mismatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtifact fails closed on a missing artifact", () => {
  const root = freshRoot();
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });
    fs.rmSync(receipt.artifactPath, { force: true });
    const result = verifyArtifact(receipt);
    assert.equal(result.verified, false);
    assert.equal(result.ok, false);
    assert.match(result.reason, /does not exist/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("artifactPathFor is deterministic for an agent id and hash", () => {
  const root = freshRoot();
  try {
    const hash = evidenceHash(EVIDENCE);
    const a = artifactPathFor("etrnl-quality-reviewer", hash, root);
    const b = artifactPathFor("etrnl-quality-reviewer", hash, root);
    assert.equal(a, b, "same inputs yield the same artifact path");
    assert.ok(a.startsWith(root), "artifact path lives under the artifact root");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
