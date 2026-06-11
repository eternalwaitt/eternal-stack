#!/usr/bin/env node
/**
 * sync-rule-exports.mjs
 * Project markdown rule modules → Cursor .mdc twins.
 * Validates manifest checksums and privacy banned-token gate.
 *
 * Usage:
 *   node scripts/sync-rule-exports.mjs [--check]
 *   node scripts/sync-rule-exports.mjs --source <file> --manifest <file> --output <dir> [--check]
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const checkMode = args.includes('--check');

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const singleSourceRel = argValue('--source');
const singleManifestRel = argValue('--manifest');
const singleOutputRel = argValue('--output');

const singleSource = singleSourceRel ? resolve(singleSourceRel) : null;
const singleManifest = singleManifestRel ? resolve(singleManifestRel) : null;
const singleOutput = singleOutputRel ? resolve(singleOutputRel) : null;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };
  const yamlText = match[1];
  const frontmatter = {};
  let currentKey = null;
  let inList = false;
  const listValues = [];

  for (const line of yamlText.split('\n')) {
    const listItem = line.match(/^  - (.+)$/);
    if (inList && listItem) {
      listValues.push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    if (inList) {
      frontmatter[currentKey] = [...listValues];
      inList = false;
      listValues.length = 0;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (rest === '') {
      currentKey = key;
      inList = true;
      continue;
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      frontmatter[key] = rest.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    } else if (rest === 'true') {
      frontmatter[key] = true;
    } else if (rest === 'false') {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = rest.replace(/^["']|["']$/g, '');
    }
  }
  if (inList && currentKey) {
    frontmatter[currentKey] = [...listValues];
  }

  const body = content.slice(match[0].length).trimStart();
  return { frontmatter, body };
}

function buildMdcContent(frontmatter, body) {
  const globs = Array.isArray(frontmatter.globs) ? frontmatter.globs : [frontmatter.globs].filter(Boolean);
  const description = (frontmatter.description || '').replace(/"/g, '\\"');
  const alwaysApply = frontmatter.alwaysApply ?? false;

  const globLines = globs.map(g => `  - "${g}"`).join('\n');

  return `---
globs:
${globLines}
alwaysApply: ${alwaysApply}
description: "${description}"
---

${body}`;
}

function checkBannedTokens(content, bannedTokens) {
  return bannedTokens.filter(token =>
    content.toLowerCase().includes(token.toLowerCase())
  );
}

function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function processModule(sourcePath, outputDir, manifest, check) {
  const content = readFileSync(sourcePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.id) throw new Error(`Missing 'id' in frontmatter: ${sourcePath}`);
  if (!frontmatter.globs) throw new Error(`Missing 'globs' in frontmatter: ${sourcePath}`);
  if (!frontmatter.description) throw new Error(`Missing 'description' in frontmatter: ${sourcePath}`);

  const bannedTokens = manifest.privacy?.bannedTokens ?? [];
  const violations = checkBannedTokens(content, bannedTokens);
  if (violations.length > 0) {
    throw new Error(`Privacy violation in ${sourcePath}: banned tokens found: ${violations.join(', ')}`);
  }

  const mdcContent = buildMdcContent(frontmatter, body);
  const mdcPath = join(outputDir, `${frontmatter.id}.mdc`);
  const checksum = sha256(mdcContent);

  if (check) {
    if (!existsSync(mdcPath)) {
      throw new Error(`Drift: expected ${mdcPath} does not exist. Run without --check to generate.`);
    }
    const existing = readFileSync(mdcPath, 'utf8');
    if (existing !== mdcContent) {
      throw new Error(`Drift detected in ${mdcPath}. Run without --check to regenerate.`);
    }
  } else {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(mdcPath, mdcContent, 'utf8');
  }

  return { id: frontmatter.id, checksum, mdcPath };
}

function walkMd(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walkMd(full));
    else if (entry.endsWith('.md')) files.push(full);
  }
  return files;
}

const errors = [];
let exitCode = 0;

if (singleSource) {
  if (!singleManifest || !singleOutput) {
    console.error('--source requires --manifest and --output');
    process.exit(1);
  }
  const manifest = loadManifest(singleManifest);
  try {
    const result = processModule(singleSource, singleOutput, manifest, checkMode);
    console.log(checkMode ? `ok: ${result.mdcPath}` : `Generated: ${result.mdcPath}`);
  } catch (err) {
    console.error(`fail: ${err.message}`);
    exitCode = 1;
  }
} else {
  const manifestPath = resolve(ROOT, 'rules-manifest.json');
  const manifest = loadManifest(manifestPath);
  const rulesRoot = join(ROOT, 'rules', 'eternal-saas');
  const cursorOutputRoot = join(ROOT, 'templates', 'cursor', 'rules', 'eternal-saas');

  const moduleFiles = walkMd(rulesRoot);
  for (const filePath of moduleFiles) {
    const rel = filePath.replace(rulesRoot + '/', '');
    const subDir = dirname(rel);
    const outputDir = subDir === '.' ? cursorOutputRoot : join(cursorOutputRoot, subDir);
    try {
      const result = processModule(filePath, outputDir, manifest, checkMode);
      console.log(checkMode ? `ok: ${rel}` : `Generated: ${result.mdcPath}`);
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
      exitCode = 1;
    }
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`fail: ${e}`);
  }
}

process.exit(exitCode);
