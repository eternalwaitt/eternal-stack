import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applyPlans, dependencyFiles } from '../scripts/lib/install-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl core fixture's-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const claude = path.join(dir, 'claude'), codex = path.join(dir, 'codex');
  const run = (...args) => spawnSync('bash', [path.join(root, 'scripts/install.sh'), '--profile', 'core', '--claude-home', claude, '--codex-home', codex, ...args], { encoding: 'utf8' });
  return { dir, claude, codex, run };
}
function helper(home) { return path.join(home, 'etrnl/library/scripts/companion.mjs'); }
function callHelper(home, ...args) { return spawnSync(process.execPath, [helper(home), ...args, '--json'], { cwd: root, encoding: 'utf8' }); }
function runHelper(home, ...args) { return spawnSync(process.execPath, [helper(home), 'run', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); }
function readOutput(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }
function withoutEtrnlOverrides() {
  const env = { ...process.env };
  for (const key of ['ETRNL_HOME', 'ETRNL_STATE_DIR', 'ETRNL_RUNS_DIR', 'ETRNL_ARTIFACTS_DIR', 'ETRNL_ARTIFACT_DIR']) delete env[key];
  return env;
}

test('core dry run writes nothing; install adds one router and a private reference library for each host', t => {
  const { claude, codex, run } = fixture(t);
  const dry = run('--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(claude), false);
  assert.equal(fs.existsSync(codex), false);
  const installed = run();
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(fs.readFileSync(path.join(claude, 'AGENTS.md'), 'utf8'), fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8'));
  assert.match(fs.readFileSync(path.join(claude, 'CLAUDE.md'), 'utf8'), /@AGENTS\.md/);
  for (const home of [claude, codex]) {
    const router = path.join(home, 'skills/etrnl-router');
    assert.ok(fs.existsSync(path.join(router, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(router, 'capability-index.json')));
    const library = path.join(home, 'etrnl/library');
    assert.ok(fs.existsSync(path.join(library, 'library-manifest.json')));
    assert.ok(fs.existsSync(path.join(library, 'skills/bundled/better-auth/SKILL.md')));
    assert.ok(fs.existsSync(path.join(library, 'skills/etrnl-dev-execute/SKILL.md')));
    const discoveredSkills = [];
    const walkSkills = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const item = path.join(dir, entry.name);
        if (entry.isDirectory()) walkSkills(item);
        else if (entry.name === 'SKILL.md') discoveredSkills.push(item);
      }
    };
    walkSkills(path.join(home, 'skills'));
    assert.deepEqual(discoveredSkills, [path.join(router, 'SKILL.md')], 'host discovery tree contains only the router skill');
    const markdown = [];
    const walkMarkdown = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const item = path.join(dir, entry.name);
        if (entry.isDirectory()) walkMarkdown(item);
        else if (entry.name.endsWith('.md')) markdown.push(fs.readFileSync(item, 'utf8'));
      }
    };
    walkMarkdown(router);
    assert.ok(markdown.every(content => !content.includes('{{ETRNL_COMPANION}}')), 'installed Markdown has resolved host helper paths');
    assert.deepEqual(fs.readdirSync(path.join(home, 'skills')), ['etrnl-router']);
    for (const unwanted of ['settings.json', 'config.toml', 'hooks', 'agents', 'commands']) assert.equal(fs.existsSync(path.join(home, unwanted)), false, unwanted);
    const manifest = JSON.parse(fs.readFileSync(path.join(home, '.etrnl-core.json'), 'utf8'));
    assert.equal(manifest.version, 2);
    assert.equal(manifest.host, home === claude ? 'claude' : 'codex');
    assert.ok(manifest.assets.length > 1);
  }
  assert.equal(run().status, 0);
});

test('installed helper resolves the contract and available capability against both fixture hosts', t => {
  const { claude, codex, run } = fixture(t);
  assert.equal(run().status, 0);
  for (const [home, host] of [[claude, 'claude'], [codex, 'codex']]) {
    const state = readOutput(callHelper(home, 'inspect'));
    assert.equal(state.hostAdapter.installed, true);
    assert.equal(state.hostAdapter.host, host);
    assert.equal(state.hostAdapter.home, fs.realpathSync(home));
    assert.equal(state.libraryRoot, path.join(fs.realpathSync(home), 'etrnl/library'));
    const quotedHelper = `'${helper(home).replaceAll("'", "'\\''")}'`;
    const shellResolved = spawnSync('bash', ['-c', `node ${quotedHelper} inspect`], { cwd: root, encoding: 'utf8' });
    assert.equal(shellResolved.status, 0, shellResolved.stderr);
    const selected = readOutput(callHelper(home, 'select', '--intent', 'build', '--scope', 'coupled', '--risk', 'low'));
    assert.equal(selected.contract.mode, 'structured');
    assert.equal(selected.capability.id, 'etrnl-dev-execute');
    assert.equal(selected.capability.available, true);
    assert.equal(selected.capability.loaded, false);
    assert.equal(selected.capability.required, true);
    assert.equal(fs.existsSync(selected.capability.path), true);
    assert.equal(selected.hostAdapter.host, host);
    const expanded = readOutput(callHelper(home, 'select', '--intent', 'build', '--scope', 'broad', '--risk', 'high', '--capability', 'better-auth', '--authorized-budget', '{"maxWorkers":9}'));
    assert.equal(expanded.contract.budgetAuthority, 'user-authorized');
    assert.deepEqual(expanded.requiredCapabilities, ['etrnl-dev-execute']);
    assert.equal(expanded.requestedCapability.id, 'better-auth');
    assert.equal(expanded.requestedCapability.required, false);
    assert.equal(expanded.capabilities.length, 2);
    const bundled = readOutput(callHelper(home, 'list')).capabilities.find(item => item.id === 'better-auth');
    assert.ok(bundled, 'bundled directory children are indexed');
    assert.equal(bundled.loaded, false);
    assert.equal(bundled.required, false);
  }
  const runContract = spawnSync(process.execPath, [helper(claude), 'run', 'scripts/workflow-contract.mjs', 'resolve', '--intent', 'fix', '--scope', 'coupled', '--risk', 'high'], { cwd: root, encoding: 'utf8' });
  assert.equal(runContract.status, 0, runContract.stderr);
  assert.equal(JSON.parse(runContract.stdout).mode, 'structured');

  const codexProbeHome = path.join(path.dirname(codex), 'wrong-claude-home');
  const context = spawnSync(process.execPath, [helper(codex), 'run', 'scripts/context-state.mjs', '--', 'list'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_HOME: codexProbeHome },
  });
  assert.equal(context.status, 0, context.stderr);
  assert.match(context.stdout, /No ETRNL context saves recorded/);
  assert.equal(fs.existsSync(codexProbeHome), false, 'Codex helper does not redirect state through CLAUDE_HOME');
  const ledgerArgs = [helper(codex), 'run', 'scripts/execution-ledger.mjs', '--', 'history', '--json', '--limit', '2'];
  const overrideRuns = path.join(path.dirname(codex), 'explicit-runs-override');
  const overrideLedger = spawnSync(process.execPath, ledgerArgs, {
    cwd: root, encoding: 'utf8', env: { ...withoutEtrnlOverrides(), ETRNL_RUNS_DIR: overrideRuns },
  });
  assert.equal(overrideLedger.status, 0, overrideLedger.stderr);
  assert.ok(fs.existsSync(overrideRuns), 'explicit ETRNL_RUNS_DIR override is honored');
  assert.equal(fs.existsSync(path.join(codex, 'etrnl/runs')), false, 'explicit runs override does not create the host default');
  const ledger = spawnSync(process.execPath, ledgerArgs, { cwd: root, encoding: 'utf8', env: withoutEtrnlOverrides() });
  assert.equal(ledger.status, 0, ledger.stderr);
  assert.ok(fs.existsSync(path.join(codex, 'etrnl/runs')), 'ledger path resolves from Codex home');
  const project = path.join(path.dirname(codex), 'project');
  fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'package.json'), '{"name":"fixture"}\n');
  spawnSync('git', ['init', '-q', project]);
  spawnSync('git', ['-C', project, 'add', 'package.json']);
  const committed = spawnSync('git', ['-C', project, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  assert.equal(committed.status, 0);
  const performance = runHelper(codex, 'scripts/performance-audit.mjs', '--', 'discover', project);
  assert.equal(performance.status, 0, performance.stderr);
  assert.equal(JSON.parse(performance.stdout).inventory.command.startsWith('git ls-files'), true);
});

test('core update preserves installed host selection', t => {
  const { claude, codex, run } = fixture(t);
  assert.equal(run('--host', 'codex').status, 0);
  const codexUpdate = spawnSync('bash', [path.join(root, 'scripts/update.sh')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_HOME: claude, CODEX_HOME: codex },
  });
  assert.equal(codexUpdate.status, 0, codexUpdate.stderr);
  assert.match(codexUpdate.stdout, /core updated for codex/);
  assert.ok(fs.existsSync(path.join(codex, '.etrnl-core.json')));
  assert.equal(fs.existsSync(claude), false, 'Codex-only core update does not create a Claude home');

  const both = fixture(t);
  assert.equal(both.run().status, 0);
  const bothUpdate = spawnSync('bash', [path.join(root, 'scripts/update.sh')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_HOME: both.claude, CODEX_HOME: both.codex },
  });
  assert.equal(bothUpdate.status, 0, bothUpdate.stderr);
  assert.match(bothUpdate.stdout, /core updated for both/);
  assert.ok(fs.existsSync(path.join(both.claude, '.etrnl-core.json')));
  assert.ok(fs.existsSync(path.join(both.codex, '.etrnl-core.json')));
});

test('core installer canonicalizes aliases before preflighting both hosts', t => {
  const { dir, run } = fixture(t);
  const physicalParent = path.join(dir, 'physical');
  fs.mkdirSync(physicalParent);
  const aliasParent = path.join(dir, 'alias');
  fs.symlinkSync(physicalParent, aliasParent, 'dir');
  const physicalHome = path.join(physicalParent, 'new-home');
  const aliasHome = path.join(aliasParent, 'new-home');
  const result = run('--claude-home', physicalHome, '--codex-home', aliasHome);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be different directories/);
  assert.equal(fs.existsSync(physicalHome), false, 'alias collision is detected before creating either host home');
});

test('core uninstall restores ownership when created-directory cleanup fails', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-uninstall-transaction-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home');
  const asset = path.join(home, 'skills/etrnl-router/SKILL.md');
  const manifest = path.join(home, '.etrnl-core.json');
  fs.mkdirSync(path.dirname(asset), { recursive: true });
  fs.writeFileSync(asset, 'router contents');
  fs.writeFileSync(manifest, 'owned manifest');
  const plan = {
    home,
    changes: [
      { path: 'skills/etrnl-router/SKILL.md', before: Buffer.from('router contents'), after: null },
      { path: '.etrnl-core.json', before: Buffer.from('owned manifest'), after: null },
    ],
    createdDirs: ['skills/etrnl-router', 'skills'],
  };
  let calls = 0;
  assert.throws(() => applyPlans([plan], {
    removeDir(directory) {
      calls += 1;
      if (calls === 1) fs.rmdirSync(directory);
      else throw Object.assign(new Error('fixture cleanup failure'), { code: 'EIO' });
    },
  }), /fixture cleanup failure/);
  assert.equal(fs.readFileSync(asset, 'utf8'), 'router contents', 'managed assets roll back');
  assert.equal(fs.readFileSync(manifest, 'utf8'), 'owned manifest', 'ownership manifest rolls back');
});

test('existing instructions survive install/update/removal; v1 guidance manifests migrate to v2', t => {
  const { claude, codex, run } = fixture(t);
  fs.mkdirSync(claude, { recursive: true }); fs.mkdirSync(codex, { recursive: true });
  const files = [[claude, 'AGENTS.md', 'Personal rules without trailing newline'], [claude, 'CLAUDE.md', '# Custom Claude\n'], [codex, 'AGENTS.md', '# Shadowed base\n'], [codex, 'AGENTS.override.md', '# Effective Codex rules\n']];
  for (const [home, file, content] of files) fs.writeFileSync(path.join(home, file), content);
  assert.equal(run().status, 0);
  assert.match(fs.readFileSync(path.join(codex, 'AGENTS.override.md'), 'utf8'), /etrnl-router/);
  assert.equal(fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8'), '# Shadowed base\n');
  assert.equal(run().status, 0);
  for (const home of [claude, codex]) {
    const file = path.join(home, 'AGENTS.override.md');
    if (fs.existsSync(file)) fs.appendFileSync(file, '\nUser addition\n');
  }
  assert.equal(run('--uninstall').status, 0);
  for (const [home, file, content] of files) {
    const actual = fs.readFileSync(path.join(home, file), 'utf8');
    assert.ok(actual.startsWith(content), `${file} custom content preserved`);
  }
  assert.match(fs.readFileSync(path.join(codex, 'AGENTS.override.md'), 'utf8'), /User addition/);

  const legacyHome = path.join(path.dirname(claude), 'v1');
  fs.mkdirSync(legacyHome);
  const inserted = '<!-- eternal-stack:core:start -->\n# Prior core guidance\n<!-- eternal-stack:core:end -->\n';
  fs.writeFileSync(path.join(legacyHome, 'AGENTS.md'), `${inserted}Local addition\n`);
  fs.writeFileSync(path.join(legacyHome, '.etrnl-core.json'), JSON.stringify({ version: 1, profile: 'core', host: 'codex', files: [{ name: 'AGENTS.md', inserted, created: true }] }));
  const migrate = spawnSync('bash', [path.join(root, 'scripts/install.sh'), '--profile', 'core', '--host', 'codex', '--codex-home', legacyHome], { encoding: 'utf8' });
  assert.equal(migrate.status, 0, migrate.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(legacyHome, '.etrnl-core.json'), 'utf8')).version, 2);
  assert.match(fs.readFileSync(path.join(legacyHome, 'AGENTS.md'), 'utf8'), /Local addition/);
});

test('preflight refuses legacy installs, conflicting assets, symlinks, and edited owned assets before writing another host', t => {
  const { dir, claude, codex, run } = fixture(t);
  fs.mkdirSync(path.join(codex, 'etrnl'), { recursive: true });
  fs.writeFileSync(path.join(codex, 'etrnl/install.json'), '{"stackProfile":"core"}');
  assert.notEqual(run().status, 0);
  assert.equal(fs.existsSync(claude), false);
  fs.rmSync(path.join(codex, 'etrnl'), { recursive: true });
  fs.mkdirSync(path.join(codex, 'skills/etrnl-router'), { recursive: true });
  fs.writeFileSync(path.join(codex, 'skills/etrnl-router/SKILL.md'), 'unowned');
  assert.notEqual(run().status, 0);
  assert.equal(fs.existsSync(claude), false);
  fs.rmSync(path.join(codex, 'skills'), { recursive: true });
  assert.equal(run().status, 0);
  const owned = path.join(codex, 'etrnl/library/skills/bundled/better-auth/SKILL.md');
  const foreign = path.join(dir, 'foreign.md'); fs.writeFileSync(foreign, 'untouched');
  fs.unlinkSync(owned); fs.symlinkSync(foreign, owned);
  const symlinked = run('--uninstall');
  assert.notEqual(symlinked.status, 0);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'untouched');
  assert.equal(fs.existsSync(path.join(claude, '.etrnl-core.json')), true);
  fs.unlinkSync(owned); fs.writeFileSync(owned, 'edited');
  const modified = run('--uninstall');
  assert.notEqual(modified.status, 0);
  assert.match(modified.stderr, /modified or missing/i);
});

test('host selection, scoped routing input, source fixture host resolution and helper allowlist', t => {
  const { dir, claude, codex, run } = fixture(t);
  assert.notEqual(run('--host', 'unknown').status, 0);
  assert.notEqual(run('--unknown').status, 0);
  assert.equal(run().status, 0);
  assert.notEqual(callHelper(claude, 'select', '--intent', 'build', '--scope', 'contained').status, 0);
  assert.notEqual(callHelper(claude, 'select', '--intent', 'build', '--scope', 'contained', '--risk', 'low', '--host', 'unknown').status, 0);
  const source = spawnSync(process.execPath, [path.join(root, 'scripts/companion.mjs'), 'inspect', '--host', 'codex', '--home', path.join(dir, 'fixture-codex'), '--json'], { cwd: root, encoding: 'utf8' });
  const inspected = readOutput(source);
  assert.equal(inspected.sourceCheckout, true);
  assert.equal(inspected.hostAdapter.host, 'codex');
  assert.equal(inspected.hostAdapter.home, path.join(dir, 'fixture-codex'));
  const sourceNoHost = spawnSync(process.execPath, [path.join(root, 'scripts/companion.mjs'), 'run', 'scripts/workflow-contract.mjs', '--', 'resolve', '--intent', 'build', '--scope', 'contained', '--risk', 'low'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(sourceNoHost.status, 0, 'source helper requires explicit host instead of guessing a default');
  const sourceWithHost = spawnSync(process.execPath, [path.join(root, 'scripts/companion.mjs'), 'run', '--host', 'codex', '--home', path.join(dir, 'fixture-codex'), 'scripts/workflow-contract.mjs', '--', 'resolve', '--intent', 'build', '--scope', 'contained', '--risk', 'low'], { cwd: root, encoding: 'utf8' });
  assert.equal(sourceWithHost.status, 0, sourceWithHost.stderr);
  const unindexed = spawnSync(process.execPath, [helper(codex), 'run', 'scripts/install.sh', '--profile', 'core'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(unindexed.status, 0);
});

test('portable library closure resolves SCRIPT_DIR shell dependencies exactly once', t => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-closure-fixture-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.mkdirSync(path.join(source, 'scripts/lib'), { recursive: true });
  fs.writeFileSync(path.join(source, 'scripts/runner.sh'), 'SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nsource "$SCRIPT_DIR/lib/env.sh"\n');
  fs.writeFileSync(path.join(source, 'scripts/lib/env.sh'), 'ETRNL_FIXTURE_ENV=1\n');
  const files = dependencyFiles(['scripts/runner.sh'], source);
  assert.ok(files.has('scripts/lib/env.sh'));
  assert.ok(!files.has('scripts/scripts/lib/env.sh'));
});
