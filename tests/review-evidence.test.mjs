import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHostReview, readReviewArtifact, hasReviewArtifact } from '../scripts/lib/review-evidence.mjs';
import { reviewReceiptFixture } from './helpers/review-receipt-fixture.mjs';

test('host receipt rejects stale source, edited output, changed checkpoint and unsupported manual evidence', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = 'a'.repeat(64), review = reviewReceiptFixture(root, {}, source);
  assert.equal(hasReviewArtifact(review), true);
  assert.equal(hasReviewArtifact(review, 'b'.repeat(64)), false);
  const capture = JSON.parse(fs.readFileSync(review.artifactPath));
  fs.appendFileSync(capture.transcriptPath, '\n');
  assert.equal(hasReviewArtifact(review), false);
  const fresh = reviewReceiptFixture(root, {}, source);
  fs.writeFileSync(capture.checkpointPath, 'changed scope');
  assert.equal(hasReviewArtifact(fresh), false);
  fs.writeFileSync(review.artifactPath, JSON.stringify({ kind: 'separate-reviewer-output', verdict: 'verified', treeHash: source, output: 'fake independent output' }));
  assert.throws(() => readReviewArtifact(review.artifactPath, 'codex-host', source), /controller-captured/);
  fs.writeFileSync(review.artifactPath, 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => readReviewArtifact(review.artifactPath, 'codex-host', source), /bounded regular file/);
});

test('host lifecycle rejects same author, incomplete/failed execution and contradictory approval', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-host-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = 'a'.repeat(64), receipt = reviewReceiptFixture(root, {}, source);
  const capture = JSON.parse(fs.readFileSync(receipt.artifactPath));
  const original = fs.readFileSync(capture.transcriptPath, 'utf8').trim().split('\n').map(JSON.parse);
  const raw = events => events.map(row => JSON.stringify(row)).join('\n');
  for (const bad of [original.slice(0, -1), [...original, { type: 'turn.failed' }], original.map(row => row.type === 'thread.started' ? { ...row, thread_id: 'fixture-author' } : row)]) {
    assert.throws(() => parseHostReview(raw(bad), 'fixture-author', 'fixture-request', source), /host lifecycle/);
  }
  const contradictory = structuredClone(original);
  const message = contradictory.find(row => row.item?.type === 'agent_message');
  const result = JSON.parse(message.item.text); result.findings = ['blocking defect']; message.item.text = JSON.stringify(result);
  assert.throws(() => parseHostReview(raw(contradictory), 'fixture-author', 'fixture-request', source), /structured reviewer result/);
  for (const exitCode of [1, null]) {
    fs.writeFileSync(receipt.artifactPath, JSON.stringify({ ...capture, exitCode }));
    assert.throws(() => readReviewArtifact(receipt.artifactPath, 'codex-host', source), /controller-captured/);
  }
});
