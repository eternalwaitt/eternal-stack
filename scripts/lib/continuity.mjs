import { processBirth } from './review-controller.mjs';
import { retrieveKnowledge } from './project-knowledge.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectIdentity } from './project-identity.mjs';
import { currentLedgerPath, ledgerOwnedByWorktree, runsDir, sessionBucket, pointerPath } from './ledger-pointer.mjs';
import { projectStateContext, stateSnapshot } from './project-state.mjs';
import { listContexts, saveContext } from './context-records.mjs';
import { worktreeHash } from './etrnl-state-core.mjs';
import { hasReviewArtifact, reviewBinding } from './review-evidence.mjs';
import { admitBudgetAction } from './workflow-contract.mjs';
import { withFileLock, writeJsonAtomic } from './json-file-store.mjs';
export function ownedContinuityLedger({ cwd = process.cwd(), session = '' } = {}) {
  const file = currentLedgerPath(session || 'default', {cwd});
  if (!file) return { file: '', ledger: null };
  if (!ledgerOwnedByWorktree(file,cwd)) throw new Error('active session ledger belongs to another worktree; choose the owned session');
  const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) throw new Error('invalid continuity ledger');
  return {file, ledger: JSON.parse(fs.readFileSync(file,'utf8'))};
}
export function evidenceDimensions(ledger, source = worktreeHash(ledger.cwd)) {
  const captured = (ledger.checks || []).filter(check => check.evidenceKind === 'command-run' && /^[a-f0-9]{64}$/.test(check.outputDigest || '') && Array.isArray(check.argv) && check.argv.length);
  const latest = new Map(); for (const row of ledger.checks || []) latest.set(row.name,row);
  const current = [...latest.values()].filter(row => captured.includes(row) && source && row.treeHash === source && row.startedTreeHash === source);
  const review = (ledger.workflowReviews || []).findLast(row => hasReviewArtifact(row,source,reviewBinding(ledger)));
  return { implementation: 'author-reported', verification: current.length ? current.every(row => row.status === 'passed' && row.exitCode === 0) ? 'current-captured-pass' : 'current-captured-failure' : 'unverified',
    review: review ? 'current-captured-independent' : 'unverified', runtime: 'unverified', deployment: 'unverified',
    capturedChecks: captured.length, currentChecks: current.length, historicalFailures: (ledger.checks || []).filter(row => row.status !== 'passed'),
    staleChecks: [...latest.values()].filter(row => !current.includes(row)), tasksReportedComplete: (ledger.tasks || []).filter(task => ['verified','skipped'].includes(task.status)).map(task=>task.id),
    notice: 'Command execution proves its recorded outcome and scope; feature readiness and runtime behavior require relevant evidence.' };
}
function genericRequest(request) {return !request.trim() || /^(where (?:were we|did we stop)|continue|resume|what(?:'s| is) next)[?.! ]*$/.test(request.trim().toLowerCase());}
function matchesTaskRequest(task,request) {const query=request.trim().toLowerCase(), words=query.split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean);return [task.id,task.featureId,task.title,...(task.aliases || [])].filter(Boolean).some(value=>{const label=value.toLowerCase(), tokens=label.split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean);return label === query || (tokens.length === 1 && words.includes(label)) || (tokens.length > 1 && query.includes(label)) || (words.length === 1 && tokens.includes(query));});}
export function continuityRecoveryCandidates({cwd = process.cwd(), featureId = '', request = ''} = {}) {
  const identity = projectIdentity(cwd), dir = runsDir();
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter(name => name.endsWith('.json') && !name.startsWith('current-'));
  if (names.length > 10000) throw new Error('run inventory exceeds recovery bound');
  const candidates = [];
  for (const name of names) {
    const file = path.join(dir,name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) continue;
    const ledger = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!ledgerOwnedByWorktree(file,cwd) || ledger.projectId !== identity.projectId || !ledger.runId || !ledger.sessionId) continue;
    const unresolved = (ledger.tasks || []).filter(task => !['verified','skipped'].includes(task.status));
    if (!unresolved.length || (featureId && !unresolved.some(task => (task.featureId || task.id) === featureId)) || (!genericRequest(request) && !unresolved.some(task=>matchesTaskRequest(task,request)))) continue;
    candidates.push({file,ledger});
  }
  return candidates.sort((a,b)=>String(b.ledger.updatedAt || '').localeCompare(String(a.ledger.updatedAt || '')));
}
export function resumeContinuity({cwd = process.cwd(), session, fromSession, runId} = {}) {
  if (!session || !fromSession || !runId) throw new Error('resume requires explicit target session, prior session and run ID');
  const {file,ledger} = ownedContinuityLedger({cwd,session:fromSession});
  if (!ledger || ledger.runId !== runId || ledger.projectId !== projectIdentity(cwd).projectId) throw new Error('selected prior run/project no longer matches');
  const prior = pointerPath(sessionBucket(fromSession,cwd)), next = pointerPath(sessionBucket(session,cwd));
  const locks = [...new Set([prior,next])].sort();
  const underLocks = index => index < locks.length ? withFileLock(locks[index],()=>underLocks(index+1)) : withFileLock(file,()=>{
    const current=ownedContinuityLedger({cwd,session:fromSession});
    if (current.file !== file || current.ledger.runId !== runId) throw new Error('resume ownership changed concurrently');
    const existing=currentLedgerPath(session,{cwd});
    if (existing && existing !== file) throw new Error('target session already owns a different run');
    if (current.ledger.workflowReviews?.some(row=>row.captureActive)) throw new Error('active review/resume controller must finish before ownership handover');
    const value=current.ledger, oldSession=value.sessionId;
    value.sessionId=sessionBucket(session,cwd);
    if (value.workflowContract?.effects === 'repository-write' && !value.workflowContract.workKind) {value.workflowContract.workKind='substantive';value.workflowContract.requirements.projectState=true;}
    if (value.projectState) delete value.projectState.ack;
    value.updatedAt=new Date().toISOString();(value.events ||= []).push({type:'workflow.ownership-resumed',at:value.updatedAt,fromSession:oldSession,toSession:value.sessionId});
    writeJsonAtomic(file,value,{mode:0o600});writeJsonAtomic(next,{path:file,updatedAt:value.updatedAt},{mode:0o600});
    if (prior !== next) fs.rmSync(prior,{force:true});
    return {resumed:true,runId:value.runId,sessionId:value.sessionId,budget:value.workflowContract?.budget,budgetUsage:value.workflowBudgetUsage || {},instruction:'Ownership explicitly transferred; reconcile current source/state, then maintain authored work before checks/review. Historical evidence was not promoted.'};
  });
  return underLocks(0);
}
export function readContinuity({ cwd = process.cwd(), session = '', request = '', featureId = '', statePath = '' } = {}) {
  const identity = projectIdentity(cwd,{statePath}); const active = ownedContinuityLedger({cwd,session});
  const recovery = active.ledger ? [] : continuityRecoveryCandidates({cwd,featureId,request});
  const preview = recovery.length === 1 ? recovery[0] : {file:'',ledger:null};
  const {file,ledger} = active.ledger ? active : preview;
  const tasks = ledger?.tasks || [], query = request.trim().toLowerCase();
  let candidates = tasks.filter(task => !featureId || (task.featureId || task.id) === featureId);
  if (!genericRequest(request)) {
    const exact = candidates.filter(task => [task.id,task.featureId,task.title,...(task.aliases || [])].filter(Boolean).some(value => value.toLowerCase() === query));
    candidates = exact.length ? exact : candidates.filter(task=>matchesTaskRequest(task,request));
  } else candidates = candidates.filter(task => !['verified','skipped'].includes(task.status));
  const source = worktreeHash(cwd);
  return { schemaVersion: 1, project: identity, ledgerFound: Boolean(active.ledger), recoveryNeeded: !active.ledger && recovery.length > 0,
    recoveryCandidates: recovery.map(({file,ledger})=>({ledgerPath:file,runId:ledger.runId,sessionId:ledger.sessionId,unresolvedWork:(ledger.tasks || []).filter(task=>!['verified','skipped'].includes(task.status)),budget:ledger.workflowContract?.budget || null,budgetUsage:ledger.workflowBudgetUsage || {}})),
    selectedRecovery: !active.ledger && recovery.length === 1 ? {ledgerPath:file,runId:ledger.runId,sessionId:ledger.sessionId,requiresExplicitResume:true} : null, ledgerPath: file || null,
    authoredContext: projectStateContext(cwd,statePath || ledger?.projectState?.path || ''),
    stateSnapshot: ledger?.projectState?.path && ledger?.tasks?.length ? stateSnapshot(ledger,candidates.length === 1 ? candidates[0].id : '') : null,
    tasks: candidates, ambiguous: candidates.length > 1 || recovery.length > 1, selection: candidates.length === 1 ? {taskId:candidates[0].id,featureId:candidates[0].featureId || candidates[0].id} : null,
    unresolvedWork: tasks.filter(task => !['verified','skipped'].includes(task.status)), decisions: ledger?.decisions || [],
    budget: ledger?.workflowContract?.budget || null, budgetUsage: ledger?.workflowBudgetUsage || {}, continuations: ledger?.continuations || {},
    knowledge: retrieveKnowledge({cwd,query:request,maxChars:1500,limit:3}),
    evidence: ledger ? evidenceDimensions(ledger,source) : null, checkpoints: listContexts({cwd,session:active.ledger?.sessionId || '',featureId,limit:3}),
    instruction: recovery.length > 1 ? 'Several prior runs match this worktree/project. Inspect recoveryCandidates and explicitly select run/session identity; no ownership changed.' : !active.ledger && recovery.length === 1 ? 'Prior owned work is shown as a recovery preview. Explicitly resume selectedRecovery into the new session before mutating it; reconcile current source and preserved budgets.' : candidates.length > 1 ? 'Several owned tasks match. Reconcile feature/task identity before choosing work; no task was started.' : 'Read authored state and scoped lessons, reconcile the request and current evidence, then explicitly resume the owned task. No ledger or budget was reset.' };
}
export function captureContinuityCheckpoint({ cwd = process.cwd(), session = '', title = 'Interruption checkpoint' } = {}) {
  const {ledger} = ownedContinuityLedger({cwd,session});
  if (!ledger) return {captured:false,ledgerFound:false,reason:'no-owned-ledger'};
  return {captured:true,ledgerFound:true,...saveContext({cwd,ledger,title})};
}
export function continuityCompletion({ cwd = process.cwd(), session = '' } = {}) {
  const {ledger} = ownedContinuityLedger({cwd,session});
  if (!ledger) return {required:false,ok:true,errors:[],ledgerFound:false};
  const request=ledger.reviewRequest, row=(ledger.workflowReviews || []).findLast(value=>value.invocationId===request?.id);
  if (request?.status === 'resuming' && request.runId === ledger.runId && request.binding === reviewBinding(ledger) && request.binding === row?.binding && /^[a-f0-9]{64}$/.test(request.treeHash || '') && request.treeHash === row?.treeHash && request.implementationSession === session && row?.captureActive && row.capturePhase === 'resume' && row.status === 'reviewing' && Number.isSafeInteger(row.ownerPid) && row.ownerBirth && processBirth(row.ownerPid) === row.ownerBirth) {
    try {process.kill(row.ownerPid,0); return {required:true,ok:false,errors:[],ledgerFound:true,outerFinalizer:true,reason:'live-owned-controller-finalization-pending'};} catch { /* dead controller must not admit completion */ }
  }
  const result = spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../execution-ledger.mjs'),'check-stop','--session',session || 'default','--require-ledger','--json'],{cwd,env:process.env,encoding:'utf8',timeout:15000,maxBuffer:512*1024});
  let parsed; try {parsed = JSON.parse(result.stdout);} catch {parsed={ok:false,errors:[result.error?.message || result.stderr?.trim() || 'completion gate returned no structured result']};}
  return {...parsed,required:Boolean(ledger.workflowContract),ledgerFound:true};
}
export function reserveContinuityRepair({ cwd = process.cwd(), session = '', reason = 'completion repair' } = {}) {
  const {file,ledger} = ownedContinuityLedger({cwd,session});
  if (!ledger?.workflowContract) return {allowed:false,reason:'no-canonical-contract'};
  return withFileLock(file,()=>{
    const current=JSON.parse(fs.readFileSync(file,'utf8')); const usage=current.workflowBudgetUsage || {};
    const admission=admitBudgetAction(current.workflowContract,usage,'retry');
    if (!admission.allowed) return admission;
    current.workflowBudgetUsage={...usage,retries:(usage.retries || 0)+1};
    current.continuations={...current.continuations,count:(current.continuations?.count || 0)+1,max:current.workflowContract.budget.maxRetries,lastReason:String(reason).slice(0,500)};
    current.updatedAt=new Date().toISOString(); (current.events ||= []).push({type:'workflow.continuation-reserved',at:current.updatedAt,reason:current.continuations.lastReason});
    writeJsonAtomic(file,current,{mode:0o600}); return {...admission,allowed:true,usage:current.workflowBudgetUsage,continuations:current.continuations};
  });
}
