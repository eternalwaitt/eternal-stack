// Portable Core installation: one discoverable skill plus a private, owned library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const start = '<!-- eternal-stack:core:start -->';
const end = '<!-- eternal-stack:core:end -->';
const manifestName = '.etrnl-core.json';
const libraryManifestName = 'library-manifest.json';
const deniedHelpers = new Set([
  'scripts/native-adapters.mjs', 'scripts/install.sh', 'scripts/uninstall.sh', 'scripts/update.sh', 'scripts/rollback-local.sh',
  'scripts/bootstrap-tools.sh', 'scripts/doctor.sh', 'scripts/post-upgrade-canary.sh',
  'scripts/canary-hindsight.sh', 'scripts/canary-websearch.sh', 'scripts/vendor-bundled-skills.sh',
]);
const excludedTemplateRoots = ['settings', 'hindsight', 'stack-profile.'];

function options(args) {
  const out = { host: 'both', claude: process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude'), codex: process.env.CODEX_HOME || path.join(os.homedir(), '.codex') };
  for (let i = 0; i < args.length; i += 1) {
    const [flag, inline] = args[i].split('=', 2);
    if (['--dry-run', '--uninstall', '--help', '-h'].includes(flag)) { out[flag] = true; continue; }
    const key = { '--host': 'host', '--claude-home': 'claude', '--codex-home': 'codex', '--profile': 'profile' }[flag];
    if (!key) throw new Error(`Unknown core option: ${flag}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    out[key] = value;
  }
  if (!['both', 'claude', 'codex'].includes(out.host)) throw new Error('--host must be both, claude or codex');
  if (out.profile && out.profile !== 'core') throw new Error('Core installer requires --profile core');
  return out;
}

function canonicalHome(home) {
  const absolute = path.resolve(home);
  let existing = absolute;
  const suffix = [];
  while (true) {
    try {
      fs.lstatSync(existing);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
  return path.resolve(fs.realpathSync.native(existing), ...suffix);
}

function hash(content) { return crypto.createHash('sha256').update(content).digest('hex'); }

function safeRelative(value, label = 'managed path') {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) throw new Error(`Invalid ${label}: ${value}`);
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error(`Unsafe ${label}: ${value}`);
  return normalized;
}

function safePath(home, relative) {
  const safe = safeRelative(relative);
  try { if (fs.lstatSync(home).isSymbolicLink()) throw new Error(`Refusing symlink host home: ${home}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const target = path.resolve(home, ...safe.split('/'));
  if (target !== home && !target.startsWith(`${home}${path.sep}`)) throw new Error(`Managed path escapes host home: ${relative}`);
  let current = home;
  for (const segment of safe.split('/')) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlink install path: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

function readPath(home, relative) {
  const file = safePath(home, relative);
  try { return fs.readFileSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function walkFiles(sourceRoot, relativeRoot, predicate = () => true) {
  const out = [];
  const visit = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextRel = `${rel}/${entry.name}`;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Source library contains a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute, nextRel);
      else if (entry.isFile() && predicate(nextRel)) out.push(nextRel);
    }
  };
  const absoluteRoot = path.join(sourceRoot, ...relativeRoot.split('/'));
  if (fs.existsSync(absoluteRoot)) visit(absoluteRoot, relativeRoot);
  return out;
}

function skillFiles() {
  const skillRoot = path.join(root, 'skills');
  return walkFiles(root, 'skills', rel => !rel.startsWith('skills/etrnl-router/'));
}

function referencedHelperPaths(files) {
  const result = new Set(['scripts/companion.mjs', 'scripts/workflow-contract.mjs']);
  const patterns = [
    /~\/\.claude\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /~\/\.codex\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /ETRNL_HOME[^\s"'`]*\/scripts\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /ETRNL_SCRIPT_ROOT\/([A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /\b(?:node|bash|python3?)\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
    /\brun\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|sh|py))/g,
  ];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(root, ...file.split('/')), 'utf8');
    for (const pattern of patterns) for (const match of content.matchAll(pattern)) {
      const raw = match[1].startsWith('scripts/') ? match[1] : `scripts/${match[1]}`;
      let relative = safeRelative(raw, 'helper path');
      if (!fs.existsSync(path.join(root, ...relative.split('/')))) {
        const basename = path.posix.basename(relative);
        let parent = path.posix.dirname(file);
        let local = null;
        while (parent.startsWith('skills/')) {
          const candidate = path.posix.join(parent, 'scripts', basename);
          if (fs.existsSync(path.join(root, ...candidate.split('/')))) { local = candidate; break; }
          if (parent === 'skills' || parent === 'skills/bundled') break;
          parent = path.posix.dirname(parent);
        }
        if (!local) continue;
        relative = safeRelative(local, 'skill-local helper path');
      }
      const base = path.posix.basename(relative);
      if (!deniedHelpers.has(relative) && !/^(?:install|uninstall|update|rollback|bootstrap|doctor|canary)(?:[-.]|$)/i.test(base)) result.add(relative);
    }
  }
  return result;
}

export function dependencyFiles(initial, sourceRoot = root) {
  const included = new Set(initial);
  const queue = [...initial];
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;
  const shellPattern = /(?:^|[;\n]\s*)(?:source|\.)\s+['"]?([^\s'";]+)/gm;
  const dynamicShellPattern = /(?:source|\.)\s+["']?\$(SCRIPT_DIR|ETRNL_SCRIPT_ROOT)\/([A-Za-z0-9_./-]+)/gm;
  while (queue.length) {
    const relative = queue.pop();
    const absolute = path.join(sourceRoot, ...relative.split('/'));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const content = fs.readFileSync(absolute, 'utf8');
    const refs = new Set();
    const rootRefs = new Set();
    for (const match of content.matchAll(importPattern)) if (match[1].startsWith('.')) refs.add(match[1]);
    if (relative.endsWith('.sh')) for (const match of content.matchAll(shellPattern)) if (match[1].startsWith('.')) refs.add(match[1]);
    if (relative.endsWith('.sh')) for (const match of content.matchAll(dynamicShellPattern)) {
      if (match[1] === 'ETRNL_SCRIPT_ROOT') rootRefs.add(path.posix.join('scripts', match[2]));
      else refs.add(match[2]);
    }
    const includeRef = (ref, base) => {
      let resolved = path.posix.normalize(path.posix.join(base, ref));
      if (!path.posix.extname(resolved)) {
        for (const ext of ['.mjs', '.js', '.json', '.sh']) {
          if (fs.existsSync(path.join(sourceRoot, ...`${resolved}${ext}`.split('/')))) { resolved += ext; break; }
        }
      }
      if (resolved.startsWith('../') || path.posix.isAbsolute(resolved) || !fs.existsSync(path.join(sourceRoot, ...resolved.split('/')))) return;
      // Include only portable source and inert hook libraries; never install active hooks.
      const allowed = /^(scripts|schemas|templates|skills|agents|rules|docs)(\/|$)/.test(resolved) || /^hooks\/lib\//.test(resolved);
      if (allowed && !included.has(resolved)) { included.add(resolved); queue.push(resolved); }
    };
    for (const ref of refs) includeRef(ref, path.posix.dirname(relative));
    for (const ref of rootRefs) includeRef(ref, '.');
  }
  return included;
}

function portableAssets(hostHome) {
  const skillFilesList = skillFiles();
  const helperPaths = referencedHelperPaths(skillFilesList);
  const all = new Set(skillFilesList);
  for (const rel of walkFiles(root, 'agents')) all.add(rel);
  for (const rel of walkFiles(root, 'schemas')) all.add(rel);
  for (const rel of walkFiles(root, 'rules')) all.add(rel);
  for (const rel of walkFiles(root, 'templates', rel => !excludedTemplateRoots.some(x => path.posix.basename(rel).startsWith(x)))) all.add(rel);
  for (const rel of helperPaths) all.add(rel);
  const closed = dependencyFiles(all);
  const callableScripts = [...helperPaths].sort();
  const assets = new Map();
  const routerDir = path.join(root, 'skills/etrnl-router');
  const routerTarget = 'skills/etrnl-router';
  const companionPath = path.join('etrnl/library', 'scripts/companion.mjs');
  const helperCommand = shellQuote(path.join(hostHome, companionPath));
  const renderMarkdown = (sourceRel, content) => {
    if (!sourceRel.endsWith('.md')) return content;
    const text = content.toString('utf8').replaceAll('{{ETRNL_COMPANION}}', helperCommand);
    if (text.includes('{{ETRNL_COMPANION}}')) throw new Error(`Unresolved companion helper placeholder in ${sourceRel}`);
    return Buffer.from(text);
  };
  for (const sourceRel of walkFiles(root, 'skills/etrnl-router')) {
    const source = path.join(root, ...sourceRel.split('/'));
    const target = `${routerTarget}/${sourceRel.slice('skills/etrnl-router/'.length)}`;
    assets.set(target, renderMarkdown(sourceRel, fs.readFileSync(source)));
  }
  for (const sourceRel of closed) {
    const source = path.join(root, ...sourceRel.split('/'));
    assets.set(`etrnl/library/${sourceRel}`, renderMarkdown(sourceRel, fs.readFileSync(source)));
  }
  const libraryManifest = {
    schemaVersion: 1,
    libraryRoot: 'etrnl/library',
    mirroredRoots: ['skills (except etrnl-router)', 'agents', 'schemas', 'templates (excluding settings and profile/plugin bootstrap files)', 'rules', 'referenced scripts and recursive local imports', 'referenced inert hooks/lib modules'],
    callableScripts,
    exclusions: [...deniedHelpers].sort(),
  };
  assets.set(`etrnl/library/${libraryManifestName}`, Buffer.from(`${JSON.stringify(libraryManifest, null, 2)}\n`));
  return assets;
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

function oldManifest(home) {
  const raw = readPath(home, manifestName);
  if (raw === null) return null;
  let manifest;
  try { manifest = JSON.parse(raw.toString('utf8')); }
  catch (error) { throw new Error(`Invalid core manifest in ${home}: ${error.message}`); }
  if (![1, 2].includes(manifest.version) || !Array.isArray(manifest.files) || manifest.profile !== 'core') throw new Error(`Unsupported core manifest in ${home}`);
  for (const file of manifest.files) {
    if (!['AGENTS.md', 'CLAUDE.md', 'AGENTS.override.md'].includes(file.name) || typeof file.inserted !== 'string' || !file.inserted.includes(start) || !file.inserted.includes(end) || typeof file.created !== 'boolean') throw new Error(`Invalid core guidance ownership in ${home}`);
  }
  if (new Set(manifest.files.map(file => file.name)).size !== manifest.files.length) throw new Error(`Duplicate core guidance ownership in ${home}`);
  if (manifest.version === 2) {
    if (!['claude', 'codex'].includes(manifest.host) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.createdDirs)) throw new Error(`Invalid core asset ownership in ${home}`);
    for (const asset of manifest.assets) {
      safeRelative(asset.path, 'manifest asset path');
      if (!/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error(`Invalid asset hash in ${home}`);
    }
    for (const dir of manifest.createdDirs) safeRelative(dir, 'manifest directory path');
    if (new Set(manifest.assets.map(asset => asset.path)).size !== manifest.assets.length) throw new Error(`Duplicate core asset ownership in ${home}`);
  }
  return manifest;
}

function withoutManaged(content, record, file) {
  const text = content === null ? null : content.toString('utf8');
  if (!record) {
    if (text?.includes(start) || text?.includes(end)) throw new Error(`Unowned core markers in ${file}; reconcile them before installing`);
    return text;
  }
  if (text === null || text.split(record.inserted).length !== 2) throw new Error(`Managed guidance modified or missing in ${file}; preserve it and reconcile before updating/removing`);
  const remaining = text.replace(record.inserted, '');
  return record.created && remaining === '' ? null : remaining;
}

function gatherCreatedDirs(home, assets, previous = []) {
  const dirs = new Set(previous);
  for (const relative of assets.keys()) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') {
      const target = safePath(home, parent);
      if (!fs.existsSync(target)) dirs.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return [...dirs].sort((a, b) => b.length - a.length);
}

function planHost(home, host, opts, baseline) {
  for (const legacy of ['etrnl/install.json', 'rules/etrnl', 'hooks/cc-stop-verifier.sh', 'skills/etrnl-dev-execute/SKILL.md']) {
    if (fs.existsSync(path.join(home, legacy))) throw new Error(`Legacy/orchestrated installation in ${home}. Use its recorded rollback before core migration; see docs/migration.md`);
  }
  const old = oldManifest(home);
  if (old?.version === 2 && old.host !== host) throw new Error(`Core manifest host mismatch in ${home}`);
  const selected = host === 'codex' && fs.existsSync(path.join(home, 'AGENTS.override.md')) ? 'AGENTS.override.md' : 'AGENTS.md';
  const targets = opts['--uninstall'] ? [] : [{ name: selected, body: baseline }, ...(host === 'claude' ? [{ name: 'CLAUDE.md', body: '@AGENTS.md\n' }] : [])];
  const names = new Set([...(old?.files || []).map(file => file.name), ...targets.map(file => file.name)]);
  const changes = [], files = [];
  for (const name of names) {
    const before = readPath(home, name);
    const previous = old?.files.find(file => file.name === name);
    const original = withoutManaged(before, previous, path.join(home, name));
    const target = targets.find(file => file.name === name);
    let after = original;
    if (target && !(name === 'CLAUDE.md' && /(?:^|\s)@(?:\.\/)?AGENTS\.md(?=\s|$)/m.test(original || ''))) {
      const separator = original === null || original === '' ? '' : original.endsWith('\n') ? '\n' : '\n\n';
      const inserted = `${separator}${start}\n${target.body.trimEnd()}\n${end}\n`;
      after = (original || '') + inserted;
      files.push({ name, inserted, created: original === null });
    }
    changes.push({ path: name, before, after: after === null ? null : Buffer.from(after) });
  }

  const desiredAssets = opts['--uninstall'] ? new Map() : portableAssets(home);
  const previousAssets = new Map((old?.version === 2 ? old.assets : []).map(asset => [asset.path, asset.sha256]));
  const assetNames = new Set([...previousAssets.keys(), ...desiredAssets.keys()]);
  const assetRecords = [];
  for (const relative of assetNames) {
    const before = readPath(home, relative);
    const previousHash = previousAssets.get(relative);
    if (previousHash && (before === null || hash(before) !== previousHash)) throw new Error(`Managed asset modified or missing at ${path.join(home, relative)}; preserve it and reconcile before updating/removing`);
    const after = desiredAssets.get(relative) ?? null;
    if (!previousHash && before !== null) throw new Error(`Unowned content already exists at ${path.join(home, relative)}; move it before installing core`);
    if (after !== null) assetRecords.push({ path: relative, sha256: hash(after) });
    if (!sameBytes(before, after)) changes.push({ path: relative, before, after });
  }
  const createdDirs = opts['--uninstall'] ? (old?.version === 2 ? old.createdDirs : []) : gatherCreatedDirs(home, desiredAssets, old?.version === 2 ? old.createdDirs : []);
  const manifest = path.join(home, manifestName);
  const nextManifest = opts['--uninstall'] ? null : Buffer.from(`${JSON.stringify({ version: 2, profile: 'core', host, files, assets: assetRecords, createdDirs }, null, 2)}\n`);
  const beforeManifest = readPath(home, manifestName);
  if (!sameBytes(beforeManifest, nextManifest)) changes.push({ path: manifestName, before: beforeManifest, after: nextManifest });
  return { home, host, changes, assetCount: assetRecords.length, changedAssets: changes.filter(change => change.path.startsWith('skills/etrnl-router/')).length, removedAssetCount: opts['--uninstall'] ? (old?.version === 2 ? old.assets.length : 0) : 0, createdDirs: opts['--uninstall'] ? createdDirs : [] };
}

function sameBytes(a, b) { return a === null ? b === null : b !== null && a.equals(b); }

function atomicWrite(file, content) {
  const targetDir = path.dirname(file);
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.core-${process.pid}.tmp`;
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600;
  let created = false;
  try {
    fs.writeFileSync(tmp, content, { mode, flag: 'wx' });
    created = true;
    fs.renameSync(tmp, file);
  } finally { if (created && fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

export function applyPlans(plans, { removeDir = fs.rmdirSync } = {}) {
  const applied = [];
  try {
    for (const plan of plans) {
      for (const change of plan.changes) {
        const file = safePath(plan.home, change.path);
        if (change.after === null) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } else atomicWrite(file, change.after);
        applied.push({ home: plan.home, ...change });
      }
    }
    // Treat owned-directory cleanup as part of the transaction. If an
    // unexpected removal error occurs, the file rollback below restores the
    // manifest and assets (and recreates any directories already removed).
    for (const plan of plans) for (const relative of plan.createdDirs) {
      const dir = safePath(plan.home, relative);
      try { removeDir(dir); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      const file = safePath(change.home, change.path);
      if (change.before === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
      else atomicWrite(file, change.before);
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  const opts = options(process.argv.slice(2));
  if (opts['--help'] || opts['-h']) {
    console.log('Usage: scripts/install.sh [--profile core] [--host both|claude|codex] [--dry-run] [--uninstall]\nOptional target overrides: --claude-home PATH --codex-home PATH\nCore installs a native router skill and private capability library; it installs no hooks, services, settings, agents or plugins.');
  } else {
    const homes = ['claude', 'codex'].filter(host => opts.host === 'both' || opts.host === host).map(host => ({ host, home: canonicalHome(opts[host]) }));
    if (new Set(homes.map(item => item.home)).size !== homes.length) throw new Error('Claude and Codex homes must be different directories');
    const baselinePath = fs.existsSync(path.join(root, 'templates/AGENTS.md')) ? 'templates/AGENTS.md' : 'docs/templates/AGENTS.md';
    const baseline = fs.readFileSync(path.join(root, baselinePath), 'utf8');
    const plans = homes.map(({ home, host }) => planHost(home, host, opts, baseline));
    for (const plan of plans) for (const change of plan.changes) {
      let parent = path.dirname(safePath(plan.home, change.path));
      while (!fs.existsSync(parent) && parent !== path.dirname(parent)) parent = path.dirname(parent);
      try { fs.accessSync(parent, fs.constants.W_OK); }
      catch { throw new Error(`Install target is not writable: ${parent}`); }
    }
    const changes = plans.flatMap(plan => plan.changes.map(change => ({ ...change, home: plan.home, host: plan.host })));
    console.log(`profile=core hosts=${homes.map(item => item.host).join(',')} hooks=0 skills=1 agents=0 services=0 settings=0 auto-update=off`);
    for (const plan of plans) {
      const guidanceChanges = plan.changes.filter(change => ['AGENTS.md', 'CLAUDE.md', 'AGENTS.override.md'].includes(change.path)).length;
      console.log(`${opts['--dry-run'] ? 'Would update' : 'Managed'} ${plan.host} core at ${plan.home}: guidance=${guidanceChanges} assets=${plan.changedAssets} asset-files=${opts['--uninstall'] ? plan.removedAssetCount : plan.assetCount}`);
    }
    if (!opts['--dry-run']) applyPlans(plans);
    console.log(opts['--dry-run'] ? 'Dry run only; no files changed.' : opts['--uninstall'] ? 'Core companion and guidance removed; unrelated content preserved.' : 'Core companion uses native host tools and project verification. Deeper capabilities load on demand.');
  }
} catch (error) { console.error(`core install: ${error.message}`); process.exitCode = 1; }
