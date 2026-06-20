#!/usr/bin/env node
/**
 * sync-rule-exports.mjs
 * Project markdown rule modules -> Cursor .mdc twins + manifest index.
 *
 * Usage:
 *   node scripts/sync-rule-exports.mjs [--check]
 *   node scripts/sync-rule-exports.mjs --source <file> --manifest <file> --output <dir> [--check]
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
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

function parseInlineArray(value) {
  const items = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (char === quote) {
      quote = '';
      current += char;
      continue;
    }
    if (char === ',' && !quote) {
      items.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim().replace(/^["']|["']$/g, ''));
  return items;
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
      frontmatter[key] = parseInlineArray(rest.slice(1, -1));
    } else if (rest === 'true') {
      frontmatter[key] = true;
    } else if (rest === 'false') {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = rest.replace(/^["']|["']$/g, '');
    }
  }
  if (inList && currentKey) frontmatter[currentKey] = [...listValues];

  return { frontmatter, body: content.slice(match[0].length).trimStart() };
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function buildMdcContent(frontmatter, body) {
  const globLines = arrayValue(frontmatter.globs).map((glob) => `  - "${glob}"`).join('\n');
  const description = (frontmatter.description || '').replace(/"/g, '\\"');
  const alwaysApply = frontmatter.alwaysApply ?? false;
  return `---\nglobs:\n${globLines}\nalwaysApply: ${alwaysApply}\ndescription: "${description}"\n---\n\n${body}`;
}

function checkBannedTokens(content, bannedTokens) {
  return bannedTokens.filter((token) => content.toLowerCase().includes(String(token).toLowerCase()));
}

function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bannedTokens = privacyTokens(manifest, dirname(manifestPath));
  Object.defineProperty(manifest, '_privacyTokens', {
    value: bannedTokens,
    enumerable: false,
  });
  return manifest;
}

function localPrivacyTokens(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`malformed local privacy JSON in ${filePath}: ${error.message}`);
    }
    if (Array.isArray(parsed)) return parsed;
    return arrayValue(parsed.privacy?.bannedTokens || parsed.bannedTokens);
  }
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function privacyTokens(manifest, manifestDir) {
  const tokens = [...arrayValue(manifest.privacy?.bannedTokens)];
  for (const relPath of arrayValue(manifest.privacy?.localTokenFiles)) {
    tokens.push(...localPrivacyTokens(resolve(manifestDir, relPath)));
  }
  return [...new Set(tokens.map((token) => String(token).trim()).filter(Boolean))];
}

function sourceRelKey(sourcePath, rulesRoot) {
  return relative(rulesRoot, sourcePath).replace(/\\/g, '/').replace(/\.md$/, '');
}

function moduleSourcePath(key, rulesRoot) {
  return join(rulesRoot, `${key}.md`);
}

function walkMd(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    throw new Error(`cannot read rule directory ${dir}: ${error.message}`);
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(full);
    } catch (error) {
      throw new Error(`cannot stat rule path ${full}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) files.push(...walkMd(full));
    else if (entry.endsWith('.md')) files.push(full);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function expandProfileModules(manifest, profileName, seen = new Set()) {
  if (seen.has(profileName)) throw new Error(`Profile cycle detected: ${profileName}`);
  const profile = manifest.profiles?.[profileName];
  if (!profile) throw new Error(`Unknown profile: ${profileName}`);
  seen.add(profileName);
  if (profile.extends && typeof profile.extends !== 'string') {
    throw new Error(`Profile ${profileName}: extends must be a single profile name string`);
  }
  const inherited = profile.extends ? expandProfileModules(manifest, profile.extends, seen) : [];
  return [...inherited, ...arrayValue(profile.modules)];
}

function expectedModuleKeys(manifest) {
  const keys = new Set();
  for (const profileName of Object.keys(manifest.profiles || {})) {
    for (const key of expandProfileModules(manifest, profileName)) keys.add(key);
  }
  return [...keys].sort();
}

function processModule(sourcePath, outputDir, manifest, check) {
  const content = readFileSync(sourcePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.id) throw new Error(`Missing 'id' in frontmatter: ${sourcePath}`);
  if (!frontmatter.globs) throw new Error(`Missing 'globs' in frontmatter: ${sourcePath}`);
  if (!frontmatter.description) throw new Error(`Missing 'description' in frontmatter: ${sourcePath}`);
  if (!frontmatter.hosts) throw new Error(`Missing 'hosts' in frontmatter: ${sourcePath}`);

  const violations = checkBannedTokens(content, manifest._privacyTokens ?? manifest.privacy?.bannedTokens ?? []);
  if (violations.length > 0) {
    throw new Error(`Privacy violation in ${sourcePath}: banned token match count=${violations.length}`);
  }

  const mdcContent = buildMdcContent(frontmatter, body);
  const mdcPath = join(outputDir, `${frontmatter.id}.mdc`);
  if (check) {
    if (!existsSync(mdcPath)) throw new Error(`Drift: expected ${mdcPath} does not exist. Run without --check to generate.`);
    if (readFileSync(mdcPath, 'utf8') !== mdcContent) {
      throw new Error(`Drift detected in ${mdcPath}. Run without --check to regenerate.`);
    }
  } else {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(mdcPath, mdcContent, 'utf8');
  }

  return {
    id: frontmatter.id,
    paths: arrayValue(frontmatter.paths || frontmatter.globs),
    globs: arrayValue(frontmatter.globs),
    hosts: arrayValue(frontmatter.hosts),
    maxBytes: frontmatter.maxBytes,
    verify: frontmatter.verify || '',
    checksum: sha256(content),
    mdcChecksum: sha256(mdcContent),
    mdcPath,
  };
}

function moduleProfiles(manifest, key) {
  return Object.keys(manifest.profiles || {})
    .filter((profileName) => expandProfileModules(manifest, profileName).includes(key))
    .sort();
}

function buildIndex(manifest, moduleResults, previousModules) {
  const modules = {};
  for (const item of moduleResults) {
    const profiles = moduleProfiles(manifest, item.key);
    const previous = previousModules?.[item.key] || {};
    modules[item.key] = {
      id: item.result.id,
      paths: item.result.paths,
      globs: item.result.globs,
      hosts: item.result.hosts,
      profile: profiles,
      verify: item.result.verify,
      checksum: item.result.checksum,
      mdcChecksum: item.result.mdcChecksum,
      cursorPath: relative(ROOT, item.result.mdcPath).replace(/\\/g, '/'),
      generatedAt: previous.generatedAt || new Date().toISOString(),
    };
    if (item.result.maxBytes !== undefined) modules[item.key].maxBytes = item.result.maxBytes;
  }
  return modules;
}

function canonicalManifest(manifest, modules) {
  return `${JSON.stringify({ ...manifest, modules }, null, 2)}\n`;
}

function assertManifestIndex(manifestPath, manifest, modules) {
  const expected = canonicalManifest(manifest, modules);
  const actual = readFileSync(manifestPath, 'utf8');
  if (actual !== expected) {
    throw new Error(`Drift detected in ${relative(ROOT, manifestPath)} modules index. Run node scripts/sync-rule-exports.mjs to regenerate.`);
  }
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
  const expectedKeys = expectedModuleKeys(manifest);
  const expectedKeySet = new Set(expectedKeys);
  let moduleFiles = [];
  try {
    moduleFiles = walkMd(rulesRoot);
  } catch (err) {
    errors.push(err.message);
    exitCode = 1;
  }
  const fileKeys = new Set(moduleFiles.map((filePath) => sourceRelKey(filePath, rulesRoot)));

  for (const key of expectedKeys) {
    if (!fileKeys.has(key)) errors.push(`${key}: manifest profile references missing module source`);
  }
  for (const key of fileKeys) {
    if (!expectedKeySet.has(key)) errors.push(`${key}: module source is not referenced by any manifest profile`);
  }

  const moduleResults = [];
  if (errors.length === 0) {
    for (const key of expectedKeys) {
      const filePath = moduleSourcePath(key, rulesRoot);
      const rel = `${key}.md`;
      const subDir = dirname(rel);
      const outputDir = subDir === '.' ? cursorOutputRoot : join(cursorOutputRoot, subDir);
      try {
        const result = processModule(filePath, outputDir, manifest, checkMode);
        moduleResults.push({ key, result });
        console.log(checkMode ? `ok: ${rel}` : `Generated: ${result.mdcPath}`);
      } catch (err) {
        errors.push(`${rel}: ${err.message}`);
        exitCode = 1;
      }
    }
  }

  if (errors.length === 0) {
    try {
      const modules = buildIndex(manifest, moduleResults, manifest.modules || {});
      const cleanManifest = { ...manifest, modules: {} };
      if (checkMode) {
        assertManifestIndex(manifestPath, cleanManifest, modules);
      } else {
        writeFileSync(manifestPath, canonicalManifest(cleanManifest, modules), 'utf8');
      }
    } catch (err) {
      errors.push(err.message);
      exitCode = 1;
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`fail: ${error}`);
    exitCode = 1;
  }
}

process.exit(exitCode);
