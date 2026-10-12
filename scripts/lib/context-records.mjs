import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { projectIdentity, validIdentity } from './project-identity.mjs';
import { worktreeHash, normalizeEvent, appendEvent, stableHash } from './etrnl-state-core.mjs';
import { writeJsonAtomic, withFileLock } from './json-file-store.mjs';
export function contextDir() { return path.join(process.env.ETRNL_ARTIFACTS_DIR || path.join(process.env.ETRNL_HOME || process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude'), 'etrnl/artifacts'), 'contexts'); }
export function readContext(file, { cwd = process.cwd(), allowLegacy = true, staleHours = 24 } = {}) {
  if (!Number.isFinite(staleHours) || staleHours <= 0) throw new Error('stale-hours must be positive');
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 512 * 1024) throw new Error('context must be a bounded regular artifact');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(value.schemaVersion) || !validIdentity(value.contextId) || !Number.isFinite(Date.parse(value.savedAt))) throw new Error('invalid context identity/schema/time');
  for (const field of ['decisions', 'blockers', 'remainingWork', 'verification']) if (!Array.isArray(value[field])) throw new Error(`context ${field} must be an array`);
  const identity = projectIdentity(cwd);
  if (value.projectId ? value.projectId !== identity.projectId : !allowLegacy || value.projectFingerprint !== stableHash(identity.root)) throw new Error('context belongs to another project');
  const currentSource = worktreeHash(cwd);
  return { ...value, sourceFresh: Boolean(value.sourceHash && currentSource && value.sourceHash === currentSource),
    sameWorktree: value.worktreeId ? value.worktreeId === identity.worktreeId : value.projectFingerprint === stableHash(identity.root),
    stale: Date.now() - Date.parse(value.savedAt) > staleHours * 3600000, evidenceNotice: 'Saved decisions and evidence are historical; resume does not mark checks, review or tasks current.' };
}
export function listContexts({ cwd = process.cwd(), session = '', featureId = '', limit = 10 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('context limit must be 1..100');
  if (!fs.existsSync(contextDir())) return [];
  const files = fs.readdirSync(contextDir()).filter(file => file.endsWith('.json'));
  if (files.length > 10000) throw new Error('context inventory exceeds bound');
  const rows = [];
  for (const file of files) {
    try { const value = readContext(path.join(contextDir(), file), { cwd });
      if ((!session || value.sessionId === session) && (!featureId || value.featureIds?.includes(featureId))) rows.push({ ...value, file: path.join(contextDir(), file) });
    } catch (error) { if (!/another project/.test(error.message)) throw error; }
  }
  return rows.sort((a,b) => b.savedAt.localeCompare(a.savedAt)).slice(0, limit);
}
export function saveContext({ cwd = process.cwd(), ledger = null, contextId = `context-${Date.now()}-${randomUUID().slice(0, 8)}`, title = 'ETRNL context', decisions = [], blockers = [], remainingWork = [], verification = [], savedAt = new Date().toISOString(), dryRun = false } = {}) {
  if (!validIdentity(contextId)) throw new Error('invalid context ID');
  const identity = projectIdentity(cwd);
  const context = { schemaVersion: 2, contextId, title, projectId: identity.projectId, worktreeId: identity.worktreeId,
    projectFingerprint: stableHash(identity.root), branch: identity.branch, sourceHash: worktreeHash(cwd), savedAt,
    sessionId: ledger?.sessionId || '', runId: ledger?.runId || '', featureIds: [...new Set((ledger?.tasks || []).map(task => task.featureId || task.id))],
    decisions: [...(ledger?.decisions || []), ...decisions], blockers: [...(ledger?.tasks || []).filter(task => ['blocked','changes_requested'].includes(task.status)), ...blockers],
    remainingWork: [...(ledger?.tasks || []).filter(task => !['verified','skipped'].includes(task.status)), ...remainingWork],
    verification: [...(ledger?.checks || []), ...verification], reviews: ledger?.workflowReviews || [], failures: (ledger?.checks || []).filter(check => check.status !== 'passed'),
    budget: ledger?.workflowContract?.budget || null, budgetUsage: ledger?.workflowBudgetUsage || {}, continuations: ledger?.continuations || {},
    workflowContract: ledger?.workflowContract || null, projectState: ledger?.projectState || null };
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error('invalid save timestamp');
  // Validate the full artifact before the first write, including title/decisions and captured ledger data.
  const checked = normalizeEvent({ eventKind: 'context_entry', data: { entryType: 'checkpoint', value: context } });
  if (!checked.ok) throw new Error(checked.error.message);
  if (Buffer.byteLength(JSON.stringify(context)) > 512 * 1024) throw new Error('context exceeds artifact bound');
  const file = path.join(contextDir(), `${contextId}.json`);
  if (dryRun) return { file, context, dryRun: true };
  fs.mkdirSync(contextDir(), { recursive: true, mode: 0o700 });
  if (fs.lstatSync(contextDir()).isSymbolicLink()) throw new Error('context artifact directory cannot be a symlink');
  withFileLock(file, () => { if (fs.existsSync(file)) throw new Error('checkpoint ID already exists; preserve existing checkpoint'); writeJsonAtomic(file, context, { mode: 0o600 }); });
  const event = appendEvent({ eventKind: 'context_entry', sessionId: context.sessionId || context.contextId, projectFingerprint: stableHash(identity.projectId), data: { entryType: 'checkpoint', value: { contextId, sourceHash: context.sourceHash, remaining: context.remainingWork.length } } });
  if (!event.ok) throw new Error(event.error.message);
  return { file, context };
}
export function contextText(value) {
  const sections = [['Decisions',value.decisions],['Blockers',value.blockers],['Remaining work',value.remainingWork],['Verification',value.verification],['Preserved failures',value.failures || []],['Reviews',value.reviews || []]];
  return `# ${value.title}\nproject=${value.projectId || value.projectFingerprint} branch=${value.branch || ''} savedAt=${value.savedAt} stale=${value.stale ?? false} sourceFresh=${value.sourceFresh ?? false}\n${value.evidenceNotice || ''}\n` + sections.map(([label,rows]) => `\n## ${label}\n${rows.map(row => `- ${typeof row === 'string' ? row : JSON.stringify(row)}`).join('\n') || '(none)'}`).join('\n') + `\n\nBudget: ${JSON.stringify(value.budget || {})}\nUsage: ${JSON.stringify(value.budgetUsage || {})}\nContinuations: ${JSON.stringify(value.continuations || {})}\n`;
}
