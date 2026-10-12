import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { withFileLock } from './json-file-store.mjs';
import { randomUUID } from 'node:crypto';
import { PROJECT_STATE_PATHS, STATE_START, STATE_END, STATE_MAX_BYTES, splitProjectState, normalizeProjectStateSource } from './project-state-format.mjs';
import { requiresProjectState } from './workflow-contract.mjs';
import { projectIdentity, projectDeclaration, safeOverviewPath, discoverStatePaths, stateDeclaration, validIdentity } from './project-identity.mjs';
import { worktreeHash } from './etrnl-state-core.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function projectRoot(cwd) {
  return fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
}
const safeFile = safeOverviewPath;
function readDoc(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > STATE_MAX_BYTES) throw new Error('project state must be a bounded regular file');
  const text = fs.readFileSync(file, 'utf8'); splitProjectState(text); return text;
}
export function resolveProjectState(ledger, explicit = '', create = false) {
  const root = projectRoot(ledger.cwd);
  let relative = explicit || ledger.projectState?.path;
  if (!relative) {
    const found = discoverStatePaths(root).filter(candidate => fs.existsSync(safeFile(root, candidate)));
    if (found.length > 1) throw new Error('multiple project state documents; init --state-path must bind the canonical one');
    relative = found[0] || (create ? 'PROJECT_STATE.md' : '');
  }
  if (relative) {
    try { execFileSync('git',['check-ignore','--quiet','--',relative],{cwd:root,timeout:2000,stdio:['ignore','pipe','ignore']}); throw new Error('canonical overview must be tracked or nonignored so authored state remains source-bound'); }
    catch(error) { if (error.status !== 1) throw error; }
  }
  if (relative && !PROJECT_STATE_PATHS.includes(relative) && !fs.existsSync(safeFile(root, relative))) throw new Error('bind an existing overview; custom paths cannot bootstrap competing documents');
  return relative ? { root, relative, file: safeFile(root, relative) } : null;
}
export function stateScope(ledger) {
  return hash(JSON.stringify({ runId: ledger.runId, contract: ledger.workflowContract,
    tasks: (ledger.tasks || []).map(({ id, featureId, title, mode, lineageId, packetHash }) => ({ id, featureId, title, mode, lineageId, packetHash })) }));
}
const initial = '# Project state\n\n## Current scope\n\n## Features and status\n\n## Pending work\n\n## Lessons and mistakes\n\n';
function evidence(ledger, source) {
  const tasks = ledger.tasks || [], latest = new Map();
  for (const check of ledger.checks || []) latest.set(check.name || '', check);
  const rows = [...latest.values()];
  const current = rows.filter(check => check.evidenceKind === 'command-run' && check.startedTreeHash === source && check.treeHash === source);
  const passed = current.filter(check => check.status === 'passed' && check.exitCode === 0).length;
  const stale = rows.length - current.length;
  const review = (ledger.workflowReviews || []).at(-1);
  return `\nExecution evidence from the latest helper mutation only; earlier pending work remains in authored sections. Feature status is not inferred.\n\n- Run reference: ${hash(ledger.runId || "unknown").slice(0, 12)}\n- Source fingerprint: ${source ? source.slice(0, 16) : 'unavailable'}\n- Tasks: ${tasks.length}; unresolved: ${tasks.filter(task => !['verified', 'skipped'].includes(task.status)).length}; reported verified: ${tasks.filter(task => task.status === 'verified').length}\n- Latest named checks: ${rows.length}; current captured passes: ${passed}; current failed/unfinished: ${current.length - passed}; stale or self-reported: ${stale}\n- Review: ${review ? (review.treeHash === source ? 'recorded; completion gate validates provenance and scope' : 'stale') : 'not recorded'}\n- State acknowledgement: ${!requiresProjectState(ledger.workflowContract) ? 'not required by contract' : stateAckErrors(ledger, source).length ? 'required or stale' : 'current'}\n- Completion: not established by this view; use the supported completion gate.\n`;
}
function replace(file, text, previous, tempRoot) {
  if ((fs.existsSync(file) ? readDoc(file) : null) !== previous) throw new Error('project state changed concurrently; retry without overwriting authored content');
  const temp = path.join(tempRoot, `etrnl-project-state-${randomUUID()}.tmp`);
  try { fs.writeFileSync(temp, text, { mode: fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644, flag: 'wx' });
    if ((fs.existsSync(file) ? readDoc(file) : null) !== previous) throw new Error('project state changed concurrently; retry');
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}
export function syncProjectState(ledger, { explicit = '', bootstrap = false } = {}) {
  if (!ledger.workflowContract || ledger.workflowContract.effects !== 'repository-write') return null;
  const location = resolveProjectState(ledger, explicit, bootstrap && requiresProjectState(ledger.workflowContract));
  if (!location) return null;
  if (!fs.existsSync(location.file) && (!bootstrap || ledger.projectState?.path)) throw new Error('bound project state document is missing; restore authored content instead of reinitializing it');
  fs.mkdirSync(path.dirname(location.file), { recursive: true });
  // The shared ledger/store lock directory beside a tracked document would enter
  // source hashes. Keep this lock inside Git's private per-worktree directory.
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: location.root, encoding: 'utf8', timeout: 2000 }).trim();
  return withFileLock(path.join(gitDir, `etrnl-project-state-${hash(location.relative).slice(0, 12)}`), () => {
    const previous = fs.existsSync(location.file) ? readDoc(location.file) : null;
    let text = previous ?? initial;
    const identity = projectIdentity(location.root, { statePath: location.relative, projectId: ledger.portableProjectId || '' });
    if (!stateDeclaration(text, location.relative)) { text = projectDeclaration(identity, location.relative) + text; replace(location.file, text, previous, gitDir); }
    ledger.projectId = identity.projectId; ledger.worktreeId = identity.worktreeId;
    let parts = splitProjectState(text);
    if (parts.generated === null) {
      text += `${text.endsWith('\n') ? '' : '\n'}\n${STATE_START}\n${STATE_END}\n`;
      replace(location.file, text, fs.existsSync(location.file) ? readDoc(location.file) : null, gitDir); parts = splitProjectState(text, true);
    }
    ledger.projectState = { ...(ledger.projectState || {}), path: location.relative };
    const source = worktreeHash(location.root);
    if (!source) throw new Error('cannot fingerprint project source for state update');
    const next = `${parts.before}${STATE_START}${evidence(ledger, source)}${STATE_END}${parts.after}`;
    if (next !== text) replace(location.file, next, text, gitDir);
    return location;
  });
}
export function stateAckErrors(ledger, source = worktreeHash(ledger.cwd)) {
  if (!requiresProjectState(ledger.workflowContract)) return [];
  try {
    const location = resolveProjectState(ledger);
    if (!location) return ['project state is not bound'];
    const text = readDoc(location.file); splitProjectState(text, true);
    const ack = ledger.projectState?.ack;
    if (!ack || !ack.taskNoteKey || !['updated', 'none'].includes(ack.learning)) return ['maintain authored project state then record-state --outcome TEXT --pending TEXT --learning updated|none before final checks/review'];
    if (!source || ack.source !== source || ack.scope !== stateScope(ledger) || ack.authoredDigest !== hash(normalizeProjectStateSource(text))) return ['project state acknowledgement is stale for current authored state, source or task scope'];
    return [];
  } catch (error) { return [`project state unavailable: ${error.message}`]; }
}
function noteText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1500 || /[\x00-\x08\x0b-\x1f]|<!--|^ {0,3}(?:`{3,}|~{3,})/m.test(value)) throw new Error(`${label} requires a concise maintenance decision (1..1500 characters), without control characters or marker/fence content`);
  return value.trim().replace(/\r?\n/g, ' ');
}
export function taskNote(ledger, taskId = '') {
  const tasks = (ledger.tasks || []).filter(task => !taskId || task.id === taskId);
  if (!tasks.length) throw new Error('record-state requires the current owned task record');
  // A single task's ID survives title changes, companion requests and new run IDs.
  const key = hash(`${ledger.projectId || projectIdentity(ledger.cwd).projectId}:${tasks.map(task => task.id).sort().join(':')}`).slice(0, 24);
  return { tasks, key };
}
export function stateReadReceipt(snapshot) { if (!snapshot) return null; const { authored, ...receipt } = snapshot; return receipt; }
export function stateSnapshot(ledger, taskId = '') {
  const location = resolveProjectState(ledger);
  if (!location) return null;
  const text = readDoc(location.file), note = taskNote(ledger, taskId);
  const start = `<!-- etrnl:task-note:${note.key}:start -->`, end = `<!-- etrnl:task-note:${note.key}:end -->`;
  const a = text.indexOf(start), b = text.indexOf(end);
  if ((a >= 0) !== (b >= 0) || (a >= 0 && b < a)) throw new Error('malformed task maintenance entry');
  return { path: location.relative, revision: hash(normalizeProjectStateSource(text)), taskId: taskId || null, taskNoteKey: note.key,
    entryRevision: a < 0 ? 'absent' : hash(text.slice(a, b + end.length)), authored: splitProjectState(text).before + splitProjectState(text).after };
}
export function acknowledgeProjectState(ledger, learning, { outcome, pending, unchangedReason, taskId = '', expectedRevision, expectedEntryRevision, owner, disposition = 'open', handoverFrom = '' } = {}) {
  if (!['updated', 'none'].includes(learning)) throw new Error('record-state requires --learning updated|none; acknowledge real authored maintenance, not user approval');
  if (!taskId && (ledger.tasks || []).length > 1) {
    if (unchangedReason !== undefined) throw new Error('unchanged-reason with several tasks requires explicit --task');
    for (const task of ledger.tasks) acknowledgeProjectState(ledger,learning,{outcome,pending,taskId:task.id,owner,disposition,handoverFrom});
    return ledger.projectState.ack;
  }
  const location = syncProjectState(ledger, { bootstrap: true });
  if (!location) throw new Error('record-state requires a repository-write workflow with a project state document');
  const note = taskNote(ledger, taskId), start = `<!-- etrnl:task-note:${note.key}:start -->`, end = `<!-- etrnl:task-note:${note.key}:end -->`;
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: location.root, encoding: 'utf8', timeout: 2000 }).trim();
  withFileLock(path.join(gitDir, `etrnl-project-state-${hash(location.relative).slice(0, 12)}`), () => {
    const text = readDoc(location.file);
    let maintained = text;
    const snapshot = stateSnapshot(ledger, taskId);
    const read = ledger.projectState.reads?.[note.key];
    expectedEntryRevision ??= read?.entryRevision;
    expectedRevision ??= read?.revision;
    if (ledger.workflowContract?.workKind === 'substantive' && !read && expectedEntryRevision === undefined) throw new Error('read-state for the owned task before maintenance');
    if (expectedEntryRevision !== undefined && expectedEntryRevision !== snapshot.entryRevision) throw new Error('overlapping task maintenance update; read and reconcile current entry');
    if (expectedRevision !== undefined && expectedRevision !== snapshot.revision && expectedEntryRevision === undefined) throw new Error('project state revision changed; provide the read entry revision to merge disjoint updates');
    if (!['open', 'blocked', 'resolved', 'deferred'].includes(disposition)) throw new Error('invalid pending disposition');
    owner = owner || note.tasks[0].owner || ledger.sessionId || ledger.runId;
    if (!validIdentity(owner)) throw new Error('pending owner requires a stable identity');
    if (disposition === 'resolved' && note.tasks.some(task => !['verified', 'skipped'].includes(task.status))) throw new Error('unresolved task cannot resolve pending work');
    if (unchangedReason !== undefined) {
      noteText(unchangedReason, 'unchanged-reason');
      if (outcome || pending) throw new Error('use outcome/pending or unchanged-reason, not both');
      if (!ledger.projectState?.ack || ledger.projectState.ack.taskNoteKey !== note.key
        || ledger.projectState.ack.authoredDigest !== hash(normalizeProjectStateSource(text))
        || !text.includes(start) || !text.includes(end)) throw new Error('unchanged-reason requires an existing acknowledged current-task entry with unchanged authored content');
    } else {
      outcome = noteText(outcome, 'outcome'); pending = noteText(pending, 'pending');
      const ids = note.tasks.map(task => String(task.id).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)).join(', ');
      const entry = `${start}\n### Task maintenance: ${ids}\n\nFeature IDs: ${note.tasks.map(task => task.featureId || task.id).join(', ')}\n\nPending owner: ${owner}; disposition: ${disposition}${handoverFrom ? `; handover from: ${handoverFrom}` : ''}\n\nOutcome (author-reported): ${outcome}\n\nPending / disposition (author-reported): ${pending}\n\nLearning decision: ${learning === 'none' ? 'No new reusable learning claimed.' : 'Authored learning updated; assess its linked evidence.'}\n${end}`;
      if (text.includes(start) || text.includes(end)) {
        if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) < text.indexOf(start)
          || !text.includes(`\n${start}\n`) || !text.includes(`\n${end}`)) throw new Error('malformed task maintenance entry; reconcile without overwriting it');
        const previousEntry = text.slice(text.indexOf(start), text.indexOf(end) + end.length);
        const previousOwner = previousEntry.match(/Pending owner: ([^;]+);/);
        if (previousOwner && previousOwner[1] !== owner && handoverFrom !== previousOwner[1]) throw new Error('pending item belongs to another owner; explicit --handover-from current owner required');
        // Retain previous failures and dispositions in authored history, never silently close them.
        const history = `\n<details><summary>Previous task maintenance</summary>\n\n${previousEntry.replace(start, '').replace(end, '').trim()}\n\n</details>\n`;
        maintained = text.slice(0, text.indexOf(start)) + entry + history + text.slice(text.indexOf(end) + end.length);
      } else {
        const index = text.indexOf(STATE_START);
        maintained = `${text.slice(0, index)}${entry}\n\n${text.slice(index)}`;
      }
      splitProjectState(maintained, true);
      if (maintained !== text) replace(location.file, maintained, text, gitDir);
    }
    const source = worktreeHash(ledger.cwd);
    if (!source) throw new Error('cannot fingerprint maintained project state');
    ledger.projectState.ack = { learning, source, scope: stateScope(ledger), authoredDigest: hash(normalizeProjectStateSource(maintained)),
      taskNoteKey: note.key, taskId: taskId || null, entryRevision: stateSnapshot(ledger, taskId).entryRevision, ...(unchangedReason ? { unchangedReason: unchangedReason.trim() } : {}) };
    ledger.projectState.reads ||= {}; ledger.projectState.reads[note.key] = stateReadReceipt(stateSnapshot(ledger,taskId));
  });
  return ledger.projectState.ack;
}

export function projectStateContext(cwd, relative = '') {
  let location;
  try { location = resolveProjectState({ cwd }, relative); }
  catch (error) { if (error.status && !relative) return 'No project state document found.'; throw error; }
  if (!location) return 'No project state document found.';
  const text = readDoc(location.file), parts = splitProjectState(text);
  // This is context, not an acceptance claim. Never replay old generated status as current.
  const authored = `${parts.before}${parts.after}`;
  return `Project state: ${location.relative}\nAuthored context; revalidate evidence against current source.\n${authored.length <= 6000 ? authored : `${authored.slice(0, 3000)}\n[earlier details omitted; read the project document]\n${authored.slice(-3000)}`}`;
}
