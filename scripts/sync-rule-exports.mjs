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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { argValue } from './lib/cli-args.mjs';
import { walkFiles as walkTree } from './lib/fs-walk.mjs';
import { gitSubprocessLimits } from './lib/env-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Bound the `git ls-files` subprocess with the repo's shared timeout/buffer
// precedence (ETRNL_GIT_TIMEOUT_MS/GIT_TIMEOUT_MS, ETRNL_GIT_MAX_BUFFER_BYTES/…)
// so a hung or pathological git invocation cannot stall the sync indefinitely.
const GIT_LIMITS = gitSubprocessLimits({ timeoutMs: 10_000, maxBufferBytes: 64 * 1024 * 1024 });

const args = process.argv.slice(2);
const checkMode = args.includes('--check');

// Reuse the shared CLI parser (scripts/lib/cli-args.mjs): first-occurrence wins,
// `--flag=value`/`--flag value` both supported, a following `--flag` is not taken
// as a value, and `--flag=`/missing returns the fallback. A `null` fallback keeps
// the `?? env ?? null` chain and the `x ? resolve(x) : null` guards below working.

// Full-mode root override: honor --root <dir> then ETRNL_RULES_ROOT so full-mode
// (no --source) can be pointed at an isolated fixture. Default is unchanged
// (__dirname/..), so existing invocations behave identically.
const rootOverride = argValue(args, '--root', null) ?? process.env.ETRNL_RULES_ROOT ?? null;
const ROOT = rootOverride ? resolve(rootOverride) : resolve(__dirname, '..');

const singleSourceRel = argValue(args, '--source', null);
const singleManifestRel = argValue(args, '--manifest', null);
const singleOutputRel = argValue(args, '--output', null);

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

/**
 * Resolves the effective banned-token denylist: the (empty in the tracked repo)
 * manifest list unioned with the gitignored overlay named by
 * privacy.bannedTokensSource. A fresh public clone has no overlay, so the list
 * is empty and the gate is a correct no-op; the private names only ever live in
 * the local overlay. If a source is declared but absent, warn instead of failing
 * so clones and CI still pass while surfacing that the gate is inactive locally.
 */
/**
 * Keep only usable denylist tokens: non-empty strings. A non-string (e.g. `123`)
 * would crash the case-insensitive match at `token.toLowerCase()`, and an empty or
 * whitespace-only token matches every file — so both are dropped, giving loading,
 * the health check, and tests one canonical schema.
 */
function sanitizeBannedTokens(list) {
  // Trim as a TRANSFORM, not just a predicate: a token with surrounding whitespace
  // (" acme ") must scan as its trimmed value ("acme"), or the case-insensitive
  // includes() would false-negative while doctor still reports the overlay active.
  return (Array.isArray(list) ? list : [])
    .filter((token) => typeof token === 'string')
    .map((token) => token.trim())
    .filter(Boolean);
}

function loadBannedTokens(manifest, root) {
  const inline = sanitizeBannedTokens(manifest.privacy?.bannedTokens);
  const sourceRel = manifest.privacy?.bannedTokensSource;
  let overlay = [];
  if (sourceRel) {
    const overlayPath = resolve(root, sourceRel);
    if (existsSync(overlayPath)) {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(overlayPath, 'utf8'));
      } catch (err) {
        throw new Error(`Banned-token overlay ${sourceRel} is not valid JSON: ${err.message}`);
      }
      // Optional chaining: a top-level `null` (or non-object) overlay must be treated
      // as unusable, not dereferenced — `null.bannedTokens` throws and would take down
      // the whole sync. sanitizeBannedTokens turns the resulting undefined into [], so
      // the "privacy denylist inactive" warning path below stays active.
      const usable = sanitizeBannedTokens(parsed?.bannedTokens);
      if (usable.length > 0) {
        overlay = usable;
      } else {
        // Overlay exists but carries no usable denylist (key missing, not an
        // array, emptied, or only non-string/blank entries). Without this warning
        // the privacy scan would silently become a no-op and exit 0 — a fail-open.
        // Match the absent-overlay branch: warn, do not fail, so clones/CI pass.
        console.warn(`warn: banned-token overlay ${sourceRel} has no usable bannedTokens array (needs a non-empty array of non-empty strings); privacy denylist inactive for this checkout`);
      }
    } else {
      console.warn(`warn: banned-token overlay ${sourceRel} is absent; privacy denylist inactive for this checkout`);
    }
  }
  return [...new Set([...inline, ...overlay])];
}

/**
 * Recursively collects files under dir whose extension is in exts.
 * Delegates the tree recursion to the shared walkFiles helper (scripts/lib/fs-walk.mjs).
 */
function walkFiles(dir, exts) {
  return [...walkTree(dir)].filter((full) => exts.some((ext) => full.endsWith(ext)));
}

// Textual file extensions worth scanning for a leaked private identity. Binary
// assets (images, fonts, archives) can't carry a readable token and are skipped.
const TEXTUAL_EXTENSIONS = [
  '.sh', '.bash', '.zsh',
  '.json', '.jsonl', '.json5',
  '.md', '.mdc', '.txt', '.rst',
  '.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.example', '.sample', '.template',
  '.html', '.css', '.xml', '.svg', '.csv',
];

// Extensionless tracked files that are still plain text and can carry an identity.
const TEXTUAL_BASENAMES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'Dockerfile', 'Makefile', 'LICENSE', 'VERSION',
  'CODEOWNERS', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc',
]);

function isTextualPath(rel) {
  const base = basename(rel);
  if (TEXTUAL_BASENAMES.has(base)) return true;
  return TEXTUAL_EXTENSIONS.some((ext) => rel.endsWith(ext));
}

/**
 * Enumerates every tracked textual file via `git ls-files`, excluding the `.mdc`
 * twins this script generates (checked separately by the per-module scan/drift
 * gate). Falls back to the manifest + tests/ walk when git is unavailable (e.g. a
 * non-repo install home) — safe because scanExtraSurfaces only runs when a private
 * overlay is present, which only ever happens inside the source git checkout.
 */
function listTrackedTextualFiles(root) {
  let tracked;
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], {
      encoding: 'utf8',
      ...GIT_LIMITS,
    });
    tracked = out.split('\0').filter(Boolean);
  } catch {
    return [
      'rules-manifest.json',
      ...walkFiles(join(root, 'tests'), TEXTUAL_EXTENSIONS).map((f) => f.replace(root + '/', '')),
    ];
  }
  return tracked
    // Generated Cursor `.mdc` twins are produced from the rule modules, which the
    // per-module scan already covers; excluding them avoids a redundant re-report.
    .filter((rel) => !rel.startsWith('templates/cursor/'))
    .filter((rel) => isTextualPath(rel));
}

/**
 * Scans every tracked textual surface — scripts, docs, agents, skills, templates,
 * configuration, tests, and the manifest — for banned tokens, not just the manifest
 * and tests/ (where private names leaked before). Returns one REDACTED message per
 * offending file: the path and match count only, never the matched private value.
 */
function scanExtraSurfaces(bannedTokens, root) {
  if (bannedTokens.length === 0) return [];
  const found = [];
  for (const rel of listTrackedTextualFiles(root)) {
    let content;
    try {
      content = readFileSync(resolve(root, rel), 'utf8');
    } catch {
      continue;
    }
    const hits = checkBannedTokens(content, bannedTokens);
    if (hits.length > 0) {
      found.push(`${rel}: privacy violation (${hits.length} banned token match${hits.length === 1 ? '' : 'es'})`);
    }
  }
  return found;
}

function processModule(sourcePath, outputDir, manifest, check, bannedTokens) {
  const content = readFileSync(sourcePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.id) throw new Error(`Missing 'id' in frontmatter: ${sourcePath}`);
  if (!frontmatter.globs) throw new Error(`Missing 'globs' in frontmatter: ${sourcePath}`);
  if (!frontmatter.description) throw new Error(`Missing 'description' in frontmatter: ${sourcePath}`);

  const violations = checkBannedTokens(content, bannedTokens);
  if (violations.length > 0) {
    // Redact: report the count only, never echo the matched private value into logs.
    throw new Error(`Privacy violation in ${sourcePath}: ${violations.length} banned token match${violations.length === 1 ? '' : 'es'} (values redacted)`);
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
  return [...walkTree(dir)].filter((full) => full.endsWith('.md'));
}

const errors = [];
let exitCode = 0;

if (singleSource) {
  if (!singleManifest || !singleOutput) {
    console.error('--source requires --manifest and --output');
    process.exit(1);
  }
  const manifest = loadManifest(singleManifest);
  const bannedTokens = loadBannedTokens(manifest, dirname(singleManifest));
  try {
    const result = processModule(singleSource, singleOutput, manifest, checkMode, bannedTokens);
    console.log(checkMode ? `ok: ${result.mdcPath}` : `Generated: ${result.mdcPath}`);
  } catch (err) {
    console.error(`fail: ${err.message}`);
    exitCode = 1;
  }
} else {
  const manifestPath = resolve(ROOT, 'rules-manifest.json');
  const manifest = loadManifest(manifestPath);
  const bannedTokens = loadBannedTokens(manifest, ROOT);
  const rulesRoot = join(ROOT, 'rules', 'eternal-saas');
  const cursorOutputRoot = join(ROOT, 'templates', 'cursor', 'rules', 'eternal-saas');

  const moduleFiles = walkMd(rulesRoot);
  for (const filePath of moduleFiles) {
    const rel = filePath.replace(rulesRoot + '/', '');
    const subDir = dirname(rel);
    const outputDir = subDir === '.' ? cursorOutputRoot : join(cursorOutputRoot, subDir);
    try {
      const result = processModule(filePath, outputDir, manifest, checkMode, bannedTokens);
      console.log(checkMode ? `ok: ${rel}` : `Generated: ${result.mdcPath}`);
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
      exitCode = 1;
    }
  }
  for (const violation of scanExtraSurfaces(bannedTokens, ROOT)) {
    errors.push(violation);
    exitCode = 1;
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`fail: ${e}`);
  }
}

process.exit(exitCode);
