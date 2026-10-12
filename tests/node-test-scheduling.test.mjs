import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
test('Node suite scheduling is bounded, configurable, and never drops a test file', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eternal-test-scheduler-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tmp, 'node'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  const run = overrides => spawnSync('bash', [path.join(root, 'tests/run-node-tests.sh')], { encoding: 'utf8', env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, TEST_JOBS: '', DOCTOR_JOBS: '', ...overrides } });
  const expected = fs.readdirSync(path.join(root, 'tests'), { recursive: true }).filter(f => f.endsWith('.test.mjs')).map(f => path.join(root, 'tests', f)).sort();
  for (const [env, jobs] of [[{}, 2], [{ DOCTOR_JOBS: '7' }, 7], [{ TEST_JOBS: '5', DOCTOR_JOBS: '7' }, 5]]) {
    const result = run(env); assert.equal(result.status, 0, result.stderr);
    const args = result.stdout.trim().split('\n');
    assert.deepEqual(args.slice(0, 2), ['--test', `--test-concurrency=${jobs}`]);
    assert.deepEqual(args.slice(2).sort(), expected);
  }
  for (const TEST_JOBS of ['0', '-1', 'invalid', '1.5']) {
    const result = run({ TEST_JOBS }); assert.equal(result.status, 2); assert.match(result.stderr, /positive integer/); assert.equal(result.stdout, '');
  }
});
