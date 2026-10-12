#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { configureNativeAdapters,nativeAdapterStatus,snapshotNativeAdapters,rollbackNativeAdapters,restoreForeignHookGroups,restoreLegacyHookGroups } from './lib/host-adapters.mjs';
const opts={host:'both',profile:'',claudeHome:process.env.CLAUDE_HOME||path.join(os.homedir(),'.claude'),codexHome:process.env.CODEX_HOME||path.join(os.homedir(),'.codex')};
try {
 for(let i=2;i<process.argv.length;i++) {
  const arg=process.argv[i];
  if(['--remove','--dry-run','--preflight','--status'].includes(arg)){opts[arg.slice(2)]=true;continue;}
  const key={'--host':'host','--profile':'profile','--claude-home':'claudeHome','--codex-home':'codexHome','--claude-version':'claudeVersion','--codex-version':'codexVersion','--snapshot':'snapshot','--rollback':'rollback','--restore-user-groups':'restoreGroups','--restore-legacy-groups':'restoreLegacy'}[arg];
  if(!key||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error(`Invalid option: ${arg}`);opts[key]=process.argv[++i];
 }
 if(!['both','codex','claude'].includes(opts.host))throw Error('Invalid host');
 const targets=['claude','codex'].filter(h=>opts.host==='both'||opts.host===h).map(host=>({host,home:opts[host+'Home'],version:opts[host+'Version'],profile:opts.profile}));
 const results=opts.restoreLegacy?(restoreLegacyHookGroups(opts.claudeHome,opts.restoreLegacy),[]):opts.restoreGroups?(restoreForeignHookGroups(opts.claudeHome,opts.restoreGroups),[]):opts.snapshot?(snapshotNativeAdapters(targets,opts.snapshot),[]):opts.rollback?rollbackNativeAdapters(targets,opts.rollback,{dryRun:opts['dry-run']}):opts.status?targets.map(nativeAdapterStatus):configureNativeAdapters(targets,{remove:opts.remove,dryRun:opts['dry-run'],preflight:opts.preflight});
 console.log(JSON.stringify({schemaVersion:1,results},null,2));
 if(opts.status&&results.some(r=>r.error))process.exitCode=1;
}catch(e){console.error(`native adapters: ${e.message}`);process.exitCode=1;}
