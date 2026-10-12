#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repo, '.audit/companion-evaluation/runs');
const defaults = { host: 'codex', condition: null, cwd: null, promptFile: null, name: null, seconds: 180, output: null, model: 'gpt-6.1-sol', persistSession: false };
const options = { ...defaults };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];
  if (flag === '--persist-session') {
    options.persistSession = true;
    continue;
  }
  const key = ({ '--host': 'host', '--condition': 'condition', '--cwd': 'cwd', '--prompt-file': 'promptFile', '--name': 'name', '--seconds': 'seconds', '--output': 'output', '--model': 'model' })[flag];
  if (!key || args[i + 1] === undefined || args[i + 1].startsWith('--')) fail(`unknown or incomplete option: ${flag}`);
  const value = args[++i];
  options[key] = key === 'seconds' ? Number(value) : value;
}

function fail(message) {
  process.stderr.write(`${message}\nusage: node scripts/companion-evaluate.mjs --host codex --condition native|candidate --cwd <temp-project> --prompt-file <fixture-prompt> --name <run-name> [--model <model>] [--seconds 180] [--persist-session] [--output <ignored-log-dir>]\n`);
  process.exit(2);
}

if (options.host !== 'codex') fail('only the authenticated Codex path is enabled for this evaluation');
if (!['native', 'candidate'].includes(options.condition)) fail('--condition must be native or candidate');
if (!options.cwd || !options.promptFile || !options.name) fail('--cwd, --prompt-file and --name are required');
if (!Number.isInteger(options.seconds) || options.seconds < 1 || options.seconds > 300) fail('--seconds must be between 1 and 300');
if (typeof options.model !== 'string' || !options.model.trim()) fail('--model must name a model');
const cwd = fs.realpathSync(path.resolve(options.cwd));
const tempRoot = fs.realpathSync(os.tmpdir());
if (!cwd.startsWith(`${tempRoot}${path.sep}`) || !path.basename(cwd).startsWith('etrnl-eval-')) fail('--cwd must be a temporary etrnl-eval-* project directory');
if (!fs.statSync(cwd).isDirectory()) fail('--cwd must be a directory');
const promptFile = path.resolve(options.promptFile);
if (!promptFile.startsWith(`${repo}/tests/companion-evaluation/`)) fail('--prompt-file must come from the checked-in synthetic evaluation suite');
const prompt = fs.readFileSync(promptFile, 'utf8').trim();
if (!prompt) fail('prompt file is empty');
const name = options.name.replace(/[^a-zA-Z0-9._-]/g, '-');
const outDir = path.resolve(options.output || path.join(artifactRoot, options.condition, name));
if (!outDir.startsWith(`${artifactRoot}${path.sep}`)) fail('--output must remain under ignored .audit/companion-evaluation/runs');
if (fs.existsSync(outDir)) fail(`output directory already exists: ${outDir}`);
fs.mkdirSync(outDir, { recursive: true });

const binary = process.env.CODEX_BIN || 'codex';
const versionResult = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000 });
if (versionResult.status !== 0) fail(`cannot read Codex version: ${versionResult.stderr || versionResult.error}`);
let resolvedBinary = binary;
if (binary.includes(path.sep)) resolvedBinary = fs.realpathSync(binary);
else {
  const match = (process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, binary)).find(candidate => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  });
  if (match) resolvedBinary = fs.realpathSync(match);
}
const staticArgs = ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', ...(options.persistSession ? [] : ['--ephemeral']), '--sandbox', 'workspace-write', '--model', options.model, '--json', '--cd', cwd];
const promptHash = createHash('sha256').update(prompt).digest('hex');
const metadata = {
  schemaVersion: 1,
  host: 'codex',
  condition: options.condition,
  cliVersion: versionResult.stdout.trim(),
  model: options.model,
  cliPath: resolvedBinary,
  sandbox: 'workspace-write',
  userConfig: 'ignored',
  sessionPersistence: options.persistSession ? 'persistent' : 'ephemeral',
  cwd,
  promptFile: path.relative(repo, promptFile),
  promptSha256: promptHash,
  startedAt: new Date().toISOString(),
  timeoutSeconds: options.seconds,
};
fs.writeFileSync(path.join(outDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);

const stdout = fs.createWriteStream(path.join(outDir, 'stdout.jsonl'), { flags: 'wx' });
const stderr = fs.createWriteStream(path.join(outDir, 'stderr.log'), { flags: 'wx' });
const startedMonotonic = performance.now();
const child = spawn(binary, [...staticArgs, prompt], { cwd, env: process.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
const resources = {
  sampleIntervalMs: 100, samples: 0, sampleErrors: 0,
  peakGroupRssKiB: 0, peakGroupProcesses: 0, stdoutBytes: 0, stderrBytes: 0,
  scope: 'sampled POSIX process group; RSS sum can double-count shared pages; detached descendants excluded',
};
child.stdout.on('data', chunk => { resources.stdoutBytes += chunk.length; });
child.stderr.on('data', chunk => { resources.stderrBytes += chunk.length; });
function sampleResources() {
  if (!child.pid || process.platform === 'win32') return;
  const result = spawnSync('ps', ['-axo', 'pgid=,rss='], { encoding: 'utf8', timeout: 1000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) { resources.sampleErrors += 1; return; }
  let count = 0, rss = 0;
  for (const row of result.stdout.trim().split('\n')) {
    const [group, memory] = row.trim().split(/\s+/).map(Number);
    if (group === child.pid) { count += 1; rss += memory; }
  }
  resources.samples += 1;
  resources.peakGroupProcesses = Math.max(resources.peakGroupProcesses, count);
  resources.peakGroupRssKiB = Math.max(resources.peakGroupRssKiB, rss);
}
const sampler = setInterval(sampleResources, resources.sampleIntervalMs);
let timedOut = false;
let interrupted = null;
let killTimer = null;
function signalChildGroup(signal) {
  if (!child.pid) return;
  try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); } catch {}
}
function scheduleEscalation() {
  if (killTimer) return;
  killTimer = setTimeout(() => signalChildGroup('SIGKILL'), 3000);
}
const timeout = setTimeout(() => {
  timedOut = true;
  signalChildGroup('SIGTERM');
  scheduleEscalation();
}, options.seconds * 1000);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = signal;
    signalChildGroup(signal);
    scheduleEscalation();
  });
}

// A CLI may exit successfully while leaving children holding its pipes open.
// Always close its process group; do not wait for pipe closure to begin cleanup.
child.on('exit', () => {
  signalChildGroup('SIGTERM');
  scheduleEscalation();
});
child.on('error', error => {
  metadata.spawnError = error.message;
});
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  clearInterval(sampler);
  // Keep escalation alive even if descendants closed their inherited pipes.
  stdout.end();
  stderr.end();
  metadata.elapsedMs = Math.round(performance.now() - startedMonotonic);
  metadata.resources = resources;
  metadata.exitCode = code;
  metadata.signal = signal;
  metadata.timedOut = timedOut;
  metadata.interrupted = interrupted;
  metadata.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: path.relative(repo, outDir), ...metadata })}\n`);
  process.exitCode = timedOut ? 124 : interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : (code ?? 1);
});
