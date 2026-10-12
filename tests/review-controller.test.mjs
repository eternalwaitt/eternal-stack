import { knowledgeReviewBinding } from '../scripts/lib/project-knowledge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { requestReview, reviewAndResume, assertCompletionTarget, recoverAbandonedReview, processBirth, reserveReviewAttempt, validateResumeEvidence, applicableVerificationEvidence } from '../scripts/lib/review-controller.mjs';
import { resolveWorkflowContract } from '../scripts/lib/workflow-contract.mjs';
import { parseHostReview, parseHostTurn, reviewBinding, readReviewArtifact } from '../scripts/lib/review-evidence.mjs';
import { reviewReceiptFixture } from './helpers/review-receipt-fixture.mjs';
const cli = path.resolve(import.meta.dirname, '../scripts/execution-ledger.mjs');
function fixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etrnl-controller-')); t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 const cwd=path.join(root,'project'); fs.mkdirSync(cwd);fs.writeFileSync(path.join(cwd,'source'),'content');
 const env={...process.env,ETRNL_RUNS_DIR:path.join(root,'runs')};
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']]) assert.equal(spawnSync('git',args,{cwd}).status,0);
 const contract=path.join(root,'contract.json');fs.writeFileSync(contract,JSON.stringify(resolveWorkflowContract({version:1,intent:'build',scope:'coupled',risk:'high'})));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{cwd,env,encoding:'utf8'});
 const init=run('init','--session','author','--cwd',cwd,'--workflow-contract',contract);assert.equal(init.status,0,init.stderr);
 assert.equal(run('set-task','--session','author','--task','work','--title','Implement accepted task','--status','in_progress').status,0);
 fs.writeFileSync(path.join(cwd,'PROJECT_STATE.md'),fs.readFileSync(path.join(cwd,'PROJECT_STATE.md'),'utf8').replace('Describe the accepted work and its limits.','Accepted fixture implementation; remaining work stays recorded.'));
 assert.equal(run('record-state','--session','author','--learning','none','--outcome','Fixture implementation state reconciled','--pending','Retain remaining scope from the checkpoint').status,0);
 const file=init.stdout.trim(), checkpoint=path.join(root,'checkpoint.md');fs.writeFileSync(checkpoint,'Completed foundation; remaining task persists.');
 return {root,cwd,file,checkpoint,run,env};
}
const session='11111111-1111-1111-1111-111111111111';
test('checkpoint request binds host session, source and scope; caller mismatches fail before launch',async t=>{
 const f=fixture(t);assert.throws(()=>requestReview(f.file,f.checkpoint,''),/actual host/);
 const request=requestReview(f.file,f.checkpoint,session); assert.equal(request.implementationSession,session);
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,session:'other'}),/differs/);
 fs.appendFileSync(path.join(f.cwd,'source'),'changed');
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file}),/source changed/);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowBudgetUsage?.reviews||0,0);
});
test('failed fixed-host launch consumes budget and leaves latest review blocked',async t=>{
 const f=fixture(t);requestReview(f.file,f.checkpoint,session);
 // Keep git available for source validation, while proving no alternate reviewer binary is accepted.
 const bin=path.join(f.root,'bin');fs.mkdirSync(bin);fs.symlinkSync(spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim(),path.join(bin,'git'));
 const old=process.env.PATH;process.env.PATH=bin;
 try {
  await assert.rejects(reviewAndResume({host:'codex',ledger:f.file}),/failed closed/);
  let ledger=JSON.parse(fs.readFileSync(f.file));assert.equal(ledger.workflowBudgetUsage.reviews,1);assert.equal(ledger.workflowReviews.at(-1).status,'blocked');
  await assert.rejects(reviewAndResume({host:'codex',ledger:f.file}),/first run/);
  for(let attempt=1;attempt<ledger.workflowContract.budget.maxReviews;attempt++) {
   requestReview(f.file,f.checkpoint,session);
   await assert.rejects(reviewAndResume({host:'codex',ledger:f.file}),/failed closed/);
  }
  requestReview(f.file,f.checkpoint,session);
  await assert.rejects(reviewAndResume({host:'codex',ledger:f.file}),/review-budget-exhausted/);
  ledger=JSON.parse(fs.readFileSync(f.file));assert.equal(ledger.workflowBudgetUsage.reviews,ledger.workflowContract.budget.maxReviews);assert.equal(ledger.workflowBudgetUsage.retries,ledger.workflowContract.budget.maxReviews-1);
 } finally {process.env.PATH=old;}
});
test('completion refuses a session pointer changed by ordinary init command',t=>{
 const f=fixture(t),initial=JSON.parse(fs.readFileSync(f.file));assert.equal(assertCompletionTarget(f.file,initial).runId,initial.runId);
 // A distinct worktree can legitimately initialize the same explicitly named session bucket.
 const other=path.join(f.root,'other');fs.mkdirSync(other);const result=spawnSync(process.execPath,[cli,'init','--session','author','--cwd',other],{cwd:other,env:f.env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 assert.throws(()=>assertCompletionTarget(f.file,initial),/pointer/);
});
test('provider lifecycle cannot be supplied as prose, self-review or failed turn',()=>{
 const final={requestId:'request',treeHash:'tree',verdict:'verified',summary:'Reviewed code',findings:[],reviewedFiles:['source']};
 const events=[{type:'thread.started',thread_id:'reviewer'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(final)}},{type:'turn.completed'}];
 const raw=rows=>rows.map(x=>JSON.stringify(x)).join('\n');
 assert.equal(parseHostReview(raw(events),session,'request','tree').result.verdict,'verified');
 assert.throws(()=>parseHostReview(raw(events),'reviewer','request','tree'),/lifecycle/);
 assert.throws(()=>parseHostReview(raw([...events,{type:'turn.failed'}]),session,'request','tree'),/lifecycle/);
 assert.throws(()=>parseHostReview(raw([{type:'item.completed',item:{type:'agent_message',text:raw(events)}}]),session,'request','tree'),/lifecycle/);
});

test('resumed lifecycle rejects absent terminal, wrong session, and failed turn',()=>{
 const raw=rows=>rows.map(x=>JSON.stringify(x)).join('\n');
 const start={type:'thread.started',thread_id:session};
 assert.throws(()=>parseHostTurn(raw([start]),session),/lifecycle/);
 assert.throws(()=>parseHostTurn(raw([start,{type:'turn.completed'}]),'wrong-session'),/lifecycle/);
 assert.throws(()=>parseHostTurn(raw([start,{type:'turn.failed'}]),session),/lifecycle/);
 assert.equal(parseHostTurn(raw([start,{type:'turn.completed'}]),session).session,session);
});
test('relative plan binding is resolved from ledger cwd, independent of controller cwd',t=>{
 const f=fixture(t),ledger=JSON.parse(fs.readFileSync(f.file));
 fs.writeFileSync(path.join(f.cwd,'plan.md'),'Accepted task scope');
 ledger.planPath='plan.md';
 const relative=reviewBinding(ledger);ledger.planPath=path.join(f.cwd,'plan.md');
 assert.equal(reviewBinding(ledger),relative);
});

test('checkpoint identity accepts equivalent filesystem aliases without relaxing content binding',async t=>{
 const f=fixture(t),alias=path.join(f.root,'checkpoint-alias.md');fs.symlinkSync(f.checkpoint,alias);
 const request=requestReview(f.file,alias,session);
 assert.equal(request.checkpointPath,fs.realpathSync(f.checkpoint));
 const different=path.join(f.root,'different-checkpoint.md');fs.copyFileSync(f.checkpoint,different);
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,checkpoint:different}),/differs/);
 // Invalid deadline is checked after identity: proves both aliases address the same registered file without launching a model.
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,checkpoint:alias,'review-seconds':'-1'}),/review-seconds must/);
 fs.appendFileSync(f.checkpoint,'changed');
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,checkpoint:alias}),/source changed/);
});

test('abruptly killed controller can be re-requested without resetting consumed budgets',async t=>{
 const f=fixture(t),request=requestReview(f.file,f.checkpoint,session);
 const moduleUrl=new URL('../scripts/lib/review-controller.mjs',import.meta.url).href;
 const code=`import {reserveReviewAttempt} from ${JSON.stringify(moduleUrl)}; reserveReviewAttempt(${JSON.stringify(f.file)},${JSON.stringify(request)}); console.log('reserved'); setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 t.after(()=>{try{child.kill('SIGKILL');}catch{}});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`owner exited ${code}`)));});
 assert.throws(()=>requestReview(f.file,f.checkpoint,session),/already running/);
 const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGKILL');await closed;
 const replacement=requestReview(f.file,f.checkpoint,session);
 assert.notEqual(replacement.id,request.id);
 const ledger=JSON.parse(fs.readFileSync(f.file));assert.equal(ledger.workflowBudgetUsage.reviews,1);assert.equal(ledger.workflowReviews.at(-1).status,'blocked');assert.equal(ledger.events.at(-1).type,'workflow.review-abandoned');
});
test('abandoned cleanup never signals a reused child PID with a different birth identity',()=>{
 const ledger={reviewRequest:{id:'old',status:'running',ownerPid:process.pid,ownerBirth:'different-old-owner',childPid:process.pid,childBirth:'different-old-child'},workflowReviews:[{invocationId:'old',status:'blocked'}]};
 assert.ok(processBirth(process.pid));recoverAbandonedReview(ledger);
 assert.equal(ledger.events.at(-1).childCleanup,'identity-unavailable');
});

test('planned review after successful prior scope consumes review budget without a retry',t=>{
 const f=fixture(t);requestReview(f.file,f.checkpoint,session);
 const ledger=JSON.parse(fs.readFileSync(f.file));ledger.workflowReviews=[{status:'verified',invocationId:'prior'}];ledger.workflowBudgetUsage={reviews:1,retries:0};fs.writeFileSync(f.file,JSON.stringify(ledger));
 reserveReviewAttempt(f.file,ledger.reviewRequest);
 const after=JSON.parse(fs.readFileSync(f.file));assert.equal(after.workflowBudgetUsage.reviews,2);assert.equal(after.workflowBudgetUsage.retries,0);
});
function capturedFixture(t) {
 const f=fixture(t);requestReview(f.file,f.checkpoint,session);
 const ledger=JSON.parse(fs.readFileSync(f.file)),request=ledger.reviewRequest;
 const dir=path.join(path.dirname(f.file),'host-reviews','fixture-request');fs.mkdirSync(dir,{recursive:true});
 const row=reviewReceiptFixture(dir,ledger,request.treeHash);
 // Private synthetic receipt fixture exercises validators; never the public review import API.
 const artifact=JSON.parse(fs.readFileSync(row.artifactPath));artifact.implementationSession=session;
 fs.writeFileSync(row.artifactPath,JSON.stringify(artifact));
 request.id='fixture-request';request.status='reviewed';
 fs.copyFileSync(row.artifactPath,path.join(dir,'receipt.json'));
 const metadata=readReviewArtifact(path.join(dir,'receipt.json'),'codex-host',request.treeHash);
 ledger.workflowReviews=[{...row,...metadata,status:'blocked'}];ledger.workflowBudgetUsage={reviews:1,retries:0};fs.writeFileSync(f.file,JSON.stringify(ledger));
 return {...f,request,dir};
}
test('resume-only uses approved capture, spends retry before failed launch, and never spends another review',async t=>{
 const f=capturedFixture(t),bin=path.join(f.root,'bin');fs.mkdirSync(bin);fs.symlinkSync(spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim(),path.join(bin,'git'));
 const old=process.env.PATH;process.env.PATH=bin;
 try {await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,'resume-existing':true}),/resume failed/);}finally{process.env.PATH=old;}
 const ledger=JSON.parse(fs.readFileSync(f.file));assert.equal(ledger.workflowBudgetUsage.reviews,1);assert.equal(ledger.workflowBudgetUsage.retries,1);assert.equal(ledger.workflowReviews.at(-1).status,'blocked');assert.equal(ledger.workflowReviews.at(-1).resumeAttempts.at(-1).status,'failed');
});
test('resume-only refuses changed source, failed reviewer, and exhausted retry budget',async t=>{
 const f=capturedFixture(t);
 let ledger=JSON.parse(fs.readFileSync(f.file));ledger.workflowBudgetUsage.retries=ledger.workflowContract.budget.maxRetries;fs.writeFileSync(f.file,JSON.stringify(ledger));
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,'resume-existing':true}),/retry-budget-exhausted/);
 fs.appendFileSync(path.join(f.cwd,'source'),'different');
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,'resume-existing':true}),/source changed/);
 fs.writeFileSync(path.join(f.cwd,'source'),'content');
 const receipt=JSON.parse(fs.readFileSync(path.join(f.dir,'receipt.json')));receipt.exitCode=1;fs.writeFileSync(path.join(f.dir,'receipt.json'),JSON.stringify(receipt));
 await assert.rejects(reviewAndResume({host:'codex',ledger:f.file,'resume-existing':true}),/successful captured review/);
});
test('abrupt resumed phase recovery preserves receipt and blocks abandoned completion',async t=>{
 const f=capturedFixture(t),moduleUrl=new URL('../scripts/lib/review-controller.mjs',import.meta.url).href;
 const code=`import fs from 'node:fs';import {processBirth} from ${JSON.stringify(moduleUrl)}; const file=${JSON.stringify(f.file)};const ledger=JSON.parse(fs.readFileSync(file)); Object.assign(ledger.workflowReviews[0],{status:'reviewing',captureActive:true,capturePhase:'resume',ownerPid:process.pid,ownerBirth:processBirth(process.pid)});ledger.reviewRequest.status='resuming';fs.writeFileSync(file,JSON.stringify(ledger));console.log('ready');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});t.after(()=>{try{child.kill('SIGKILL');}catch{}});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`owner exited ${code}`)));});
 const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGKILL');await closed;
 const ledger=JSON.parse(fs.readFileSync(f.file));recoverAbandonedReview(ledger);
 assert.equal(ledger.workflowReviews[0].status,'blocked');assert.equal(ledger.reviewRequest.status,'reviewed');assert.equal(ledger.workflowBudgetUsage.reviews,1);
 assert.equal(validateResumeEvidence(ledger,ledger.reviewRequest,path.join(f.dir,'receipt.json')).verdict,'verified');
});
test('live resumed author can request next source review while parallel outer admission stays blocked',t=>{
 const f=capturedFixture(t),ledger=JSON.parse(fs.readFileSync(f.file));
 Object.assign(ledger.workflowReviews[0],{status:'reviewing',captureActive:true,capturePhase:'resume',ownerPid:process.pid,ownerBirth:processBirth(process.pid)});ledger.reviewRequest.status='resuming';fs.writeFileSync(f.file,JSON.stringify(ledger));
 fs.appendFileSync(path.join(f.cwd,'source'),'new implementation');
 assert.equal(f.run('record-state','--session','author','--learning','none','--outcome','Fixture implementation state reconciled','--pending','Retain remaining scope from the checkpoint').status,0);
 const next=requestReview(f.file,f.checkpoint,session);
 assert.notEqual(next.id,f.request.id);assert.equal(next.status,'pending');
 assert.throws(()=>reserveReviewAttempt(f.file,next),/already running/);
 const saved=JSON.parse(fs.readFileSync(f.file));assert.equal(saved.reviewRequest.id,next.id);assert.equal(saved.workflowReviews[0].invocationId,f.request.id);assert.equal(saved.workflowReviews[0].captureActive,true);
});

test('unscoped manual retry precharge is rejected and automatic check retry charges once',t=>{
 const f=fixture(t);
 assert.equal(f.run('run-check','--session','author','--name','check','--',process.execPath,'-e','process.exit(1)').status,1);
 for(const operation of [null,'check','review','resume']) {
  const result=f.run('record-budget-use','--session','author','--action','retry',...(operation?['--operation',operation]:[]));
  assert.equal(result.status,2);assert.match(result.stderr,/automatically/);
 }
 assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowBudgetUsage.retries,0);
 assert.equal(f.run('run-check','--session','author','--name','check','--',process.execPath,'-e','process.exit(0)').status,0);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowBudgetUsage.retries,1);
 assert.equal(f.run('record-budget-use','--session','author','--action','retry','--operation','replan').status,0);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowBudgetUsage.retries,2);
 for(const operation of ['redelegate','context-restore']) assert.equal(f.run('record-budget-use','--session','author','--action','retry','--operation',operation).status,0);
 assert.equal(f.run('record-budget-use','--session','author','--action','retry','--operation','replan').status,1);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowBudgetUsage.retries,4);
});
test('review prompt receives latest applicable failures without reusing stale or oversized evidence',()=>{
 const base={evidenceKind:'command-run',commandDigest:'a',name:'test',startedTreeHash:'current',treeHash:'current',status:'passed',exitCode:0};
 const shadowed=applicableVerificationEvidence({checks:[base,{name:'test',evidenceKind:'guidance',status:'failed'}]},'current');assert.equal(shadowed.evidence.length,0);assert.equal(shadowed.limitations[0].status,'failed');
 const inconsistent=applicableVerificationEvidence({checks:[{...base,exitCode:1}]},'current');assert.equal(inconsistent.evidence.length,0);assert.match(inconsistent.limitations[0].reason,/inconsistent/);
 const changedCommand=applicableVerificationEvidence({checks:[base,{...base,commandDigest:'new-command',status:'failed',exitCode:1}]},'current');assert.equal(changedCommand.evidence.length,1);assert.equal(changedCommand.evidence[0].status,'failed');
 let value=applicableVerificationEvidence({checks:[base,{...base,status:'failed',exitCode:1}]},'current');assert.equal(value.evidence.length,1);assert.equal(value.evidence[0].status,'failed');
 value=applicableVerificationEvidence({checks:[base,{...base,treeHash:'different'}]},'current');assert.equal(value.evidence.length,0);
 value=applicableVerificationEvidence({checks:[{...base,argv:['x'.repeat(70000)]}]},'current');assert.equal(value.omitted,true);assert.match(value.reason,/inspect ledger/);
});
function publicControllerFixture(t) {
 const f=fixture(t);f.env.CODEX_THREAD_ID=session;
 assert.equal(f.run('set-task','--session','author','--task','work','--status','verified').status,0);
 assert.equal(f.run('run-check','--session','author','--name','acceptance','--',process.execPath,'-e','process.exit(0)').status,0);
 const request=f.run('request-review','--session','author','--checkpoint',f.checkpoint);assert.equal(request.status,0,request.stderr);
 const bin=path.join(f.root,'host-bin');fs.mkdirSync(bin);fs.symlinkSync(path.resolve(import.meta.dirname,'helpers/synthetic-codex-host.mjs'),path.join(bin,'codex'));
 const env={...f.env,PATH:`${bin}${path.delimiter}${process.env.PATH}`};
 const runController=(mode='',...args)=>spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../scripts/companion.mjs'),'review-and-resume','--host','codex','--ledger',f.file,'--session',session,...args],{cwd:f.cwd,env:{...env,SYNTHETIC_HOST_MODE:mode},encoding:'utf8',timeout:15000});
 return {...f,runController};
}
test('public author and controller CLI protocol completes only after captured review and same-session resume',t=>{
 const f=publicControllerFixture(t),result=f.runController();
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'complete');
 assert.equal(f.run('check-stop','--session','author').status,0);
 const ledger=JSON.parse(fs.readFileSync(f.file));assert.equal(ledger.workflowBudgetUsage.reviews,1);assert.equal(ledger.workflowBudgetUsage.retries,0);
 assert.equal(ledger.workflowReviews.at(-1).resumeAttempts.at(-1).status,'passed');
});
test('public CLI missing author terminal stays incomplete; resume-existing repeats only resume and spends one retry',t=>{
 const f=publicControllerFixture(t),failed=f.runController('resume-no-terminal');
 assert.equal(failed.status,2,failed.stderr);assert.notEqual(f.run('check-stop','--session','author').status,0);
 const before=JSON.parse(fs.readFileSync(f.file)),artifact=fs.readFileSync(before.workflowReviews.at(-1).artifactPath);
 const recovered=f.runController('','--resume-existing');assert.equal(recovered.status,0,recovered.stderr);assert.equal(JSON.parse(recovered.stdout).status,'complete');
 const after=JSON.parse(fs.readFileSync(f.file));assert.equal(after.workflowBudgetUsage.reviews,1);assert.equal(after.workflowBudgetUsage.retries,1);assert.equal(after.workflowReviews.length,1);assert.equal(after.workflowReviews[0].resumeAttempts.length,2);assert.deepEqual(fs.readFileSync(after.workflowReviews[0].artifactPath),artifact);
});
test('Claude controller captures a distinct fixed provider and exact author resume, rejects preexisting wrong session',t=>{
 const f=fixture(t);f.env.CLAUDE_SESSION_ID=session;
 f.run('set-task','--session','author','--task','work','--status','verified');f.run('run-check','--session','author','--name','acceptance','--',process.execPath,'-e','process.exit(0)');
 const req=f.run('request-review','--session','author','--host','claude','--checkpoint',f.checkpoint);assert.equal(req.status,0,req.stderr);
 const bin=path.join(f.root,'claude-bin');fs.mkdirSync(bin);fs.symlinkSync(path.resolve(import.meta.dirname,'helpers/synthetic-claude-host.mjs'),path.join(bin,'claude'));
 const run=(mode='',extra={})=>spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../scripts/companion.mjs'),'review-and-resume','--host','claude','--ledger',f.file,'--session',session],{cwd:f.cwd,env:{...f.env,PATH:`${bin}${path.delimiter}${process.env.PATH}`,SYNTHETIC_CLAUDE_MODE:mode,...extra},encoding:'utf8',timeout:15000});
 const rejected=run('wrong-reviewer');assert.equal(rejected.status,2);assert.match(rejected.stderr,/launched session/);assert.equal(JSON.parse(fs.readFileSync(f.file)).workflowReviews.at(-1).status,'blocked');
 const again=f.run('request-review','--session','author','--host','claude','--checkpoint',f.checkpoint);assert.equal(again.status,0,again.stderr);
 const old=run('',{SYNTHETIC_CLAUDE_VERSION:'2.1.200'});assert.equal(old.status,2);assert.match(old.stderr,/requires 2.1.296/);
 const completed=run();assert.equal(completed.status,0,completed.stderr);assert.equal(JSON.parse(completed.stdout).status,'complete');
 const ledger=JSON.parse(fs.readFileSync(f.file)),row=ledger.workflowReviews.at(-1);assert.equal(row.reviewer,'claude-host');assert.notEqual(row.reviewerAgentId,session);assert.equal(row.resumeAttempts.at(-1).status,'passed');assert.equal(ledger.workflowBudgetUsage.retries,1);
});
test('ignored knowledge promotion packet is captured independently and changed candidate cannot reuse review',t=>{
 const f=publicControllerFixture(t),store=path.join(f.root,'lessons.jsonl'),packet=path.join(f.root,'knowledge-packet.json');
 const childCode=`import fs from 'node:fs'; import {recordKnowledge,knowledgeReviewBinding} from ${JSON.stringify(new URL('../scripts/lib/project-knowledge.mjs',import.meta.url).href)}; const row=recordKnowledge({id:'lesson-1',classification:'candidate_lesson',summary:'Source freshness protects billing verification',trigger:'billing verification after source edit',action:'rerun captured regression',exceptions:'No code or authored-state change',evidence:[{kind:'regression',digest:'a'.repeat(64)}]},process.cwd()); fs.writeFileSync(${JSON.stringify(packet)},JSON.stringify({schemaVersion:1,kind:'knowledge-review-packet',knowledgeBinding:knowledgeReviewBinding(row),record:row}));`;
 const env={...f.env,ETRNL_RETRO_LESSONS:store};const produced=spawnSync(process.execPath,['--input-type=module','-e',childCode],{cwd:f.cwd,env,encoding:'utf8'});assert.equal(produced.status,0,produced.stderr);
 const req=spawnSync(process.execPath,[cli,'request-review','--session','author','--checkpoint',f.checkpoint,'--knowledge-packet',packet],{cwd:f.cwd,env,encoding:'utf8'});assert.equal(req.status,0,req.stderr);
 const result=f.runController();assert.equal(result.status,0,result.stderr);
 const ledger=JSON.parse(fs.readFileSync(f.file)),capture=JSON.parse(fs.readFileSync(ledger.workflowReviews.at(-1).artifactPath));assert.equal(capture.knowledgeBinding,JSON.parse(fs.readFileSync(packet)).knowledgeBinding);
 const promoteCode=`import {reviseKnowledge} from ${JSON.stringify(new URL('../scripts/lib/project-knowledge.mjs',import.meta.url).href)}; console.log(JSON.stringify(reviseKnowledge({cwd:process.cwd(),id:'lesson-1',expectedRevision:1,classification:'reviewed_lesson',authorizedBy:'owner',reason:'Captured independent scoped review',artifactPath:${JSON.stringify(ledger.workflowReviews.at(-1).artifactPath)},reviewer:'codex-host',treeHash:${JSON.stringify(capture.treeHash)}})));`;
 const promoted=spawnSync(process.execPath,['--input-type=module','-e',promoteCode],{cwd:f.cwd,env,encoding:'utf8'});assert.equal(promoted.status,0,promoted.stderr);assert.equal(JSON.parse(promoted.stdout).evidenceGrade,'captured_independent_review');
 const original=JSON.parse(fs.readFileSync(packet)).record;original.action='Different remedy';fs.writeFileSync(store,JSON.stringify(original)+'\n');
 const substituted=structuredClone(capture);substituted.knowledgePacket.record=original;substituted.knowledgeBinding=knowledgeReviewBinding(original);substituted.knowledgePacket.knowledgeBinding=substituted.knowledgeBinding;const copied=path.join(f.root,'copied-capture.json');fs.writeFileSync(copied,JSON.stringify(substituted));assert.throws(()=>readReviewArtifact(copied,'codex-host',capture.treeHash),/transcript.*bound/);
 const changed=spawnSync(process.execPath,['--input-type=module','-e',promoteCode],{cwd:f.cwd,env,encoding:'utf8'});assert.notEqual(changed.status,0);assert.match(changed.stderr,/not bound to current project candidate/);
});
