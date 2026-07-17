# Reversible Compression Contract (headroom CCR)

This contract bounds context growth for read-only agents without losing evidence.

## Principle

A read-only agent writes its FULL evidence to a content-addressed artifact on
disk and returns only a receipt: `{ summary, artifactPath, contentHash }`. The
parent retrieves the raw evidence from the artifact path only when a finding
needs the detail.

## Read-only agent contract

- Write the complete evidence to an artifact with
  `writeEvidenceArtifact(agentId, evidenceText)` from
  `scripts/lib/reversible-compression.mjs` (alias `makeArtifactReceipt`).
- Return the receipt `{ agentId, artifactPath, contentHash, summary, bytes }` and
  nothing else. Do not inline the full evidence into the returned message.
- The `contentHash` is content-addressed: it hashes the evidence bytes through the
  shared 16-char SHA-256 helper (`stableHash` in `scripts/lib/etrnl-state-core.mjs`)
  and excludes wall-clock time. Identical evidence produces an identical hash.
- On any artifact write error, surface the failure. The helper fails closed and
  throws; the agent reports the write error and stops. No silent fallback.

## Parent orchestrator contract

- Before trusting cached evidence, call `verifyArtifact(receipt)`. Trust the
  cached evidence only when `verified === true`.
- A `contentHash` mismatch means the artifact was tampered with; treat the cached
  evidence as invalid and re-run the read-only agent.
- Re-read the raw artifact bytes on demand, and only when a finding needs the
  full detail.
- Record the `artifactPath` and `contentHash` in the run ledger so downstream
  waves and reviewers verify the same evidence.

## Ledger record

The `artifactPath` and `contentHash` go into the run ledger. The ledger entry
binds the summary a parent acted on to the exact evidence bytes a reviewer
re-reads and re-hashes.
