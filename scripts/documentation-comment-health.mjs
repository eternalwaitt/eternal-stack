#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isAuditExcludedPath, isGeneratedOrFixturePath } from "./lib/audit-exclusions.mjs";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);
const root = path.resolve(argValue(args, "--root", process.cwd()));
const json = args.includes("--json");

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const testPattern = /(^|\/)(__tests__|tests?|fixtures?|__mocks__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const riskPattern = /(^|\/)(api|app|routes?|scripts?|queue|workers?|modules?|lib|packages?|services?)\/|contract|router|schema|env|auth|permission|security|payment|billing|s3|qdrant|redis|scan|integration|client/i;

const targetPatterns = [
  { kind: "function", pattern: /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "class", pattern: /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "interface", pattern: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "type", pattern: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "const", pattern: /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "let", pattern: /^\s*export\s+let\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "var", pattern: /^\s*export\s+var\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "enum", pattern: /^\s*export\s+enum\s+([A-Za-z_$][\w$]*)\b/ },
];

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const relativePath = path.relative(root, fullPath);
      if (!isAuditExcludedPath(relativePath) && !isGeneratedOrFixturePath(relativePath)) walk(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function hasLeadingDoc(lines, lineIndex) {
  let index = lineIndex - 1;
  while (index >= 0 && /^\s*$/.test(lines[index])) index -= 1;
  while (index >= 0 && /^\s*@\w+/.test(lines[index])) index -= 1;
  if (index < 0) return { hasDoc: false, style: "none" };

  const previous = lines[index];
  if (/^\s*\/\*\*.*\*\/\s*$/.test(previous)) return { hasDoc: true, style: "jsdoc" };
  if (!/^\s*\*\/\s*$/.test(previous)) {
    if (/^\s*\/\//.test(previous)) return { hasDoc: false, style: "line-comment" };
    return { hasDoc: false, style: "none" };
  }

  for (let cursor = index - 1; cursor >= 0 && cursor >= lineIndex - 30; cursor -= 1) {
    if (/^\s*\/\*\*/.test(lines[cursor])) return { hasDoc: true, style: "jsdoc" };
    if (!/^\s*\*/.test(lines[cursor]) && !/^\s*$/.test(lines[cursor])) break;
  }
  return { hasDoc: false, style: "block-comment" };
}

function targetFromLine(line) {
  for (const entry of targetPatterns) {
    const match = line.match(entry.pattern);
    if (match) return { kind: entry.kind, name: match[1] };
  }
  return null;
}

function scanFile(file) {
  const relativePath = path.relative(root, file);
  if (testPattern.test(relativePath)) return [];
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const targets = [];
  for (let index = 0; index < lines.length; index += 1) {
    const target = targetFromLine(lines[index]);
    if (!target) continue;
    const doc = hasLeadingDoc(lines, index);
    targets.push({
      path: relativePath,
      line: index + 1,
      kind: target.kind,
      name: target.name,
      risk: riskPattern.test(relativePath) ? "public_or_risky" : "exported",
      hasLeadingDoc: doc.hasDoc,
      docStyle: doc.style,
      classification: doc.hasDoc ? "useful_or_needs_review" : "missing",
    });
  }
  return targets;
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`documentation-comment-health failed: root is not a directory: ${root}`);
  process.exit(2);
}

const files = walk(root).sort((left, right) => left.localeCompare(right));
const targets = files.flatMap(scanFile);
const documented = targets.filter((target) => target.hasLeadingDoc).length;
const missing = targets.length - documented;
const result = {
  repo: root,
  generatedAt: new Date().toISOString(),
  sourceFilesScanned: files.length,
  tsdocJsdocTargetCount: targets.length,
  documentedTargetCount: documented,
  missingDocTargetCount: missing,
  wrongFormatTargetCount: targets.filter((target) => target.docStyle === "line-comment" || target.docStyle === "block-comment").length,
  targets,
};

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`TSDOC_JSDOC_FILES_SCANNED: ${result.sourceFilesScanned}\n`);
  process.stdout.write(`COMMENT_TARGETS_REVIEWED: ${result.tsdocJsdocTargetCount}\n`);
  process.stdout.write(`COMMENT_TARGETS_DOCUMENTED: ${result.documentedTargetCount}\n`);
  process.stdout.write(`COMMENT_TARGETS_MISSING_DOCS: ${result.missingDocTargetCount}\n`);
  process.stdout.write(`COMMENT_TARGETS_WRONG_FORMAT: ${result.wrongFormatTargetCount}\n`);
}
