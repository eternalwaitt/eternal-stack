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
function check(text, { agent = null } = {}) {
  const args = [runner, "check", "--stdin", "--json"];
  if (agent) args.push("--agent", agent);
  const res = spawnSync("node", args, { encoding: "utf8", input: text });
  return { code: res.status, out: res.stdout ? JSON.parse(res.stdout) : null };
}

const block = (lines) => "Some preamble.\n\n" + lines.join("\n") + "\n";

const validVerified = block([
  "ETRNL_CONTRACT: v1",
  "ETRNL_AGENT: etrnl-design-reviewer",
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
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: x", "ETRNL_STATUS: blocked", "ETRNL_LENSES: a", "ETRNL_FINDINGS: 1",
    "- bug | auth | src/auth.ts:10 | request omits tenantId -> cross-tenant read | add tenantId filter",
  ]);
  const { code } = check(text);
  assert.equal(code, 0);
});

test("no contract block is a violation, not a crash", () => {
  const { code, out } = check("just some text, no contract here\n");
  assert.equal(code, 1);
  assert.ok(out.violations.some((v) => v.includes("contract block")));
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
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-scout", "ETRNL_STATUS: completed", "ETRNL_LENSES: reuse-map",
    "ETRNL_FINDINGS: 0", "ETRNL_CONFIDENCE: high",
  ]);
  const { code } = check(text, { agent: "etrnl-scout" });
  assert.equal(code, 0);
});

test("worker profile: 'completed' with a non-bug finding is allowed", () => {
  const text = block([
    "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-investigator", "ETRNL_STATUS: completed", "ETRNL_LENSES: root-cause",
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
      "ETRNL_CONTRACT: v1", "ETRNL_AGENT: etrnl-design-reviewer", "ETRNL_STATUS: verified|changes_requested|blocked",
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
