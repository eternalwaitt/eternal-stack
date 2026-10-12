# Evidence handoffs without transcript replay

Use an evidence artifact when findings or command output would otherwise overwhelm the handoff. A small answer can stay inline. This is a context technique, not a new required phase or task budget.

Return the goal, findings and acceptance results, exact evidence paths, remaining work, and material limitations. Retain only relevant sanitized evidence in the host-local ignored location; never archive whole transcripts, credentials or unrelated source just to reduce the reply size.

When the installed helper is available, `writeEvidenceArtifact(agentId, evidenceText)` from `scripts/lib/reversible-compression.mjs` (alias `makeArtifactReceipt`) produces `{ agentId, artifactPath, contentHash, summary, bytes }`. Its `contentHash` uses the shared 16-character SHA-256 helper. The hash checks the saved bytes; it proves neither source freshness, reviewer identity nor correctness.

Before reusing an artifact, `verifyArtifact(receipt)` checks byte integrity. Separately compare the source/configuration/scope to the work being resumed. A mismatch means the artifact is invalid for reuse; it may be stale, corrupted or edited. Investigate the mismatch and recover the needed evidence within the existing contract budget, rather than automatically spawning the whole review again.

Read relevant raw sections only when a finding needs detail. If the helper fails, preserve its diagnostics and mark the artifact unavailable. Continue independent work and provide the bounded findings inline when that safely conveys the evidence; do not claim the missing artifact exists. If the active contract specifically requires it, report that requirement incomplete.

When a run ledger is active, record the artifact path and digest with the existing task identity and remaining budget. Handoff, restoration, a new filename, or a new reviewer label does not reset that budget.
