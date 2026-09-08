import { PERFORMANCE_CHECKS, PERFORMANCE_METRIC_DOMAINS, digest, dispatchPerformance } from '../../../scripts/lib/performance-contract.mjs';

import { FEATURES } from '../../../scripts/lib/performance-expertise.mjs';
import { findingFingerprint, performanceCells } from '../../../scripts/lib/performance-depth.mjs';

// Synthetic contract evidence, not measurements of a real application.
export const raw = 'Synthetic performance fixture: samples 10, 11, 12; no real performance claim.\n';
export function performanceFixture() {
  const files = [{ path: 'synthetic-app.mjs', sha256: digest('synthetic') }];
  const inventory = { files, sha256: digest(files), command: 'synthetic fixture inventory', revision: 'fixture-v1' };
  const domains = [...new Set(PERFORMANCE_CHECKS.map(c => c.domain))];
  const contract = { version: 2, runId: "fixture-run", targetId: "fixture-target", mode: 'audit', inventory, surfaces: [{ id: 'synthetic', files: ['synthetic-app.mjs'], domains, journeys: ['fixture-journey'] }], exclusions: [],
    discoveryReview: { routeCommand: 'synthetic route fixture', runtimeCommand: 'synthetic runtime fixture', limitations: 'Synthetic validation only; no live agent or application evidence' },
    receipts: PERFORMANCE_CHECKS.map(c => ({ id: c.id, inventoryHash: inventory.sha256, surfaceIds: ['synthetic'], journeyIds: ['fixture-journey'], itemCount: 1, journeyCount: 1, status: 'confirmed_clean', reason: 'Synthetic positive contract fixture', loadPlan: c.domain === 'load' ? Object.fromEntries(['target', 'environment', 'authorization', 'duration', 'maxRate', 'maxConcurrency', 'abortLatency', 'abortErrors', 'abortResources', 'generatorLimits', 'cleanup'].map(k => [k, 'synthetic fixture only'])) : undefined, dispatch: dispatchPerformance(c), commands: ['synthetic measurement fixture'], criteria: ['fixture measurement below synthetic limit'], artifacts: [{ path: 'performance-evidence.txt', sha256: digest(raw) }], evidenceKind: 'measured', measurement: { metricDomain: PERFORMANCE_METRIC_DOMAINS[c.domain], evidenceType: 'trace', method: 'synthetic trace', metric: 'fixture-duration', value: 11, unit: 'ms', statistic: 'median', variance: 'range 10-12', warmups: 1, sampleCount: 3, conditions: { environment: 'synthetic', sourceRevision: 'fixture-v1', fixture: 'synthetic', auth: 'synthetic', cacheState: 'warm', device: 'synthetic', network: 'synthetic', concurrency: '1' } } })) };
  contract.stack = { signals: [], features: Object.fromEntries(FEATURES.map(f => [f, {status: 'absent', reason: 'Synthetic feature-free fixture'}])) };
  contract.expertise = [];
  contract.completion = {status: 'complete', findingLimit: null, cellLimit: null};
  contract.rerun = {mode: 'first_run', historySearch: 'Synthetic first-run fixture', quality: 'first_run'};
  return syncDepth(contract);
}

export function syncDepth(c) {
  c.findings = c.receipts.filter(r => r.status === 'finding').map(r => {
    const f = {checkId: r.id, location: 'synthetic-app.mjs:function', mechanism: r.id, impact: 'Synthetic impact', artifacts: r.artifacts};
    return {...f, id: findingFingerprint(f)};
  });
  for (const r of c.receipts) r.findingIds = c.findings.filter(f => f.checkId === r.id).map(f => f.id);
  c.rounds = [1, 2].map(number => ({number, inventoryHash: c.inventory.sha256, approach: number === 1 ? 'producer-tracing' : 'coverage-challenge', cells: performanceCells(c, PERFORMANCE_CHECKS).map(cell => ({...cell, status: 'examined', commands: ['synthetic sweep'], artifacts: [{path: 'performance-evidence.txt', sha256: digest(raw)}], analysis: number === 1 ? 'Synthetic producer trace' : 'Synthetic coverage challenge', findingIds: c.findings.filter(f => f.checkId === cell.checkId).map(f => f.id)}))}));
  return c;
}
