#!/usr/bin/env node
// Lean deterministic review-rule runner: catch the mechanical CodeRabbit tail
// before push. Two engines only — ast_grep (AST-aware, pinned ast-grep 0.43.0)
// and literal (exact substring). No receipt/ledger machinery.
//
// Usage:
//   node scripts/review-rules.mjs check [--config <path>] [--root <dir>]
//                                       [--changed-only] [--json]
// Exit 1 when any block-mode rule matches; warn-mode matches report but pass.

import { readFileSync, existsSync, statSync, globSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = { config: null, root: process.cwd(), changedOnly: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--changed-only") out.changedOnly = true;
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
  const allow = Array.isArray(config.enabledRuleIds) && config.enabledRuleIds.length > 0
    ? new Set(config.enabledRuleIds)
    : null;
  return config.rules.filter((r) => ruleMode(r) !== "off" && (!allow || allow.has(r.ruleId)));
}

function changedFiles(root) {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const tracked = run(["diff", "--name-only", "--diff-filter=d", "HEAD"]);
  const untracked = run(["ls-files", "--others", "--exclude-standard"]);
  const set = new Set();
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
    throw new Error("ast-grep is not installed; cannot evaluate ast_grep rules");
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
  const changedSet = args.changedOnly ? changedFiles(args.root) : null;
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
  process.exit(blocking.length ? 1 : 0);
}

main();
