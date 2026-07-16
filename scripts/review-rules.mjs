#!/usr/bin/env node
// Lean deterministic review-rule runner: catch the mechanical CodeRabbit tail
// before push. Two engines only — ast_grep (AST-aware, pinned ast-grep 0.43.0)
// and literal (exact substring). No receipt/ledger machinery.
//
// Usage:
//   node scripts/review-rules.mjs check [--config <path>] [--root <dir>]
//                                       [--changed-only] [--base <ref>] [--json]
// --changed-only scopes to the working tree (pre-commit / local); --base <ref>
// scopes to the outgoing commit range <ref>...HEAD (pre-push, where the worktree
// is clean) and fails closed when <ref> cannot be resolved.
// Exit 1 when any block-mode rule matches; warn-mode matches report but pass.

import { readFileSync, existsSync, statSync, globSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = { config: null, root: process.cwd(), changedOnly: false, base: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--changed-only") out.changedOnly = true;
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "check") continue;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function loadConfig(configPath, root) {
  const resolved = configPath
    ? path.resolve(configPath)
    : path.join(root, "review-rules.json");
  if (!existsSync(resolved)) {
    throw new Error(`review-rules config not found: ${resolved}`);
  }
  const config = JSON.parse(readFileSync(resolved, "utf8"));
  if (config.schemaVersion !== 1 || !Array.isArray(config.rules)) {
    throw new Error(`invalid review-rules config: ${resolved}`);
  }
  return config;
}

function ruleMode(rule) {
  const mode = rule.mode || "block";
  if (!["block", "warn", "off"].includes(mode)) {
    throw new Error(`rule ${rule.ruleId}: invalid mode "${mode}"`);
  }
  return mode;
}

function activeRules(config) {
  const known = new Set(config.rules.map((r) => r.ruleId));
  const enabled = Array.isArray(config.enabledRuleIds) ? config.enabledRuleIds : [];
  // A typo in enabledRuleIds would otherwise select zero rules and report a clean
  // pass — a false pass on a blocking gate. Fail closed instead.
  for (const id of enabled) {
    if (!known.has(id)) throw new Error(`enabledRuleIds references unknown ruleId "${id}"`);
  }
  const allow = enabled.length > 0 ? new Set(enabled) : null;
  return config.rules.filter((r) => ruleMode(r) !== "off" && (!allow || allow.has(r.ruleId)));
}

function changedFiles(root, base) {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const set = new Set();
  if (base) {
    // Pre-push scope: the outgoing commit range base...HEAD, NOT the working tree.
    // A real pre-push runs with the to-be-pushed commit already at HEAD and a clean
    // worktree, so `git diff HEAD` would see nothing. Fail closed when base cannot
    // be resolved rather than silently checking zero files.
    const range = run(["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`]);
    if (range.status !== 0) {
      throw new Error(`cannot resolve --base "${base}" (outgoing range ${base}...HEAD): ${(range.stderr || "").trim()}`);
    }
    for (const line of (range.stdout || "").split("\n")) if (line.trim()) set.add(line.trim());
    return set;
  }
  const tracked = run(["diff", "--name-only", "--diff-filter=d", "HEAD"]);
  const untracked = run(["ls-files", "--others", "--exclude-standard"]);
  for (const out of [tracked.stdout, untracked.stdout]) {
    if (!out) continue;
    for (const line of out.split("\n")) if (line.trim()) set.add(line.trim());
  }
  return set;
}

function filesForRule(rule, root, changedSet) {
  const globs = Array.isArray(rule.scopeGlobs) ? rule.scopeGlobs : [];
  const found = new Set();
  for (const g of globs) {
    for (const rel of globSync(g, { cwd: root })) {
      const abs = path.join(root, rel);
      if (!existsSync(abs) || !statSync(abs).isFile()) continue;
      if (changedSet && !changedSet.has(rel)) continue;
      found.add(rel);
    }
  }
  return [...found];
}

function evalLiteral(rule, root, files) {
  const needle = rule.literal?.needle;
  if (typeof needle !== "string" || needle.length === 0) {
    throw new Error(`rule ${rule.ruleId}: literal engine requires a needle`);
  }
  const caseSensitive = rule.literal.caseSensitive !== false;
  const hay = (s) => (caseSensitive ? s : s.toLowerCase());
  const target = hay(needle);
  const hits = [];
  for (const rel of files) {
    const lines = readFileSync(path.join(root, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (hay(line).includes(target)) hits.push({ file: rel, line: i + 1, snippet: line.trim().slice(0, 120) });
    });
  }
  return hits;
}

function evalAstGrep(rule, root, files) {
  if (files.length === 0) return [];
  const pattern = rule.astGrep?.pattern;
  const language = rule.astGrep?.language;
  if (!pattern || !language) {
    throw new Error(`rule ${rule.ruleId}: ast_grep engine requires pattern + language`);
  }
  const res = spawnSync(
    "ast-grep",
    ["run", "--pattern", pattern, "--lang", language, "--json=compact", ...files],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error && res.error.code === "ENOENT") {
    throw new Error("ast-grep is not installed; cannot evaluate ast_grep rules (install ast-grep — see docs/health-stack.md)");
  }
  if (res.error) {
    throw new Error(`rule ${rule.ruleId}: ast-grep failed to run: ${res.error.message}`);
  }
  // ast-grep run exit codes: 0 = matches, 1 = no matches (normal), >=2 = usage/
  // argument error (e.g. an invalid --lang). A killing signal or an exit >=2 must
  // fail closed — treating that empty stdout as "no matches" would silently pass a
  // blocking guard.
  if (res.signal) {
    throw new Error(`rule ${rule.ruleId}: ast-grep terminated by signal ${res.signal}`);
  }
  if (typeof res.status === "number" && res.status >= 2) {
    throw new Error(`rule ${rule.ruleId}: ast-grep exited ${res.status} (cannot evaluate): ${(res.stderr || "").trim().slice(0, 200)}`);
  }
  // A malformed pattern makes ast-grep emit an ERROR-node warning on stderr and
  // return an empty match set with exit 0. Detect it so a broken rule fails
  // closed (cannot-evaluate) instead of silently passing a blocking guard.
  if (/ERROR node/i.test(res.stderr || "")) {
    throw new Error(`rule ${rule.ruleId}: malformed ast-grep pattern (ast-grep reported an ERROR node)`);
  }
  const raw = (res.stdout || "").trim();
  if (!raw) return [];
  let matches;
  try { matches = JSON.parse(raw); } catch { throw new Error(`rule ${rule.ruleId}: ast-grep returned non-JSON output`); }
  return matches.map((m) => ({
    file: path.relative(root, path.resolve(root, m.file)),
    line: (m.range?.start?.line ?? 0) + 1,
    snippet: (m.text || "").trim().slice(0, 120),
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.config, args.root);
  // --base implies changed scoping over the outgoing range (pre-push); --changed-only
  // without --base scopes to the working tree (pre-commit / local).
  const changedSet = (args.changedOnly || args.base) ? changedFiles(args.root, args.base) : null;
  const rules = activeRules(config);

  const findings = [];
  for (const rule of rules) {
    const files = filesForRule(rule, args.root, changedSet);
    const hits = rule.engine === "literal"
      ? evalLiteral(rule, args.root, files)
      : rule.engine === "ast_grep"
        ? evalAstGrep(rule, args.root, files)
        : (() => { throw new Error(`rule ${rule.ruleId}: unknown engine "${rule.engine}"`); })();
    for (const hit of hits) {
      findings.push({
        ruleId: rule.ruleId, mode: ruleMode(rule), lensId: rule.lensId,
        category: rule.category, severity: rule.severity, ...hit,
      });
    }
  }

  const blocking = findings.filter((f) => f.mode === "block");
  if (args.json) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, status: blocking.length ? "block" : "pass", findings }, null, 2) + "\n");
  } else if (findings.length === 0) {
    process.stdout.write(`review-rules: pass (${rules.length} active rule(s), no matches)\n`);
  } else {
    for (const f of findings) {
      process.stdout.write(`  [${f.mode}] ${f.ruleId} (${f.category}) ${f.file}:${f.line}  ${f.snippet}\n`);
    }
    process.stdout.write(`review-rules: ${blocking.length} blocking, ${findings.length - blocking.length} warn\n`);
  }
  process.exit(blocking.length ? EXIT_BLOCK : EXIT_PASS);
}

// Exit codes are a contract for callers (pre-push, CI): 0 pass, 1 a block-mode
// rule matched, 2 the run could not be evaluated (ast-grep missing/broken,
// malformed pattern, invalid config). A cannot-evaluate must never be mistaken
// for a clean pass, and an infrastructure failure must never look like a block.
const EXIT_PASS = 0;
const EXIT_BLOCK = 1;
const EXIT_CANNOT_EVALUATE = 2;

try {
  main();
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "error", error: msg, findings: [] }, null, 2) + "\n");
  }
  process.stderr.write(`review-rules: cannot evaluate: ${msg}\n`);
  process.exit(EXIT_CANNOT_EVALUATE);
}
