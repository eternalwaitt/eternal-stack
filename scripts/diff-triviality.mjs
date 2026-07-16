#!/usr/bin/env node
// Deterministic non-runtime ("trivial") diff classifier for the Stop verifier
// fast-path. A change is trivial ONLY when every touched path is non-runtime
// (documentation, asset, generated, vendor, or a known metadata file). Anything
// that can execute — source, schema, script, test, CI, migration — or any path
// the schema cannot classify, marks the whole change non-trivial. Fail-safe by
// construction: uncertainty resolves to "runtime", so the fast-path can only
// relax a gate when the diff is provably non-runtime.
//
// Classification comes from schemas/review-classification-rules-v1.json (the
// same path taxonomy the review pipeline uses) plus a tight metadata-basename
// allowlist for files that carry no glob (VERSION, LICENSE, .gitignore, ...).
//
// Usage:
//   node scripts/diff-triviality.mjs classify [--root <dir>] [--json] [path ...]
//   node scripts/diff-triviality.mjs classify --root <dir> --stdin-json   # paths as JSON array on stdin
//   node scripts/diff-triviality.mjs classify --root <dir> --git          # paths from `git diff --name-only HEAD`

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, "..", "schemas", "review-classification-rules-v1.json");

const RUNTIME_TAGS = new Set(["application", "source", "schema", "script", "test", "ci", "migration"]);
const NON_RUNTIME_TAGS = new Set(["documentation", "asset", "generated", "vendor", "metadata"]);

// Data/config/executable extensions affect behavior. They carry no source tag in
// the path taxonomy, so a file like docs/config.json or generated/migrate.sql
// would otherwise inherit only the directory's documentation/generated tag and be
// judged non-runtime. Treat these as runtime regardless of directory (fail-safe).
const DATA_CONFIG_EXTS = new Set([
  "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
  "sql", "graphql", "gql", "proto", "xml", "plist", "properties", "lock",
]);

// Metadata files that execute nothing and match no taxonomy glob. Kept tight on
// purpose: anything ambiguous (.npmrc, Dockerfile, *.env) stays runtime.
const METADATA_BASENAMES = new Set([
  "VERSION", "LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE", "AUTHORS",
  "CONTRIBUTORS", "CODEOWNERS", ".gitignore", ".gitattributes", ".editorconfig",
]);
const METADATA_PATTERNS = [/^LICENSE(\.[A-Za-z0-9]+)?$/, /^CHANGELOG(\.[A-Za-z0-9]+)?$/];

const VALUE_FLAGS = new Set(["--root"]);

function argv() {
  const a = process.argv.slice(2);
  const command = a[0] || "help";
  const flag = (name) => a.includes(name);
  const value = (name, fallback = "") => {
    const i = a.indexOf(name);
    return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : fallback;
  };
  const positionals = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i].startsWith("--")) continue;
    if (VALUE_FLAGS.has(a[i - 1])) continue; // consumed as a flag value, not a path
    positionals.push(a[i]);
  }
  return { command, flag, value, positionals };
}

// Minimal, path-aware glob → RegExp. Handles the three shapes the taxonomy uses:
// `**/*.ext` (any depth, extension), `dir/**` (subtree), and `**/*.x.*`.
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else { re += ".*"; }
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$+?.()|[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function loadPathRules() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  // A malformed schema must not silently classify everything as trivial: a
  // non-array `rules` is a corrupt taxonomy, not "no rules".
  if (!Array.isArray(schema.rules)) throw new Error("schema.rules must be an array");
  // Only path-glob rules classify a bare path; content/risk rules need file bodies.
  return schema.rules
    .filter((r) => (r.match?.pathGlobs || []).length > 0 && (r.addClassificationTags || []).length > 0)
    .map((r) => ({
      ruleId: r.ruleId,
      matchers: r.match.pathGlobs.map(globToRegExp),
      tags: r.addClassificationTags,
    }));
}

// Resolve symlinks so an in-root path is not mistaken for an escape. On macOS the
// caller's root (git toplevel) is /private/var/... while a recorded edit path may
// use the /var/... symlink; without canonicalizing, path.relative reads "../".
function realOr(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

// Returns the repo-relative path, or null when the path escapes --root. A null is
// forced to runtime by the caller: an out-of-root path like /tmp/CHANGELOG.md must
// never be stripped to `tmp/CHANGELOG.md` and inherit the metadata allowlist, which
// would let an out-of-scope file make the whole diff trivial (fail-safe).
//
// BOTH absolute and relative inputs are resolved against the canonical root first.
// A relative traversal like `docs/../../CHANGELOG.md` does not literally start with
// "../", so without resolving it it would survive to the metadata allowlist and mark
// an escaped file trivial. realOr canonicalizes symlinks (macOS /var -> /private/var)
// so an in-root path is never mistaken for an escape.
function normalize(p, root) {
  const input = p.replace(/\\/g, "/");
  const candidate = path.isAbsolute(input) ? input : path.resolve(root, input);
  let rel = path.relative(root, realOr(candidate)).replace(/\\/g, "/");
  if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel)) return null;
  rel = rel.replace(/^\.\//, "").replace(/^\/+/, "");
  if (rel === ".." || rel.startsWith("../")) return null;
  return rel;
}

function isMetadata(rel) {
  const base = rel.split("/").pop() || rel;
  return METADATA_BASENAMES.has(base) || METADATA_PATTERNS.some((re) => re.test(base));
}

function extensionOf(rel) {
  const base = rel.split("/").pop() || rel;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function classifyPath(rel, rules) {
  const tags = new Set();
  for (const rule of rules) {
    if (rule.matchers.some((re) => re.test(rel))) rule.tags.forEach((t) => tags.add(t));
  }
  if (tags.size === 0 && isMetadata(rel)) tags.add("metadata");
  const hasRuntime = [...tags].some((t) => RUNTIME_TAGS.has(t));
  const hasNonRuntime = [...tags].some((t) => NON_RUNTIME_TAGS.has(t));
  const isDataConfig = DATA_CONFIG_EXTS.has(extensionOf(rel));
  // Runtime wins on conflict; a data/config extension forces runtime even under a
  // documentation/generated directory; unclassified paths (fallback => source) are runtime.
  const runtime = hasRuntime || isDataConfig || !hasNonRuntime;
  return { tags: [...tags].sort(), runtime };
}

function gitChangedPaths(root) {
  const res = spawnSync("git", ["-C", root, "diff", "--name-only", "HEAD"],
    { encoding: "utf8", timeout: 5000 });
  if (res.status !== 0) return [];
  return (res.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function readStdinPaths() {
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch { return []; }
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed).filter((x) => typeof x === "string"); } catch { return []; }
  }
  return trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function main() {
  const { command, flag, value, positionals } = argv();
  if (command !== "classify") {
    process.stderr.write("usage: diff-triviality.mjs classify [--root <dir>] [--json] [--git|--stdin-json] [path ...]\n");
    process.exit(2);
  }
  const root = realOr(path.resolve(value("--root", process.cwd())));
  if (!existsSync(schemaPath)) {
    // No schema => cannot prove triviality => never trivial (fail-safe).
    emit({ trivial: false, reason: "schema-missing", total: 0, runtime: [], nonRuntime: [] }, flag("--json"));
    return;
  }
  let paths = positionals;
  if (flag("--git")) paths = gitChangedPaths(root);
  else if (flag("--stdin-json")) paths = readStdinPaths();
  paths = [...new Set(paths.filter(Boolean))];

  let rules;
  try {
    rules = loadPathRules();
  } catch {
    // Unreadable or malformed schema => cannot prove triviality => never trivial.
    emit({ trivial: false, reason: "schema-invalid", total: 0, runtime: [], nonRuntime: [] }, flag("--json"));
    return;
  }
  const runtime = [];
  const nonRuntime = [];
  for (const p of paths) {
    const rel = normalize(p, root);
    // A path outside --root (rel === null) is forced runtime and reported verbatim.
    const { runtime: isRuntime } = rel === null ? { runtime: true } : classifyPath(rel, rules);
    (isRuntime ? runtime : nonRuntime).push(rel ?? p);
  }
  const trivial = paths.length > 0 && runtime.length === 0;
  emit({ trivial, total: paths.length, runtime: runtime.sort(), nonRuntime: nonRuntime.sort() }, flag("--json"));
}

function emit(payload, asJson) {
  if (asJson) { process.stdout.write(JSON.stringify(payload, null, 2) + "\n"); return; }
  process.stdout.write(
    `trivial=${payload.trivial} total=${payload.total} runtime=${payload.runtime.length} nonRuntime=${payload.nonRuntime.length}\n`
  );
}

main();
