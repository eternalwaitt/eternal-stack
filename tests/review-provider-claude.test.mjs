import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {claudeReviewInvocation,claudeResumeInvocation,parseClaudeReview,parseClaudeTurn} from '../scripts/lib/review-provider-claude.mjs';
const author='11111111-1111-4111-8111-111111111111',reviewer='22222222-2222-4222-8222-222222222222';
const structured={requestId:'request',treeHash:'source',verdict:'verified',summary:'inspected source',findings:[],reviewedFiles:['src/app.mjs']};
const envelope=(extras={})=>JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:reviewer,structured_output:structured,...extras});
test('provider versioned invocation confines reviewer tools; resume preserves permissions',()=>{
 const invocation=claudeReviewInvocation({prompt:'untrusted task',schema:{type:'object'},session:author});assert.equal(invocation.executable,'claude');assert.equal(invocation.providerSchemaVersion,1);assert.notEqual(invocation.reviewerSession,author);
 for(const flag of ['--restricted','--bare','--json-schema','--session-id','--no-session-persistence','--strict-mcp-config'])assert.ok(invocation.argv.includes(flag));assert.equal(invocation.argv[invocation.argv.indexOf('--tools')+1],'Read,Glob,Grep');assert.ok(!invocation.argv.includes('--dangerously-skip-permissions'));
 const resume=claudeResumeInvocation({prompt:'continue',session:author});assert.equal(resume.argv[resume.argv.indexOf('--resume')+1],author);assert.equal(resume.argv[resume.argv.indexOf('--permission-mode')+1],'dontAsk');
});
test('captured successful JSON requires distinct reviewer and request/source binding',()=>{
 const parsed=parseClaudeReview(envelope(),{implementationSession:author,requestId:'request',treeHash:'source'});assert.equal(parsed.reviewerAgentId,reviewer);
 for(const raw of [envelope({session_id:author}),envelope({subtype:'error_max_turns'}),envelope({is_error:true}),envelope({structured_output:{...structured,treeHash:'stale'}}),envelope({structured_output:{...structured,findings:['defect']}}),envelope({structured_output:{...structured,reviewedFiles:[]}}),'{bad'])assert.throws(()=>parseClaudeReview(raw,{implementationSession:author,requestId:'request',treeHash:'source'}));
 assert.throws(()=>parseClaudeTurn(envelope(),author));assert.equal(parseClaudeTurn(envelope({session_id:author}),author).session,author);
});
test('fixed CLI fake subprocess capture provides actual JSON envelope; malformed output rejected',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'claude-provider-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const binary=path.join(home,'claude');fs.writeFileSync(binary,'#!/usr/bin/env node\nprocess.stdout.write(process.env.FIXTURE_OUTPUT);\n',{mode:0o700});
 const invocation=claudeReviewInvocation({prompt:'review',schema:{type:'object'},session:author});
 const captured=spawnSync(invocation.executable,invocation.argv,{env:{...process.env,PATH:home+path.delimiter+process.env.PATH,FIXTURE_OUTPUT:envelope()},encoding:'utf8'});assert.equal(captured.status,0);assert.equal(parseClaudeReview(captured.stdout,{implementationSession:author,requestId:'request',treeHash:'source'}).reviewerAgentId,reviewer);
});
