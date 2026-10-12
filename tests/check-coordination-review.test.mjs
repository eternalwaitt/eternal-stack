import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveWorkflowContract } from '../scripts/lib/workflow-contract.mjs';
const cli = path.resolve(import.meta.dirname, '../scripts/execution-ledger.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-review-coordination-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'project'); fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, 'source'), 'source');
  const env = { ...process.env, ETRNL_RUNS_DIR: path.join(root, 'runs') };
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]) assert.equal(spawnSync('git', args, { cwd, env }).status, 0);
  const contract = path.join(root, 'contract.json');
  fs.writeFileSync(contract, JSON.stringify(resolveWorkflowContract({ version: 1, intent: 'build', scope: 'contained', risk: 'low' })));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 10000 });
  const init = run('init', '--session', 'review', '--cwd', cwd, '--workflow-contract', contract);
  assert.equal(init.status, 0, init.stderr);
  return { root, cwd, contract, run, ledgerFile: init.stdout.trim() };
}

test('independent regression: contract omission cannot erase prior retry history', t => {
  const f = fixture(t);
  const failed = f.run('run-check', '--session', 'review', '--name', 'failure', '--', process.execPath, '-e', 'process.exit(1)');
  assert.equal(failed.status, 1);
  const resumed = f.run('init', '--session', 'review', '--cwd', f.cwd);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(resumed.stdout.trim(), f.ledgerFile);
  const state = JSON.parse(fs.readFileSync(f.ledgerFile, 'utf8'));
  assert.equal(state.checks.length, 1);
  assert.equal(state.workflowBudgetUsage.verificationAttempts, 1);
  assert.ok(state.workflowContract);
});

test('independent regression: a newer failed command invalidates an older reusable pass', t => {
  const f = fixture(t), marker = path.join(f.root, 'next-call-fails');
  // Simulate a flaky check without changing its source/argv/environment identity.
  const code = `const fs=require('node:fs'); if(fs.existsSync(${JSON.stringify(marker)})) process.exit(9); fs.writeFileSync(${JSON.stringify(marker)},'1');`;
  const run = (name, reuse) => f.run('run-check', '--session', 'review', '--name', name, ...(reuse ? ['--reuse-key', 'fixture-inputs'] : []), '--', process.execPath, '-e', code);
  assert.equal(run('first', true).status, 0);
  assert.equal(run('second', false).status, 1);
  const result = run('renamed', true);
  assert.equal(result.status, 1, result.stdout);
  assert.doesNotMatch(result.stdout, /Reused command check/);
  const ledger = JSON.parse(fs.readFileSync(f.ledgerFile, 'utf8'));
  assert.equal(ledger.checks.at(-1).status, 'failed');
});
