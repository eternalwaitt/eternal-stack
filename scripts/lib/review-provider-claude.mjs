// Claude Code CLI provider schema v1, documented 2.1.296 CLI/Agent SDK.
// https://code.claude.com/docs/en/cli-reference
// https://platform.claude.com/docs/en/agent-sdk/typescript#sdkresultmessage
// Flags provide a documented tool boundary, not an OS sandbox or live parity proof.
import {randomUUID} from 'node:crypto';
export const claudeProvider={schemaVersion:1,minimumVersion:'2.1.296',provider:'claude',reviewer:'claude-host'};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function base(model) {
 if(model&&(!/^[a-zA-Z0-9._-]{1,100}$/.test(model)))throw Error('invalid Claude model');
 return ['--print','--output-format','json',...(model?['--model',model]:[])];
}
export function claudeReviewInvocation({prompt,schema,session,model}) {
 const reviewerSession=randomUUID();if(!uuid(session))throw Error('Claude author session must be a UUID');
 return {executable:'claude',providerSchemaVersion:1,reviewerSession,argv:[...base(model),'--restricted','--bare','--setting-sources','','--settings','{"disableAllHooks":true,"autoMemoryEnabled":false}','--tools','Read,Glob,Grep','--disallowedTools','mcp__*','--permission-mode','dontAsk','--permission-prompts','none','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence','--session-id',reviewerSession,'--json-schema',JSON.stringify(schema),prompt]};
}
export function claudeResumeInvocation({prompt,session,model}) {
 if(!uuid(session))throw Error('Claude resume requires exact UUID');
 // Resume retains host/project policies and approvals. Unattended permissions
 // are denied; unavailable operations remain blockers, never permission bypass.
 return {executable:'claude',providerSchemaVersion:1,argv:[...base(model),'--resume',session,'--permission-mode','dontAsk','--permission-prompts','none',prompt]};
}
export function parseClaudeTurn(raw,expectedSession) {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>8*1024*1024)throw Error('bounded Claude JSON result required');
 const result=JSON.parse(raw);
 if(!result||Array.isArray(result)||result.type!=='result'||result.subtype!=='success'||result.is_error!==false||!uuid(result.session_id)||(expectedSession&&result.session_id!==expectedSession))throw Error('successful Claude result/session missing');
 return {session:result.session_id,events:[result],message:result};
}
export function parseClaudeReview(raw,{implementationSession,requestId,treeHash}) {
 const {session,message}=parseClaudeTurn(raw);
 if(session===implementationSession)throw Error('separate Claude reviewer session required');
 const result=message.structured_output;
 if(!result||Array.isArray(result)||result.requestId!==requestId||result.treeHash!==treeHash||!['verified','changes_requested','blocked'].includes(result.verdict)||typeof result.summary!=='string'||!result.summary.trim()||!Array.isArray(result.findings)||result.findings.some(v=>typeof v!=='string')||!Array.isArray(result.reviewedFiles)||!result.reviewedFiles.length||result.reviewedFiles.some(v=>typeof v!=='string'||!v.trim()||v.startsWith('/')||v.split('/').includes('..'))||(result.verdict==='verified'&&result.findings.length))throw Error('invalid Claude structured reviewer result');
 return {result,reviewerAgentId:session};
}
