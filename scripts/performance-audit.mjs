#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PERFORMANCE_CHECKS, PERFORMANCE_CONTRACT_VERSION, digest, dispatchPerformance, validatePerformanceContract } from './lib/performance-contract.mjs';
import { detectPerformanceStack, planPerformanceExpertise, PERFORMANCE_EXPERTISE, resolvePerformanceResource } from './lib/performance-expertise.mjs';
import { performanceCells, reconcilePerformanceFindings } from './lib/performance-depth.mjs';

export function discover(root) {
  const paths = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const files = [...new Set(paths)].sort().map(p => ({ path: p, sha256: digest(fs.readFileSync(path.join(root, p))) }));
  const inventory = { files, sha256: digest(files), command: 'git ls-files --cached --others --exclude-standard -z; SHA-256 each file', revision: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  // Conservative: unknown stacks keep every domain pending. Detection hints are
  // investigation leads, never an automatic not-applicable decision.
  const domains = [...new Set(PERFORMANCE_CHECKS.map(c => c.domain))];
  const surfaces = [{ id: 'unclassified-source', files: files.map(f => f.path), domains, journeys: [] }];
  const hints = files.filter(f => /package\.json$|\.(sql|prisma|csproj)$|go\.mod$|Cargo\.toml$|pyproject\.toml$|routes?|pages?|worker|queue|cron|Dockerfile|vercel/i.test(f.path)).map(f => f.path);
  const stack = detectPerformanceStack(root, files);
  return { version: PERFORMANCE_CONTRACT_VERSION, runId: randomUUID(), targetId: `git:${path.basename(root)}`, mode: 'audit', inventory, surfaces, exclusions: [], hints, stack,
    expertise: planPerformanceExpertise(stack).map(p => ({ ...p, checkIds: PERFORMANCE_CHECKS.filter(c => p.domains.includes(c.domain)).map(c => c.id), status: 'blocked', blocker: { dependency: 'specialist investigation pending', action: 'Read the listed skill/resources, apply them to every assigned check, retain evidence and record loaded receipt' } })),
    completion: { status: 'source_limited', findingLimit: null, cellLimit: null }, findings: [], rounds: [], rerun: { mode: 'first_run', historySearch: '', quality: 'first_run' },
    discoveryReview: { routeCommand: '', runtimeCommand: '', limitations: 'Pending route manifest, runtime registration, ignored/generated surfaces and external-system reconciliation. Filename hints are not complete semantic discovery.' },
    receipts: PERFORMANCE_CHECKS.map(c => ({ id: c.id, surfaceIds: ['unclassified-source'], journeyIds: [], itemCount: 1, journeyCount: 0, inventoryHash: inventory.sha256, status: 'source_limited', reason: 'Discovery classification and investigation pending', blocker: { dependency: 'classified source/runtime surfaces and representative journeys', action: `Load ${c.reference}, reconcile runtime manifests, classify surfaces and investigate ${c.id}` }, dispatch: dispatchPerformance(c) })) };
}

export function distributionFiles(root) {
  const out = [];
  const visit = rel => {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) { out.push({ path: rel, sha256: null }); return; }
    if (fs.statSync(target).isDirectory()) for (const name of fs.readdirSync(target).sort()) visit(`${rel}/${name}`);
    // Git checkouts differ by LF/CRLF on supported hosts. Distribution parity
    // normalizes text newlines only; raw measurement evidence remains byte-exact.
    else out.push({ path: rel, sha256: digest(fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n')) });
  };
  for (const rel of ['skills/etrnl-audit-performance', 'scripts/performance-audit.mjs', 'scripts/performance-baseline.mjs', 'scripts/deep-audit-artifact-check.mjs', 'scripts/lib']) visit(rel);
  const resources = [...new Set([...PERFORMANCE_EXPERTISE.flatMap(r => r.resources), 'orpc-patterns/references/tanstack-query.md', 'orpc-patterns/references/streaming-files-serialization.md'])];
  for (const resource of resources) {
    if (resource.startsWith('etrnl-audit-performance/')) continue;
    const resolved = resolvePerformanceResource(resource, root);
    out.push({ path: `skills/${resource}`, sha256: resolved.sha256 || null });
  }
  return out;
}

export function parity(source, target) {
  const expected = distributionFiles(source), actual = new Map(distributionFiles(target).map(f => [f.path, f.sha256]));
  const drift = expected.filter(f => !f.sha256 || actual.get(f.path) !== f.sha256).map(f => ({ path: f.path, sourceHash: f.sha256, targetHash: actual.get(f.path) ?? null }));
  const sourcePaths = new Set(expected.map(f => f.path));
  for (const [p, sha256] of actual) if (!sourcePaths.has(p)) drift.push({ path: p, sourceHash: null, targetHash: sha256 });
  return drift;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second] = process.argv.slice(2);
  try {
    if (command === 'discover' && first) console.log(JSON.stringify(discover(path.resolve(first)), null, 2));
    else if (['experts', 'cells', 'reconcile'].includes(command) && first) {
      const contract = JSON.parse(fs.readFileSync(first, 'utf8'));
      if (command === 'experts') console.log(JSON.stringify(planPerformanceExpertise(contract.stack, second ? path.resolve(second) : undefined), null, 2));
      if (command === 'cells') console.log(JSON.stringify(performanceCells(contract, PERFORMANCE_CHECKS), null, 2));
      if (command === 'reconcile') {
        if (!second) throw new Error('reconcile requires previous and current contract paths');
        console.log(JSON.stringify(reconcilePerformanceFindings(contract, JSON.parse(fs.readFileSync(second, 'utf8'))), null, 2));
      }
    }
    else if (command === 'parity' && first && second) {
      const drift = parity(path.resolve(first), path.resolve(second));
      console.log(JSON.stringify({ synchronized: drift.length === 0, drift }, null, 2));
      process.exitCode = drift.length ? 1 : 0;
    } else if (command === 'validate' && first) {
      const errors = validatePerformanceContract(JSON.parse(fs.readFileSync(first, 'utf8')), path.dirname(path.resolve(first)));
      console.log(JSON.stringify({ ok: !errors.length, errors }, null, 2)); process.exitCode = errors.length ? 1 : 0;
    } else throw new Error('Usage: performance-audit.mjs discover <git-root> | experts <contract.json> [stack-root] | cells <contract.json> | reconcile <previous.json> <current.json> | validate <contract.json> | parity <source-root> <installed-or-staged-root>');
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
