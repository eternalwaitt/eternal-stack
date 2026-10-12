import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { resolveWorkflowContract } from '../scripts/lib/workflow-contract.mjs';

const cli = path.resolve(import.meta.dirname, '../scripts/execution-ledger.mjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(t, budget = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-check-coordination-'));
  const cwd = path.join(root, 'project'); fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, 'source.js'), 'export const value = 1;\n');
  const env = { ...process.env, ETRNL_RUNS_DIR: path.join(root, 'runs'), GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'Fixture', GIT_CONFIG_KEY_1: 'user.email', GIT_CONFIG_VALUE_1: 'fixture@example.invalid' };
  for (const args of [['init', '-q'], ['add', '.'], ['commit', '-qm', 'fixture']]) assert.equal(spawnSync('git', args, { cwd, env }).status, 0);
  const contract = path.join(root, 'contract.json');
  fs.writeFileSync(contract, JSON.stringify(resolveWorkflowContract({ version: 1, intent: 'build', scope: 'contained', risk: 'low', authorizedBudget: budget })));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
  const init = run('init', '--session', 'task', '--cwd', cwd, '--workflow-contract', contract);
  assert.equal(init.status, 0, init.stderr);
  const ledgerFile = init.stdout.trim();
  assert.equal(run('set-task', '--session', 'task', '--task', 'coordination-verification',
    '--title', 'Verify substantive coordination implementation', '--owner', 'task', '--status', 'verified').status, 0);
  const missingAck = run('check-stop', '--session', 'task');
  assert.notEqual(missingAck.status, 0);
  assert.match(missingAck.stderr, /maintain authored project state/);
  const read = run('read-state', '--session', 'task', '--task', 'coordination-verification');
  assert.equal(read.status, 0, read.stderr);
  const snapshot = JSON.parse(read.stdout);
  const ack = run('record-state', '--session', 'task', '--task', 'coordination-verification',
    '--owner', 'task', '--revision', snapshot.revision, '--entry-revision', snapshot.entryRevision,
    '--learning', 'none', '--outcome', 'Coordination fixture ready for captured verification',
    '--pending', 'Retain failures and consumed coordination budgets', '--disposition', 'resolved');
  assert.equal(ack.status, 0, ack.stderr);
  const start = (name, code, options = [], extraEnv = {}) => {
    const child = spawn(process.execPath, [cli, 'run-check', '--session', 'task', '--name', name, ...options, '--', process.execPath, '-e', code], { cwd, env: { ...env, ...extraEnv } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const done = new Promise(resolve => child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr })));
    return { child, done };
  };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, cwd, env, run, start, contract, ledgerFile, ledger: () => JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) };
}
async function waitFor(file) {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(file)) { assert.ok(Date.now() < deadline, `timed out waiting for ${file}`); await delay(20); }
}
function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

test('concurrent same-check callers share one successful receipt only with an explicit input key', async t => {
  const f = fixture(t); const trace = path.join(f.root, 'trace');
  const code = `require('node:fs').appendFileSync(${JSON.stringify(trace)}, 'run\\n');setTimeout(()=>{},200)`;
  const pair = [f.start('package-a', code, ['--reuse-key', 'dependencies-v1', '--max-concurrent-checks', '2']), f.start('renamed-package-a', code, ['--reuse-key', 'dependencies-v1', '--max-concurrent-checks', '2'])];
  const results = await Promise.all(pair.map(p => p.done));
  results.forEach(r => assert.equal(r.status, 0, r.stderr));
  assert.equal(fs.readFileSync(trace, 'utf8'), 'run\n');
  assert.equal(f.ledger().workflowBudgetUsage.verificationAttempts, 1);
  assert.equal(f.ledger().checks.filter(c => c.reusedFrom).length, 1);
  assert.equal(f.run('check-stop', '--session', 'task').status, 0);
});

test('source, declared input key and environment changes invalidate opt-in reuse; default always runs', async t => {
  const f = fixture(t); const trace = path.join(f.root, 'trace');
  const code = `require('node:fs').appendFileSync(${JSON.stringify(trace)}, 'run\\n')`;
  const run = async (options, env) => { const r = await f.start('check', code, options, env).done; assert.equal(r.status, 0, r.stderr); };
  await run(['--reuse-key', 'v1']);
  await run(['--reuse-key', 'v1']);
  fs.writeFileSync(path.join(f.cwd, 'source.js'), 'export const value = 2;\n');
  await run(['--reuse-key', 'v1']);
  await run(['--reuse-key', 'v2']);
  await run(['--reuse-key', 'v2'], { ETRNL_FIXTURE_CONFIG: 'different' });
  await run([]);
  assert.equal(fs.readFileSync(trace, 'utf8').trim().split('\n').length, 5);
});

test('failed commands never reuse, and renaming a retry cannot reset the retry budget', async t => {
  const f = fixture(t, { maxRetries: 0 });
  const first = await f.start('first', 'process.exit(7)', ['--reuse-key', 'v1']).done;
  assert.equal(first.status, 1);
  const second = await f.start('renamed', 'process.exit(7)', ['--reuse-key', 'v1']).done;
  assert.equal(second.status, 1); assert.match(second.stderr, /retry-budget-exhausted/);
  assert.equal(f.ledger().checks.length, 1);
});

test('init resumes the original ledger and consumed budgets even after a plan is replaced', async t => {
  const f = fixture(t, { maxVerificationAttempts: 1 });
  assert.equal((await f.start('first', 'process.exit(0)').done).status, 0);
  const plan = path.join(f.root, 'plan.md'); fs.writeFileSync(plan, '# Updated plan\n');
  const resumed = f.run('init', '--session', 'task', '--cwd', f.cwd, '--workflow-contract', f.contract, '--plan', plan);
  assert.equal(resumed.status, 0, resumed.stderr); assert.equal(resumed.stdout.trim(), f.ledgerFile);
  const omitted = f.run('init', '--session', 'task', '--cwd', f.cwd);
  assert.equal(omitted.status, 0, omitted.stderr); assert.equal(omitted.stdout.trim(), f.ledgerFile);
  const result = await f.start('different', 'process.exit(0+0)').done;
  assert.equal(result.status, 1); assert.match(result.stderr, /verification-budget-exhausted/);
});

test('noisy checks drain all output with bounded forwarding and complete digests', async t => {
  const f = fixture(t);
  const result = await f.start('noisy', "process.stdout.write('x'.repeat(2*1024*1024))").done;
  assert.equal(result.status, 0, result.stderr);
  const row = f.ledger().checks[0];
  assert.equal(row.outputBytes, 2 * 1024 * 1024); assert.ok(row.forwardedBytes <= 256 * 1024);
  assert.ok(result.stdout.length < 257 * 1024); assert.match(result.stderr, /digests cover all 2097152 bytes/);
});

test('successful finite command cleans descendants even when they inherit output pipes', async t => {
  const f = fixture(t); const marker = path.join(f.root, 'descendant');
  const childCode = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));setInterval(()=>{},1000)`;
  const code = `const p=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'});p.unref();setTimeout(()=>process.exit(0),150)`;
  const result = await f.start('finite', code, ['--timeout-ms', '2000']).done;
  assert.equal(result.status, 0, result.stderr);
  assert.equal(isAlive(Number(fs.readFileSync(marker, 'utf8'))), false);
});

test('a killed wrapper releases admission and kills its registered command group on next admission', async t => {
  const f = fixture(t); const marker = path.join(f.root, 'child');
  const owner = f.start('killed', `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`);
  await waitFor(marker); owner.child.kill('SIGKILL');
  // SIGKILL cannot write a failed receipt, but its reserved attempt is retained.
  const next = await f.start('replacement', 'process.exit(0)').done;
  assert.equal(next.status, 0, next.stderr);
  await owner.done;
  assert.equal(isAlive(Number(fs.readFileSync(marker, 'utf8'))), false);
  assert.equal(f.ledger().workflowBudgetUsage.verificationAttempts, 2);
  assert.equal(f.ledger().workflowCheckReservations.length, 1);
});

test('distinct packages serialize by default but explicit concurrency admits parallel checks', async t => {
  const f = fixture(t); const trace = path.join(f.root, 'trace');
  const code = label => `const f=require('node:fs');f.appendFileSync(${JSON.stringify(trace)},'start-${label}\\n');setTimeout(()=>f.appendFileSync(${JSON.stringify(trace)},'end-${label}\\n'),180)`;
  const pair = [f.start('a', code('a')), f.start('b', code('b'))];
  (await Promise.all(pair.map(p => p.done))).forEach(r => assert.equal(r.status, 0, r.stderr));
  const rows = fs.readFileSync(trace, 'utf8').trim().split('\n');
  assert.ok(rows[0].startsWith('start-')); assert.ok(rows[1].startsWith('end-'));
  fs.writeFileSync(trace, '');
  // A rendezvous proves simultaneous admission without assuming CLI startup
  // and source hashing finish within a 180ms command lifetime.
  const parallelCode = label => `const f=require('node:fs');const trace=${JSON.stringify(trace)};f.appendFileSync(trace,'start-${label}\\n');const deadline=Date.now()+5000;const timer=setInterval(()=>{const rows=f.readFileSync(trace,'utf8').trim().split('\\n');if(rows.filter(row=>row.startsWith('start-')).length===2){clearInterval(timer);f.appendFileSync(trace,'end-${label}\\n')}else if(Date.now()>deadline){clearInterval(timer);process.exitCode=7}},20)`;
  const parallel = [f.start('c', parallelCode('c'), ['--max-concurrent-checks', '2']), f.start('d', parallelCode('d'), ['--max-concurrent-checks', '2'])];
  (await Promise.all(parallel.map(p => p.done))).forEach(r => assert.equal(r.status, 0, r.stderr));
  const concurrent = fs.readFileSync(trace, 'utf8').trim().split('\n');
  assert.ok(concurrent[0].startsWith('start-')); assert.ok(concurrent[1].startsWith('start-'));
});


test('a later failure invalidates an older pass even when external input identity was reused incorrectly', async t => {
  const f = fixture(t); const marker = path.join(f.root, 'fail');
  const code = `process.exit(require('node:fs').existsSync(${JSON.stringify(marker)}) ? 3 : 0)`;
  assert.equal((await f.start('changing-input', code, ['--reuse-key', 'fixed']).done).status, 0);
  fs.writeFileSync(marker, 'fail');
  assert.equal((await f.start('changing-input', code).done).status, 1);
  assert.equal((await f.start('changing-input', code, ['--reuse-key', 'fixed']).done).status, 1);
  assert.equal(f.ledger().checks.length, 3);
});


test('resume after a killed check retains consumed budget and replaces the abandoned attempt honestly', async t => {
  const f = fixture(t); const marker = path.join(f.root, 'resume');
  const code = `const fs=require('node:fs');if(fs.existsSync(${JSON.stringify(marker)}))process.exit(0);fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`;
  const owner = f.start('resumed', code);
  await waitFor(marker); owner.child.kill('SIGKILL');
  const resumed = await f.start('resumed', code).done;
  await owner.done;
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(f.ledger().workflowBudgetUsage.verificationAttempts, 2);
  assert.equal(f.ledger().workflowBudgetUsage.retries, 1);
  assert.equal(f.ledger().workflowCheckReservations.length, 0);
  assert.equal(f.run('check-stop', '--session', 'task').status, 0);
});


test('bounded output retains a late failure diagnostic after a noisy prefix', async t => {
  const f = fixture(t);
  const result = await f.start('noisy-failure', "process.stdout.write('x'.repeat(2*1024*1024),()=>{process.stderr.write('FINAL_FAILURE_DETAIL');process.exitCode=7})").done;
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FINAL_FAILURE_DETAIL/);
  assert.match(result.stderr, /truncated; final stdout\/stderr tails follow/);
  assert.ok(f.ledger().checks[0].forwardedBytes <= 256 * 1024);
  assert.equal(f.ledger().checks[0].exitCode, 7);
});
