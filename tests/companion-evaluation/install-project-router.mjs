#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const project = process.argv[2] ? fs.realpathSync(process.argv[2]) : null;
if (!project || !path.basename(project).startsWith('etrnl-eval-')) throw new Error('usage: node install-project-router.mjs <temporary etrnl-eval-* project>');
const home = path.join(project, '.candidate-home');
if (fs.existsSync(home)) throw new Error(`candidate home already exists: ${home}`);
const result = spawnSync('bash', [path.join(repo, 'scripts/install.sh'), '--profile', 'core', '--host', 'codex', '--codex-home', home], {
  cwd: repo,
  encoding: 'utf8',
  env: process.env,
  timeout: 60_000,
  maxBuffer: 4 * 1024 * 1024,
});
if (result.error || result.status !== 0) throw new Error(`temporary core install failed: ${result.stderr || result.error || result.status}`);
const source = path.join(home, 'skills/etrnl-router');
const discovery = path.join(project, '.agents/skills/etrnl-router');
fs.mkdirSync(discovery, { recursive: true });
for (const file of ['SKILL.md', 'capability-index.json']) fs.copyFileSync(path.join(source, file), path.join(discovery, file));
const instructions = '# Evaluation companion setup\n\nUse the available Eternal Stack companion entrypoint at .agents/skills/etrnl-router/SKILL.md to handle coding tasks in this fixture. Its portable capability library is installed at .candidate-home/etrnl/library; use the rendered helper path in the skill.\n';
fs.writeFileSync(path.join(project, 'AGENTS.md'), instructions, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ project, candidateHome: home, discoveredSkill: path.relative(project, path.join(discovery, 'SKILL.md')), library: path.relative(project, path.join(home, 'etrnl/library')), installSummary: result.stdout.trim() })}\n`);
