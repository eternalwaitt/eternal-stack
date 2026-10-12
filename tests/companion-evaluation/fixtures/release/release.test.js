import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('release metadata and announcement are prepared for the agreed release', () => {
  const release = JSON.parse(fs.readFileSync('release.json', 'utf8'));
  assert.equal(release.version, 'demo-1.2.0');
  assert.ok(fs.existsSync('announcement.md'));
  assert.match(fs.readFileSync('announcement.md', 'utf8'), /demo-1\.2\.0/);
});
