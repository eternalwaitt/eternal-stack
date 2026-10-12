import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { worktreeHash } from '../scripts/lib/etrnl-state-core.mjs';

test('candidate setup excludes owned runtime artifacts but retains application-source identity', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-eval-prepare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'etrnl-eval-project');
  const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, 'companion-evaluation/prepare.mjs'), 'invoice-retry', project, '--candidate'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const initial = worktreeHash(project); assert.ok(initial);
  const identity = JSON.parse(fs.readFileSync(path.join(project, '.candidate-home/evaluation-install-identity.json')));
  assert.equal(Object.keys(identity).length, 4);
  Object.values(identity).forEach(hash => assert.match(hash, /^[a-f0-9]{64}$/));
  fs.writeFileSync(path.join(project, '.companion-handoff.md'), 'checkpoint');
  fs.writeFileSync(path.join(project, '.candidate-home/runtime-note'), 'review receipt');
  fs.writeFileSync(path.join(project, '.injected-test-launch-failure-used'), 'used');
  assert.equal(worktreeHash(project), initial);
  fs.appendFileSync(path.join(project, 'packages/billing/retry.js'), '\n// application change\n');
  assert.notEqual(worktreeHash(project), initial);
  fs.writeFileSync(path.join(project, 'new-application.js'), 'export const changed = true;');
  const firstNew = worktreeHash(project);
  fs.appendFileSync(path.join(project, 'new-application.js'), '\nexport const another = true;');
  assert.notEqual(worktreeHash(project), firstNew);
});
