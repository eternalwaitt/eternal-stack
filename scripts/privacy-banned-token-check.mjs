#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

const root = resolve(process.argv[2] || process.cwd());
const manifestPath = resolve(root, 'rules-manifest.json');

function readUtf8(filePath) {
  const bytes = readFileSync(filePath);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    console.error(`warning: encoding issue while reading ${filePath}: ${error.message}`);
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function git(args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function gitLines(args) {
  const result = git(args);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function isSafeRelativePath(relPath) {
  return !isAbsolute(relPath) && !relPath.split(/[\\/]+/).includes('..');
}

function localTokensFromJson(filePath, relPath) {
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(filePath));
  } catch (error) {
    throw new Error(`malformed JSON in ${relPath}: ${error.message}`);
  }
  if (Array.isArray(parsed)) return parsed;
  return arrayValue(parsed?.privacy?.bannedTokens || parsed?.bannedTokens);
}

function localTokensFromText(filePath) {
  return readUtf8(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

try {
  const manifest = JSON.parse(readUtf8(manifestPath));
  const privacy = manifest.privacy || {};
  const localTokenFiles = new Set(arrayValue(privacy.localTokenFiles).map(String));
  const tokens = arrayValue(privacy.bannedTokens)
    .map((token) => String(token).trim().toLowerCase())
    .filter(Boolean);

  for (const relPath of [...localTokenFiles].sort()) {
    if (!isSafeRelativePath(relPath)) {
      throw new Error(`local privacy token file must be a safe relative path: ${relPath}`);
    }
    const ignored = git(['check-ignore', '--quiet', '--', relPath]);
    if (ignored.status !== 0) {
      throw new Error(`local privacy token file is not gitignored: ${relPath}`);
    }
  }

  for (const relPath of localTokenFiles) {
    const localPath = resolve(root, relPath);
    if (!existsSync(localPath)) continue;
    const localTokens = extname(localPath) === '.json'
      ? localTokensFromJson(localPath, relPath)
      : localTokensFromText(localPath);
    for (const token of localTokens) {
      const normalized = String(token).trim().toLowerCase();
      if (normalized) tokens.push(normalized);
    }
  }

  const uniqueTokens = [...new Set(tokens)].sort();
  const violations = [];
  for (const relPath of gitLines(['ls-files'])) {
    if (relPath === 'rules-manifest.json' || localTokenFiles.has(relPath)) continue;
    const filePath = resolve(root, relPath);
    try {
      // Performance guard: very large tracked files are skipped rather than fully decoded,
      // so banned-token coverage intentionally applies to files at or below 10 MiB.
      if (statSync(filePath).size > 10 * 1024 * 1024) continue;
      const text = readUtf8(filePath).toLowerCase();
      const foundCount = uniqueTokens.filter((token) => text.includes(token)).length;
      if (foundCount) violations.push(`${relPath}: banned token match count=${foundCount}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  if (violations.length) {
    console.error(violations.join('\n'));
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
