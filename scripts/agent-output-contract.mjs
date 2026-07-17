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

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Directory of this script, resolved via fileURLToPath so a checkout path with
// spaces or non-ASCII characters is decoded correctly. Using new URL().pathname
// would keep percent-encoding, making the schema / agents dir look missing and
// silently downgrading the hook to fail-open (enforcement skipped). See FINDING #13.
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Resolve the agents directory, honoring an explicit --agents-dir override.
function resolveAgentsDir(agentsDirArg) {
  return agentsDirArg ? path.resolve(agentsDirArg) : path.join(HERE, "..", "agents");
}

// A contracted agent is one that has an agents/<agent>.md file in the resolved
// agents dir. Used for the missing-block policy: only contracted agents are
// required to emit a contract block.
//
// Fail CLOSED when the registry is unavailable. If the agents dir cannot be resolved
// (missing/invalid path) we CANNOT prove the agent is NOT contracted, so returning
// false would let an omitted contract from a real contracted agent pass. Instead throw
// an evaluation error: the top-level catch turns it into exit 2, and the hook fails
// closed on exit 2 (blocks, escapable via CLAUDE_GUARD_DISABLED=1). A resolvable dir
// where the file is simply absent still returns false (the agent is genuinely
// non-contracted), so normal non-contracted subagents pass through unaffected.
function isContractedAgent(agentId, agentsDir) {
  if (!agentId) return false;
  // The registry must be a real directory. existsSync() alone would accept a regular
  // FILE at agentsDir (then agents/<id>.md resolves false -> "non-contracted", letting an
  // omitted contract pass). statSync().isDirectory() rejects that; a missing/unreadable
  // dir throws -> exit 2 -> the hook fails closed.
  let dirStat;
  try {
    dirStat = statSync(agentsDir);
  } catch {
    throw new Error("agents registry is unavailable; cannot determine contracted status");
  }
  if (!dirStat.isDirectory()) {
    throw new Error("agents registry is not a directory; cannot determine contracted status");
  }
  // Only ENOENT (the file is genuinely absent) means "not contracted". Any other error
  // (EACCES and friends) must NOT be masked as non-contracted — it is cannot-evaluate.
  try {
    return statSync(path.join(agentsDir, `${agentId}.md`)).isFile();
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw new Error(`agents registry entry for ${agentId} is unreadable; cannot determine contracted status`);
  }
}

const EXIT_PASS = 0;
const EXIT_VIOLATION = 1;
const EXIT_CANNOT_EVALUATE = 2;

function parseArgs(argv) {
  const out = { cmd: null, agent: null, taskId: null, file: null, stdin: false, json: false, agentsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "check" || a === "check-all-agents") out.cmd = a;
    else if (a === "--agent") out.agent = argv[++i];
    else if (a === "--task-id") out.taskId = argv[++i];
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
  const resolved = path.join(HERE, "..", "schemas", "agent-contract-v1.json");
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

// Return true when kv has a non-empty (non-whitespace) value for key.
function hasNonEmpty(kv, key) {
  if (!kv.has(key)) return false;
  const v = kv.get(key);
  return typeof v === "string" && v.trim().length > 0;
}

// Validate a single emitted contract. Returns { violations: string[] }.
// agentId is the TRUSTED identity the hook passes via --agent (from the trusted
// JSON event's .subagent_type // .agent_type), NOT the self-reported ETRNL_AGENT
// line inside the block. agentsDir is the resolved agents directory used to
// decide whether a missing block is a violation (contracted agent) or a no-op
// (agent outside the contract rollout).
function validateContract(text, agentId, schema, agentsDir, taskId = null) {
  const violations = [];
  const block = extractBlock(text, schema);
  if (!block) {
    // Missing-block policy (FINDING #2): a missing block is only a violation when
    // the TRUSTED agent id names a contracted agent (agents/<agentId>.md exists).
    // Agents outside the contract rollout pass with zero violations (exit 0).
    if (isContractedAgent(agentId, agentsDir)) {
      return { violations: [`missing ETRNL_CONTRACT: v1 block for contracted agent ${agentId}`] };
    }
    return { violations: [] };
  }

  const kv = keyValues(block);
  // Required keys must be present AND non-empty (FINDING #14): a bare "ETRNL_LENSES:"
  // with no value must not satisfy the fail-closed required-key check.
  for (const key of schema.block.requiredKeys) {
    if (!hasNonEmpty(kv, key)) violations.push(`missing or empty required key ${key}`);
  }
  const perAgent = (agentId && schema.perAgentRequiredKeys[agentId]) || [];
  for (const key of perAgent) {
    if (!hasNonEmpty(kv, key)) violations.push(`agent ${agentId} missing or empty required key ${key}`);
  }

  // Specialized-key VALUE validation (FINDING #149): presence + non-empty is not
  // enough for keys with a deterministic machine-checkable grammar — e.g.
  // "ETRNL_REOPEN_ROUNDS: nonsense" would otherwise pass despite lacking the
  // required "<n> (tier <0-3>, cap <2|4>)" shape. For any PRESENT key that names a
  // format in schema.specializedKeyFormats, its value must match the anchored regex.
  // Genuinely free-form keys are intentionally absent from the map and stay at the
  // presence+non-empty floor. ETRNL_STOP_CYCLE and ETRNL_REQUIRED_TESTS keep their
  // dedicated reconciliation checks below.
  const specializedFormats = schema.specializedKeyFormats || {};
  for (const [key, pattern] of Object.entries(specializedFormats)) {
    if (!kv.has(key)) continue;
    const value = kv.get(key);
    if (!new RegExp(pattern).test(value)) {
      violations.push(`${key} value "${value}" does not match required format ${pattern}`);
    }
  }

  // Identity spoof check (FINDING #15): the emitted ETRNL_AGENT is self-reported
  // and must match the trusted --agent value. Profile selection below already
  // uses agentId (trusted), so this only guards against a spoofed emitted id.
  if (agentId && kv.has("ETRNL_AGENT")) {
    const emitted = kv.get("ETRNL_AGENT");
    if (emitted && emitted !== agentId) {
      violations.push(`emitted ETRNL_AGENT ${emitted} does not match trusted agent ${agentId}`);
    }
  }

  // Task-ID trust check (round-4 finding): the trusted taskId (event.task_id, passed by
  // the hook as --task-id) is authoritative. Reject a block whose ETRNL_TASK_ID differs
  // from it, and reject DUPLICATE ETRNL_TASK_ID lines — an agent could prefix a matching
  // id before a block declaring a different one to slip a hook-side first-match guard.
  const taskIdLines = block.filter((l) => /^\s*ETRNL_TASK_ID\s*[:=]/.test(l));
  if (taskIdLines.length > 1) {
    violations.push(`duplicate ETRNL_TASK_ID fields in contract block (${taskIdLines.length})`);
  }
  if (taskId && kv.has("ETRNL_TASK_ID")) {
    const emittedTask = kv.get("ETRNL_TASK_ID");
    if (emittedTask && emittedTask !== taskId) {
      violations.push(`emitted ETRNL_TASK_ID ${emittedTask} does not match trusted task ${taskId}`);
    }
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

  // Required-tests reconciliation (FINDING #12, FINDING #205): the test-wiring auditor
  // emits one required_tests line per missing gate, and each missing gate is one
  // test-CATEGORY finding. Reconcile ETRNL_REQUIRED_TESTS against the count of test-
  // category findings ONLY — not findings.length — so an unrelated docs/correctness
  // finding cannot satisfy the required-tests gate (anti-gaming). Keep the non-negative
  // integer floor: a non-numeric/empty count must not silently skip reconciliation.
  const declaredRequiredTests = kv.get("ETRNL_REQUIRED_TESTS");
  if (declaredRequiredTests !== undefined) {
    const requiredTestFindings = findings.filter((f) => f.category === "test").length;
    if (!/^\d+$/.test(declaredRequiredTests)) {
      violations.push(`ETRNL_REQUIRED_TESTS must be a non-negative integer, got "${declaredRequiredTests}"`);
    } else if (Number(declaredRequiredTests) !== requiredTestFindings) {
      violations.push(`ETRNL_REQUIRED_TESTS says ${declaredRequiredTests} but ${requiredTestFindings} test finding(s) parsed`);
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
    const dir = resolveAgentsDir(args.agentsDir);
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

  const agentsDir = resolveAgentsDir(args.agentsDir);
  const { violations } = validateContract(text, args.agent, schema, agentsDir, args.taskId);
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
