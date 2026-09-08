import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const list = x => Array.isArray(x) ? x : [];
const text = x => typeof x === 'string' && x.trim().length > 0;
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export const findingFingerprint = f => createHash('sha256').update(JSON.stringify([f.checkId, f.location, f.mechanism])).digest('hex');

export function performanceCells(contract, checks) {
  return checks.flatMap(check => contract.surfaces.filter(s => s.domains.includes(check.domain)).map(s => ({ id: `${check.id}::${s.id}`, checkId: check.id, surfaceId: s.id, journeyIds: s.journeys })));
}

/** Seed honest rerun dispositions; source changes never automatically prove cause. */
export function reconcilePerformanceFindings(previous, current) {
  const old = new Map(list(previous.findings).map(f => [f.id, f]));
  const next = new Set(list(current.findings).map(f => f.id));
  const unchanged = previous.inventory.sha256 === current.inventory.sha256;
  const rows = list(current.findings).map(f => ({ findingId: f.id, classification: old.has(f.id) ? 'carried' : unchanged ? 'previously_missed' : 'needs_explanation', reason: '' }));
  for (const f of list(previous.findings)) if (!next.has(f.id)) rows.push({ findingId: f.id, classification: 'needs_verification', reason: '' });
  return rows;
}

export function rerunQuality(previous, rows) {
  const misses = rows.filter(r => r.classification === 'previously_missed').length;
  return misses >= Math.max(1, list(previous.findings).length) ? 'failed' : misses ? 'misses_detected' : 'no_misses';
}

export function validatePerformanceDepth(contract, checks, base, verifyArtifact, reportedFindingIds = null) {
  const errors = [];
  if (!text(contract.runId) || !text(contract.targetId)) errors.push('performance runId and stable targetId required');
  if (contract.completion?.findingLimit !== null || contract.completion?.cellLimit !== null) errors.push('performance finding and surface limits are prohibited');
  if (!['complete', 'source_limited'].includes(contract.completion?.status)) errors.push('performance completion status required');
  const findings = list(contract.findings);
  if (!Array.isArray(contract.findings) || findings.some(f => !f || !text(f.id))) return [...errors, 'complete structured findings ledger required'];
  if (new Set(findings.map(f => f.id)).size !== findings.length) errors.push('duplicate finding fingerprint');
  for (const f of findings) {
    if (!checks.some(c => c.id === f.checkId) || !text(f.location) || !text(f.mechanism) || f.id !== findingFingerprint(f) || !text(f.impact)) errors.push('finding needs stable check/location/mechanism fingerprint and impact');
    if (!list(f.artifacts).length) errors.push(`${f.id}: finding evidence required`);
    for (const a of list(f.artifacts)) verifyArtifact(a, errors, f.id);
    if (reportedFindingIds && !reportedFindingIds.includes(f.id)) errors.push(`${f.id}: finding omitted from common audit artifact`);
  }
  for (const r of contract.receipts) {
    const owned = findings.filter(f => f.checkId === r.id).map(f => f.id);
    if (!same(list(r.findingIds), owned)) errors.push(`${r.id}: complete findings list required`);
    if (owned.length && r.status !== 'finding') errors.push(`${r.id}: findings hidden by receipt status`);
    if (r.status === 'finding' && !owned.length) errors.push(`${r.id}: finding receipt has no ledger entry`);
  }
  const cells = performanceCells(contract, checks), rounds = list(contract.rounds);
  if (rounds.length < 2) errors.push('initial investigation and independent second sweep are mandatory');
  const seenFindings = new Set();
  let lastNew = [];
  for (const [index, round] of rounds.entries()) {
    if (!round || round.number !== index + 1 || round.inventoryHash !== contract.inventory.sha256 || round.approach !== (index === 0 ? 'producer-tracing' : 'coverage-challenge')) { errors.push('round order, inventory hash and distinct investigation approaches required'); continue; }
    const rows = list(round.cells);
    if (!same(rows.map(r => r?.id), cells.map(c => c.id))) errors.push(`round ${index + 1}: every check/surface cell must be investigated, without a finding cap`);
    lastNew = [];
    for (const cell of cells) {
      const row = rows.find(r => r?.id === cell.id);
      if (!row) continue;
      if (!same(list(row.journeyIds), cell.journeyIds)) errors.push(`${cell.id}: round journey coverage incomplete`);
      if (!['examined', 'source_limited'].includes(row.status)) errors.push(`${cell.id}: invalid investigation disposition`);
      if (row.status === 'source_limited') {
        if (!text(row.blocker?.dependency) || !text(row.blocker?.action)) errors.push(`${cell.id}: exact investigation blocker required`);
        if (contract.completion?.status === 'complete' || contract.receipts.find(r => r.id === cell.checkId)?.status === 'confirmed_clean') errors.push(`${cell.id}: unexamined cell cannot close clean or complete`);
      } else {
        const priorRow = list(rounds[index - 1]?.cells).find(r => r?.id === cell.id);
        if (priorRow?.status === 'examined' && priorRow.analysis === row.analysis) errors.push(`${cell.id}: challenge sweep must retain distinct analysis, not copied conclusions`);
        if (!list(row.commands).length || row.commands.some(c => !text(c)) || !list(row.artifacts).length || !text(row.analysis)) errors.push(`${cell.id}: per-surface investigation evidence required`);
        for (const a of list(row.artifacts)) verifyArtifact(a, errors, cell.id);
      }
      for (const id of list(row.findingIds)) {
        if (!findings.some(f => f.id === id && f.checkId === cell.checkId)) errors.push(`${cell.id}: unknown or misattributed finding`);
        if (!seenFindings.has(id)) { lastNew.push(id); seenFindings.add(id); }
      }
    }
  }
  if (!same([...seenFindings], findings.map(f => f.id))) errors.push('findings ledger and investigation rounds do not reconcile');
  if (rounds.length >= 2 && lastNew.length && contract.completion?.status === 'complete') errors.push('second sweep found new issues: continue investigation until a full sweep adds none');
  if (contract.completion?.status === 'complete' && contract.receipts.some(r => r.status === 'source_limited')) errors.push('source-limited checks prevent full completion');
  const rerun = contract.rerun;
  if (!rerun || !['first_run', 'comparison'].includes(rerun.mode)) return [...errors, 'explicit first-run or prior-run reconciliation required'];
  if (rerun.mode === 'first_run') {
    if (!text(rerun.historySearch) || rerun.quality !== 'first_run') errors.push('first run requires prior-artifact search and honest quality label');
    return errors;
  }
  const beforeErrors = [];
  verifyArtifact(rerun.previous, beforeErrors, 'prior performance run');
  if (beforeErrors.length) return [...errors, ...beforeErrors];
  let previous;
  try { previous = JSON.parse(fs.readFileSync(path.resolve(base, rerun.previous.path), 'utf8')); }
  catch (e) { return [...errors, `prior run JSON invalid: ${e.message}`]; }
  if (!previous || previous.targetId !== contract.targetId || previous.runId === contract.runId || !previous.inventory?.sha256 || (!Array.isArray(previous.findings) || previous.findings.some(f => !f || !text(f.id)))) return [...errors, 'prior run must be a distinct run of the same target with inventory and findings'];
  const expected = reconcilePerformanceFindings(previous, contract), rows = list(rerun.rows);
  if (!same(rows.map(r => r?.findingId), expected.map(r => r.findingId))) errors.push('rerun must reconcile every previous and current finding exactly once');
  for (const r of rows) {
    if (!r || !text(r.reason)) { errors.push('rerun classification needs explanation'); continue; }
    const seed = expected.find(x => x.findingId === r.findingId);
    const allowed = seed?.classification === 'carried' ? ['carried'] : seed?.classification === 'needs_verification' ? ['resolved', 'removed_surface'] : ['previously_missed', 'introduced_by_remediation', 'newly_observable'];
    if (!allowed.includes(r.classification)) errors.push('rerun disposition unresolved or contradicts finding identity');
    if (r.classification === 'introduced_by_remediation' && previous.inventory.sha256 === contract.inventory.sha256) errors.push('unchanged source cannot introduce a remediation regression');
    if (r.classification !== 'carried') {
      if (!list(r.artifacts).length) errors.push('new or resolved rerun finding needs causal evidence');
      for (const a of list(r.artifacts)) verifyArtifact(a, errors, 'rerun cause');
    }
    if (r.classification === 'previously_missed' && (!text(r.missAnalysis) || !text(r.safeguard))) errors.push('missed finding needs audit failure analysis and safeguard');
    if (r.classification === 'newly_observable' && !text(r.newSignal)) errors.push('newly observable finding needs the exact newly available signal');
    if (r.classification === 'introduced_by_remediation' && !text(r.change)) errors.push('introduced finding needs causal remediation change');
  }
  if (rerun.quality !== rerunQuality(previous, rows)) errors.push('rerun audit-quality label hides previously missed findings');
  return errors;
}
