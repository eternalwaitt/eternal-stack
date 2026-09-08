import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PERFORMANCE_CHECKS, validatePerformanceContract, dispatchPerformance } from '../../../scripts/lib/performance-contract.mjs';
import { PERFORMANCE_EXPERTISE } from '../../../scripts/lib/performance-expertise.mjs';
import { discover, parity } from '../../../scripts/performance-audit.mjs';
import { performanceFixture, syncDepth, raw } from './fixture.mjs';
import { nPlusOne, cacheStampede, retainEveryRequest } from './fault-target.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-contract-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
fs.writeFileSync(path.join(dir, 'performance-evidence.txt'), raw);
const validate = (c, lanes) => validatePerformanceContract(c, dir, lanes);
test('complete synthetic evidence passes', () => assert.deepEqual(validate(performanceFixture()), []));
const cases = [
  ['N+1 query hidden by clean lane', 'database.query-count'],
  ['unbounded nested relation', 'database.nested-cardinality'],
  ['ineffective index', 'database.indexes'],
  ['pool acquisition wait', 'database.pool-wait'],
  ['CPU-heavy synchronous endpoint', 'runtime.cpu'],
  ['event-loop delay', 'runtime.event-loop'],
  ['GC pressure', 'runtime.gc'],
  ['accumulating memory', 'runtime.heap-retention'],
  ['cache stampede', 'cache.stampede'],
  ['oversized route bundle', 'bundle.route-ownership'],
  ['server dependency in client boundary', 'bundle.client-leakage'],
  ['React render churn', 'react.context-subscriptions'],
  ['hydration work', 'browser.hydration'],
  ['long main-thread task', 'browser.long-tasks'],
];
for (const [name, id] of cases) test(name, () => {
  const c = performanceFixture(), r = c.receipts.find(r => r.id === id);
  r.status = 'finding'; r.evidenceKind = 'static_hypothesis';
  Object.assign(r, { producingPath: 'synthetic-app.mjs:1', remediation: 'Fix the measured producing path after profiling', priorityBasis: 'Potential hot-journey impact; unmeasured', regressionGuard: 'Representative journey replay' });
  syncDepth(c);
  assert.deepEqual(validate(c), []);
  assert.ok(validate(c, [{ laneId: PERFORMANCE_CHECKS.find(x => x.id === id).laneId, status: 'confirmed_clean' }]).some(e => e.includes('hides') || e.includes('hidden')));
});
for (const [name, mutate, pattern] of [
  ['one sample is not proof', c => c.receipts[0].measurement.sampleCount = 1, 'repeated'],
  ['source scan cannot prove clean', c => c.receipts[0].evidenceKind = 'static_hypothesis', 'cannot prove clean'],
  ['missing route coverage', c => c.surfaces[0].journeys.push('omitted-route'), 'counts mismatch'],
  ['omitted subcheck', c => c.receipts.pop(), 'exactly one'],
  ['duplicate subcheck', c => c.receipts.push(c.receipts[0]), 'exactly one'],
  ['stale inventory', c => c.inventory.files[0].sha256 = 'a'.repeat(64), 'hash mismatch'],
  ['generic clean prose', c => { c.receipts[0].artifacts = []; c.receipts[0].criteria = []; }, 'raw artifacts'],
  ['tampered evidence', c => c.receipts[0].artifacts[0].sha256 = 'a'.repeat(64), 'hash mismatch'],
  ['missing evidence', c => c.receipts[0].artifacts[0].path = 'absent.txt', 'ENOENT'],
  ['unavailable contributor', c => c.receipts[0].dispatch = { mode: 'external', reference: 'domains-database.md' }, 'availability'],
  ['missing precise blocker', c => { c.receipts[0].status = 'source_limited'; }, 'exact dependency'],
  ['false applicability exclusion', c => c.receipts[0].status = 'not_applicable', 'cannot be not_applicable'],
  ['unaccounted file', c => c.surfaces[0].files = [], 'omitted'],
]) test(name, () => { const c = performanceFixture(); mutate(c); assert.ok(validate(c).some(e => e.includes(pattern)), validate(c).join('\n')); });
test('optional unavailable skill falls back without losing checks', () => {
  for (const c of PERFORMANCE_CHECKS) assert.equal(dispatchPerformance(c, { available: false }).mode, 'builtin');
});
test('discovery is stack neutral and cannot complete unreconciled inventory', () => {
  const root = path.join(dir, 'repo'); fs.mkdirSync(root);
  execFileSync('git', ['init', root], { stdio: 'ignore' });
  fs.writeFileSync(path.join(root, 'worker.py'), 'print("fixture")');
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture'], { stdio: 'ignore' });
  const c = discover(root);
  assert.equal(c.inventory.files[0].path, 'worker.py');
  assert.equal(c.receipts.length, PERFORMANCE_CHECKS.length);
  assert.ok(validate(c).some(e => e.includes('discovery review')));
});
test('distribution parity rejects old skills and missing helper libraries', () => {
  const source = path.join(dir, 'source'), target = path.join(dir, 'target');
  for (const root of [source, target]) {
    fs.mkdirSync(path.join(root, 'skills/etrnl-audit-performance'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
    for (const file of ['skills/etrnl-audit-performance/SKILL.md', 'scripts/performance-audit.mjs', 'scripts/performance-baseline.mjs', 'scripts/deep-audit-artifact-check.mjs', 'scripts/lib/performance-contract.mjs']) fs.writeFileSync(path.join(root, file), 'current');
  }
  for (const root of [source, target]) for (const resource of new Set([...PERFORMANCE_EXPERTISE.flatMap(r => r.resources), 'orpc-patterns/references/tanstack-query.md', 'orpc-patterns/references/streaming-files-serialization.md'])) { const p = path.join(root, 'skills', resource); fs.mkdirSync(path.dirname(p), {recursive: true}); if (!fs.existsSync(p)) fs.writeFileSync(p, 'fixture'); }
  assert.deepEqual(parity(source, target), []);
  fs.writeFileSync(path.join(source, 'scripts/performance-audit.mjs'), 'current\n');
  fs.writeFileSync(path.join(target, 'scripts/performance-audit.mjs'), 'current\r\n');
  assert.deepEqual(parity(source, target), []);
  fs.writeFileSync(path.join(target, 'skills/etrnl-audit-performance/SKILL.md'), 'old');
  fs.unlinkSync(path.join(target, 'scripts/lib/performance-contract.mjs'));
  assert.equal(parity(source, target).length, 2);
});
test('runtime cannot use a single bundle observation to close clean', () => {
  const c = performanceFixture(), r = c.receipts.find(r => r.id === 'runtime.native-rss');
  r.measurement.method = 'emitted-artifact'; r.measurement.sampleCount = 1;
  assert.ok(validate(c).some(e => e.includes('repeated')));
});
test('build memory cannot substitute for server runtime memory', () => {
  const c = performanceFixture(); c.receipts.find(r => r.id === 'runtime.native-rss').measurement.metricDomain = 'build';
  assert.ok(validate(c).some(e => e.includes('domain substitution')));
});
test('remediation cannot keep mismatched or failing experiments', () => {
  const c = performanceFixture(); c.mode = 'remediation';
  const measurement = { ...c.receipts[0].measurement, value: 100, conditions: { ...c.receipts[0].measurement.conditions, sourceRevision: 'before', fixture: 'large' }, artifact: c.receipts[0].artifacts[0] };
  c.experiments = [{ checkId: 'database.query-count', change: 'reduce work', regressionGuard: 'CPU budget', before: measurement, after: { ...measurement, value: 80, conditions: { ...measurement.conditions, sourceRevision: 'after', fixture: 'small' } }, correctness: 'passed', decision: 'keep', improvementPct: 20, noisePct: 5 }];
  assert.ok(validate(c).some(e => e.includes('keep requires')));
  c.experiments[0].after.conditions.fixture = 'large';
  assert.deepEqual(validate(c), []);
  c.experiments[0].after.unit = 'bytes'; assert.ok(validate(c).some(e => e.includes('keep requires')));
  c.experiments[0].after.unit = measurement.unit;
  c.experiments[0].correctness = 'failed';
  assert.ok(validate(c).some(e => e.includes('keep requires')));
  c.experiments[0].decision = 'revert'; assert.deepEqual(validate(c), []);
});
test('malformed receipt and surface shapes fail without throwing', () => {
  for (const key of ['receipts', 'surfaces']) for (const value of [undefined, null, {}, [null]]) { const c = performanceFixture(); c[key] = value; assert.ok(validate(c).length); }
});
test('contributors activate only for their domain and satisfied capability manifest', () => {
  const candidate = { name: 'vercel-react-best-practices', available: true, compatible: true, version: 'pinned-fixture', sha256: 'a'.repeat(64), provenance: 'https://example.test/fixture', capabilities: { reactVersion: '19', frameworkVersion: 'fixture' } };
  assert.equal(dispatchPerformance(PERFORMANCE_CHECKS.find(c => c.domain === 'react'), candidate).mode, 'external');
  assert.equal(dispatchPerformance(PERFORMANCE_CHECKS.find(c => c.domain === 'database'), candidate).mode, 'builtin');
  candidate.capabilities = {};
  assert.equal(dispatchPerformance(PERFORMANCE_CHECKS.find(c => c.domain === 'react'), candidate).mode, 'builtin');
});
test('measured load requires authorization and safe abort plan', () => {
  const c = performanceFixture(); delete c.receipts.find(r => r.id === 'load.spike').loadPlan.authorization;
  assert.ok(validate(c).some(e => e.includes('loadPlan.authorization')));
});
test('source-limited receipts cannot hide under a clean synthesis', () => {
  const c = performanceFixture(); c.receipts[0].status = 'source_limited'; c.receipts[0].blocker = { dependency: 'database credentials', action: 'provide read-only profiling access' };
  c.completion.status = 'source_limited';
  assert.ok(validatePerformanceContract(c, dir, [], true).some(e => e.includes('clean synthesis')));
  assert.deepEqual(validate(c), []);
});
test('baseline trend does not compare different evidence kinds', () => {
  const row = { operation: 'fixture', metric: 'duration', value: 10, unit: 'ms', statistic: 'median', sampleCount: 3, evidenceKind: 'runtime', capturedAt: '2026-09-08', conditions: { environment: 'fixture', sourceRevision: 'fixture-v1' } };
  const report = { schemaVersion: 2, baselineId: 'fixture', targetLabel: 'fixture', measurements: [row], nextRun: { command: 'fixture replay', thresholds: { noisePct: 5, maxRegressionPct: 10 } } };
  const before = path.join(dir, 'before.json'), after = path.join(dir, 'after.json');
  fs.writeFileSync(before, JSON.stringify(report)); report.measurements[0].evidenceKind = 'trace'; fs.writeFileSync(after, JSON.stringify(report));
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../../../scripts/performance-baseline.mjs', import.meta.url)), 'trend', '--before', before, '--after', after], { encoding: 'utf8' }));
  assert.deepEqual(result.comparisons.map(c => c.verdict), ['added', 'removed']);
});
test('seeded query fanout is observable at two cardinalities', async () => {
  for (const count of [10, 100]) {
    let queries = 0;
    const rows = await nPlusOne(Array.from({ length: count }, (_, i) => i), { read: async id => { queries++; return id; } });
    assert.equal(rows.length, count); assert.equal(queries, count);
    assert.ok(queries > 1, 'request-level one-query budget must detect seeded N+1');
  }
});
test('seeded cold-cache burst amplifies upstream loads', async () => {
  const cache = new Map(); let loads = 0;
  await Promise.all(Array.from({ length: 12 }, () => cacheStampede('same', cache, async () => { loads++; await new Promise(resolve => setTimeout(resolve, 1)); return 'value'; })));
  assert.equal(loads, 12);
  await cacheStampede('same', cache, async () => { loads++; }); assert.equal(loads, 12);
});
test('bounded responses do not prevent seeded process retention', () => {
  const cache = new Map();
  for (let i = 0; i < 100; i++) assert.deepEqual(retainEveryRequest(i, cache), { status: 200 });
  assert.equal([...cache.values()].reduce((sum, b) => sum + b.length, 0), 102400);
  cache.clear(); assert.equal(cache.size, 0);
});
import { detectPerformanceStack, planPerformanceExpertise, resolvePerformanceResource } from '../../../scripts/lib/performance-expertise.mjs';
import { digest } from '../../../scripts/lib/performance-contract.mjs';
import { findingFingerprint, reconcilePerformanceFindings, rerunQuality } from '../../../scripts/lib/performance-depth.mjs';

function withFinding() {
  const c = performanceFixture(), r = c.receipts[0];
  Object.assign(r, {status: 'finding', evidenceKind: 'static_hypothesis', producingPath: 'synthetic-app.mjs', remediation: 'Profile and bound work', priorityBasis: 'Fixture risk', regressionGuard: 'Fixture replay'});
  return syncDepth(c);
}
for (const [name, mutate, pattern] of [
  ['finding cap rejected', c => c.completion.findingLimit = 5, 'limits are prohibited'],
  ['surface cap rejected', c => c.completion.cellLimit = 5, 'limits are prohibited'],
  ['one pass rejected', c => c.rounds.pop(), 'second sweep'],
  ['second sweep cannot skip a cell', c => c.rounds[1].cells.pop(), 'every check/surface'],
  ['second sweep needs evidence', c => c.rounds[1].cells[0].artifacts = [], 'per-surface'],
  ['second sweep needs journey coverage', c => c.rounds[1].cells[0].journeyIds = [], 'journey coverage'],
]) test(name, () => {const c = performanceFixture(); mutate(c); assert.ok(validate(c).some(e => e.includes(pattern)));});
test('new finding in final sweep requires another full sweep', () => {
  const c = withFinding(); c.rounds[0].cells[0].findingIds = [];
  assert.ok(validate(c).some(e => e.includes('continue investigation')));
  const third = {...structuredClone(c.rounds[1]), number: 3};
  for (const cell of third.cells) cell.analysis = 'Third synthetic sweep challenges new mechanism';
  c.rounds.push(third);
  assert.deepEqual(validate(c), []);
});
test('all findings must appear in the common artifact', () => {
  const c = withFinding(); assert.ok(validatePerformanceContract(c, dir, [], false, []).some(e => e.includes('omitted from common')));
  c.receipts[0].findingIds = []; assert.ok(validate(c).some(e => e.includes('complete findings list')));
});
test('stack activation selects existing specialists and keeps Mongo separate', () => {
  const root = path.join(dir, 'stack'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'package.json'), JSON.stringify({engines:{node:'24'}, dependencies:{'@orpc/server':'1.14.3','@prisma/client':'6',next:'15',react:'19','@tanstack/react-query':'5',ioredis:'5',bullmq:'5'}}));
  fs.writeFileSync(path.join(root,'schema.prisma'), 'datasource db { provider = "postgresql" }');
  const files = ['package.json','schema.prisma'].map(p => ({path:p,sha256:digest(fs.readFileSync(path.join(root,p)))}));
  const stack = detectPerformanceStack(root, files), ids = planPerformanceExpertise(stack).map(p=>p.id);
  for(const id of ['orpc-patterns','prisma-expert','sql-optimization-patterns','react-next-performance','tanstack-query-performance','node-profiling','cache-performance','queue-performance']) assert.ok(ids.includes(id),id);
  assert.ok(!ids.includes('vercel-performance'));
  fs.writeFileSync(path.join(root,'schema.prisma'), 'datasource db { provider = "mongodb" }');
  assert.equal(detectPerformanceStack(root,files).features.sql.status,'unknown');
  assert.equal(resolvePerformanceResource('orpc-patterns/SKILL.md').name,'orpc-fullstack');
});
test('required specialist cannot be missing, stale or declared blocked under clean checks', () => {
  const c=performanceFixture(); c.stack.features.prisma={status:'present',reason:'Fixture Prisma surface'};
  assert.ok(validate(c).some(e=>e.includes('exactly one load receipt')));
  const plan=planPerformanceExpertise(c.stack)[0];
  c.expertise=[{...plan,checkIds:PERFORMANCE_CHECKS.filter(x=>plan.domains.includes(x.domain)).map(x=>x.id),status:'loaded',versionReview:'Fixture version review',application:'Fixture query count analysis',artifacts:c.receipts[0].artifacts}];
  assert.deepEqual(validate(c),[]);
  c.expertise[0].resources[0].sha256='a'.repeat(64); assert.ok(validate(c).some(e=>e.includes('stale specialist')));
  c.expertise[0].status='blocked'; c.expertise[0].blocker={dependency:'missing resource',action:'restore matching resource'};
  assert.ok(validate(c).some(e=>e.includes('cannot remove coverage')));
});
function comparison() {
 const previous=performanceFixture(), c=withFinding(); c.runId='second-run';
 const raw=JSON.stringify(previous); fs.writeFileSync(path.join(dir,'prior.json'),raw);
 c.rerun={mode:'comparison',previous:{path:'prior.json',sha256:digest(raw)},rows:reconcilePerformanceFindings(previous,c).map(r=>({...r,reason:'Present but missed',artifacts:c.receipts[0].artifacts,missAnalysis:'First sweep missed producer',safeguard:'Replay producer at scale'})),quality:'failed'};
 return {previous,c};
}
test('unchanged rerun new finding is an explicit audit quality failure', () => {
 const {previous,c}=comparison(); assert.equal(rerunQuality(previous,c.rerun.rows),'failed'); assert.deepEqual(validate(c),[]);
 c.rerun.quality='no_misses'; assert.ok(validate(c).some(e=>e.includes('audit-quality')));
});
test('rerun cannot relabel a miss without causal evidence', () => {
 const {c}=comparison(); const row=c.rerun.rows[0]; row.classification='introduced_by_remediation';row.change='Alleged change';c.rerun.quality='no_misses';
 assert.ok(validate(c).some(e=>e.includes('unchanged source')));
 row.classification='newly_observable'; assert.ok(validate(c).some(e=>e.includes('newly available signal')));
 row.classification='previously_missed';delete row.missAnalysis;c.rerun.quality='failed';assert.ok(validate(c).some(e=>e.includes('failure analysis')));
});
test('prior run hashes and complete reconciliation are enforced', () => {
 const {c}=comparison();c.rerun.rows=[]; assert.ok(validate(c).some(e=>e.includes('every previous and current')));
 c.rerun.previous.sha256='a'.repeat(64);assert.ok(validate(c).some(e=>e.includes('hash mismatch')));
});
test('expert, cell and rerun CLI plans execute', () => {
 const {c}=comparison(); const file=path.join(dir,'current.json');fs.writeFileSync(file,JSON.stringify(c));
 const cli=fileURLToPath(new URL('../../../scripts/performance-audit.mjs',import.meta.url));
 const run=(...args)=>JSON.parse(execFileSync(process.execPath,[cli,...args],{encoding:'utf8'}));
 assert.equal(run('cells',file).length,PERFORMANCE_CHECKS.length);
 assert.deepEqual(run('experts',file),[]);
 assert.equal(run('reconcile',path.join(dir,'prior.json'),file)[0].classification,'previously_missed');
});

test('copied challenge conclusions cannot satisfy a second sweep', () => {
 const c=performanceFixture();c.rounds[1].cells[0].analysis=c.rounds[0].cells[0].analysis;
 assert.ok(validate(c).some(e=>e.includes('copied conclusions')));
});
test('more than five findings remain required within one check', () => {
 const c=withFinding(), seed=c.findings[0];
 for(let i=1;i<8;i++){const f={...seed,location:`synthetic-app.mjs:sibling${i}`};f.id=findingFingerprint(f);c.findings.push(f);}
 const ids=c.findings.map(f=>f.id);c.receipts[0].findingIds=ids;
 for(const round of c.rounds) round.cells[0].findingIds=ids;
 assert.deepEqual(validate(c),[]);
 c.receipts[0].findingIds=ids.slice(0,5);assert.ok(validate(c).some(e=>e.includes('complete findings list')));
});
test('disappeared findings require verified resolution', () => {
 const previous=withFinding(),c=performanceFixture();c.runId='resolved-run';
 const raw=JSON.stringify(previous);fs.writeFileSync(path.join(dir,'resolved-prior.json'),raw);
 c.rerun={mode:'comparison',previous:{path:'resolved-prior.json',sha256:digest(raw)},rows:reconcilePerformanceFindings(previous,c).map(r=>({...r,reason:'Needs investigation'})),quality:'no_misses'};
 assert.ok(validate(c).some(e=>e.includes('disposition unresolved')));
 Object.assign(c.rerun.rows[0],{classification:'resolved',reason:'Replayed original reproducer',artifacts:c.receipts[0].artifacts});
 assert.deepEqual(validate(c),[]);
});
test('source-limited cells cannot silently close a clean check', () => {
 const c=performanceFixture(),cell=c.rounds[1].cells[0];
 Object.assign(cell,{status:'source_limited',blocker:{dependency:'Fixture unavailable',action:'Provide representative fixture'}});
 c.completion.status='source_limited';assert.ok(validate(c).some(e=>e.includes('unexamined cell')));
 Object.assign(c.receipts[0],{status:'source_limited',blocker:cell.blocker});assert.deepEqual(validate(c),[]);
});
