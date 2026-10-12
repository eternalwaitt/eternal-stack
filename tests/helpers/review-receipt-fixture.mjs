// Synthetic lifecycle data for deterministic tests only. Production review admission
// must run the controller's fixed host subprocess; this helper is never installed.
import fs from 'node:fs';
import path from 'node:path';
import { digest, reviewBinding, readReviewArtifact } from '../../scripts/lib/review-evidence.mjs';
export function reviewReceiptFixture(root, ledger, treeHash, overrides = {}) {
  const requestId = 'fixture-request', implementationSession = 'fixture-author', reviewerSession = 'fixture-reviewer';
  const checkpointPath = path.join(root, 'review-checkpoint.md'); fs.writeFileSync(checkpointPath, 'Synthetic test checkpoint.');
  const result = { requestId, treeHash, verdict: 'verified', summary: 'Fixture output, no findings.', findings: [], reviewedFiles: ['source.js'], ...overrides };
  const transcriptPath = path.join(root, 'review-transcript.jsonl');
  fs.writeFileSync(transcriptPath, [
    { type: 'thread.started', thread_id: reviewerSession },
    { type: 'turn.started' },
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(result) } },
    { type: 'turn.completed' },
  ].map(row => JSON.stringify(row)).join('\n') + '\n');
  const artifactPath = path.join(root, 'review-output.json');
  fs.writeFileSync(artifactPath, JSON.stringify({ kind: 'host-review-run', reviewer: 'codex-host', requestId, treeHash, implementationSession, binding: reviewBinding(ledger), exitCode: 0, signal: null, error: '', checkpointPath, checkpointDigest: digest(fs.readFileSync(checkpointPath)), transcriptPath, transcriptDigest: digest(fs.readFileSync(transcriptPath)) }));
  return { reviewer: 'codex-host', status: 'verified', treeHash, at: new Date().toISOString(), ...readReviewArtifact(artifactPath, 'codex-host', treeHash) };
}
