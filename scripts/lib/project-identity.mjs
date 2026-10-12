import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROJECT_STATE_PATHS, STATE_MAX_BYTES } from './project-state-format.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 2000, maxBuffer: 5 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export function validIdentity(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value); }
export function safeOverviewPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.posix.isAbsolute(relative) || relative.includes('\\') || !relative.endsWith('.md') || relative.split('/').some(part => !part || part === '..' || part === '.' || part.startsWith('.'))) throw new Error('state path must be a relative public Markdown document inside the project');
  let file = root;
  for (const part of relative.split('/')) {
    file = path.join(file, part);
    try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('project state path cannot contain symlinks'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (fs.existsSync(file) && (!fs.statSync(file).isFile() || fs.statSync(file).size > STATE_MAX_BYTES)) throw new Error('project state must be a bounded regular file');
  return file;
}
export function stateDeclaration(text, relative) {
  const match = text.split(/\r?\n/, 1)[0].match(/^<!-- etrnl:project-state (\{.*\}) -->$/);
  if (!match) return null;
  let declaration; try { declaration = JSON.parse(match[1]); } catch { throw new Error('invalid project state declaration'); }
  if (declaration.version !== 1 || !validIdentity(declaration.projectId) || declaration.path !== relative || Object.keys(declaration).some(key => !['version', 'projectId', 'path'].includes(key))) throw new Error('project state declaration does not match its document');
  return declaration;
}
export function discoverStatePaths(root) {
  const candidates = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  if (candidates.length > 10000) throw new Error('project state discovery exceeds bounded inventory');
  const found = new Set(PROJECT_STATE_PATHS.filter(relative => candidates.includes(relative)));
  for (const relative of new Set(candidates.filter(relative => relative.endsWith('.md')))) {
    if (PROJECT_STATE_PATHS.includes(relative)) continue;
    // Only a self-declared existing overview qualifies for neutral generated text.
    let file; try { file = safeOverviewPath(root, relative); } catch { continue; }
    if (!fs.existsSync(file)) continue;
    const fd = fs.openSync(file, 'r'); const bytes = Buffer.alloc(1024); let size;
    try { size = fs.readSync(fd, bytes, 0, bytes.length, 0); } finally { fs.closeSync(fd); }
    if (bytes.subarray(0, size).toString().startsWith('<!-- etrnl:project-state ')) {
      stateDeclaration(fs.readFileSync(file, 'utf8'), relative); found.add(relative);
    }
  }
  return [...found].sort();
}
export function projectIdentity(cwd = process.cwd(), { projectId = '', statePath = '' } = {}) {
  let root = fs.realpathSync(cwd), branch = '', gitRoot = false;
  try { root = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel'])); branch = git(root, ['branch', '--show-current']); gitRoot = true; } catch { /* non-Git contexts remain machine scoped until explicitly bound */ }
  const declared = [];
  if (gitRoot) for (const relative of statePath ? [statePath] : discoverStatePaths(root)) {
    const file = safeOverviewPath(root, relative);
    if (fs.existsSync(file)) { const binding = stateDeclaration(fs.readFileSync(file, 'utf8'), relative); if (binding) declared.push(binding.projectId); }
  }
  if (new Set(declared).size > 1) throw new Error('conflicting portable project identities; reconcile declarations');
  if (projectId && !validIdentity(projectId)) throw new Error('invalid portable project ID');
  if (projectId && declared[0] && projectId !== declared[0]) throw new Error('project ID conflicts with authored declaration');
  let identityKind = 'authored', id = projectId || declared[0];
  if (!id) {
    try {
      const roots = git(root, ['rev-list', '--max-parents=0', '--all']).split('\n').filter(Boolean).sort();
      if (!roots.length) throw new Error('unborn');
      id = `git-${hash(roots.join('\n')).slice(0, 32)}`; identityKind = 'git-history';
    } catch { id = `local-${hash(root).slice(0, 32)}`; identityKind = 'machine-local'; }
  }
  return { projectId: id, root, worktreeId: hash(root).slice(0, 24), branch, identityKind };
}
export function projectDeclaration(identity, relative) { return `<!-- etrnl:project-state ${JSON.stringify({ version: 1, projectId: identity.projectId, path: relative })} -->\n`; }
