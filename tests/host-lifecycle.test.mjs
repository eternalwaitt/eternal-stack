import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handleHostEvent,readNativeEnvelope} from '../scripts/host-lifecycle.mjs';
function fixture(event,host='codex',extras={}) {return {host,event,payload:{hook_event_name:event,session_id:'fixture-session',cwd:'/tmp/project',...extras}};}
function mock() {
 const calls=[];return {calls,readContinuity:async args=>(calls.push(['read',args]),{projectId:'p',budget:{retries:2}}),retrieveKnowledge:async args=>(calls.push(['retrieve',args]),{count:1,text:'observed observation'}),captureContinuityCheckpoint:async args=>(calls.push(['checkpoint',args]),{ok:true}),continuityCompletion:async args=>(calls.push(['completion',args]),{required:true,ok:false,errors:['missing verification']}),reserveContinuityRepair:async args=>(calls.push(['reserve',args]),{allowed:true})};
}
for(const host of ['codex','claude'])test(`${host} start/prompt context uses same records with bounded redacted requests`,async()=>{
 const api=mock();const result=await handleHostEvent(fixture('UserPromptSubmit',host,{prompt:'Bearer SECRET '+'x'.repeat(2000)}),api);
 assert.equal(result.hookSpecificOutput.hookEventName,'UserPromptSubmit');assert.match(result.hookSpecificOutput.additionalContext,/untrusted data/);assert.equal(api.calls[0][1].session,'fixture-session');assert.ok(api.calls[0][1].request.length<=1500);assert.doesNotMatch(api.calls[0][1].request,/SECRET/);
});
test('cheap read tool has no continuity or retrieval I/O',async()=>{
 const api=mock(),start=performance.now();for(let i=0;i<100;i++)assert.deepEqual(await handleHostEvent(fixture('PreToolUse','codex',{tool_name:'Read'}),api),{});
 assert.equal(api.calls.length,0);assert.ok(performance.now()-start<500);
});
test('native shell boundary retrieves observations without treating them as a permission decision',async()=>{
 const api=mock();const result=await handleHostEvent(fixture('PreToolUse','codex',{tool_name:'Bash',tool_input:{command:'deploy Bearer SECRET'}}),api);
 assert.equal(api.calls[0][0],'retrieve');assert.doesNotMatch(api.calls[0][1].query,/SECRET/);assert.equal(result.hookSpecificOutput.permissionDecision,undefined);
});
test('completion veto consumes canonical continuation budget once',async()=>{
 const api=mock();const result=await handleHostEvent(fixture('Stop'),api);assert.equal(result.decision,'block');assert.deepEqual(api.calls.map(c=>c[0]),['completion','reserve']);
});
test('exhausted durable budget ends repair requests without false success',async()=>{
 const api=mock();api.reserveContinuityRepair=async()=>({allowed:false});const result=await handleHostEvent(fixture('Stop'),api);assert.equal(result.decision,undefined);assert.match(result.systemMessage,/incomplete/);
});
test('completed bound task checkpoints; absent task never creates or reserves',async()=>{
 const api=mock();api.continuityCompletion=async()=>({required:true,ok:true});assert.deepEqual(await handleHostEvent(fixture('Stop'),api),{});assert.equal(api.calls[0][0],'checkpoint');
 api.calls.length=0;api.continuityCompletion=async()=>({required:false,ok:true});assert.deepEqual(await handleHostEvent(fixture('Stop'),api),{});assert.equal(api.calls.length,0);
});
for(const event of ['Interrupt','SessionEnd','PreCompact','PostCompact','PostToolUse'])test(`${event} preserves canonical checkpoint without reset`,async()=>{
 const api=mock();await handleHostEvent(fixture(event,'codex',{tool_name:'Bash',tool_response:'SECRET'}),api);assert.deepEqual(api.calls,[['checkpoint',{cwd:'/tmp/project',session:'fixture-session'}]]);
});
test('Claude StopFailure checkpoints; no invented Interrupt support',async()=>{
 const api=mock();await handleHostEvent(fixture('StopFailure','claude'),api);assert.equal(api.calls[0][0],'checkpoint');await assert.rejects(handleHostEvent(fixture('Interrupt','claude'),api),/Unsupported/);
});
test('malformed/mismatched envelope and excessive payload rejected before API use',async()=>{
 const api=mock();await assert.rejects(handleHostEvent(fixture('Stop','codex',{hook_event_name:'SessionEnd'}),api),/match/);assert.equal(api.calls.length,0);
 await assert.rejects(readNativeEnvelope(Readable.from(['x'.repeat(65537)])),/64 KiB/);await assert.rejects(readNativeEnvelope(Readable.from(['{bad'])));
});
test('retrieval receipt records observation only and excludes raw payload',async()=>{
 const api=mock(),receipts=[];api.retrieveKnowledge=async()=>({count:1,text:'note',receipt:{projectId:'p',lessonIds:['l'],queryDigest:'digest',classification:'retrieval_only'}});api.recordRetrieval=value=>receipts.push(value);
 await handleHostEvent(fixture('PreToolUse','codex',{tool_name:'Bash',tool_input:{command:'raw private query'}}),api);assert.equal(receipts.length,1);assert.equal(receipts[0].receipt.classification,'retrieval_only');assert.doesNotMatch(JSON.stringify(receipts),/raw private query/);
});
