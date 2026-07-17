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
    const result = verifyArtifact(receipt, { root });
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

    const result = verifyArtifact(receipt, { root });
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
    const result = verifyArtifact(receipt, { root });
    assert.equal(result.verified, false);
    assert.equal(result.ok, false);
    assert.match(result.reason, /does not exist/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtifact rejects a receipt whose artifactPath points outside the derived location", () => {
  const root = freshRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-revcomp-outside-"));
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });

    // A subagent crafts a receipt that keeps the real content hash but aims the
    // path at a secret file outside the evidence root.
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(secret, "SSH PRIVATE KEY MATERIAL\n");
    const forged = { ...receipt, artifactPath: secret };

    const result = verifyArtifact(forged, { root });
    assert.equal(result.verified, false, "path outside the derived location is not verified");
    assert.equal(result.ok, false);
    assert.match(result.reason, /identity/, "reason names an identity mismatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("verifyArtifact rejects a receipt with an invalid contentHash", () => {
  const root = freshRoot();
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });

    // Traversal smuggled through the content hash must be rejected before it can
    // be used to build a path.
    const forged = { ...receipt, contentHash: "../../../../etc/passwd" };
    const result = verifyArtifact(forged, { root });
    assert.equal(result.verified, false, "invalid content hash is not verified");
    assert.equal(result.ok, false);
    assert.match(result.reason, /content hash/, "reason names the bad content hash");

    // Wrong length / non-hex is also rejected.
    const badLen = verifyArtifact({ ...receipt, contentHash: "ABCDEF" }, { root });
    assert.equal(badLen.verified, false);
    assert.equal(badLen.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifyArtifact rejects a symlink at the derived path", (t) => {
  const root = freshRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-revcomp-symlink-"));
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });

    // Replace the real artifact with a symlink that (harmlessly) points at
    // matching content — a symlink must never be dereferenced into verified evidence.
    const target = path.join(outside, "linked-evidence.txt");
    fs.writeFileSync(target, EVIDENCE);
    fs.rmSync(receipt.artifactPath, { force: true });
    try {
      fs.symlinkSync(target, receipt.artifactPath);
    } catch (error) {
      t.skip(`symlink creation unsupported: ${error.message}`);
      return;
    }

    const result = verifyArtifact(receipt, { root });
    assert.equal(result.verified, false, "a symlink is not a regular file and is not verified");
    assert.equal(result.ok, false);
    assert.match(result.reason, /not a regular file/, "reason names the non-regular file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("verifyArtifact verifies the happy path with the derived path and correct hash", () => {
  const root = freshRoot();
  try {
    const receipt = writeEvidenceArtifact("etrnl-quality-reviewer", EVIDENCE, { root });
    // The receipt's own artifactPath equals the derived path, so verification passes.
    assert.equal(
      path.resolve(receipt.artifactPath),
      path.resolve(artifactPathFor(receipt.agentId, receipt.contentHash, root)),
      "receipt path equals the derived path",
    );
    const result = verifyArtifact(receipt, { root });
    assert.equal(result.verified, true);
    assert.equal(result.ok, true);
    assert.equal(result.actualHash, receipt.contentHash);
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
