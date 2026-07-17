#!/usr/bin/env node
// Agent-output contract validator: turns each etrnl agent's emitted contract
// block from advisory prose into a hard gate. Parses the fenced ETRNL_CONTRACT
// block, then enforces: the status enum, the per-finding line grammar, the
// DETERMINISTIC status rule (declared status must match the findings — anti-
// gaming), two-tier verbosity for fenced-critical findings, and per-agent
// required fields. Spec lives in schemas/agent-contract-v1.json.
//
// Usage:
//   node scripts/agent-output-contract.mjs check --agent <id> [--file <p>|--stdin] [--json]
//   node scripts/agent-output-contract.mjs check-all-agents [--agents-dir <d>] [--json]
//
// Exit codes mirror review-rules.mjs: 0 pass / 1 contract violation / 2 cannot
// evaluate (missing input, unreadable schema, bad args). A cannot-evaluate must
// never look like a clean pass, and a violation must never look like a crash.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const EXIT_PASS = 0;
const EXIT_VIOLATION = 1;
const EXIT_CANNOT_EVALUATE = 2;

function parseArgs(argv) {
  const out = { cmd: null, agent: null, file: null, stdin: false, json: false, agentsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "check" || a === "check-all-agents") out.cmd = a;
    else if (a === "--agent") out.agent = argv[++i];
    else if (a === "--file") out.file = argv[++i];
    else if (a === "--stdin") out.stdin = true;
    else if (a === "--json") out.json = true;
    else if (a === "--agents-dir") out.agentsDir = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.cmd) throw new Error("missing command (check | check-all-agents)");
  return out;
}

function loadSchema() {
  // Resolve relative to this script so it works from any cwd (hook context).
  const here = path.dirname(new URL(import.meta.url).pathname);
  const resolved = path.join(here, "..", "schemas", "agent-contract-v1.json");
  if (!existsSync(resolved)) throw new Error(`agent-contract schema not found: ${resolved}`);
  const schema = JSON.parse(readFileSync(resolved, "utf8"));
  if (schema.schemaVersion !== 1) throw new Error(`unsupported agent-contract schema version`);
  return schema;
}

function readStdin() {
  try { return readFileSync(0, "utf8"); }
  catch { return ""; }
}

// Extract the contract region: everything from the openMarker line to EOF (agents
// emit the contract LAST). Returns null when no marker is present.
function extractBlock(text, schema) {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim() === schema.block.openMarker);
  if (idx === -1) return null;
  return lines.slice(idx);
}

function keyValues(blockLines) {
  const kv = new Map();
  for (const line of blockLines) {
    const m = /^(ETRNL_[A-Z_]+):\s?(.*)$/.exec(line.trim());
    if (m) kv.set(m[1], m[2].trim());
  }
  return kv;
}

function parseFindings(blockLines, schema) {
  const re = new RegExp(schema.findingGrammar.line);
  const findings = [];
  const malformed = [];
  for (const raw of blockLines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.startsWith("- ")) continue;
    const m = re.exec(line);
    if (!m) { malformed.push(line.trim().slice(0, 100)); continue; }
    const [, severity, category, file, ln, problem, fix] = m;
    findings.push({ severity, category, file, line: Number(ln), problem, fix });
  }
  return { findings, malformed };
}

function computeStatus(findings, schema) {
  const blocking = new Set(schema.severity.blocking);
  if (findings.some((f) => blocking.has(f.severity))) return "blocked";
  if (findings.length > 0) return "changes_requested";
  return "verified";
}

// Validate a single emitted contract. Returns { violations: string[] }.
function validateContract(text, agentId, schema) {
  const violations = [];
  const block = extractBlock(text, schema);
  if (!block) return { violations: [`no "${schema.block.openMarker}" contract block found`] };

  const kv = keyValues(block);
  for (const key of schema.block.requiredKeys) {
    if (!kv.has(key)) violations.push(`missing required key ${key}`);
  }
  const perAgent = (agentId && schema.perAgentRequiredKeys[agentId]) || [];
  for (const key of perAgent) {
    if (!kv.has(key)) violations.push(`agent ${agentId} missing required key ${key}`);
  }

  const isWorker = Boolean(agentId) && Array.isArray(schema.workerProfileAgents) && schema.workerProfileAgents.includes(agentId);
  const allowedStatuses = isWorker ? schema.status.workerStatuses : schema.status.reviewerStatuses;
  const status = kv.get("ETRNL_STATUS");
  if (status && !allowedStatuses.includes(status)) {
    violations.push(`ETRNL_STATUS "${status}" not valid for ${isWorker ? "worker" : "reviewer"} profile {${allowedStatuses.join("|")}}`);
  }

  const { findings, malformed } = parseFindings(block, schema);
  for (const bad of malformed) violations.push(`malformed finding line: ${bad}`);
  const catEnum = new Set(schema.category.enum);
  for (const f of findings) {
    if (!catEnum.has(f.category)) violations.push(`finding ${f.file}:${f.line} category "${f.category}" not in taxonomy`);
  }

  // Two-tier verbosity: a blocking finding in a fenced-critical category must show
  // the source->consequence chain, not assert it.
  const fenced = new Set(schema.category.fencedCritical);
  const tier = schema.twoTier;
  for (const f of findings) {
    if (f.severity === tier.requireChainWhen.severity && fenced.has(f.category) && !f.problem.includes(tier.chainToken)) {
      violations.push(`fenced-critical ${f.severity}/${f.category} finding at ${f.file}:${f.line} must show the "${tier.chainToken}" source->consequence chain`);
    }
  }

  // Declared finding count must match parsed findings.
  const declared = kv.get("ETRNL_FINDINGS");
  if (declared !== undefined) {
    if (!/^\d+$/.test(declared)) {
      // Fail closed: a non-numeric (or empty) count must not silently skip reconciliation.
      violations.push(`ETRNL_FINDINGS must be a non-negative integer, got "${declared}"`);
    } else if (Number(declared) !== findings.length) {
      violations.push(`ETRNL_FINDINGS says ${declared} but ${findings.length} finding line(s) parsed`);
    }
  }

  // Deterministic status rule (anti-gaming): declared status must match findings.
  if (status && allowedStatuses.includes(status)) {
    if (isWorker) {
      // Worker profile: evidence/map output. A bug still forces "blocked"; otherwise
      // "completed" and "blocked" (external blocker) are both legitimate.
      const hasBug = findings.some((f) => schema.severity.blocking.includes(f.severity));
      if (hasBug && status !== "blocked") {
        violations.push(`ETRNL_STATUS "${status}" contradicts findings — a bug-severity finding requires "blocked"`);
      }
    } else {
      // Reviewer profile: declared status must exactly match findings.
      const computed = computeStatus(findings, schema);
      if (computed !== status) {
        violations.push(`ETRNL_STATUS "${status}" contradicts findings — deterministic rule requires "${computed}"`);
      }
    }
  }

  // Adversary 3-cycle STOP cap.
  if (agentId === "etrnl-adversary" && kv.has("ETRNL_STOP_CYCLE")) {
    const cyc = Number(kv.get("ETRNL_STOP_CYCLE"));
    if (!Number.isInteger(cyc) || cyc < 1 || cyc > 3) {
      violations.push(`ETRNL_STOP_CYCLE "${kv.get("ETRNL_STOP_CYCLE")}" must be an integer 1..3 (doubt-driven cap)`);
    }
  }

  return { violations };
}

// Static lint: does an agent .md DECLARE a conformant contract template? (P2 gate)
function checkAllAgents(agentsDir, schema) {
  if (!existsSync(agentsDir)) throw new Error(`agents dir not found: ${agentsDir}`);
  const results = [];
  for (const name of readdirSync(agentsDir).sort()) {
    if (!name.endsWith(".md")) continue;
    const id = name.replace(/\.md$/, "");
    const text = readFileSync(path.join(agentsDir, name), "utf8");
    const violations = [];
    if (!text.includes(schema.block.openMarker)) {
      violations.push(`does not declare a "${schema.block.openMarker}" contract block`);
    }
    for (const key of schema.block.requiredKeys) {
      if (!text.includes(key)) violations.push(`contract template omits ${key}`);
    }
    for (const key of schema.perAgentRequiredKeys[id] || []) {
      if (!text.includes(key)) violations.push(`agent-specific required key ${key} absent from template`);
    }
    results.push({ agent: id, violations });
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const schema = loadSchema();

  if (args.cmd === "check-all-agents") {
    const dir = args.agentsDir
      ? path.resolve(args.agentsDir)
      : path.join(path.dirname(new URL(import.meta.url).pathname), "..", "agents");
    const results = checkAllAgents(dir, schema);
    const failed = results.filter((r) => r.violations.length > 0);
    if (args.json) {
      process.stdout.write(JSON.stringify({ schemaVersion: 1, status: failed.length ? "violation" : "pass", results }, null, 2) + "\n");
    } else if (failed.length === 0) {
      process.stdout.write(`agent-contract: pass (${results.length} agents declare a conformant contract)\n`);
    } else {
      for (const r of failed) for (const v of r.violations) process.stdout.write(`  [${r.agent}] ${v}\n`);
      process.stdout.write(`agent-contract: ${failed.length}/${results.length} agent template(s) non-conformant\n`);
    }
    process.exit(failed.length ? EXIT_VIOLATION : EXIT_PASS);
  }

  // cmd === "check"
  let text;
  if (args.file) {
    if (!existsSync(args.file)) throw new Error(`--file not found: ${args.file}`);
    text = readFileSync(args.file, "utf8");
  } else if (args.stdin) {
    text = readStdin();
  } else {
    throw new Error("check requires --file <path> or --stdin");
  }
  if (!text || !text.trim()) throw new Error("no contract text to evaluate (empty input)");

  const { violations } = validateContract(text, args.agent, schema);
  if (args.json) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, agent: args.agent || null, status: violations.length ? "violation" : "pass", violations }, null, 2) + "\n");
  } else if (violations.length === 0) {
    process.stdout.write(`agent-contract: pass${args.agent ? ` (${args.agent})` : ""}\n`);
  } else {
    for (const v of violations) process.stdout.write(`  ${v}\n`);
    process.stdout.write(`agent-contract: ${violations.length} violation(s)\n`);
  }
  process.exit(violations.length ? EXIT_VIOLATION : EXIT_PASS);
}

try {
  main();
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "error", error: msg }, null, 2) + "\n");
  }
  process.stderr.write(`agent-contract: cannot evaluate: ${msg}\n`);
  process.exit(EXIT_CANNOT_EVALUATE);
}
