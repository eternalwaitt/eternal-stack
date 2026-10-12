import { parseClaudeReview } from './review-provider-claude.mjs';
import { knowledgeReviewBinding } from './project-knowledge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function boundedRead(file, limit = 1024 * 1024) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error('review evidence must be a bounded regular file');
  const bytes = fs.readFileSync(file);
  if (bytes.length > limit) throw new Error('review evidence exceeds size limit');
  return bytes;
}
export function reviewBinding(ledger) {
  return digest(JSON.stringify({ runId: ledger.runId, cwd: ledger.cwd, contract: ledger.workflowContract,
    tasks: (ledger.tasks || []).map(({ id, featureId, title, mode, lineageId, packetHash }) => ({ id, featureId, title, mode, lineageId, packetHash })),
    plan: ledger.planPath ? digest(boundedRead(path.resolve(ledger.cwd || process.cwd(), ledger.planPath))) : null }));
}
export function parseHostTurn(raw, expectedSession) {
  const events = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const starts = events.filter(row => row.type === 'thread.started');
  const terminal = events.findIndex(row => row.type === 'turn.completed');
  if (starts.length !== 1 || !starts[0].thread_id || (expectedSession && starts[0].thread_id !== expectedSession)
    || events.filter(row => row.type === 'turn.completed').length !== 1
    || events.findIndex(row => row.type === 'thread.started') >= terminal
    || events.some(row => ['error', 'turn.failed'].includes(row.type))) throw new Error('successful host lifecycle missing');
  return { events, session: starts[0].thread_id };
}
export function parseHostReview(raw, implementationSession, requestId, treeHash) {
  const { events, session } = parseHostTurn(raw);
  if (session === implementationSession) throw new Error('separate successful host lifecycle missing');
  const messages = events.filter(row => row.type === 'item.completed' && row.item?.type === 'agent_message');
  const result = JSON.parse(messages.at(-1)?.item?.text || 'null');
  if (!result || result.requestId !== requestId || result.treeHash !== treeHash
    || !['verified', 'changes_requested', 'blocked'].includes(result.verdict)
    || typeof result.summary !== 'string' || !result.summary.trim()
    || !Array.isArray(result.findings) || !Array.isArray(result.reviewedFiles) || !result.reviewedFiles.length
    || result.reviewedFiles.some(file => typeof file !== 'string' || !file.trim())
    || (result.verdict === 'verified' && result.findings.length)) throw new Error('invalid structured reviewer result');
  return { result, reviewerAgentId: session };
}
// No public import command admits this evidence. The controller writes receipts
// only from its own fixed child process. Direct same-user store mutation is outside
// this local integrity boundary; hashes establish freshness, not authentication.
export function readReviewArtifact(file, reviewer, treeHash) {
  const bytes = boundedRead(file);
  const capture = JSON.parse(bytes);
  if ((capture.provider && !['codex','claude'].includes(capture.provider)) || (capture.provider && reviewer !== `${capture.provider}-host`)) throw new Error('review provider identity mismatch');
  if (capture.kind !== 'host-review-run' || capture.reviewer !== reviewer || capture.treeHash !== treeHash
    || capture.exitCode !== 0 || capture.signal || capture.error || !capture.implementationSession
    || !capture.binding || !capture.requestId) throw new Error('controller-captured reviewer evidence required');
  if (capture.knowledgeBinding && (!capture.knowledgePacket || capture.knowledgeBinding !== knowledgeReviewBinding(capture.knowledgePacket.record))) throw new Error('knowledge review capture binding changed');
  const raw = boundedRead(capture.transcriptPath, 8 * 1024 * 1024);
  if (digest(raw) !== capture.transcriptDigest || digest(boundedRead(capture.checkpointPath)) !== capture.checkpointDigest) throw new Error('review capture changed');
  const parsed = capture.provider === 'claude' ? parseClaudeReview(raw.toString(),{implementationSession:capture.implementationSession,requestId:capture.requestId,treeHash}) : parseHostReview(raw.toString(), capture.implementationSession, capture.requestId, treeHash);
  if (capture.knowledgeBinding && parsed.result.knowledgeBinding !== capture.knowledgeBinding) throw new Error('review transcript is not bound to captured knowledge candidate');
  if (capture.reviewerSession && parsed.reviewerAgentId !== capture.reviewerSession) throw new Error('captured reviewer session changed');
  if (parsed.result.verdict !== 'verified') throw new Error('reviewer did not approve');
  return { artifactPath: file, artifactSha256: digest(bytes), invocationId: capture.requestId,
    reviewerAgentId: parsed.reviewerAgentId, implementationAgentId: capture.implementationSession,
    evidenceKind: 'host-review-run', binding: capture.binding };
}
export function hasReviewArtifact(review, treeHash = review?.treeHash, binding = review?.binding) {
  try {
    if (review?.evidenceKind !== 'host-review-run' || !treeHash || review.treeHash !== treeHash || review.binding !== binding) return false;
    const current = readReviewArtifact(review.artifactPath, review.reviewer, treeHash);
    return ['artifactSha256', 'invocationId', 'reviewerAgentId', 'implementationAgentId', 'binding'].every(key => current[key] === review[key]);
  } catch { return false; }
}
