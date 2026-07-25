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
// `classify-plan` applies the same taxonomy to a plan's `## File map` rows before
// any code exists, so `/etrnl-dev-execute` can pick an execution shape from the
// plan alone. Same fail-safe direction: uncertainty resolves to the heaviest
// shape (`large`), never the lightest.
//
// Usage:
//   node scripts/diff-triviality.mjs classify [--root <dir>] [--json] [path ...]
//   node scripts/diff-triviality.mjs classify --root <dir> --stdin-json   # paths as JSON array on stdin
//   node scripts/diff-triviality.mjs classify --root <dir> --git          # paths from `git diff --name-only HEAD`
//   node scripts/diff-triviality.mjs classify-plan --plan <plan.md> [--json]

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

const VALUE_FLAGS = new Set(["--root", "--plan"]);

// Plan-scope triage thresholds. TRIVIAL_MAX_PATHS is the plan contract (at most
// three files); SMALL_MAX_PATHS mirrors requiresTier2Escalation in
// scripts/lib/plan-risk-tier.mjs so one file-count boundary governs the repo.
const TRIVIAL_MAX_PATHS = 3;
const SMALL_MAX_PATHS = 8;

// The only way a runtime file-map row clears the behavioral bar: the plan states
// it outright in the Change column. Silence resolves to behavioral, because a
// plan row cannot prove that an edit to executable source leaves behavior intact.
const NON_BEHAVIORAL_DECLARATIONS = [
  /\bno behavio(?:u)?ral change\b/i, /\bno behavio(?:u)?r change\b/i,
  /\bnon-behavio(?:u)?ral\b/i, /\bcomments? only\b/i, /\btypo fix\b/i,
  /\bdocs only\b/i, /\bdocumentation only\b/i,
];

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
  // Tracked changes (incl. deletions) UNION untracked new files: a brand-new runtime
  // file (e.g. a fresh src/app.ts) must not be omitted, or the --git set could read as
  // trivial. Mirrors the Stop-verifier's own edits ∪ working-tree union.
  const git = (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 });
  const tracked = git(["diff", "--name-only", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  if (tracked.status !== 0 || untracked.status !== 0) return [];
  const set = new Set();
  for (const out of [tracked.stdout, untracked.stdout]) {
    for (const line of (out || "").split(/\r?\n/)) { const t = line.trim(); if (t) set.add(t); }
  }
  return [...set];
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

// Paths named in one `## File map` cell. The taxonomy row for a bundle of
// related files backticks each one, so a single cell can carry several paths and
// each counts toward the file budget.
function pathsInCell(cell) {
  const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  if (ticked.length > 0) return ticked;
  const bare = cell.trim();
  return bare && !bare.includes(" ") ? [bare] : [];
}

// One row per distinct path in the plan's `## File map` table, carrying that
// row's Change note. Header and separator rows are dropped.
function planFileMapRows(planText, { sectionBody }) {
  const rows = [];
  const seen = new Set();
  for (const line of sectionBody(planText, "File map").split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (/^[-:\s]+$/.test(cells[0])) continue;
    if (/^path$/i.test(cells[0])) continue;
    const change = cells[1];
    for (const raw of pathsInCell(cells[0])) {
      const cleaned = raw.replace(/^[`'"]+|[`'"]+$/g, "").trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      rows.push({ path: cleaned, change });
    }
  }
  return rows;
}

function classifyPlanRow(row, root, rules, { requiresTier3Escalation }) {
  const rel = normalize(row.path, root);
  const target = rel ?? row.path;
  // The tier-3 auto-escalation set (hooks, installers, auth, money, migrations,
  // tenancy) carries full gates whatever the plan's Risk tier line claims.
  const escalated = requiresTier3Escalation([target, row.change]);
  // Schema and data/config files change behavior through data, so no plan
  // sentence waives them; they block Trivial without forcing the Large shape.
  const fenced = escalated || DATA_CONFIG_EXTS.has(extensionOf(target));
  // An out-of-root path is unclassifiable, so it counts as runtime (fail-safe).
  const runtime = rel === null ? true : classifyPath(rel, rules).runtime;
  const declaredNonBehavioral = NON_BEHAVIORAL_DECLARATIONS.some((re) => re.test(row.change));
  let behavioral;
  if (fenced) behavioral = true;
  else if (!runtime) behavioral = false;
  else behavioral = !declaredNonBehavioral;
  return { path: target, change: row.change, runtime, fenced, escalated, behavioral };
}

// Trivial / Small / Large triage for a plan, read from its `Risk tier:` line and
// `## File map` rows. Trivial needs BOTH conditions: at most three paths AND no
// row carrying a behavioral, API, or schema change. Tier 3 is Large at every
// file count; tier 0-1 runs the quick-dev lane and has no triage.
function classifyPlan(planPath, root, rules, planLib) {
  let planText;
  try {
    planText = readFileSync(planPath, "utf8");
  } catch {
    return { scope: "large", reason: "plan-unreadable", tier: null, fileCount: 0, behavioralPaths: [], rows: [] };
  }
  const { tier } = planLib.parseRiskTier(planText);
  const rows = planFileMapRows(planText, planLib).map((row) => classifyPlanRow(row, root, rules, planLib));
  const behavioralPaths = rows.filter((row) => row.behavioral).map((row) => row.path).sort();
  const base = { tier, fileCount: rows.length, behavioralPaths, rows };
  if (tier >= 3) return { scope: "large", reason: "tier-3-full-packet", ...base };
  if (rows.some((row) => row.escalated)) {
    return { scope: "large", reason: "tier-3-surface-under-declared", ...base };
  }
  if (tier < 2) return { scope: "not-applicable", reason: "tier-below-2-quick-dev-lane", ...base };
  if (rows.length === 0) return { scope: "large", reason: "file-map-empty", ...base };
  if (rows.length > SMALL_MAX_PATHS) return { scope: "large", reason: "file-count-above-small-cap", ...base };
  if (rows.length > TRIVIAL_MAX_PATHS) return { scope: "small", reason: "file-count-above-trivial-cap", ...base };
  if (behavioralPaths.length > 0) return { scope: "small", reason: "behavioral-change-declared", ...base };
  return { scope: "trivial", reason: "within-file-cap-and-non-behavioral", ...base };
}

function loadRulesOrNull() {
  if (!existsSync(schemaPath)) return null;
  try {
    return loadPathRules();
  } catch {
    return null;
  }
}

// Loaded lazily so the Stop-verifier `classify` path keeps working when
// scripts/lib is absent (a partial install, or a single-file copy of this
// script). A plan triage without the tier parser cannot be proven Trivial.
async function loadPlanLibOrNull() {
  try {
    return await import("./lib/plan-risk-tier.mjs");
  } catch {
    return null;
  }
}

async function planCommand(value, asJson) {
  const planPath = value("--plan");
  if (!planPath) {
    process.stderr.write("usage: diff-triviality.mjs classify-plan --plan <plan-path> [--root <dir>] [--json]\n");
    process.exit(2);
  }
  const root = realOr(path.resolve(value("--root", process.cwd())));
  const rules = loadRulesOrNull();
  const planLib = await loadPlanLibOrNull();
  // No taxonomy and no tier parser mean no path can be proven non-runtime and no
  // tier can be read, so no plan can be proven Trivial (same fail-safe stance as
  // `classify`).
  const unavailable = rules === null ? "schema-unavailable" : planLib === null ? "plan-helper-unavailable" : "";
  if (unavailable) {
    emitPlan({ scope: "large", reason: unavailable, tier: null, fileCount: 0, behavioralPaths: [], rows: [] }, asJson);
    return;
  }
  emitPlan(classifyPlan(path.resolve(planPath), root, rules, planLib), asJson);
}

async function main() {
  const { command, flag, value, positionals } = argv();
  if (command === "classify-plan") {
    await planCommand(value, flag("--json"));
    return;
  }
  if (command !== "classify") {
    process.stderr.write(
      "usage: diff-triviality.mjs classify [--root <dir>] [--json] [--git|--stdin-json] [path ...]\n" +
      "       diff-triviality.mjs classify-plan --plan <plan-path> [--root <dir>] [--json]\n"
    );
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

function emitPlan(payload, asJson) {
  if (asJson) { process.stdout.write(JSON.stringify(payload, null, 2) + "\n"); return; }
  process.stdout.write(
    `scope=${payload.scope} tier=${payload.tier ?? "unknown"} files=${payload.fileCount} ` +
    `behavioral=${payload.behavioralPaths.length} reason=${payload.reason}\n`
  );
}

function emit(payload, asJson) {
  if (asJson) { process.stdout.write(JSON.stringify(payload, null, 2) + "\n"); return; }
  process.stdout.write(
    `trivial=${payload.trivial} total=${payload.total} runtime=${payload.runtime.length} nonRuntime=${payload.nonRuntime.length}\n`
  );
}

await main();
