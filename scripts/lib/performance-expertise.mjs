import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const stackRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = s => createHash('sha256').update(s).digest('hex');
export const FEATURES = ['orpc', 'prisma', 'sql', 'react', 'next', 'tanstack-query', 'node', 'cache', 'queues', 'streaming', 'vercel', 'external-services'];
const rule = (id, features, domains, resources) => ({ id, features, domains, resources });
// Paths are logical installed skill paths. Source bundles are resolved below.
export const PERFORMANCE_EXPERTISE = [
  rule('orpc-patterns', ['orpc'], ['requests', 'cache'], ['orpc-patterns/SKILL.md', 'orpc-patterns/references/version-notes.md', 'orpc-patterns/references/middleware-context.md', 'orpc-patterns/references/handlers-adapters.md', 'orpc-patterns/references/client-links.md', 'orpc-patterns/references/plugins-security.md', 'orpc-patterns/references/procedures.md', 'orpc-patterns/references/integrations-observability.md']),
  rule('prisma-expert', ['prisma'], ['database'], ['prisma-expert/SKILL.md']),
  rule('sql-optimization-patterns', ['sql'], ['database'], ['sql-optimization-patterns/SKILL.md']),
  rule('react-next-performance', ['react', 'next'], ['react', 'browser', 'bundle'], ['etrnl-audit-performance/references/domains-browser.md']),
  rule('tanstack-query-performance', ['tanstack-query'], ['requests', 'cache', 'react'], ['etrnl-audit-performance/references/conditional-performance.md']),
  rule('node-profiling', ['node'], ['runtime'], ['etrnl-audit-performance/references/domains-runtime.md']),
  rule('cache-performance', ['cache'], ['cache'], ['etrnl-audit-performance/references/domains-runtime.md']),
  rule('queue-performance', ['queues'], ['background'], ['etrnl-backend-patterns/references/resilience.md', 'etrnl-audit-performance/references/domains-operations.md']),
  rule('streaming-performance', ['streaming'], ['requests', 'runtime'], ['etrnl-audit-performance/references/conditional-performance.md']),
  rule('vercel-performance', ['vercel'], ['platform'], ['etrnl-audit-performance/references/domains-operations.md']),
  rule('dependency-resilience', ['external-services'], ['requests'], ['etrnl-backend-patterns/references/resilience.md']),
];

/** Positive source signals trigger expertise; absence of a pattern never proves absence. */
export function detectPerformanceStack(root, files) {
  const signals = [];
  const add = (feature, file, reason, version = '') => signals.push({ feature, path: file.path, sha256: file.sha256, reason, version });
  for (const file of files) {
    const p = file.path;
    if (!/(?:package\.json|\.(?:prisma|sql|[cm]?[jt]sx?)|vercel\.json)$/.test(p) || /(^|\/)(?:node_modules|vendor)\//.test(p)) continue;
    const text = fs.readFileSync(path.join(root, p), 'utf8');
    if (p.endsWith('package.json')) {
      let pkg;
      try { pkg = JSON.parse(text); } catch { throw new Error(`Invalid package manifest: ${p}`); }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
      for (const [name, version] of Object.entries(deps)) {
        for (const [feature, pattern] of [
          ['orpc', /^@orpc\//], ['prisma', /^(?:prisma|@prisma\/)/], ['sql', /^(?:pg|postgres|mysql2?|better-sqlite3|sqlite3|mssql|knex|kysely|drizzle-orm)$/],
          ['react', /^(?:react|react-dom)$/], ['next', /^next$/], ['tanstack-query', /^@tanstack\/(?:react|vue|svelte|solid)-query$/],
          ['cache', /^(?:redis|ioredis|lru-cache|@upstash\/redis)$/], ['queues', /^(?:bullmq|bull|pg-boss|@aws-sdk\/client-sqs|amqplib)$/],
        ]) if (pattern.test(name)) add(feature, file, `dependency ${name}`, String(version));
      }
      if (pkg.engines?.node) add('node', file, 'Explicit Node runtime declaration', pkg.engines?.node || 'verify deployment runtime');
      if (deps.next) add('react', file, 'Next.js React surface', String(deps.react || 'resolve React version'));
    }
    if (p.endsWith('.prisma')) {
      add('prisma', file, 'Prisma schema');
      if (/provider\s*=\s*"(?:postgresql|mysql|sqlite|sqlserver|cockroachdb)"/.test(text)) add('sql', file, 'relational Prisma datasource');
    }
    if (p.endsWith('.sql')) add('sql', file, 'SQL source');
    if (p.endsWith('vercel.json')) add('vercel', file, 'Vercel deployment configuration');
    if (/\.[cm]?[jt]sx?$/.test(p)) {
      if (/(?:from\s*|import\s*\(|require\s*\()\s*['"]@orpc\//.test(text)) add('orpc', file, 'oRPC import');
      if (/(?:from\s*|import\s*\(|require\s*\()\s*['"]@prisma\//.test(text)) add('prisma', file, 'Prisma import');
      if (/\$(?:queryRaw|executeRaw)\b/.test(text)) add('sql', file, 'raw SQL call');
      if (/\b(?:ReadableStream|TransformStream|WebSocket|eventIterator|streamToEventIterator)\b/.test(text)) add('streaming', file, 'stream or socket surface');
      if (/\bfetch\s*\(\s*['"]https?:\/\//.test(text)) add('external-services', file, 'absolute HTTP request dependency');
    }
  }
  return { signals, features: Object.fromEntries(FEATURES.map(feature => [feature, {
    status: signals.some(s => s.feature === feature) ? 'present' : 'unknown',
    reason: signals.some(s => s.feature === feature) ? 'Positive inventory signal; inspect applicability and versions' : 'Reconcile source and runtime before ruling out',
  }])) };
}

export function resolvePerformanceResource(resource, root = stackRoot) {
  const direct = path.join(root, 'skills', resource);
  const bundled = path.join(root, 'skills/bundled', resource);
  const resolved = fs.existsSync(direct) ? direct : bundled;
  if (!fs.existsSync(resolved)) return { resource, available: false };
  const text = fs.readFileSync(resolved, 'utf8').replaceAll('\r\n', '\n');
  const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || resource;
  return { resource, available: true, path: path.relative(root, resolved).split(path.sep).join('/'), name, sha256: hash(text) };
}

export function planPerformanceExpertise(stack, root = stackRoot) {
  const present = feature => stack?.features?.[feature]?.status === 'present';
  return PERFORMANCE_EXPERTISE.filter(r => r.features.some(present)).map(r => {
    const resources = [...r.resources];
    if (r.id === 'orpc-patterns' && present('tanstack-query')) resources.push('orpc-patterns/references/tanstack-query.md');
    if (r.id === 'orpc-patterns' && present('streaming')) resources.push('orpc-patterns/references/streaming-files-serialization.md');
    // Every contributor is fenced by version-aware performance rules, even if
    // its original scope includes implementation, migrations or generic advice.
    resources.push('etrnl-audit-performance/references/conditional-performance.md');
    return { id: r.id, features: r.features.filter(present), domains: r.domains, resources: [...new Set(resources)].map(p => resolvePerformanceResource(p, root)) };
  });
}

export function validatePerformanceExpertise(contract, checks, verifyArtifact, root = stackRoot) {
  const errors = [], stack = contract.stack;
  if (!stack || !Array.isArray(stack.signals) || !stack.features) return ['stack signals and explicit feature classifications required'];
  for (const feature of FEATURES) {
    const f = stack.features[feature];
    if (!['present', 'absent', 'unknown'].includes(f?.status) || typeof f?.reason !== 'string' || !f.reason.trim()) errors.push(`stack ${feature}: classification and reason required`);
    if (f?.status === 'unknown' && !contract.receipts.some(r => r.status === 'source_limited')) errors.push(`stack ${feature}: unknown applicability cannot close clean`);
  }
  for (const signal of stack.signals) {
    if (!signal || !FEATURES.includes(signal.feature) || !contract.inventory.files.some(f => f.path === signal.path && f.sha256 === signal.sha256)) { errors.push('stack signal must bind to an inventoried file'); continue; }
    if (stack.features[signal.feature]?.status !== 'present') errors.push(`positive ${signal.feature} signal cannot be silently disabled`);
  }
  const expected = planPerformanceExpertise(stack, root), receipts = contract.expertise;
  if (!Array.isArray(receipts)) return [...errors, 'expertise load receipts required'];
  if (JSON.stringify(receipts.map(r => r?.id).sort()) !== JSON.stringify(expected.map(r => r.id).sort())) errors.push('every applicable specialist must have exactly one load receipt');
  for (const plan of expected) {
    const receipt = receipts.find(r => r?.id === plan.id);
    if (!receipt) continue;
    const applicable = checks.filter(c => plan.domains.includes(c.domain) && contract.surfaces.some(s => s.domains.includes(c.domain))).map(c => c.id);
    if (!applicable.length) errors.push(`${plan.id}: detected expertise has no classified performance surface`);
    if (JSON.stringify((Array.isArray(receipt.checkIds) ? [...receipt.checkIds] : []).sort()) !== JSON.stringify(applicable.sort())) errors.push(`${plan.id}: specialist check coverage mismatch`);
    if (receipt.status === 'blocked') {
      if (contract.completion?.status === 'complete' || !receipt.blocker?.dependency || !receipt.blocker?.action || applicable.some(id => contract.receipts.find(r => r.id === id)?.status === 'confirmed_clean')) errors.push(`${plan.id}: specialist blocker cannot remove coverage or allow clean`);
      continue;
    }
    if (receipt.status !== 'loaded' || !receipt.versionReview || !receipt.application || !Array.isArray(receipt.artifacts) || !receipt.artifacts.length) errors.push(`${plan.id}: loaded specialist requires version review, application notes and evidence`);
    for (const a of Array.isArray(receipt.artifacts) ? receipt.artifacts : []) verifyArtifact(a, errors, plan.id);
    if (!Array.isArray(receipt.resources) || JSON.stringify(receipt.resources.map(r => r?.resource).sort()) !== JSON.stringify(plan.resources.map(r => r.resource).sort())) { errors.push(`${plan.id}: required reference omitted`); continue; }
    for (const resource of plan.resources) {
      const loaded = receipt.resources.find(r => r?.resource === resource.resource);
      if (!resource.available || loaded?.sha256 !== resource.sha256) errors.push(`${plan.id}: missing or stale specialist resource ${resource.resource}`);
    }
  }
  return errors;
}
