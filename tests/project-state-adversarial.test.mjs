import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { resolveWorkflowContract } from '../scripts/lib/workflow-contract.mjs';
import { worktreeHash } from '../scripts/lib/etrnl-state-core.mjs';
import { stateAckErrors } from '../scripts/lib/project-state.mjs';
import { STATE_START, STATE_END, normalizeProjectStateSource } from '../scripts/lib/project-state-format.mjs';
const cli = path.resolve(import.meta.dirname, '../scripts/execution-ledger.mjs');
const authored = '# Product state\n\n## Features\n\nF1: implemented locally; production unverified.\n\n## Pending\n\nP1: preserve this unfinished migration.\n\n## Lessons\n\nL1: require current evidence; cause confirmed by synthetic regression.\n\n';
const document = generated => `${authored}${STATE_START}\n${generated}\n${STATE_END}\n`;
function fixture(t, { state = 'PROJECT_STATE.md', intent = 'fix', scope = 'coupled', risk = 'high', committed = true, workKind = 'substantive' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-project-state-independent-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'project'); fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, 'app.js'), 'export const value = 1;\n');
  if (state) { fs.mkdirSync(path.dirname(path.join(cwd, state)), { recursive: true }); fs.writeFileSync(path.join(cwd, state), document('No run yet.')); }
  const git = (...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git('init', '-q'); if (committed) { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'); }
  const contract = path.join(root, 'contract.json'); fs.writeFileSync(contract, JSON.stringify(resolveWorkflowContract({ version: 1, intent, scope, risk, workKind })));
  const env = { ...process.env, ETRNL_RUNS_DIR: path.join(root, 'runs') };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 15000 });
  const init = (session = 'author', extra = []) => { const r = run('init', '--session', session, '--cwd', cwd, '--workflow-contract', contract, ...extra); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  return { root, cwd, state, env, git, run, init, read: file => JSON.parse(fs.readFileSync(file)) };
}
test('only exact managed state bytes are hash-neutral in working tree and index', t => {
  const f = fixture(t), file = path.join(f.cwd, f.state), before = worktreeHash(f.cwd); assert.ok(before);
  fs.writeFileSync(file, document('A different generated status.')); assert.equal(worktreeHash(f.cwd), before);
  f.git('add', f.state); assert.equal(worktreeHash(f.cwd), before);
  fs.writeFileSync(file, document('Another generated status.')); assert.equal(worktreeHash(f.cwd), before);
  fs.writeFileSync(file, document('Another generated status.').replace('unfinished migration', 'new accepted scope'));
  const changed = worktreeHash(f.cwd); assert.ok(changed); assert.notEqual(changed, before);
  f.git('add', f.state); fs.writeFileSync(file, document('Restored worktree generated status.'));
  assert.notEqual(worktreeHash(f.cwd), before, 'staged authored scope must remain part of evidence');
  fs.writeFileSync(path.join(f.cwd, 'README.md'), document('outside allowlist'));
  const outside = worktreeHash(f.cwd); fs.writeFileSync(path.join(f.cwd, 'README.md'), document('changed outside allowlist'));
  assert.notEqual(worktreeHash(f.cwd), outside);
});
test('existing canonical document survives mutations and a fresh session without a competing document', t => {
  const f = fixture(t, { state: 'docs/CURRENT_STATE.md' }), file = path.join(f.cwd, f.state), before = normalizeProjectStateSource(fs.readFileSync(file, 'utf8'));
  const ledger = f.init('first', ['--state-path', f.state]);
  assert.equal(f.run('set-task', '--session', 'first', '--task', 'work', '--title', 'Implement fixture', '--status', 'in_progress').status, 0);
  assert.equal(f.run('record-state', '--session', 'first', '--learning', 'none', '--outcome', 'Fixture implementation recorded; local verification pending.', '--pending', 'P1 migration remains pending.').status, 0);
  assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  f.init('second', ['--state-path', f.state]);
  const context = f.run('project-state', '--cwd', f.cwd, '--state-path', f.state);
  assert.equal(context.status, 0, context.stderr); assert.match(context.stdout, /P1: preserve this unfinished migration/); assert.match(context.stdout, /L1: require current evidence/);
  assert.ok(normalizeProjectStateSource(fs.readFileSync(file, 'utf8')).includes(before.split(STATE_START)[0]));
  assert.match(context.stdout, /Outcome \(author-reported\): Fixture implementation/);
  assert.equal(fs.existsSync(path.join(f.cwd, 'PROJECT_STATE.md')), false);
});
test('acknowledgment is bound to authored state, source and task scope, never to machine-only refresh', t => {
  const f = fixture(t), ledger = f.init(), file = path.join(f.cwd, f.state);
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'work', '--title', 'Accepted scope', '--status', 'in_progress').status, 0);
  assert.notEqual(f.run('check-stop', '--session', 'author').status, 0);
  assert.equal(f.run('record-state', '--session', 'author', '--learning', 'none', '--outcome', 'Fixture implementation recorded; local verification pending.', '--pending', 'P1 migration remains pending.').status, 0);
  assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'work', '--status', 'verified').status, 0);
  assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('unfinished migration', 'changed pending scope'));
  assert.match(stateAckErrors(f.read(ledger)).join(' '), /stale/);
  assert.equal(f.run('record-state', '--session', 'author', '--learning', 'updated', '--outcome', 'Updated pending scope recorded.', '--pending', 'Changed pending scope remains unresolved.').status, 0);
  fs.appendFileSync(path.join(f.cwd, 'app.js'), 'export const extra = 2;\n');
  assert.match(stateAckErrors(f.read(ledger)).join(' '), /stale/);
  assert.equal(f.run('record-state', '--session', 'author', '--learning', 'none', '--outcome', 'Fixture implementation recorded; local verification pending.', '--pending', 'P1 migration remains pending.').status, 0);
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'work', '--title', 'Different scope', '--status', 'verified').status, 0);
  assert.match(stateAckErrors(f.read(ledger)).join(' '), /stale/);
});
test('malformed or conflicted state fails closed without clobbering authored text', t => {
  const f = fixture(t), ledger = f.init(), file = path.join(f.cwd, f.state), valid = fs.readFileSync(file, 'utf8');
  for (const bad of [valid + STATE_END, valid.replace(STATE_END, ''), valid + '\n<<<<<<< other\nconflict\n=======\nlocal\n>>>>>>> local\n']) {
    fs.writeFileSync(file, bad); assert.equal(worktreeHash(f.cwd), '');
    const result = f.run('set-task', '--session', 'author', '--task', 'work', '--status', 'verified');
    assert.notEqual(result.status, 0); assert.equal(fs.readFileSync(file, 'utf8'), bad);
    assert.ok(stateAckErrors(f.read(ledger)).length);
  }
});
test('read-only and tiny direct work do not bootstrap state; explanation does not modify existing state', t => {
  for (const options of [{ intent: 'explain', scope: 'contained', risk: 'low' }, { intent: 'fix', scope: 'contained', risk: 'low', workKind: 'trivial' }]) {
    const f = fixture(t, { ...options, state: null }); f.init(); assert.equal(fs.existsSync(path.join(f.cwd, 'PROJECT_STATE.md')), false);
  }
  const f = fixture(t, { intent: 'explain', scope: 'contained', risk: 'low' }), file = path.join(f.cwd, f.state), before = fs.readFileSync(file, 'utf8');
  f.init(); assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('generated evidence never promotes self-report to feature readiness or exports private task/command text', t => {
  const f = fixture(t), ledger = f.init(), sentinel = '/Users/private-owner/secret-token-never-publish';
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'work', '--title', sentinel, '--status', 'verified').status, 0);
  assert.equal(f.run('record-check', '--session', 'author', '--name', 'private-check', '--status', 'passed', '--command', sentinel).status, 0);
  const text = fs.readFileSync(path.join(f.cwd, f.state), 'utf8'), block = text.split(STATE_START)[1].split(STATE_END)[0];
  assert.equal(text.includes(sentinel), false); assert.match(block, /not established/); assert.match(block, /current captured passes: 0/);
  assert.match(text, /production unverified/); assert.ok(stateAckErrors(f.read(ledger)).length);
});
test('concurrent helper mutations preserve authored scope and all task records', async t => {
  const f = fixture(t), ledger = f.init(), file = path.join(f.cwd, f.state), before = normalizeProjectStateSource(fs.readFileSync(file, 'utf8'));
  const results = await Promise.all(Array.from({ length: 6 }, (_, n) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'set-task', '--session', 'author', '--task', `work-${n}`, '--title', `Fixture task ${n}`, '--status', 'pending'], { cwd: f.cwd, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', data => stderr += data); child.once('error', reject); child.once('close', code => resolve({ code, stderr }));
  })));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(f.read(ledger).tasks.length, 6); assert.equal(normalizeProjectStateSource(fs.readFileSync(file, 'utf8')), before);
  assert.match(fs.readFileSync(file, 'utf8'), /Tasks: 6; unresolved: 6/);
});
test('symlink output cannot modify a file outside the repository', t => {
  const f = fixture(t, { state: null }), outside = path.join(f.root, 'outside.md'); fs.writeFileSync(outside, 'keep outside bytes');
  fs.symlinkSync(outside, path.join(f.cwd, 'PROJECT_STATE.md'));
  const result = f.run('init', '--session', 'author', '--cwd', f.cwd, '--workflow-contract', path.join(f.root, 'contract.json'));
  assert.notEqual(result.status, 0); assert.equal(fs.readFileSync(outside, 'utf8'), 'keep outside bytes');
});
test('a generic unchanged document cannot acknowledge a new substantive task outcome', t => {
  const f = fixture(t); f.init();
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'brand-new-feature', '--title', 'Add an unrecorded feature', '--status', 'in_progress').status, 0);
  const result = f.run('record-state', '--session', 'author', '--learning', 'none');
  assert.notEqual(result.status, 0, 'current source/digest is insufficient without a task-linked authored outcome or explicit no-change reason');
});
test('inline or fenced marker examples cannot be masked as generated project evidence', t => {
  const f = fixture(t), file = path.join(f.cwd, f.state);
  for (const text of [`${authored}Narrative ${STATE_START} hidden authored claim ${STATE_END}\n`, `${authored}\n\x60\x60\x60md\n${STATE_START}\nauthored example\n${STATE_END}\n\x60\x60\x60\n`]) {
    fs.writeFileSync(file, text);
    assert.equal(worktreeHash(f.cwd), '', 'malformed or example delimiters must not create a hash-neutral authored region');
  }
});
test('unchanged reason needs prior current-task maintenance and cannot replace another task outcome', t => {
  const f = fixture(t), ledger = f.init();
  f.run('set-task', '--session', 'author', '--task', 'work', '--title', 'Current task', '--status', 'in_progress');
  const unchanged = () => f.run('record-state', '--session', 'author', '--learning', 'none', '--unchanged-reason', 'Verification-only change preserves the documented outcome and pending decision.');
  assert.notEqual(unchanged().status, 0);
  const maintained = f.run('record-state', '--session', 'author', '--learning', 'none', '--outcome', 'Current task implemented; validation pending.', '--pending', 'P1 migration remains queued.');
  assert.equal(maintained.status, 0, maintained.stderr);
  fs.appendFileSync(path.join(f.cwd, 'app.js'), '// verification-only adjustment\n');
  assert.ok(stateAckErrors(f.read(ledger)).length);
  const renewed = unchanged(); assert.equal(renewed.status, 0, renewed.stderr); assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  f.run('set-task', '--session', 'author', '--task', 'different', '--title', 'Different task', '--status', 'in_progress');
  assert.notEqual(unchanged().status, 0);
});
test('forged generated completion is excluded from startup and replaced by actual mutation evidence', t => {
  const f = fixture(t); f.init(); const file = path.join(f.cwd, f.state);
  fs.writeFileSync(file, document('FORGED_ALL_FEATURES_READY_AND_COMPLETE'));
  const context = f.run('project-state', '--cwd', f.cwd);
  assert.equal(context.status, 0); assert.doesNotMatch(context.stdout, /FORGED_ALL/);
  assert.notEqual(f.run('check-stop', '--session', 'author').status, 0);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /FORGED_ALL/);
  assert.match(fs.readFileSync(file, 'utf8'), /Completion: not established/);
});
test('missing bound document blocks completion and preserves canonical mutations without recreating authored content', t => {
  const f = fixture(t), ledger = f.init(), file = path.join(f.cwd, f.state);
  fs.unlinkSync(file);
  assert.notEqual(f.run('check-stop', '--session', 'author').status, 0);
  assert.equal(fs.existsSync(file), false);
  const resumed = f.run('init', '--session', 'author', '--cwd', f.cwd, '--workflow-contract', path.join(f.root, 'contract.json'));
  assert.notEqual(resumed.status, 0, 'resuming must not recreate lost authored state as a blank scaffold');
  assert.equal(fs.existsSync(file), false);
  const mutation = f.run('set-task', '--session', 'author', '--task', 'retained', '--status', 'in_progress');
  assert.notEqual(mutation.status, 0);
  assert.equal(f.read(ledger).tasks.some(task => task.id === 'retained'), true, 'projection failure cannot erase canonical task mutation');
  assert.equal(fs.existsSync(file), false);
});
test('ambiguous documents require explicit binding and neither document is overwritten', t => {
  const f = fixture(t), second = path.join(f.cwd, 'CURRENT_STATE.md'); fs.writeFileSync(second, '# Other durable state\n');
  const original = fs.readFileSync(path.join(f.cwd, f.state), 'utf8');
  const result = f.run('init', '--session', 'author', '--cwd', f.cwd, '--workflow-contract', path.join(f.root, 'contract.json'));
  assert.notEqual(result.status, 0); assert.equal(fs.readFileSync(second, 'utf8'), '# Other durable state\n');
  assert.equal(fs.readFileSync(path.join(f.cwd, f.state), 'utf8'), original);
});
test('ordinary Setext headings remain authored and nested working directory hashes include root untracked files', t => {
  const f = fixture(t), file = path.join(f.cwd, f.state);
  fs.writeFileSync(file, document('No run yet.').replace('# Product state', 'Product state\n============='));
  assert.ok(worktreeHash(f.cwd));
  fs.mkdirSync(path.join(f.cwd, 'nested')); fs.writeFileSync(path.join(f.cwd, 'untracked.mjs'), 'export const extra = 1;\n');
  const before = worktreeHash(f.cwd); assert.ok(before); assert.equal(worktreeHash(path.join(f.cwd, 'nested')), before);
  fs.writeFileSync(path.join(f.cwd, 'untracked.mjs'), 'export const extra = 2;\n');
  const after = worktreeHash(path.join(f.cwd, 'nested')); assert.ok(after); assert.notEqual(after, before); assert.equal(after, worktreeHash(f.cwd));
});
test('review registration rejects missing and stale state acknowledgment before consuming review budget', t => {
  const f = fixture(t), ledger = f.init();
  f.run('set-task', '--session', 'author', '--task', 'work', '--title', 'Review current work', '--status', 'in_progress');
  const checkpoint = path.join(f.root, 'checkpoint.md'); fs.writeFileSync(checkpoint, 'Current implementation awaits review.');
  const request = () => spawnSync(process.execPath, [cli, 'request-review', '--session', 'author', '--checkpoint', checkpoint], { cwd: f.cwd, env: { ...f.env, CODEX_THREAD_ID: '00000000-0000-4000-8000-000000000001' }, encoding: 'utf8', timeout: 15000 });
  const initialBudget = JSON.stringify(f.read(ledger).workflowBudgetUsage);
  const missing = request(); assert.notEqual(missing.status, 0); assert.match(missing.stderr, /state/);
  const maintained = f.run('record-state', '--session', 'author', '--learning', 'none', '--outcome', 'Implementation ready for independent review.', '--pending', 'Review remains pending; migration P1 stays queued.');
  assert.equal(maintained.status, 0, maintained.stderr);
  fs.appendFileSync(path.join(f.cwd, 'app.js'), '// changed after state maintenance\n');
  const stale = request(); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /stale/);
  assert.equal(f.read(ledger).reviewRequest, undefined); assert.equal(JSON.stringify(f.read(ledger).workflowBudgetUsage), initialBudget);
});

test('unborn repository retains meaningful source freshness and required state without a synthetic commit', t => {
  const f = fixture(t, { committed: false, state: null }), before = worktreeHash(f.cwd);
  assert.ok(before, 'unborn git repository has a real worktree identity');
  fs.appendFileSync(path.join(f.cwd, 'app.js'), 'export const added = 2;\n');
  const changed = worktreeHash(f.cwd); assert.ok(changed); assert.notEqual(changed, before);
  f.git('add', 'app.js'); const staged = worktreeHash(f.cwd); assert.ok(staged); assert.notEqual(staged, changed);
  fs.appendFileSync(path.join(f.cwd, 'app.js'), '// unstaged detail\n'); assert.notEqual(worktreeHash(f.cwd), staged);
  const ledger = f.init();
  assert.equal(f.run('set-task', '--session', 'author', '--task', 'first', '--title', 'Initial implementation', '--status', 'verified').status, 0);
  const maintained = f.run('record-state', '--session', 'author', '--learning', 'none', '--outcome', 'Initial local implementation ready for verification.', '--pending', 'No remaining fixture feature work; independent review pending.');
  assert.equal(maintained.status, 0, maintained.stderr); assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  const checked = f.run('run-check', '--session', 'author', '--name', 'initial-check', '--', process.execPath, '-e', 'process.exit(0)');
  assert.equal(checked.status, 0, checked.stderr); assert.deepEqual(stateAckErrors(f.read(ledger)), []);
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: f.cwd, encoding: 'utf8' });
  assert.notEqual(head.status, 0, 'helper must not create a dummy commit');
  fs.appendFileSync(path.join(f.cwd, 'app.js'), '// later change\n'); assert.ok(stateAckErrors(f.read(ledger)).length);
});
test('unborn fallback never conceals a corrupt detached HEAD or an existing corrupt branch ref', t => {
  const f = fixture(t, { committed: false }), head = path.join(f.cwd, '.git/HEAD'), original = fs.readFileSync(head, 'utf8');
  fs.writeFileSync(head, '0000000000000000000000000000000000000001\n'); assert.equal(worktreeHash(f.cwd), '');
  fs.writeFileSync(head, original);
  const reference = original.trim().replace(/^ref: /, ''); fs.mkdirSync(path.dirname(path.join(f.cwd, '.git', reference)), { recursive: true });
  fs.writeFileSync(path.join(f.cwd, '.git', reference), '0000000000000000000000000000000000000001\n'); assert.equal(worktreeHash(f.cwd), '');
});
test('large project state preserves bounded startup skill, workflow and learning hints', t => {
  const f = fixture(t), ledger = f.init('startup'), root = path.resolve(import.meta.dirname, '..');
  f.run('set-task', '--session', 'startup', '--task', 'work', '--title', 'Pending work', '--status', 'in_progress');
  const file = path.join(f.cwd, f.state); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Features', `${'Durable authored detail. '.repeat(200)}\n\n## Features`));
  const env = { ...f.env, CLAUDE_GUARD_STATE_DIR: path.join(f.root, 'guard'), ETRNL_STATE_DIR: path.join(f.root, 'state'), ETRNL_ARTIFACTS_DIR: path.join(f.root, 'artifacts'), ETRNL_BUGLOG: path.join(f.root, 'buglog.jsonl'), ETRNL_LEARNING_STARTUP_HINTS: '1', ETRNL_UPDATE_CHECK: '0', ETRNL_TOOL_UPDATE_CHECK: '0', ETRNL_SKILL_UPDATE_CHECK: '0', CLAUDE_GUARD_DISABLE_HINDSIGHT_LESSON: '1' };
  fs.mkdirSync(env.CLAUDE_GUARD_STATE_DIR, { recursive: true });
  const recorded = spawnSync(process.execPath, [path.join(root, 'scripts/project-buglog.mjs'), 'record', '--cwd', f.cwd, '--file', 'app.js', '--category', 'repeated-edit', '--summary', 'retain independent startup learning'], { cwd: f.cwd, env, encoding: 'utf8', timeout: 15000 });
  assert.equal(recorded.status, 0, recorded.stderr);
  const result = spawnSync(path.join(root, 'hooks/cc-sessionstart-restore.sh'), [], { cwd: f.cwd, env, encoding: 'utf8', input: JSON.stringify({ session_id: 'startup', hook_event_name: 'SessionStart', cwd: f.cwd }), timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  for (const label of ['ETRNL skills', 'Workflow status:', 'unfinished=1', 'Project learning hints:', 'Project state: PROJECT_STATE.md']) assert.ok(context.includes(label), `missing ${label}: ${context}`);
  assert.ok(Array.from(context).length <= 1500); assert.ok(f.read(ledger).projectState);
  const hook = (name, event) => spawnSync(path.join(root, 'hooks', name), [], { cwd: f.cwd, env, encoding: 'utf8', input: JSON.stringify({ session_id: 'startup', cwd: f.cwd, ...event }), timeout: 30000 });
  for (const [name, event] of [['cc-precompact-save.sh', { hook_event_name: 'PreCompact' }], ['cc-postcompact-record.sh', { hook_event_name: 'PostCompact', summary: 'Keep accepted scope. '.repeat(100) }]]) {
    const saved = hook(name, event); assert.equal(saved.status, 0, saved.stderr);
  }
  const compact = hook('cc-sessionstart-restore.sh', { hook_event_name: 'SessionStart', source: 'compact' }); assert.equal(compact.status, 0, compact.stderr);
  const compactContext = JSON.parse(compact.stdout).hookSpecificOutput.additionalContext;
  assert.ok(Array.from(compactContext).length <= 1200); assert.match(compactContext, /verification_stale=true/); assert.match(compactContext, /Project state: PROJECT_STATE.md/);

});
