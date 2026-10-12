import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests/fixtures/project-knowledge-evaluation/v2');
const script = path.join(root, 'scripts/project-knowledge-evaluate.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json')));
function fixture(t) { const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eternal-evalv2-test-')); t.after(() => fs.rmSync(temp, { recursive: true, force: true })); return path.join(temp, 'etrnl-knowledge-eval-fixtures'); }
function cli(args, ok = true) { const out = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); if (ok) assert.equal(out.status, 0, out.stderr); return out; }
function filesBelow(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }

test('v1 stays immutable and explicitly superseded by hash-frozen source preparation v2', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  for (const [file, digest] of Object.entries(manifest.files)) assert.equal(hash(fs.readFileSync(path.join(dir, file))), digest);
  assert.equal(hash(fs.readFileSync(path.join(dir, '../cases.json'))), 'df8fca650d2c9bdaa7ed1a6e8c05587e9a35dbe06b20daf556e68a21407498db');
  assert.equal(manifest.modelRuns, 0); assert.match(manifest.supersededReason, /leading.*cosmetic/);
  assert.equal(corpus.variantsAreIndependentFamilies, false);
});

test('twenty plain prompts cover ten cases with different source conditions and separate labels', () => {
  assert.equal(corpus.cases.length, 20);
  assert.deepEqual([...new Set(corpus.cases.map(row => row.userCase))], [1,2,3,4,5,6,7,8,9,10]);
  const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'))).cases;
  for (const row of corpus.cases) {
    assert.doesNotMatch(row.prompt, /maintain.{0,20}state|missing review|failed deploy|passed test|without.{0,12}reminder|ground.?truth|relevant lesson|before.{0,20}decision|independent.{0,10}review|fixture|pending items/i);
    assert.equal(row.groundTruth, undefined); assert.equal(row.rubric, undefined);
    assert.ok(labels[row.id].groundTruth && labels[row.id].decisionOpportunity);
    assert.ok(row.files['PROJECT_STATE.md'] && row.files['src/main.mjs'] && row.files['.etrnl/artifacts/contexts/saved.json'] && row.files['.etrnl/receipts/history.json']);
  }
  for (let userCase = 1; userCase <= 10; userCase += 1) {
    const [a,b] = corpus.cases.filter(row => row.userCase === userCase);
    assert.notEqual(a.files['src/main.mjs'], b.files['src/main.mjs']);
    assert.notDeepEqual(labels[a.id].groundTruth, labels[b.id].groundTruth);
  }
});

test('prepare materializes all twenty snapshots with verified bytes and labels outside agent cwd', t => {
  const prepared = fixture(t);
  const result = JSON.parse(cli(['prepare','--case','all','--output',prepared]).stdout);
  assert.equal(result.fixtureCount, 20); assert.equal(result.modelRuns, 0);
  const receipt = JSON.parse(fs.readFileSync(path.join(prepared, 'preparation.json')));
  for (const row of receipt.fixtures) {
    const cwd = row.agentInput.cwd;
    assert.ok(fs.existsSync(path.join(cwd,'.git')));
    for (const [relative,digest] of Object.entries(row.files)) assert.equal(hash(fs.readFileSync(path.join(cwd,relative))),digest);
    const workspaceFiles = filesBelow(cwd);
    assert.ok(!workspaceFiles.some(file => /labels\.json|run-record-template\.json|adjudication/.test(path.relative(cwd,file))));
    assert.ok(!path.resolve(prepared,row.labels).startsWith(`${cwd}${path.sep}`));
    assert.equal(row.agentInput.groundTruth,undefined);
    assert.ok(row.agentInput.env.ETRNL_STATE_DIR.startsWith(cwd));
    const syntax = spawnSync(process.execPath,['--check',path.join(cwd,'src/main.mjs')],{encoding:'utf8'}); assert.equal(syntax.status,0,syntax.stderr);
  }
  const report = JSON.parse(cli(['report','--prepared',prepared]).stdout);
  assert.equal(report.fixtureCount,20); assert.ok(report.filesVerified > 100);
  assert.equal(report.trialDenominator,0); assert.equal(report.behavioralScores,null); assert.equal(report.repeatErrorReduction,null);
  assert.notEqual(cli(['prepare','--case','01a','--output',prepared],false).status,0,'existing snapshots never overwritten');
});

test('integrity report rejects tampered workspace bytes and symlinked artifact directories', t => {
  const prepared = fixture(t);
  cli(['prepare','--case','06a','--output',prepared]);
  const file = path.join(prepared,'06a/workspace/src/main.mjs'); const original = fs.readFileSync(file);
  fs.appendFileSync(file,'\n// changed\n');
  assert.match(cli(['report','--prepared',prepared],false).stderr,/changed/);
  fs.writeFileSync(file,original);
  const source = path.join(prepared,'06a/workspace/.etrnl/receipts'); const moved = path.join(prepared,'receipt-copy');
  fs.renameSync(source,moved); fs.symlinkSync(moved,source);
  assert.match(cli(['report','--prepared',prepared],false).stderr,/symlink/);
});

test('unknown case and non-temporary output are rejected without creating files', t => {
  const prepared = fixture(t);
  assert.notEqual(cli(['prepare','--case','../labels','--output',prepared],false).status,0); assert.equal(fs.existsSync(prepared),false);
  assert.match(cli(['prepare','--case','02a','--output',path.join(root,'etrnl-knowledge-eval-denied')],false).stderr,/temporary/);
  assert.equal(fs.existsSync(path.join(root,'etrnl-knowledge-eval-denied')),false);
});
