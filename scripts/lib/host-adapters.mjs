// Native registration formats: Codex rust-v0.159.2 ff6aec hooks discovery;
// Claude Code 2.1.296 official hooks documentation. No registration implies execution.
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import { applyPlans } from './install-core.mjs';
export const adapterSchemaVersion = 1;
export const hostAdapters = {
  codex: { minimumVersion:'0.159.2', config:'hooks.json', events:['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop','PreCompact','PostCompact','Interrupt','SessionEnd'] },
  claude: { minimumVersion:'2.1.296', config:'settings.json', events:['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop','PreCompact','SessionEnd','StopFailure'] },
};
const manifestPath = 'etrnl/native-adapters.json';
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const same = isDeepStrictEqual;
function safeFile(home,relative) {
  const target=path.resolve(home,relative);
  let current=path.resolve(home);
  for (const segment of ['', ...relative.split('/')]) {
    if(segment) current=path.join(current,segment);
    try { if(fs.lstatSync(current).isSymbolicLink()) throw Error(`Refusing symlink adapter path: ${current}`); } catch(e) {if(e.code!=='ENOENT') throw e;}
  }
  return target;
}
function bytes(home,file) {try{return fs.readFileSync(safeFile(home,file));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function object(data,label) {
  const value=data===null ? {} : JSON.parse(data.toString());
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error(`${label} must contain a JSON object`);
  if(value.hooks!==undefined && (!value.hooks || typeof value.hooks!=='object'||Array.isArray(value.hooks))) throw Error(`${label}.hooks must be an object`);
  for(const [event,groups] of Object.entries(value.hooks||{})) if(!Array.isArray(groups)||groups.some(g=>!g||!Array.isArray(g.hooks))) throw Error(`${label}: invalid hook groups for ${event}`);
  return value;
}
export function validateHostVersion(host,version) {
  const spec=hostAdapters[host]; if(!spec)throw Error(`Unsupported native host: ${host}`);
  if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error(`Explicit --${host}-version X.Y.Z required; runtime activation is unverified`);
  const parts=version.split('.').map(Number), floor=spec.minimumVersion.split('.').map(Number);
  for(let i=0;i<3;i++){if(parts[i]>floor[i])return;if(parts[i]<floor[i])throw Error(`${host} ${version} is below supported ${spec.minimumVersion}`);}
}
export function adapterGroups(host,home) {
  const spec=hostAdapters[host];
  return Object.fromEntries(spec.events.map(event=>[event,{...(event==='PreToolUse'||event==='PostToolUse'?{matcher:'.*'}:{}),hooks:[{type:'command',command:`node ${quote(path.join(home,'scripts/companion.mjs'))} run scripts/host-lifecycle.mjs -- --host ${host} --event ${event}`,timeout:(event==='SessionEnd'||event==='Interrupt'?1:10)}]}]));
}
function plan({host,home,version,profile,remove=false,preflight=false}) {
  home=path.resolve(home); const spec=hostAdapters[host];if(!spec)throw Error(`Unsupported host: ${host}`);
  const before=bytes(home,spec.config), priorBytes=bytes(home,manifestPath), prior=priorBytes?JSON.parse(priorBytes):null;
  if(prior && (prior.schemaVersion!==adapterSchemaVersion||prior.host!==host||prior.config!==spec.config||!same(prior.groups,adapterGroups(host,home))))throw Error('Unsupported native adapter ownership record');
  const settings=object(before,spec.config);const original=JSON.parse(JSON.stringify(settings));
  if(prior) {
    for(const [event,group] of Object.entries(prior.groups)) {
      const entries=settings.hooks?.[event]||[];const matches=entries.filter(entry=>same(entry,group));
      if(matches.length!==1)throw Error(`Owned ${host} ${event} registration changed or missing; preserve it for manual repair`);
      settings.hooks[event]=entries.filter(entry=>!same(entry,group));if(!settings.hooks[event].length)delete settings.hooks[event];
    }
    if(!Object.keys(settings.hooks||{}).length)delete settings.hooks;
  }
  if(remove&&!prior)return {home,changes:[],createdDirs:[]};
  if(!remove) {
    validateHostVersion(host,version);
    if(fs.existsSync(safeFile(home,'.etrnl-core.json')))throw Error('Core ownership exists; native registration requires migration to an optional profile');
    if(host==='claude'&&settings.disableAllHooks===true)throw Error('Claude settings explicitly disable all hooks; review before registration');
    if(!['orchestrated','full'].includes(profile))throw Error('Native adapters require an explicit optional profile; Core stays hook-free');
    // A disabled feature is never silently enabled by registration.
    if(host==='codex') {
      const toml=bytes(home,'config.toml')?.toString()||'';
      if(/^\s*(?:hooks\s*=\s*false|disable_all_hooks\s*=\s*true)\s*(?:#.*)?$/m.test(toml))throw Error('Codex config contains explicit hook override; review it before registration');
    }
    if(!preflight) {
      const install=JSON.parse(bytes(home,'etrnl/install.json')?.toString()||'null');
      if(!install||install.stackProfile!==profile||install.host!==host)throw Error(`Missing matching ${host} optional install manifest`);
      if(!bytes(home,'scripts/companion.mjs')||!bytes(home,'scripts/host-lifecycle.mjs'))throw Error('Install companion and native adapter before registration');
    }
    const groups=adapterGroups(host,home);settings.hooks||={};
    for(const [event,group] of Object.entries(groups))settings.hooks[event]=[...(settings.hooks[event]||[]),group];
    const metadata={schemaVersion:adapterSchemaVersion,host,profile,declaredVersion:version,minimumVersion:spec.minimumVersion,runtimeVerified:false,config:spec.config,groups,originalBytes:prior?.originalBytes??(before?before.toString('base64'):null)};
    return {home,createdDirs:[],changes:[{path:spec.config,before,after:Buffer.from(JSON.stringify(settings,null,2)+'\n')},{path:manifestPath,before:priorBytes,after:Buffer.from(JSON.stringify(metadata,null,2)+'\n')}]};
  }
  let after=Buffer.from(JSON.stringify(settings,null,2)+'\n');
  const originalBytes=prior.originalBytes===null?null:Buffer.from(prior.originalBytes,'base64');
  if(same(settings,object(originalBytes,'original config')))after=originalBytes;
  return {home,createdDirs:[],changes:[{path:spec.config,before,after},{path:manifestPath,before:priorBytes,after:null}]};
}
export function configureNativeAdapters(targets,{remove=false,dryRun=false,preflight=false}={}) {
  if(new Set(targets.map(t=>path.resolve(t.home))).size!==targets.length)throw Error('Native host homes must be distinct');
  const plans=targets.map(t=>plan({...t,remove,preflight}));
  if(!dryRun&&!preflight)applyPlans(plans);
  return plans.map((p,i)=>({host:targets[i].host,changes:p.changes.length,registered:!remove,runtimeVerified:false}));
}
export function nativeAdapterStatus({host,home}) {
  const spec=hostAdapters[host];
  try {
    const record=JSON.parse(bytes(home,manifestPath)?.toString()||'null');
    if(!record)return {host,available:!!bytes(home,'scripts/host-lifecycle.mjs'),registered:false,runtimeVerified:false};
    const settings=object(bytes(home,spec.config),spec.config), expected=adapterGroups(host,path.resolve(home));
    const registered=record.schemaVersion===1&&record.host===host&&same(record.groups,expected)&&Object.entries(expected).every(([event,group])=>(settings.hooks?.[event]||[]).filter(g=>same(g,group)).length===1)&&!!bytes(home,'scripts/host-lifecycle.mjs')&&!!bytes(home,'scripts/companion.mjs');
    return {host,available:true,registered,declaredVersion:record.declaredVersion,minimumVersion:spec.minimumVersion,runtimeVerified:false,...(!registered?{error:'Owned registration or installed paths do not match'}:{})};
  }catch(e){return {host,registered:false,runtimeVerified:false,error:e.message};}
}
export function snapshotNativeAdapters(targets,backup) {
  fs.mkdirSync(backup,{recursive:true});
  for(const target of targets) {
    const record=bytes(path.resolve(target.home),manifestPath);
    const file=path.join(backup,`native-adapters-${target.host}.json`);
    if(fs.existsSync(file))throw Error(`Native adapter snapshot exists: ${file}`);
    fs.writeFileSync(file,record||'null\n',{mode:0o600,flag:'wx'});
    const install=bytes(path.resolve(target.home),'etrnl/install.json');
    fs.writeFileSync(path.join(backup,`native-install-${target.host}.json`),install||'null\n',{mode:0o600,flag:'wx'});
  }
}
export function rollbackNativeAdapters(targets,backup,{dryRun=false}={}) {
  const plans=targets.map(target=>{
    const snapshot=path.join(backup,`native-adapters-${target.host}.json`);
    if(!fs.existsSync(snapshot))return {home:path.resolve(target.home),changes:[],createdDirs:[]};
    const prior=JSON.parse(fs.readFileSync(snapshot,'utf8'));
    const removed=plan({...target,remove:true});
    if(!prior)return removed;
    if(prior.schemaVersion!==1||prior.host!==target.host||!same(prior.groups,adapterGroups(target.host,path.resolve(target.home))))throw Error('Invalid native rollback ownership record');
    const spec=hostAdapters[target.host],configChange=removed.changes.find(c=>c.path===spec.config);
    const before=bytes(removed.home,spec.config),settings=object(configChange?configChange.after:before,spec.config);settings.hooks||={};
    for(const [event,group] of Object.entries(prior.groups))settings.hooks[event]=[...(settings.hooks[event]||[]),group];
    return {home:removed.home,createdDirs:[],changes:[{path:spec.config,before,after:Buffer.from(JSON.stringify(settings,null,2)+'\n')},{path:manifestPath,before:bytes(removed.home,manifestPath),after:Buffer.from(JSON.stringify(prior,null,2)+'\n')}]};
  });
  if(!dryRun)applyPlans(plans);
  return plans.map((p,i)=>({host:targets[i].host,changes:p.changes.length,runtimeVerified:false}));
}
// Exact commands from shipped templates define legacy ownership. Unknown cc-* names,
// commands outside the managed hook path and compound commands remain user-owned.
function legacyCommands(home) {
  const commands=new Set();
  for(const name of ['settings.json','settings.strict.json']) {
    const installed=bytes(path.resolve(home),`templates/${name}`);
    const source=path.resolve(import.meta.dirname,'../../templates',name);
    const template=object(installed||fs.readFileSync(source),'shipped hook template');
    for(const groups of Object.values(template.hooks||{}))for(const group of groups)for(const hook of group.hooks) {
      const match=String(hook.command||'').match(/^(bash|python3) ~\/\.claude\/hooks\/([A-Za-z0-9_-]+\.(?:sh|py))$/);
      if(!match)continue;
      commands.add(hook.command);
      const file=path.join(path.resolve(home),'hooks',match[2]);
      commands.add(`${match[1]} ${quote(file)}`);commands.add(`${match[1]} ${file}`);
    }
  }
  return commands;
}
// Legacy template merging flattens all groups. Native opt-in retains the exact
// unrelated user groups from the pre-install backup after that legacy pass.
export function restoreForeignHookGroups(home,originalFile) {
  if(!fs.existsSync(originalFile))return;
  const original=object(fs.readFileSync(originalFile),'original settings');
  const before=bytes(path.resolve(home),'settings.json'),current=object(before,'settings.json');
  current.hooks||={};
  const owned=legacyCommands(home);
  for(const [event,groups] of Object.entries(original.hooks||{})) {
    const foreign=groups.filter(group=>group.hooks.length&&group.hooks.every(h=>!owned.has(h.command)));
    const commands=new Set(foreign.flatMap(g=>g.hooks.map(h=>h.command)));
    const kept=(current.hooks[event]||[]).map(g=>({...g,hooks:g.hooks.filter(h=>!commands.has(h.command))})).filter(g=>g.hooks.length);
    current.hooks[event]=[...kept,...foreign];
  }
  applyPlans([{home:path.resolve(home),createdDirs:[],changes:[{path:'settings.json',before,after:Buffer.from(JSON.stringify(current,null,2)+'\n')}]}]);
}

// Revert only wholly owned legacy command groups after a native-aware rollback.
// Unrelated settings and groups added after install remain untouched.
export function restoreLegacyHookGroups(home,originalFile) {
  const before=bytes(path.resolve(home),'settings.json'),current=object(before,'settings.json');
  const original=fs.existsSync(originalFile)?object(fs.readFileSync(originalFile),'original settings'):{};
  const commands=legacyCommands(home),owned=hook=>commands.has(hook.command);
  current.hooks||={};
  for(const event of new Set([...Object.keys(current.hooks),...Object.keys(original.hooks||{})])) {
    const groups=current.hooks[event]||[];
    if(groups.some(g=>g.hooks.some(owned)&&!g.hooks.every(owned)))throw Error('Mixed user/legacy hook group cannot be safely rolled back automatically');
    const previous=(original.hooks?.[event]||[]).filter(g=>g.hooks.length&&g.hooks.every(owned));
    const kept=groups.filter(g=>!g.hooks.length||!g.hooks.every(owned));
    current.hooks[event]=[...kept,...previous];if(!current.hooks[event].length)delete current.hooks[event];
  }
  if(!Object.keys(current.hooks).length)delete current.hooks;
  applyPlans([{home:path.resolve(home),createdDirs:[],changes:[{path:'settings.json',before,after:Buffer.from(JSON.stringify(current,null,2)+'\n')}]}]);
}
