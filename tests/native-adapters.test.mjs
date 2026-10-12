import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureNativeAdapters,nativeAdapterStatus,validateHostVersion,adapterGroups} from '../scripts/lib/host-adapters.mjs';
function fixture(t,host='codex',profile='orchestrated') {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"native host's "));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 fs.mkdirSync(path.join(home,'etrnl'));fs.mkdirSync(path.join(home,'scripts'));
 fs.writeFileSync(path.join(home,'etrnl/install.json'),JSON.stringify({host,stackProfile:profile}));
 for(const name of ['companion.mjs','host-lifecycle.mjs'])fs.writeFileSync(path.join(home,'scripts',name),'// fixture\n');
 return {host,home,profile,version:host==='codex'?'0.159.2':'2.1.296'};
}
for(const host of ['codex','claude'])test(`${host} native schema preserves user arrays and restores original bytes`,t=>{
 const target=fixture(t,host),file=path.join(target.home,host==='codex'?'hooks.json':'settings.json');
 const before='{"custom":true,"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo user"}]}]}}\n';fs.writeFileSync(file,before);
 configureNativeAdapters([target]);const saved=JSON.parse(fs.readFileSync(file));
 assert.equal(saved.custom,true);assert.equal(saved.hooks.Stop.length,2);assert.equal(saved.hooks.Stop[0].hooks[0].command,'echo user');
 assert.match(saved.hooks.SessionStart[0].hooks[0].command,/companion\.mjs/);assert.equal(saved.hooks.Stop[1].hooks[0].type,'command');
 assert.equal(nativeAdapterStatus(target).registered,true);assert.equal(nativeAdapterStatus(target).runtimeVerified,false);
 configureNativeAdapters([target]);assert.equal(JSON.parse(fs.readFileSync(file)).hooks.Stop.length,2);
 configureNativeAdapters([target],{remove:true});assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('unregister removes only owned group after user config changes',t=>{
 const target=fixture(t);configureNativeAdapters([target]);const file=path.join(target.home,'hooks.json');const settings=JSON.parse(fs.readFileSync(file));settings.custom={later:1};settings.hooks.Stop.unshift({hooks:[{type:'command',command:'new user hook'}]});fs.writeFileSync(file,JSON.stringify(settings));
 configureNativeAdapters([target],{remove:true});const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.custom.later,1);assert.equal(saved.hooks.Stop[0].hooks[0].command,'new user hook');assert.equal(saved.hooks.SessionStart,undefined);
});
test('version floor, core and explicit disabled hooks are rejected',t=>{
 assert.throws(()=>validateHostVersion('codex','0.159.1'),/below/);assert.throws(()=>validateHostVersion('claude',''),/Explicit/);
 const target=fixture(t);assert.throws(()=>configureNativeAdapters([{...target,profile:'core'}]),/Core/);
 fs.writeFileSync(path.join(target.home,'config.toml'),'[features]\nhooks = false\n');assert.throws(()=>configureNativeAdapters([target]),/override/);
});
test('all configs preflight before mutation and malformed groups rejected',t=>{
 const a=fixture(t),b=fixture(t,'claude');fs.writeFileSync(path.join(b.home,'settings.json'),'{bad');assert.throws(()=>configureNativeAdapters([a,b]));assert.equal(fs.existsSync(path.join(a.home,'hooks.json')),false);
 fs.writeFileSync(path.join(b.home,'settings.json'),'{"hooks":{"Stop":{}}}');assert.throws(()=>configureNativeAdapters([a,b]),/groups/);
});
test('owned edits and symlink configs cannot be clobbered',t=>{
 const target=fixture(t);configureNativeAdapters([target]);const file=path.join(target.home,'hooks.json'),settings=JSON.parse(fs.readFileSync(file));settings.hooks.Stop[0].hooks[0].command='changed';fs.writeFileSync(file,JSON.stringify(settings));
 assert.equal(nativeAdapterStatus(target).registered,false);assert.throws(()=>configureNativeAdapters([target],{remove:true}),/changed/);
 const other=fixture(t);fs.symlinkSync(file,path.join(other.home,'hooks.json'));assert.throws(()=>configureNativeAdapters([other]),/symlink/);
});
test('dry run/preflight no writes; new config removed on uninstall',t=>{
 const target=fixture(t);configureNativeAdapters([target],{dryRun:true});assert.equal(fs.existsSync(path.join(target.home,'hooks.json')),false);
 configureNativeAdapters([target],{preflight:true});assert.equal(fs.existsSync(path.join(target.home,'hooks.json')),false);
 configureNativeAdapters([target]);configureNativeAdapters([target],{remove:true});assert.equal(fs.existsSync(path.join(target.home,'hooks.json')),false);
});
test('write failure rolls back config and ownership transaction',t=>{
 const target=fixture(t);const rename=fs.renameSync;let calls=0;
 fs.renameSync=(...args)=>{if(++calls===2)throw Error('injected write failure');return rename(...args);};
 try {assert.throws(()=>configureNativeAdapters([target]),/injected/);}finally{fs.renameSync=rename;}
 assert.equal(fs.existsSync(path.join(target.home,'hooks.json')),false);assert.equal(fs.existsSync(path.join(target.home,'etrnl/native-adapters.json')),false);
});
test('Codex registration uses native home hooks.json command schema, escaped fixture home',t=>{
 const target=fixture(t);const groups=adapterGroups('codex',target.home);
 assert.deepEqual(Object.keys(groups),['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop','PreCompact','PostCompact','Interrupt','SessionEnd']);
 assert.equal(groups.PreToolUse.matcher,'.*');assert.equal(groups.Interrupt.hooks[0].timeout,1);assert.match(groups.Stop.hooks[0].command,/'\\''/);
});
test('rollback restores prior registration while retaining unrelated current config',async t=>{
 const {snapshotNativeAdapters,rollbackNativeAdapters}=await import('../scripts/lib/host-adapters.mjs');const target=fixture(t),backup=path.join(target.home,'backup');
 snapshotNativeAdapters([target],backup);configureNativeAdapters([target]);const file=path.join(target.home,'hooks.json'),settings=JSON.parse(fs.readFileSync(file));settings.custom='later';fs.writeFileSync(file,JSON.stringify(settings));rollbackNativeAdapters([target],backup);assert.deepEqual(JSON.parse(fs.readFileSync(file)),{custom:'later'});
 configureNativeAdapters([target]);const second=path.join(target.home,'second');snapshotNativeAdapters([target],second);configureNativeAdapters([{...target,version:'0.160.0'}]);rollbackNativeAdapters([target],second);assert.equal(nativeAdapterStatus(target).declaredVersion,'0.159.2');assert.equal(nativeAdapterStatus(target).registered,true);
});
test('legacy installer integration preserves exact unrelated user group arrays',async t=>{
 const {restoreForeignHookGroups}=await import('../scripts/lib/host-adapters.mjs');const target=fixture(t,'claude');const original={theme:'dark',hooks:{Stop:[{matcher:'custom',hooks:[{type:'command',command:'first',timeout:2},{type:'command',command:'second',timeout:3}]}]}};const backup=path.join(target.home,'before.json');fs.writeFileSync(backup,JSON.stringify(original));
 fs.writeFileSync(path.join(target.home,'settings.json'),JSON.stringify({theme:'dark',hooks:{Stop:[{hooks:[{type:'command',command:'first'}]},{hooks:[{type:'command',command:'second'}]},{hooks:[{type:'command',command:'bash ~/.claude/hooks/cc-stop-verifier.sh'}]}]}}));restoreForeignHookGroups(target.home,backup);configureNativeAdapters([target]);const current=JSON.parse(fs.readFileSync(path.join(target.home,'settings.json')));assert.deepEqual(current.hooks.Stop[1],original.hooks.Stop[0]);assert.equal(current.theme,'dark');
});
test('explicit Claude disable and incompatible Core ownership rejected without settings changes',t=>{
 const target=fixture(t,'claude'),file=path.join(target.home,'settings.json');fs.writeFileSync(file,'{"disableAllHooks":true}');assert.throws(()=>configureNativeAdapters([target]),/disable/);assert.equal(fs.readFileSync(file,'utf8'),'{"disableAllHooks":true}');
 const core=fixture(t);fs.writeFileSync(path.join(core.home,'.etrnl-core.json'),'{}');assert.throws(()=>configureNativeAdapters([core]),/Core ownership/);
});

test('native-aware legacy restore preserves unknown cc names and compound commands but rejects genuinely mixed ownership',async t=>{
 const {restoreLegacyHookGroups,restoreForeignHookGroups}=await import('../scripts/lib/host-adapters.mjs');const target=fixture(t,'claude');
 const file=path.join(target.home,'settings.json'),backup=path.join(target.home,'before.json');
 const user={hooks:[{type:'command',command:'bash /opt/user/cc-custom.sh'},{type:'command',command:`bash ${target.home}/hooks/cc-custom.sh`},{type:'command',command:'bash ~/.claude/hooks/cc-stop-verifier.sh && echo custom'}]};
 fs.writeFileSync(backup,JSON.stringify({hooks:{Stop:[user]}}));fs.writeFileSync(file,JSON.stringify({theme:'new',hooks:{Stop:[user,{hooks:[{type:'command',command:'bash ~/.claude/hooks/cc-stop-verifier.sh'}]}]}}));
 restoreForeignHookGroups(target.home,backup);restoreLegacyHookGroups(target.home,backup);const restored=JSON.parse(fs.readFileSync(file));assert.deepEqual(restored.hooks.Stop,[user]);assert.equal(restored.theme,'new');
 restored.hooks.Stop=[{hooks:[...user.hooks,{type:'command',command:'bash ~/.claude/hooks/cc-stop-verifier.sh'}]}];fs.writeFileSync(file,JSON.stringify(restored));assert.throws(()=>restoreLegacyHookGroups(target.home,backup),/Mixed/);assert.deepEqual(JSON.parse(fs.readFileSync(file)),restored);
});
