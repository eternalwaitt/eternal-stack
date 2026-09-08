import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validatePerformanceExpertise } from './performance-expertise.mjs';
import { validatePerformanceDepth } from './performance-depth.mjs';

// Fine checks are mandatory even when applicability is unknown. Six lanes remain
// scheduling units, never substitutes for these independently closed receipts.
export const PERFORMANCE_CONTRACT_VERSION = 2;
const groups = [
  ['database', 'database-query-performance', 'database', 'query-count root-cardinality nested-cardinality projection plans indexes pool-wait locks-transactions'],
  ['runtime', 'infrastructure-network', 'runtime', 'cpu saturation event-loop thread-pool gc heap-retention native-rss handles-io cold-start concurrency'],
  ['cache', 'server-response-caching', 'runtime', 'keys-invalidation stampede coalescing capacity'],
  ['requests', 'server-response-caching', 'runtime', 'route-coverage waterfalls serialization external-retries'],
  ['react', 'react-rendering', 'browser', 'render-commit context-subscriptions virtualization compiler effects-leaks'],
  ['browser', 'perceived-performance', 'browser', 'hydration long-tasks field-vitals constrained-device transitions-streaming resource-loading'],
  ['bundle', 'bundle-code-splitting', 'browser', 'route-ownership transfer-parse-execute duplicates-tree-shaking client-leakage dynamic-imports budgets'],
  ['delivery', 'infrastructure-network', 'operations', 'cdn-compression assets placement network-io'],
  ['load', 'infrastructure-network', 'operations', 'traffic-mix smoke steady stress spike soak headroom autoscaling generator'],
  ['background', 'infrastructure-network', 'operations', 'queues backpressure scheduled-jobs'],
  ['build', 'infrastructure-network', 'operations', 'cpu memory incremental-cache'],
  ['platform', 'infrastructure-network', 'operations', 'provider-signals resource-limits'],
];
export const PERFORMANCE_CHECKS = groups.flatMap(([domain, laneId, reference, names]) => names.split(' ').map(name => ({ id: `${domain}.${name}`, domain, laneId, reference: `domains-${reference}.md` })));
export const PERFORMANCE_METRIC_DOMAINS = { database: 'database', runtime: 'server_runtime', cache: 'server_runtime', requests: 'server_runtime', react: 'browser', browser: 'browser', bundle: 'client_bundle', delivery: 'network', load: 'capacity', background: 'background', build: 'build', platform: 'provider_runtime' };
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const array = x => Array.isArray(x) ? x : [];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export const PERFORMANCE_CONTRIBUTORS = {
  'vercel-react-best-practices': { domains: ['react', 'bundle'], requires: ['reactVersion', 'frameworkVersion'] },
  'vercel-optimize': { domains: ['platform', 'delivery', 'requests', 'cache'], requires: ['supportedVercelFramework', 'linkedProjectScope', 'readCredentials', 'observabilitySignals'] },
  'agent-laboratory': { domains: groups.map(g => g[0]), requires: ['remediationMode', 'replayHarness'] },
  'load-testing': { domains: ['load'], requires: ['authorizedTarget', 'trafficMix'] },
};
function contributorApplies(check, candidate) {
  const spec = PERFORMANCE_CONTRIBUTORS[candidate?.name];
  return spec?.domains.includes(check.domain) && spec.requires.every(key => nonempty(candidate.capabilities?.[key]));
}

/** Resolve optional contributors without letting availability change coverage. */
export function dispatchPerformance(check, candidate) {
  if (candidate?.available && candidate.compatible && candidate.version && /^[a-f0-9]{64}$/.test(candidate.sha256 || '') && candidate.provenance && contributorApplies(check, candidate)) {
    return { ...candidate, mode: 'external', reference: check.reference };
  }
  return { mode: 'builtin', reference: check.reference, fallbackReason: candidate ? 'Contributor unavailable, unpinned, or incompatible; built-in investigation required' : 'Built-in domain playbook' };
}

/** Validate evidence files without permitting traversal outside the audit directory. */
function evidenceFile(file, base, errors, label) {
  if (!file || !nonempty(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) { errors.push(`${label}: evidence path and SHA-256 required`); return; }
  try {
    const root = fs.realpathSync(base);
    const target = fs.realpathSync(path.resolve(root, file.path));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(target).isFile()) throw new Error('outside artifact directory or not a file');
    if (digest(fs.readFileSync(target)) !== file.sha256) throw new Error('hash mismatch');
  } catch (error) { errors.push(`${label}: ${error.message}`); }
}

/** Structural enforcement does not attest to truthful instrumentation or complete semantic discovery. */
export function validatePerformanceContract(contract, base, checks = [], claimClean = false, reportedFindingIds = null) {
  const errors = [];
  if (contract?.path) {
    evidenceFile(contract, base, errors, 'performance contract');
    if (errors.length) return errors;
    try { contract = JSON.parse(fs.readFileSync(path.resolve(base, contract.path), 'utf8')); }
    catch (error) { return [`performance contract JSON: ${error.message}`]; }
  }
  if (contract?.version !== PERFORMANCE_CONTRACT_VERSION) return [`mandatory performanceContract version ${PERFORMANCE_CONTRACT_VERSION} missing`];
  if (!['audit', 'remediation'].includes(contract.mode)) errors.push('mode must be audit or remediation');
  const inventory = contract.inventory;
  if (!inventory || !Array.isArray(inventory.files) || !inventory.files.length || !nonempty(inventory.command) || !nonempty(inventory.revision)) return ['performance inventory requires files, command and revision'];
  if (inventory.files.some(x => !x || typeof x !== 'object')) return ['inventory file entries must be objects'];
  if (inventory.sha256 !== digest(inventory.files)) errors.push('inventory content hash mismatch');
  const files = inventory.files.map(x => x.path);
  if (new Set(files).size !== files.length || inventory.files.some(x => !nonempty(x.path) || !/^[a-f0-9]{64}$/.test(x.sha256 || ''))) errors.push('inventory paths must be unique and hashed');
  if (!Array.isArray(contract.surfaces) || !Array.isArray(contract.receipts)) return [...errors, 'surfaces and receipts arrays required'];
  const surfaces = array(contract.surfaces);
  if (surfaces.some(s => !s || !Array.isArray(s.domains) || !Array.isArray(s.files) || !Array.isArray(s.journeys))) return ['surface entries need files, domains and journeys arrays'];
  const ids = surfaces.map(x => x.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(x => !nonempty(x))) errors.push('unique nonempty surface ids required');
  const accounted = new Set();
  for (const s of surfaces) {
    if (!array(s.files).length || !array(s.domains).length || s.domains.some(d => !groups.some(g => g[0] === d)) || !Array.isArray(s.journeys)) errors.push(`surface ${s.id}: files, known domains and journeys required`);
    for (const f of array(s.files)) { accounted.add(f); if (!files.includes(f)) errors.push(`surface ${s.id}: unknown file ${f}`); }
  }
  for (const e of array(contract.exclusions)) {
    if (!e || typeof e !== 'object') { errors.push('invalid exclusion'); continue; }
    if (!nonempty(e.reason) || !files.includes(e.path)) errors.push('exclusion needs inventoried path and reason');
    accounted.add(e.path);
  }
  if (!same(files, [...accounted])) errors.push('inventory files omitted from surfaces/exclusions');
  if (!nonempty(contract.discoveryReview?.routeCommand) || !nonempty(contract.discoveryReview?.runtimeCommand) || !nonempty(contract.discoveryReview?.limitations)) errors.push('discovery review requires route/runtime reconciliation commands and limitations');
  const receipts = array(contract.receipts);
  if (receipts.some(r => !r || typeof r !== 'object')) return [...errors, 'receipt entries must be objects'];
  if (claimClean && receipts.some(r => !['confirmed_clean', 'not_applicable'].includes(r.status))) errors.push('clean synthesis hides unresolved performance receipts');
  if (!same(receipts.map(r => r.id), PERFORMANCE_CHECKS.map(c => c.id))) errors.push('every fine check needs exactly one receipt');
  for (const check of PERFORMANCE_CHECKS) {
    const r = receipts.find(x => x.id === check.id);
    if (!r) continue;
    const relevant = surfaces.filter(s => s.domains.includes(check.domain));
    if (!same(array(r.surfaceIds), relevant.map(s => s.id))) errors.push(`${check.id}: surface coverage mismatch`);
    const journeys = [...new Set(relevant.flatMap(s => s.journeys))];
    if (!same(array(r.journeyIds), journeys) || r.itemCount !== relevant.length || r.journeyCount !== journeys.length) errors.push(`${check.id}: item/journey counts mismatch`);
    if (r.inventoryHash !== inventory.sha256) errors.push(`${check.id}: stale inventory receipt`);
    if (!['confirmed_clean', 'finding', 'source_limited', 'not_applicable'].includes(r.status)) errors.push(`${check.id}: invalid disposition`);
    if (!nonempty(r.reason)) errors.push(`${check.id}: reason required`);
    if (!relevant.length && r.status !== 'not_applicable') errors.push(`${check.id}: no surface; record explicit applicability decision`);
    if (relevant.length && r.status === 'not_applicable') errors.push(`${check.id}: applicable surface cannot be not_applicable`);
    if (r.status === 'source_limited' && (!nonempty(r.blocker?.dependency) || !nonempty(r.blocker?.action))) errors.push(`${check.id}: exact dependency and recovery action required`);
    const dispatch = r.dispatch;
    if (!dispatch || !['builtin', 'external'].includes(dispatch.mode) || dispatch.reference !== check.reference) errors.push(`${check.id}: dispatch receipt required`);
    if (dispatch?.mode === 'external' && (!dispatch.available || !dispatch.compatible || !nonempty(dispatch.version) || !/^[a-f0-9]{64}$/.test(dispatch.sha256 || '') || !nonempty(dispatch.provenance))) errors.push(`${check.id}: external provenance/availability invalid`);
    if (dispatch?.mode === 'external' && !contributorApplies(check, dispatch)) errors.push(`${check.id}: external contributor applicability/capabilities invalid`);
    if (!['finding', 'confirmed_clean'].includes(r.status)) continue;
    if (!array(r.commands).length || r.commands.some(x => !nonempty(x)) || !array(r.criteria).length || r.criteria.some(x => !nonempty(x)) || !array(r.artifacts).length) errors.push(`${check.id}: commands, criteria and raw artifacts required`);
    for (const a of array(r.artifacts)) evidenceFile(a, base, errors, check.id);
    if (!['measured', 'static_hypothesis'].includes(r.evidenceKind)) errors.push(`${check.id}: evidence kind required`);
    if (r.status === 'confirmed_clean' && r.evidenceKind !== 'measured') errors.push(`${check.id}: source inspection cannot prove clean`);
    if (r.status === 'finding' && (!nonempty(r.producingPath) || !nonempty(r.remediation) || !nonempty(r.priorityBasis) || !nonempty(r.regressionGuard))) errors.push(`${check.id}: causal finding fields required`);
    if (r.evidenceKind === 'measured') {
      const m = r.measurement;
      if (m?.metricDomain !== PERFORMANCE_METRIC_DOMAINS[check.domain]) errors.push(`${check.id}: measurement domain substitution`);
      if (!['field', 'lab', 'trace', 'runtime', 'query_plan', 'bundle', 'provider_runtime'].includes(m?.evidenceType)) errors.push(`${check.id}: typed measurement evidence required`);
      if (m?.evidenceType === 'bundle' && check.domain !== 'bundle') errors.push(`${check.id}: bundle bytes cannot close another measurement domain`);
      if (!m || !nonempty(m.method) || !nonempty(m.metric) || !Number.isFinite(m.value) || m.value < 0 || !nonempty(m.unit) || !nonempty(m.statistic) || !nonempty(m.variance) || !Number.isInteger(m.warmups) || m.warmups < 0) errors.push(`${check.id}: measurement method, value, distribution, variance and warmups required`);
      for (const key of ['environment', 'sourceRevision', 'fixture', 'auth', 'cacheState', 'device', 'network', 'concurrency']) if (!nonempty(m?.conditions?.[key])) errors.push(`${check.id}: conditions.${key} required`);
      const emitted = m?.method === 'emitted-artifact' && check.domain === 'bundle' && check.id !== 'bundle.transfer-parse-execute';
      if (!Number.isInteger(m?.sampleCount) || m.sampleCount < (emitted ? 1 : 3)) errors.push(`${check.id}: repeated samples required (single emitted build observation excepted)`);
      if (check.domain === 'load') {
        for (const key of ['target', 'environment', 'authorization', 'duration', 'maxRate', 'maxConcurrency', 'abortLatency', 'abortErrors', 'abortResources', 'generatorLimits', 'cleanup']) if (!nonempty(r.loadPlan?.[key])) errors.push(`${check.id}: loadPlan.${key} required`);
      }
    }
  }
  for (const lane of checks) {
    const rows = receipts.filter(r => PERFORMANCE_CHECKS.find(c => c.id === r.id)?.laneId === lane.laneId);
    if (lane.status === 'confirmed_clean' && rows.some(r => !['confirmed_clean', 'not_applicable'].includes(r.status))) errors.push(`${lane.laneId}: broad clean hides incomplete or finding receipts`);
    if (rows.some(r => r.status === 'finding') && lane.status !== 'finding') errors.push(`${lane.laneId}: fine finding hidden by lane`);
  }
  if (contract.mode === 'remediation') {
    if (!array(contract.experiments).length) errors.push('remediation requires experiments');
    for (const e of array(contract.experiments)) {
      if (!e || typeof e !== 'object') { errors.push('invalid experiment'); continue; }
      if (!PERFORMANCE_CHECKS.some(c => c.id === e.checkId) || !nonempty(e.change) || !['keep', 'revert', 'inconclusive'].includes(e.decision) || !nonempty(e.regressionGuard)) errors.push('experiment requires check, change, decision and regression guard');
      for (const phase of ['before', 'after']) {
        evidenceFile(e[phase]?.artifact, base, errors, `experiment ${phase}`);
        if (!Number.isFinite(e[phase]?.value) || e[phase].value < 0 || !Number.isInteger(e[phase]?.sampleCount)) errors.push(`experiment ${phase} measurement required`);
        for (const key of ['metric', 'unit', 'metricDomain', 'evidenceType']) if (!nonempty(e[phase]?.[key])) errors.push(`experiment ${phase}.${key} required`);
        for (const key of ['environment', 'sourceRevision', 'fixture', 'auth', 'cacheState', 'device', 'network', 'concurrency']) if (!nonempty(e[phase]?.conditions?.[key])) errors.push(`experiment ${phase}.conditions.${key} required`);
      }
      const comparable = value => { const { sourceRevision, ...rest } = value || {}; return Object.keys(rest).sort().map(k => [k, rest[k]]); };
      const matched = JSON.stringify(comparable(e.before?.conditions)) === JSON.stringify(comparable(e.after?.conditions)) && ['metric', 'unit', 'metricDomain', 'evidenceType'].every(k => e.before?.[k] === e.after?.[k]);
      const improvement = e.before?.value > 0 && Number.isFinite(e.after?.value) ? (e.before.value - e.after.value) / e.before.value * 100 * (e.direction === 'higher' ? -1 : 1) : null;
      if (e.decision === 'keep' && (!matched || e.before?.sampleCount < 3 || e.after?.sampleCount < 3 || e.correctness !== 'passed' || !Number.isFinite(e.noisePct) || e.noisePct < 0 || improvement === null || improvement <= e.noisePct)) errors.push('keep requires matched repeated evidence above noise and passing correctness');
    }
  }
  if (claimClean && contract.completion?.status !== 'complete') errors.push('source-limited investigation cannot support clean synthesis');
  const verifyArtifact = (file, out, label) => evidenceFile(file, base, out, label);
  errors.push(...validatePerformanceExpertise(contract, PERFORMANCE_CHECKS, verifyArtifact));
  errors.push(...validatePerformanceDepth(contract, PERFORMANCE_CHECKS, base, verifyArtifact, reportedFindingIds));
  return errors;
}
