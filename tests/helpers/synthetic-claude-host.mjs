#!/usr/bin/env node
// Fixed-executable protocol fixture only; never installed or live model evidence.
const args=process.argv.slice(2),prompt=args.at(-1);
if(args.includes('--version')) { console.log(process.env.SYNTHETIC_CLAUDE_VERSION || '2.1.296 (Claude Code)'); process.exit(0); }
const value=flag=>args[args.indexOf(flag)+1];
let session=args.includes('--resume') ? value('--resume') : value('--session-id');
if(process.env.SYNTHETIC_CLAUDE_MODE==='wrong-reviewer')session='99999999-9999-9999-9999-999999999999';
if(args.includes('--resume')) {
 if(process.env.SYNTHETIC_CLAUDE_MODE==='resume-failed'){console.log(JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,session_id:session}));process.exit(0);}
 console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:session,result:'Synthetic author yield.'}));
} else {
 if(!args.includes('--restricted') || !args.includes('--bare') || value('--tools')!=='Read,Glob,Grep')process.exit(8);
 const [,requestId,treeHash]=prompt.match(/requestId=([^;]+); treeHash=([a-f0-9]+)/)||[];
 console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:session,structured_output:{requestId,treeHash,...(prompt.match(/knowledgeBinding=([a-f0-9]{64})/) ? {knowledgeBinding:prompt.match(/knowledgeBinding=([a-f0-9]{64})/)[1]} : {}),verdict:'verified',summary:'Synthetic provider fixture; no model quality claim.',findings:[],reviewedFiles:['source']}}));
}
