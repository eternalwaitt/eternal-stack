import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appPath = process.env.ETRNL_EVAL_TARGET
  ? path.join(process.env.ETRNL_EVAL_TARGET, 'app.js')
  : fileURLToPath(new URL('./app.js', import.meta.url));

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'books-app-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

function app(dir, ...args) {
  return spawnSync(process.execPath, [appPath, '--data', path.join(dir, 'books.json'), ...args], { cwd: dir, encoding: 'utf8' });
}

test('fresh CLI processes create, list, edit, change status, remove, and retain data', async t => {
  const dir = await fixture(t);
  const created = app(dir, 'add', '--title', 'Kindred', '--author', 'Octavia Butler');
  assert.equal(created.status, 0, created.stderr);
  const book = JSON.parse(created.stdout);
  assert.ok(book.id);
  assert.equal(book.status, 'Want to read');

  const listed = app(dir, 'list');
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), [book]);

  const updated = app(dir, 'update', book.id, '--title', 'Kindred (paperback)', '--status', 'Reading');
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(JSON.parse(updated.stdout).author, 'Octavia Butler');
  assert.equal(JSON.parse(updated.stdout).status, 'Reading');

  const restarted = app(dir, 'list');
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), [JSON.parse(updated.stdout)], 'a separate process sees persisted changes');

  const invalid = app(dir, 'update', book.id, '--status', 'Maybe');
  assert.notEqual(invalid.status, 0, 'unknown statuses are rejected');
  const removed = app(dir, 'remove', book.id);
  assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(JSON.parse(app(dir, 'list').stdout), []);
});

test('help explains how to run the app', async t => {
  const dir = await fixture(t);
  const result = app(dir, '--help');
  assert.equal(result.status, 0, result.stderr);
  for (const command of ['add', 'list', 'update', 'remove']) assert.match(result.stdout, new RegExp(command));
});
