#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const [fixture, destination, ...flags] = process.argv.slice(2);
const candidate = flags.includes("--candidate");
const allowed = new Set(['books', 'settings-password-reset', 'invoice-retry', 'release', 'project-state-catalog']);
if (!allowed.has(fixture) || !destination || flags.some(flag => flag !== '--candidate') || flags.length > 1) {
  process.stderr.write('usage: prepare.mjs <books|settings-password-reset|invoice-retry|release|project-state-catalog> <new-destination> [--candidate]\n');
  process.exit(2);
}
const target = path.resolve(destination);
if (candidate && !target.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && !target.startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`)) {
  throw new Error('candidate installation requires an isolated temporary project');
}
if (fs.existsSync(target)) {
  process.stderr.write(`destination already exists: ${target}\n`);
  process.exit(2);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(path.join(root, 'fixtures', fixture), target, { recursive: true });

const git = spawnSync('git', ['init', '-q'], { cwd: target, encoding: 'utf8' });
if (git.status !== 0) throw new Error(`git init failed: ${git.stderr}`);
const add = spawnSync('git', ['add', '.'], { cwd: target, encoding: 'utf8' });
if (add.status !== 0) throw new Error(`git add failed: ${add.stderr}`);
const commit = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic evaluation fixture'], { cwd: target, encoding: 'utf8' });
if (commit.status !== 0) throw new Error(`fixture commit failed: ${commit.stderr}`);
if (fs.existsSync(path.join(target, 'LOCAL_NOTES.md'))) {
  fs.writeFileSync(path.join(target, 'LOCAL_NOTES.md'), 'Local operator note: keep this unrelated work exactly as written.\n');
  const status = spawnSync('git', ['status', '--short'], { cwd: target, encoding: 'utf8' });
  if (status.status !== 0 || !status.stdout.includes('LOCAL_NOTES.md')) throw new Error('expected unrelated local note to remain dirty');
}
// Fixture instrumentation is not application source. Keep its identity separate
// so writing a checkpoint or receipt cannot invalidate a reviewed source tree.
fs.appendFileSync(path.join(target, '.git/info/exclude'), '\n/.candidate-home/\n/.agents/\n/.companion-handoff.md\n/.injected-test-launch-failure-used\n');
if (candidate) {
  const home = path.join(target, '.candidate-home');
  const install = spawnSync(process.execPath, [path.resolve(root, '../../scripts/lib/install-core.mjs'), '--host', 'codex', '--codex-home', home], { encoding: 'utf8' });
  if (install.status !== 0) throw new Error(`candidate installation failed: ${install.stderr}`);
  fs.mkdirSync(path.join(target, '.agents'), { recursive: true });
  fs.cpSync(path.join(home, 'skills'), path.join(target, '.agents/skills'), { recursive: true });
  const files = ['.etrnl-core.json', 'skills/etrnl-router/SKILL.md', 'etrnl/library/scripts/execution-ledger.mjs', 'etrnl/library/scripts/lib/workflow-contract.mjs'];
  const installedIdentity = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(home, file))).digest('hex')]));
  fs.writeFileSync(path.join(home, 'evaluation-install-identity.json'), `${JSON.stringify(installedIdentity, null, 2)}\n`);
}
process.stdout.write(`${target}\n`);
