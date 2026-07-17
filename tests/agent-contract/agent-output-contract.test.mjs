import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const runner = path.join(repoRoot, "scripts", "agent-output-contract.mjs");

// Validate a contract by piping it to --stdin (the path the SubagentStop hook uses).
function check(text, { agent = null, agentsDir = null, taskId = null } = {}) {
  const args = [runner, "check", "--stdin", "--json"];
  if (agent) args.push("--agent", agent);
  if (agentsDir) args.push("--agents-dir", agentsDir);
  if (taskId) args.push("--task-id", taskId);
  const res = spawnSync("node", args, { encoding: "utf8", input: text });
  return { code: res.status, out: res.stdout ? JSON.parse(res.stdout) : null };
}

const block = (lines) => "Some preamble.\n\n" + lines.join("\n") + "\n";

const validVerified = block([
  "ETRNL_CONTRACT: v1",
  "ETRNL_AGENT: etrnl-design-reviewer",
  "ETRNL_TASK_ID: T-1",
  "ETRNL_STATUS: verified",
  "ETRNL_LENSES: layout, contrast",
  "ETRNL_FINDINGS: 0",
]);

test("valid verified contract with no findings passes", () => {
  const { code, out } = check(validVerified, { agent: "etrnl-design-reviewer" });
  assert.equal(code, 0);
  assert.equal(out.status, "pass");
});

test("valid blocked contract with a bug finding passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1",
    "ETRNL_AGENT: etrnl-design-reviewer",
    "ETRNL_TASK_ID: T-1",
    "ETRNL_STATUS: blocked",
    "ETRNL_LENSES: correctness",
    "ETRNL_FINDINGS: 1",
    "- bug | correctness | src/foo.ts:42 | off-by-one in loop bound | use <= length",
  ]);
  const { code } = check(text, { agent: "etrnl-design-reviewer" });
  assert.equal(code, 0);
});

test("missing ETRNL_STATUS is a violation naming the key", () => {
  const text = block(["ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0"]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_STATUS")));
});

test("blocked status with zero findings contradicts the deterministic rule", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: blocked", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("deterministic")));
});

test("verified status with a bug finding is rejected (anti-gaming)", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: verified", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- bug | correctness | a.ts:1 | crash | guard it",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("contradicts")));
});

test("malformed finding line is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: changes_requested", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- this is not the grammar",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("malformed")));
});

test("fenced-critical bug without the -> chain is rejected (two-tier)", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: blocked", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- bug | auth | src/auth.ts:10 | missing tenant check | add tenantId filter",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("chain")));
});

test("fenced-critical bug WITH the -> chain passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: blocked", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- bug | auth | src/auth.ts:10 | request omits tenantId -> cross-tenant read | add tenantId filter",
  ]);
  const { code } = check(text);
  assert.equal(code, 0);
});

test("no contract block for a contracted agent is a violation, not a crash", () => {
  const { code, out } = check("just some text, no contract here\n", { agent: "etrnl-scout" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("missing ETRNL_CONTRACT: v1 block for contracted agent etrnl-scout")));
});

test("no contract block with an unavailable agents registry fails closed (exit 2), never a silent pass", () => {
  // The registry can't confirm the agent is non-contracted, so an omitted contract
  // must NOT pass — it becomes cannot-evaluate (exit 2), which the hook blocks on.
  const { code } = check("just some text, no contract here\n", {
    agent: "etrnl-scout",
    agentsDir: path.join(tmpdir(), "etrnl-no-such-agents-dir-xyz"),
  });
  assert.equal(code, 2);
});

test("no contract block with an agents registry that is a regular file fails closed (exit 2)", () => {
  // existsSync() would accept a regular file at agentsDir; statSync().isDirectory() must not.
  const filePath = path.join(mkdtempSync(path.join(tmpdir(), "etrnl-agentsfile-")), "not-a-dir");
  writeFileSync(filePath, "i am a file, not a registry\n");
  const { code } = check("just some text, no contract here\n", { agent: "etrnl-scout", agentsDir: filePath });
  assert.equal(code, 2);
});

test("contract ETRNL_TASK_ID that differs from the trusted --task-id is a violation", () => {
  // validVerified declares ETRNL_TASK_ID: T-1; the hook passes the trusted event id.
  const { code, out } = check(validVerified, { agent: "etrnl-design-reviewer", taskId: "T-2" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("does not match trusted task T-2")));
});

test("a matching --task-id passes; a task id prefixed BEFORE the block cannot spoof it", () => {
  // A prefix line before the ETRNL_CONTRACT marker is outside the extracted block, so the
  // authoritative comparison is against the block's own ETRNL_TASK_ID.
  const pass = check(validVerified, { agent: "etrnl-design-reviewer", taskId: "T-1" });
  assert.equal(pass.code, 0);
  const spoof = "ETRNL_TASK_ID: T-1\n" + validVerified.replace("ETRNL_TASK_ID: T-1", "ETRNL_TASK_ID: OTHER");
  const { code, out } = check(spoof, { agent: "etrnl-design-reviewer", taskId: "T-1" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("does not match trusted task T-1")));
});

test("duplicate ETRNL_TASK_ID lines inside the contract block are a violation", () => {
  const dup = block([
    "ETRNL_CONTRACT: v1",
    "ETRNL_AGENT: etrnl-design-reviewer",
    "ETRNL_TASK_ID: T-1",
    "ETRNL_TASK_ID: T-1",
    "ETRNL_STATUS: verified",
    "ETRNL_LENSES: layout",
    "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(dup, { agent: "etrnl-design-reviewer", taskId: "T-1" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("duplicate ETRNL_TASK_ID")));
});

test("empty input is cannot-evaluate (exit 2), never a clean pass", () => {
  const { code } = check("");
  assert.equal(code, 2);
});

test("adversary missing its required keys is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-adversary", "ETRNL_STATUS: verified", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text, { agent: "etrnl-adversary" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_ATTACK_CLASSES")));
});

test("adversary stop-cycle above 3 is rejected", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-adversary", "ETRNL_STATUS: verified", "ETRNL_LENSES: a",
    "ETRNL_FINDINGS: 0", "ETRNL_ATTACK_CLASSES: race, injection", "ETRNL_STOP_CYCLE: 4",
  ]);
  const { code, out } = check(text, { agent: "etrnl-adversary" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_STOP_CYCLE")));
});

test("declared finding count must match parsed findings", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: changes_requested", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 3",
    "- risk | perf | a.ts:1 | n+1 query | batch it",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_FINDINGS")));
});

test("non-numeric ETRNL_FINDINGS fails closed (cannot skip reconciliation)", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: changes_requested", "ETRNL_LENSES: a", "ETRNL_FINDINGS: three",
    "- risk | perf | a.ts:1 | n+1 query | batch it",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_FINDINGS must be a non-negative integer")));
});

test("finding with a category outside the taxonomy is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: changes_requested", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- risk | boguscat | a.ts:1 | x | y",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("not in taxonomy")));
});

test("worker profile: scout 'completed' with no findings passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-scout", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: completed", "ETRNL_LENSES: reuse-map",
    "ETRNL_FINDINGS: 0", "ETRNL_CONFIDENCE: high",
  ]);
  const { code } = check(text, { agent: "etrnl-scout" });
  assert.equal(code, 0);
});

test("worker profile: 'completed' with a non-bug finding is allowed", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-investigator", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: completed", "ETRNL_LENSES: root-cause",
    "ETRNL_FINDINGS: 1", "ETRNL_CONFIDENCE: medium", "- risk | perf | a.ts:3 | slow path | cache it",
  ]);
  const { code } = check(text, { agent: "etrnl-investigator" });
  assert.equal(code, 0);
});

test("worker profile: a bug finding still forces blocked", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-executor", "ETRNL_STATUS: completed", "ETRNL_LENSES: impl",
    "ETRNL_FINDINGS: 1", "- bug | correctness | a.ts:1 | crash | fix it",
  ]);
  const { code, out } = check(text, { agent: "etrnl-executor" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("contradicts")));
});

test("worker profile: reviewer-only status 'verified' is rejected for a worker", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-scout", "ETRNL_STATUS: verified", "ETRNL_LENSES: map",
    "ETRNL_FINDINGS: 0", "ETRNL_CONFIDENCE: low",
  ]);
  const { code, out } = check(text, { agent: "etrnl-scout" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("worker profile")));
});

test("check-all-agents flags a non-conformant agent template and passes a conformant one", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agents-"));
  writeFileSync(path.join(dir, "etrnl-thin.md"), "# Thin agent\nNo contract here.\n");
  writeFileSync(
    path.join(dir, "etrnl-design-reviewer.md"),
    [
      "# Design reviewer", "Output format — emit this contract block:",
      "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-design-reviewer", "ETRNL_TASK_ID: <id>", "ETRNL_STATUS: verified|changes_requested|blocked",
      "ETRNL_LENSES: <ran>", "ETRNL_FINDINGS: <n>",
    ].join("\n") + "\n",
  );
  const res = spawnSync("node", [runner, "check-all-agents", "--agents-dir", dir, "--json"], { encoding: "utf8" });
  assert.equal(res.status, 1);
  const out = JSON.parse(res.stdout);
  const thin = out.results.find((r) => r.agent === "etrnl-thin");
  const good = out.results.find((r) => r.agent === "etrnl-design-reviewer");
  assert.ok(thin.violations.length > 0);
  assert.equal(good.violations.length, 0);
});

// --- Trust-boundary / missing-block policy (FINDING #2) ---

test("unknown agent with no contract block exits 0 (outside the rollout)", () => {
  const { code, out } = check("just some text, no contract here\n", { agent: "general-purpose" });
  assert.equal(code, 0);
  assert.equal(out.status, "pass");
  assert.equal(out.violations.length, 0);
});

// --- Identity spoof: emitted ETRNL_AGENT must match trusted --agent (FINDING #15) ---

test("emitted ETRNL_AGENT that differs from the trusted --agent is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-design-reviewer", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text, { agent: "etrnl-scout" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("emitted ETRNL_AGENT etrnl-design-reviewer does not match trusted agent etrnl-scout")));
});

// --- Required keys must be present AND non-empty (FINDING #14) ---

test("a bare required key with an empty value is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES:", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("missing or empty required key ETRNL_LENSES")));
});

// --- ETRNL_TASK_ID is required and must be non-empty (FINDING #11) ---

test("missing ETRNL_TASK_ID is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: verified", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("missing or empty required key ETRNL_TASK_ID")));
});

test("blank ETRNL_TASK_ID is a violation (no notask verdict-key collision)", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_TASK_ID:", "ETRNL_STATUS: verified", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text);
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("missing or empty required key ETRNL_TASK_ID")));
});

// --- Per-agent specialized keys for browser-qa / spec-reviewer / test-wiring-auditor (FINDING #12) ---

test("browser-qa missing a specialized key (ETRNL_ROUTES_CHECKED) is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-browser-qa", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: layout", "ETRNL_FINDINGS: 0",
    "ETRNL_VIEWPORTS_CHECKED: mobile", "ETRNL_REPORT_PATH: none", "ETRNL_READY_FOR_FINAL_GATE: yes",
  ]);
  const { code, out } = check(text, { agent: "etrnl-browser-qa" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_ROUTES_CHECKED")));
});

test("spec-reviewer missing a specialized key (ETRNL_TIER_B_COVERAGE) is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-spec-reviewer", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: scope", "ETRNL_FINDINGS: 0",
    "ETRNL_EVIDENCE_CHECKED: none", "ETRNL_READY_TO_EXECUTE: yes",
  ]);
  const { code, out } = check(text, { agent: "etrnl-spec-reviewer" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_TIER_B_COVERAGE")));
});

test("test-wiring-auditor missing its specialized key (ETRNL_REQUIRED_TESTS) is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-test-wiring-auditor", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: coverage", "ETRNL_FINDINGS: 0",
  ]);
  const { code, out } = check(text, { agent: "etrnl-test-wiring-auditor" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_REQUIRED_TESTS")));
});

test("test-wiring-auditor ETRNL_REQUIRED_TESTS that disagrees with the finding count is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-test-wiring-auditor", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: changes_requested",
    "ETRNL_LENSES: coverage", "ETRNL_FINDINGS: 1", "ETRNL_REQUIRED_TESTS: 2",
    "- risk | test | a.ts:1 | new branch uncovered | add a case exercising the branch",
  ]);
  const { code, out } = check(text, { agent: "etrnl-test-wiring-auditor" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_REQUIRED_TESTS says 2 but 1 test finding(s) parsed")));
});

test("browser-qa with all specialized keys present passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-browser-qa", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: layout", "ETRNL_FINDINGS: 0",
    "ETRNL_ROUTES_CHECKED: /", "ETRNL_VIEWPORTS_CHECKED: mobile", "ETRNL_REPORT_PATH: none", "ETRNL_READY_FOR_FINAL_GATE: yes",
  ]);
  const { code } = check(text, { agent: "etrnl-browser-qa" });
  assert.equal(code, 0);
});

// --- ETRNL_REQUIRED_TESTS counts TEST-category findings only (FINDING #205) ---

test("ETRNL_REQUIRED_TESTS satisfied only by a non-test finding is a violation", () => {
  // One finding, but it is a docs finding — zero test-category findings. A required-
  // tests count of 1 must NOT be satisfied by an unrelated finding.
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-test-wiring-auditor", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: changes_requested",
    "ETRNL_LENSES: coverage", "ETRNL_FINDINGS: 1", "ETRNL_REQUIRED_TESTS: 1",
    "- risk | docs | a.ts:1 | stale comment | update the doc",
  ]);
  const { code, out } = check(text, { agent: "etrnl-test-wiring-auditor" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_REQUIRED_TESTS says 1 but 0 test finding(s) parsed")));
});

test("ETRNL_REQUIRED_TESTS equal to the test-category finding count passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-test-wiring-auditor", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: changes_requested",
    "ETRNL_LENSES: coverage", "ETRNL_FINDINGS: 2", "ETRNL_REQUIRED_TESTS: 1",
    "- risk | test | a.ts:1 | new branch uncovered | add a case exercising the branch",
    "- risk | docs | a.ts:2 | stale comment | update the doc",
  ]);
  const { code } = check(text, { agent: "etrnl-test-wiring-auditor" });
  assert.equal(code, 0);
});

// --- Specialized-key VALUE validation (FINDING #149) ---

test("malformed specialized value (ETRNL_REOPEN_ROUNDS: nonsense) is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-quality-reviewer", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: reuse", "ETRNL_FINDINGS: 0", "ETRNL_REOPEN_ROUNDS: nonsense",
  ]);
  const { code, out } = check(text, { agent: "etrnl-quality-reviewer" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_REOPEN_ROUNDS value \"nonsense\" does not match required format")));
});

test("well-formed specialized value (ETRNL_REOPEN_ROUNDS: 1 (tier 2, cap 4)) passes", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-quality-reviewer", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: reuse", "ETRNL_FINDINGS: 0", "ETRNL_REOPEN_ROUNDS: 1 (tier 2, cap 4)",
  ]);
  const { code } = check(text, { agent: "etrnl-quality-reviewer" });
  assert.equal(code, 0);
});

test("malformed boolean gate (ETRNL_READY_TO_EXECUTE: maybe) is a violation", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-spec-reviewer", "ETRNL_TASK_ID: T-1", "ETRNL_STATUS: verified",
    "ETRNL_LENSES: scope", "ETRNL_FINDINGS: 0",
    "ETRNL_EVIDENCE_CHECKED: none", "ETRNL_TIER_B_COVERAGE: none-applicable", "ETRNL_READY_TO_EXECUTE: maybe",
  ]);
  const { code, out } = check(text, { agent: "etrnl-spec-reviewer" });
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("ETRNL_READY_TO_EXECUTE value \"maybe\" does not match required format")));
});
