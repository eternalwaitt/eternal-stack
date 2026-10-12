#!/usr/bin/env node
// Preparation and integrity reports only. Never starts a model or executes fixture source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = path.join(repo, 'tests/fixtures/project-knowledge-evaluation/v2');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const args = process.argv.slice(2), command = args.shift(), options = {};
function read(file, max = 2 * 1024 * 1024) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error('bounded regular file required');
  return fs.readFileSync(file);
}
function relative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value) || value.split('/').some(part => !part || ['.','..'].includes(part))) throw new Error('invalid fixture relative path');
  return value;
}
function admittedCorpus() {
  const manifestBytes = read(path.join(corpusDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schemaVersion !== 2 || manifest.modelRuns !== 0) throw new Error('preparation corpus schema mismatch');
  for (const [file, digest] of Object.entries(manifest.files)) if (hash(read(path.join(corpusDir, relative(file)))) !== digest) throw new Error(`frozen corpus hash mismatch: ${file}`);
  const cases = JSON.parse(read(path.join(corpusDir, 'cases.json'))).cases;
  const labels = JSON.parse(read(path.join(corpusDir, 'labels.json'))).cases;
  if (cases.length !== 20 || new Set(cases.map(row => row.id)).size !== 20) throw new Error('twenty unique preparation seeds required');
  for (const row of cases) {
    if (!/^\d{2}[ab]$/.test(row.id) || !labels[row.id] || !row.prompt.trim() || Object.keys(row.files).length > 50) throw new Error('invalid preparation seed');
    let total = 0;
    for (const [file, content] of Object.entries(row.files)) { relative(file); if (typeof content !== 'string' || Buffer.byteLength(content) > 100000) throw new Error('invalid bounded fixture content'); total += Buffer.byteLength(content); }
    if (total > 512 * 1024) throw new Error('fixture exceeds preparation limit');
  }
  return { manifest, manifestDigest: hash(manifestBytes), cases, labels };
}
function tempLocation(value, existing) {
  if (!value) throw new Error('--output or --prepared temporary fixture root required');
  const full = path.resolve(value), parent = fs.realpathSync(path.dirname(full));
  const tempRoots = [...new Set([os.tmpdir(), '/tmp'].filter(value => fs.existsSync(value)).map(value => fs.realpathSync(value)))];
  if (!tempRoots.some(temp => parent === temp || parent.startsWith(`${temp}${path.sep}`)) || !path.basename(full).startsWith('etrnl-knowledge-eval-')) throw new Error('fixture root must be a temporary etrnl-knowledge-eval-* directory');
  const target = path.join(parent, path.basename(full));
  if (existing) { if (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink()) throw new Error('existing regular fixture directory required'); }
  else if (fs.existsSync(target)) throw new Error('preparation output already exists; preserve it');
  return target;
}
function contained(root, relativePath) {
  let file = root;
  for (const part of relative(relativePath).split('/')) { file = path.join(file, part); if (fs.lstatSync(file).isSymbolicLink()) throw new Error('fixture path cannot contain symlinks'); }
  return file;
}
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 }); }
function prepare() {
  const corpus = admittedCorpus();
  const selected = options['--case'] === 'all' ? corpus.cases : corpus.cases.filter(row => row.id === options['--case']);
  if (!selected.length) throw new Error('--case must be all or an admitted case ID');
  const output = tempLocation(options['--output'], false), records = [];
  // Everything is validated before the first write. A failed write remains visible; no destructive cleanup.
  fs.mkdirSync(output, { mode: 0o700 });
  for (const row of selected) {
    const base = path.join(output, row.id), workspace = path.join(base, 'workspace'), adjudication = path.join(base, 'adjudication');
    const hashes = {};
    for (const [file, content] of Object.entries({ ...row.files, 'TASK.txt': `${row.prompt}\n` })) { write(path.join(workspace, file), content); hashes[file] = hash(Buffer.from(content)); }
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))); gitEnv.GIT_CONFIG_NOSYSTEM = '1'; gitEnv.GIT_CONFIG_GLOBAL = '/dev/null'; gitEnv.GIT_TERMINAL_PROMPT = '0';
    const initialized = spawnSync('git', ['init', '-q', '--template=', '--initial-branch=fixture', workspace], { encoding: 'utf8', env: gitEnv, timeout: 5000, maxBuffer: 1024 * 1024 });
    if (initialized.status !== 0) throw new Error('temporary fixture Git initialization failed');
    // Labels and source identities live outside the directory supplied as agent cwd.
    write(path.join(adjudication, 'labels.json'), json(corpus.labels[row.id]));
    write(path.join(adjudication, 'run-record-template.json'), json({ schemaVersion: 2, fixtureId: row.id, condition: null, pairId: null, order: null, hostVersion: null, modelId: null, settings: null, sourceSnapshot: null, contractRevision: null, independentLabeler: null, retrievalEvents: [], decisionEvents: [], outcomes: null, retainedFailures: [], costs: null, trialsExecuted: 0 }));
    records.push({ id: row.id, userCase: row.userCase, workspace: `${row.id}/workspace`, agentInput: { cwd: workspace, promptFile: path.join(workspace, 'TASK.txt'), env: { ETRNL_HOME: path.join(workspace, '.etrnl/host'), ETRNL_STATE_DIR: path.join(workspace, '.etrnl/state'), ETRNL_ARTIFACTS_DIR: path.join(workspace, '.etrnl/artifacts'), ETRNL_RETRO_LESSONS: path.join(workspace, '.etrnl/retro-lessons.jsonl'), ETRNL_BUGLOG: path.join(workspace, '.etrnl/artifacts/project-buglog.jsonl') } }, files: hashes, labels: `${row.id}/adjudication/labels.json`, labelsDigest: hash(Buffer.from(json(corpus.labels[row.id]))) });
  }
  const receipt = { schemaVersion: 2, kind: 'knowledge-fixture-preparation', corpusManifestDigest: corpus.manifestDigest, modelRuns: 0, sourceExecuted: false, fixtures: records, labelsAccessNotice: 'Outside agent workspace is separation, not access control. A separately authorized runner must mount only workspace and keep labels inaccessible.' };
  write(path.join(output, 'preparation.json'), json(receipt));
  console.log(json({ ok: true, command, prepared: output, fixtureCount: records.length, modelRuns: 0, agentInputs: records.map(row => row.agentInput) }));
}
function report() {
  const corpus = admittedCorpus(), prepared = tempLocation(options['--prepared'], true);
  const receipt = JSON.parse(read(path.join(prepared, 'preparation.json')));
  if (receipt.kind !== 'knowledge-fixture-preparation' || receipt.corpusManifestDigest !== corpus.manifestDigest || receipt.modelRuns !== 0 || !Array.isArray(receipt.fixtures) || receipt.fixtures.length > 20) throw new Error('preparation receipt invalid or corpus changed');
  let filesVerified = 0;
  for (const row of receipt.fixtures) {
    const original = corpus.cases.find(item => item.id === row.id);
    if (!original || row.workspace !== `${row.id}/workspace` || row.labels !== `${row.id}/adjudication/labels.json`) throw new Error('invalid preparation receipt scope');
    const expected = { ...original.files, 'TASK.txt': `${original.prompt}\n` };
    if (Object.keys(expected).length !== Object.keys(row.files).length) throw new Error('preparation file inventory changed');
    for (const [file, content] of Object.entries(expected)) {
      if (row.files[file] !== hash(Buffer.from(content)) || hash(read(contained(prepared, `${row.workspace}/${relative(file)}`))) !== row.files[file]) throw new Error(`materialized file changed: ${row.id}/${file}`);
      filesVerified += 1;
    }
    const expectedLabels = hash(Buffer.from(json(corpus.labels[row.id])));
    if (expectedLabels !== row.labelsDigest || hash(read(contained(prepared, row.labels))) !== expectedLabels) throw new Error('adjudication labels changed');
  }
  console.log(json({ schemaVersion: 2, kind: 'preparation-integrity-report', corpusManifestDigest: corpus.manifestDigest, fixtureCount: receipt.fixtures.length, filesVerified, integrity: 'verified', modelRuns: 0, trialDenominator: 0, behavioralScores: null, repeatErrorReduction: null, intervals: null, limitation: 'Synthetic source preparation only. No model behavior, causal benefit or population reliability measured.' }));
}
try {
  while (args.length) { const key = args.shift(), value = args.shift(); if (!['--case','--output','--prepared'].includes(key) || !value || value.startsWith('--') || options[key]) throw new Error('unknown, duplicate or incomplete option'); options[key] = value; }
  if (command === 'prepare') { if (options['--prepared']) throw new Error('prepare uses --case and --output'); prepare(); }
  else if (command === 'report') { if (options['--case'] || options['--output']) throw new Error('report uses --prepared; output is stdout'); report(); }
  else throw new Error('usage: project-knowledge-evaluate.mjs prepare --case ID|all --output TEMP/etrnl-knowledge-eval-NAME | report --prepared TEMP/etrnl-knowledge-eval-NAME');
} catch (error) { console.error(error.message); process.exitCode = 2; }
