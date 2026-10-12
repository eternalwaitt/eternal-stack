#!/usr/bin/env node
import { nativeAdapterStatus } from './lib/host-adapters.mjs';
import { readContinuity, resumeContinuity } from './lib/continuity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { reviewAndResume } from './lib/review-controller.mjs';
import { resolveWorkflowContract, projectStateInstructions } from './lib/workflow-contract.mjs';
import { projectStateContext } from './lib/project-state.mjs';

const scriptDir = path.resolve(import.meta.dirname);
const scriptRoot = path.dirname(scriptDir);
const coreHome = path.resolve(scriptRoot, '../..');
const coreManifestPath = path.join(coreHome, '.etrnl-core.json');
const legacyHome = scriptRoot;
const legacyManifestPath = path.join(legacyHome, 'etrnl/install.json');
const coreInstalled = fs.existsSync(coreManifestPath) && path.basename(scriptRoot) === 'library' && path.basename(path.dirname(scriptRoot)) === 'etrnl';
const legacyInstalled = !coreInstalled && fs.existsSync(legacyManifestPath) && path.basename(scriptDir) === 'scripts';
const sourceCheckout = !coreInstalled && !legacyInstalled
  && fs.existsSync(path.join(scriptRoot, '.git'))
  && fs.existsSync(path.join(scriptRoot, 'skills/etrnl-router/SKILL.md'));
const installedHome = coreInstalled ? coreHome : legacyInstalled ? legacyHome : null;
const libraryRoot = coreInstalled ? scriptRoot : installedHome || scriptRoot;
const indexPath = installedHome
  ? path.join(installedHome, 'skills/etrnl-router/capability-index.json')
  : path.join(scriptRoot, 'skills/etrnl-router/capability-index.json');
const manifestPath = coreInstalled ? coreManifestPath : legacyInstalled ? legacyManifestPath : null;
const libraryManifestName = 'library-manifest.json';
const deniedScripts = new Set([
  'scripts/native-adapters.mjs', 'scripts/install.sh', 'scripts/uninstall.sh', 'scripts/update.sh', 'scripts/rollback-local.sh',
  'scripts/bootstrap-tools.sh', 'scripts/doctor.sh', 'scripts/post-upgrade-canary.sh',
  'scripts/canary-hindsight.sh', 'scripts/canary-websearch.sh', 'scripts/vendor-bundled-skills.sh',
]);

function fail(message) {
  throw new Error(message);
}

function parse(args) {
  const [command, ...rest] = args;
  if (!['inspect', 'list', 'select', 'run', 'review-and-resume', 'context', 'resume'].includes(command)) fail('usage: companion.mjs inspect|list|select|run [options]');
  const opts = { command, values: {}, positional: [] };
  if (command === 'run') {
    let i = 0;
    while (i < rest.length) {
      const arg = rest[i];
      if (!arg.startsWith('--')) { opts.positional = rest.slice(i); break; }
      const [flag, inlineValue] = arg.split('=', 2);
      const key = flag.slice(2);
      if (!['host', 'home', 'ledger', 'checkpoint', 'session', 'model', 'review-seconds', 'resume-seconds', 'request', 'feature', 'state-path', 'work-kind', 'from-session', 'run-id'].includes(key)) fail(`unknown run option: ${flag}`);
      const value = inlineValue ?? rest[++i];
      if (!value || value.startsWith('--')) fail(`${flag} requires a value`);
      opts.values[key] = value;
      i += 1;
    }
    if (opts.positional[1] === '--') opts.positional.splice(1, 1);
    if (opts.values.host && !['claude', 'codex'].includes(opts.values.host)) fail('--host must be claude or codex');
    return opts;
  }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--') { opts.positional.push(...rest.slice(i + 1)); break; }
    if (!arg.startsWith('--')) { opts.positional.push(arg); continue; }
    const [flag, inlineValue] = arg.split('=', 2);
    if (flag === '--resume-existing' && command === 'review-and-resume') { opts.values['resume-existing'] = true; continue; }
    if (flag === '--json') { opts.json = true; continue; }
    const key = flag.slice(2);
    if (!['intent', 'scope', 'risk', 'capability', 'budget-cap', 'authorized-budget', 'host', 'home', 'ledger', 'checkpoint', 'session', 'model', 'review-seconds', 'resume-seconds', 'request', 'feature', 'state-path', 'work-kind', 'from-session', 'run-id'].includes(key)) fail(`unknown option: ${flag}`);
    const value = inlineValue ?? rest[++i];
    if (!value || value.startsWith('--')) fail(`${flag} requires a value`);
    opts.values[key] = value;
  }
  if (opts.values.host && !['claude', 'codex'].includes(opts.values.host)) fail('--host must be claude or codex');
  return opts;
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read ${label} at ${file}: ${error.message}`); }
}

function manifestInfo() {
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  if (fs.lstatSync(manifestPath).isSymbolicLink()) fail(`refusing symlink core manifest: ${manifestPath}`);
  const manifest = readJson(manifestPath, 'core install manifest');
  if (coreInstalled && (manifest.version !== 2 || manifest.profile !== 'core' || !['claude', 'codex'].includes(manifest.host))) {
    fail(`unsupported core manifest at ${manifestPath}`);
  }
  if (legacyInstalled && (!['orchestrated', 'full'].includes(manifest.stackProfile) || !['claude', 'codex'].includes(manifest.host))) {
    fail(`unsupported optional-profile manifest at ${manifestPath}; reinstall the profile to refresh host metadata`);
  }
  return coreInstalled ? { ...manifest, installKind: 'core' } : { ...manifest, profile: manifest.stackProfile, installKind: 'optional' };
}

function nativeInfo(opts) {
  const manifest = manifestInfo();
  if (manifest) {
    if (opts.values.host && opts.values.host !== manifest.host) fail(`installed router belongs to ${manifest.host}, not ${opts.values.host}`);
    if (opts.values.home && path.resolve(opts.values.home) !== installedHome) fail('--home cannot override an installed router home');
    return { installed: true, host: manifest.host, home: installedHome, manifest };
  }
  if (!sourceCheckout) fail(`installed core manifest is missing from ${installedHome}`);
  if (!opts.values.host || !['claude', 'codex'].includes(opts.values.host)) {
    return { installed: false, host: null, home: null, manifest: null };
  }
  const home = path.resolve(opts.values.home || process.env[opts.values.host === 'claude' ? 'CLAUDE_HOME' : 'CODEX_HOME'] || path.join(os.homedir(), opts.values.host === 'claude' ? '.claude' : '.codex'));
  return { installed: false, host: opts.values.host, home, manifest: null };
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value) || value.includes('\\')) fail(`${label} must be a non-empty relative POSIX path`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '..' || normalized.startsWith('../')) fail(`${label} escapes the library root`);
  return normalized;
}

function isRegularFileUnder(root, relative) {
  const safe = safeRelative(relative, 'path');
  let current = root;
  for (const segment of safe.split('/')) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink()) fail(`refusing symlink in library path: ${current}`);
  }
  return fs.statSync(current).isFile();
}

function readIndex() {
  if (fs.lstatSync(indexPath).isSymbolicLink()) fail(`refusing symlink capability index: ${indexPath}`);
  const index = readJson(indexPath, 'capability index');
  if (index.schemaVersion !== 1 || !index.verbs || typeof index.verbs !== 'object') fail(`invalid capability index: ${indexPath}`);
  return index;
}

function installedSkills() {
  const root = path.join(libraryRoot, 'skills');
  if (!fs.existsSync(root)) return [];
  const found = [];
  const roots = [root];
  while (roots.length) {
    const dir = roots.pop();
    const bundledChildren = path.basename(dir) === 'bundled';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`refusing symlink in capability library: ${file}`);
      if (!entry.isDirectory()) continue;
      if ((legacyInstalled && dir === root) || entry.name === 'bundled' || entry.name.startsWith('etrnl-') || bundledChildren) {
        const skillPath = path.join(file, 'SKILL.md');
        const rel = path.relative(libraryRoot, skillPath).split(path.sep).join('/');
        if (isRegularFileUnder(libraryRoot, rel)) found.push({ id: entry.name, path: rel });
      }
      if (entry.name === 'bundled') roots.push(file);
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function inspect(opts) {
  const native = nativeInfo(opts);
  return {
    schemaVersion: 1,
    libraryRoot,
    scriptRoot: path.join(libraryRoot, 'scripts'),
    sourceCheckout,
    hostAdapter: {
      installed: native.installed,
      host: native.host,
      home: native.home,
      skillPath: native.installed ? path.join(native.home, 'skills/etrnl-router/SKILL.md') : null,
      nativeAgentFilesInstalled: native.host === 'claude' && native.manifest?.installKind === 'optional',
      lifecycle: native.manifest?.installKind === 'optional' ? nativeAdapterStatus({host:native.host,home:native.home}) : {registered:false,runtimeVerified:false,reason:'Core guided lifecycle; no automatic hooks'},
    },
    statePaths: native.home ? {
      state: process.env.ETRNL_STATE_DIR || path.join(native.home, 'etrnl/state'),
      runs: process.env.ETRNL_RUNS_DIR || path.join(native.home, 'etrnl/runs'),
      artifacts: process.env.ETRNL_ARTIFACTS_DIR || process.env.ETRNL_ARTIFACT_DIR || path.join(native.home, 'etrnl/artifacts'),
      overrides: {
        state: Boolean(process.env.ETRNL_STATE_DIR),
        runs: Boolean(process.env.ETRNL_RUNS_DIR),
        artifacts: Boolean(process.env.ETRNL_ARTIFACTS_DIR || process.env.ETRNL_ARTIFACT_DIR),
      },
    } : null,
  };
}

function select(opts) {
  const { intent, scope, risk } = opts.values;
  if (!intent || !scope || !risk) fail('select requires --intent, --scope and --risk; scope and risk are never inferred by this helper');
  let budgetCap;
  if (opts.values['budget-cap']) {
    try { budgetCap = JSON.parse(opts.values['budget-cap']); }
    catch { fail('--budget-cap must be a JSON object'); }
  }
  let authorizedBudget;
  if (opts.values['authorized-budget']) {
    try { authorizedBudget = JSON.parse(opts.values['authorized-budget']); }
    catch { fail('--authorized-budget must be a JSON object'); }
  }
  const contract = resolveWorkflowContract({ workKind: opts.values['work-kind'], version: 1, intent, scope, risk, ...(budgetCap ? { budgetCap } : {}), ...(authorizedBudget ? { authorizedBudget } : {}) });
  const index = readIndex();
  const verb = index.verbs[intent];
  if (!verb) fail(`no capability index entry for intent ${intent}`);
  const requiredId = verb.requiredByMode?.[contract.mode] ?? null;
  const selectedIds = [...new Set([requiredId, opts.values.capability].filter(Boolean))];
  const all = installedSkills();
  const capabilities = selectedIds.map(id => {
    const selected = all.find(item => item.id === id);
    if (!selected) fail(`capability is not available: ${id}`);
    const required = id === requiredId;
    return {
      id,
      path: path.join(libraryRoot, ...selected.path.split('/')),
      pathRelativeToLibrary: selected.path,
      available: true,
      loaded: false,
      required,
      loadRequired: required,
    };
  });
  const capability = capabilities.find(item => item.required) || capabilities[0] || null;
  const requestedCapability = opts.values.capability ? capabilities.find(item => item.id === opts.values.capability) : null;
  return {
    schemaVersion: 1,
    intent,
    contract,
    projectStateContext: projectStateContext(process.cwd()),
    projectStateMaintenance: projectStateInstructions(contract),
    capability,
    requestedCapability,
    capabilities,
    availableCapabilities: capabilities.filter(item => item.available).map(item => item.id),
    loadedCapabilities: [],
    requiredCapabilities: capabilities.filter(item => item.required).map(item => item.id),
    libraryRoot,
    scriptRoot: path.join(libraryRoot, 'scripts'),
    hostAdapter: inspect(opts).hostAdapter,
  };
}

function referencedScripts() {
  const manifestPath = path.join(libraryRoot, 'library-manifest.json');
  if (!sourceCheckout && fs.existsSync(manifestPath)) {
    if (!isRegularFileUnder(libraryRoot, libraryManifestName)) fail(`refusing invalid portable library manifest: ${manifestPath}`);
    const manifest = readJson(manifestPath, 'portable library manifest');
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.callableScripts)) fail(`invalid portable library manifest: ${manifestPath}`);
    return manifest.callableScripts.map(script => safeRelative(script, 'indexed helper path')).filter(script => !manifest.exclusions?.includes(script));
  }
  const files = [];
  const skillRoot = path.join(libraryRoot, 'skills');
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`refusing symlink in capability library: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(absolute);
    }
  }
  visit(skillRoot);
  const found = new Set(['scripts/companion.mjs', 'scripts/workflow-contract.mjs', 'scripts/host-lifecycle.mjs']);
  const patterns = [
    /~\/\.claude\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /~\/\.codex\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /ETRNL_HOME[^\s"'`]*\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /ETRNL_SCRIPT_ROOT\/(?:scripts\/)?([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /companion\.mjs["']?\s+run\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /\b(?:node|bash|python3?)\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /\brun\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) for (const match of content.matchAll(pattern)) {
      const rel = match[1].startsWith('scripts/') ? match[1] : `scripts/${match[1]}`;
      try { found.add(safeRelative(rel, 'helper path')); } catch { /* external path, not a stack helper */ }
    }
  }
  return [...found].filter(rel => !deniedScripts.has(rel) && !/^(?:install|uninstall|update|rollback|bootstrap|doctor|canary)(?:[-.]|$)/i.test(path.posix.basename(rel)));
}

function runScript(opts) {
  const script = safeRelative(opts.positional.shift() || '', 'script path');
  const allowed = referencedScripts();
  if (!allowed.includes(script)) fail(`script is not indexed as a capability helper: ${script}`);
  if (!isRegularFileUnder(libraryRoot, script)) fail(`indexed helper is missing: ${script}`);
  const native = nativeInfo(opts);
  if (!native.host || !native.home) fail('run from an installed core skill or provide --host claude|codex [--home PATH] in a source checkout');
  const extension = path.extname(script);
  const command = extension === '.mjs' ? process.execPath : extension === '.sh' ? 'bash' : extension === '.py' ? 'python3' : null;
  if (!command) fail(`unsupported helper type: ${extension}`);
  const env = { ...process.env };
  delete env.CLAUDE_HOME;
  delete env.CODEX_HOME;
  env.ETRNL_HOME = native.home;
  env.ETRNL_LIBRARY_ROOT = libraryRoot;
  env.ETRNL_SCRIPT_ROOT = path.join(libraryRoot, 'scripts');
  env.ETRNL_STATE_DIR = process.env.ETRNL_STATE_DIR || path.join(native.home, 'etrnl/state');
  env.ETRNL_RUNS_DIR = process.env.ETRNL_RUNS_DIR || path.join(native.home, 'etrnl/runs');
  env.ETRNL_ARTIFACTS_DIR = process.env.ETRNL_ARTIFACTS_DIR || path.join(native.home, 'etrnl/artifacts');
  env.ETRNL_ARTIFACT_DIR = process.env.ETRNL_ARTIFACT_DIR || env.ETRNL_ARTIFACTS_DIR;
  env[native.host === 'claude' ? 'CLAUDE_HOME' : 'CODEX_HOME'] = native.home;
  const result = spawnSync(command, [path.join(libraryRoot, ...script.split('/')), ...opts.positional], {
    cwd: process.cwd(), env, stdio: 'inherit', shell: false,
  });
  if (result.error) fail(`could not run ${script}: ${result.error.message}`);
  process.exitCode = result.status ?? 1;
}

try {
  const opts = parse(process.argv.slice(2));
  if (opts.command === 'inspect') output(inspect(opts));
  else if (opts.command === 'list') {
    const index = readIndex();
    output({ schemaVersion: 1, verbs: index.verbs, capabilities: installedSkills().map(item => ({ ...item, available: true, loaded: false, required: false })) });
  } else if (opts.command === 'select') output(select(opts));
  else if (opts.command === 'resume') output(resumeContinuity({cwd:process.cwd(),session:opts.values.session,fromSession:opts.values['from-session'],runId:opts.values['run-id']}));
  else if (opts.command === 'context') output(readContinuity({cwd:process.cwd(),session:opts.values.session,request:opts.values.request || opts.positional.join(' '),featureId:opts.values.feature,statePath:opts.values['state-path']}));
  else if (opts.command === 'run') runScript(opts);
  else if (opts.command === 'review-and-resume') {
    const result = await reviewAndResume(opts.values); output(result);
    if (result.status !== 'complete') process.exitCode = 1;
  }
} catch (error) {
  console.error(`etrnl companion: ${error.message}`);
  process.exitCode = 2;
}
