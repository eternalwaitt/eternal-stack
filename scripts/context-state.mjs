#!/usr/bin/env node
import { flagValue } from './lib/etrnl-state-core.mjs';
import { saveContext, readContext, listContexts, contextText } from './lib/context-records.mjs';
import { ownedContinuityLedger } from './lib/continuity.mjs';
const args = process.argv.slice(2), command = args[0], get = (flag, fallback = '') => flagValue(args, flag, fallback);
const all = flag => args.flatMap((value,index) => value === flag && args[index+1] ? [args[index+1]] : []);
try {
  const cwd = get('--cwd', process.cwd()), session = get('--session');
  if (command === 'save') {
    const result = saveContext({ cwd, ledger: ownedContinuityLedger({ cwd, session }).ledger, title: get('--title','ETRNL context'),
      ...(get('--id') ? { contextId: get('--id') } : {}), ...(get('--saved-at') ? { savedAt: get('--saved-at') } : {}),
      decisions: all('--decision'), blockers: all('--blocker'), remainingWork: all('--remaining'), verification: all('--verification'), dryRun: args.includes('--dry-run') });
    console.log(args.includes('--json') ? JSON.stringify(result) : `${result.dryRun ? 'dry-run: would write ' : ''}${result.file}`);
  } else if (['restore','show','validate'].includes(command)) {
    const file = args[1] && !args[1].startsWith('-') ? args[1] : get('--path');
    const value = file ? readContext(file,{cwd,staleHours:Number(get('--stale-hours',process.env.ETRNL_CONTEXT_STALE_HOURS || '24'))}) : listContexts({cwd,session,featureId:get('--feature'),limit:1})[0];
    if (!value) throw new Error('No saved context for this project/session; provide a project-owned checkpoint path.');
    console.log(args.includes('--json') ? JSON.stringify(value) : contextText(value));
  } else if (command === 'list') {
    const rows = listContexts({cwd,session,featureId:get('--feature'),limit:Number(get('--limit','10'))});
    console.log(args.includes('--json') ? JSON.stringify(rows) : rows.map(row => `${row.contextId}: ${row.title} branch=${row.branch} remaining=${row.remainingWork.length}`).join('\n') || 'No ETRNL context saves recorded.');
  } else throw new Error('usage: context-state.mjs save|show|restore|validate|list [--json] [--session ID] [--feature ID]');
} catch(error) { console.error(error.message); process.exitCode = 2; }
