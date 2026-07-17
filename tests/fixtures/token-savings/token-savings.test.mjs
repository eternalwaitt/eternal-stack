// P7 token accounting: exercise scripts/token-savings.mjs against a temp ledger
// with mixed agents[] records. Holdout membership is deterministic (stable hash
// of the agent id mod 100 < holdout-percent), so the ids below are chosen so
// that at --holdout-percent 50: `spec-*` and `costly-*` are SCORED, `held-*`
// are HELD OUT. Mirrors tests/fixtures/review-rules/new-guards.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const script = path.join(repoRoot, "scripts", "token-savings.mjs");

// Held-out token total is the sum of `held-*` outputTokens below. It must never
// appear in totals.totalOutputTokens.
const HELDOUT_TOKENS = 9000 + 800;

function writeLedger(agents) {
  const root = mkdtempSync(path.join(tmpdir(), "ts-"));
  const ledgerPath = path.join(root, "run-fixture.json");
  writeFileSync(ledgerPath, JSON.stringify({
    schemaVersion: 2,
    runId: "run-fixture",
    tasks: [],
    checks: [],
    agents,
  }));
  return ledgerPath;
}

function runReport(ledgerPath, extraArgs = []) {
  const res = spawnSync(
    "node",
    [script, "report", "--ledger", ledgerPath, "--json", "--holdout-percent", "50", ...extraArgs],
    { encoding: "utf8" },
  );
  return { code: res.status, out: JSON.parse(res.stdout), stderr: res.stderr };
}

const AGENTS = [
  // SCORED spec reviewer: cheap, high findings.
  { id: "spec-a", role: "subagent", status: "completed", taskId: "T1", agentType: "etrnl-spec-reviewer", outputTokens: 400, findingsCount: 3 },
  { id: "spec-b", role: "subagent", status: "completed", taskId: "T1", agentType: "etrnl-spec-reviewer", outputTokens: 200, findingsCount: 2 },
  // SCORED costly agent: high tokens, ZERO findings -> net-negative.
  { id: "costly-1", role: "subagent", status: "completed", taskId: "T2", agentType: "etrnl-quality-reviewer", outputTokens: 5000, findingsCount: 0 },
  // HELD OUT records: excluded from savings totals entirely.
  { id: "held-1", role: "subagent", status: "completed", taskId: "T3", agentType: "etrnl-spec-reviewer", outputTokens: 9000, findingsCount: 0 },
  { id: "held-2", role: "subagent", status: "completed", taskId: "T3", agentType: "etrnl-spec-reviewer", outputTokens: 800, findingsCount: 5 },
];

test("reports a per-agentType token line for scored records", () => {
  const ledgerPath = writeLedger(AGENTS);
  const { code, out } = runReport(ledgerPath);
  assert.equal(code, 0);
  const spec = out.perAgent.find((entry) => entry.agentType === "etrnl-spec-reviewer");
  assert.ok(spec, "per-agent line for etrnl-spec-reviewer exists");
  // Only the two SCORED spec records (400 + 200); the held-out spec records are excluded.
  assert.equal(spec.recordCount, 2);
  assert.equal(spec.totalOutputTokens, 600);
  assert.equal(spec.meanOutputTokens, 300);
  assert.equal(spec.totalFindings, 5);
});

test("flags a zero-finding high-token agent as net-negative", () => {
  const ledgerPath = writeLedger(AGENTS);
  const { out } = runReport(ledgerPath);
  const flagged = out.netNegative.find((entry) => entry.id === "costly-1");
  assert.ok(flagged, "costly-1 is listed as a net-negative contract");
  assert.equal(flagged.agentType, "etrnl-quality-reviewer");
  assert.equal(flagged.outputTokens, 5000);
  assert.equal(flagged.findingsCount, 0);
  const quality = out.perAgent.find((entry) => entry.agentType === "etrnl-quality-reviewer");
  assert.equal(quality.netNegative, true);
});

test("excludes holdout records from the savings totals", () => {
  const ledgerPath = writeLedger(AGENTS);
  const { out } = runReport(ledgerPath);
  // Both held-* records are in the holdout at 50%.
  assert.equal(out.holdout.count, 2);
  assert.equal(out.holdout.excludedTokens, HELDOUT_TOKENS);
  // Scored total = spec 600 + costly 5000; held-out 9800 tokens are NOT counted.
  assert.equal(out.totals.recordCount, 3);
  assert.equal(out.totals.totalOutputTokens, 5600);
  assert.ok(
    !out.perAgent.some((entry) => entry.totalOutputTokens >= HELDOUT_TOKENS),
    "no per-agent bucket absorbed the held-out tokens",
  );
});

test("--net-negative-threshold flags at exactly the boundary (>=, not >)", () => {
  // Both ids are SCORED (not held out) at --holdout-percent 50: stable-hash of
  // "node-5000" and "node-4999" mod 100 are each >= 50. At threshold 5000 the
  // 5000-token agent must be flagged (proving >=) and the 4999-token one must
  // not (proving the boundary is not >).
  const ledgerPath = writeLedger([
    { id: "node-5000", role: "subagent", status: "completed", taskId: "B", agentType: "boundary-at", outputTokens: 5000, findingsCount: 0 },
    { id: "node-4999", role: "subagent", status: "completed", taskId: "B", agentType: "boundary-below", outputTokens: 4999, findingsCount: 0 },
  ]);
  const { code, out } = runReport(ledgerPath, ["--net-negative-threshold", "5000"]);
  assert.equal(code, 0);
  assert.equal(out.totals.netNegativeThreshold, 5000);
  // Both records are scored, so neither is siphoned into the holdout.
  assert.equal(out.holdout.count, 0);
  assert.equal(out.totals.recordCount, 2);
  const flaggedIds = out.netNegative.map((entry) => entry.id);
  assert.deepEqual(flaggedIds, ["node-5000"]);
  const atBoundary = out.perAgent.find((entry) => entry.agentType === "boundary-at");
  assert.equal(atBoundary.netNegative, true);
  const belowBoundary = out.perAgent.find((entry) => entry.agentType === "boundary-below");
  assert.equal(belowBoundary.netNegative, false);
});

test("guards empty input with a zero-state report and exit 0", () => {
  const ledgerPath = writeLedger([]);
  const { code, out } = runReport(ledgerPath);
  assert.equal(code, 0);
  assert.equal(out.totals.recordCount, 0);
  assert.equal(out.perAgent.length, 0);
  assert.equal(out.netNegative.length, 0);
});

test("rejects --holdout-percent above 100 with exit 2", () => {
  const ledgerPath = writeLedger(AGENTS);
  const res = spawnSync(
    "node",
    [script, "report", "--ledger", ledgerPath, "--json", "--holdout-percent", "101"],
    { encoding: "utf8" },
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--holdout-percent must be between 0 and 100/);
});

test("accepts --holdout-percent 100 (control)", () => {
  const ledgerPath = writeLedger(AGENTS);
  const res = spawnSync(
    "node",
    [script, "report", "--ledger", ledgerPath, "--json", "--holdout-percent", "100"],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 0);
});

test("exits 2 on an explicitly requested unreadable ledger", () => {
  const res = spawnSync(
    "node",
    [script, "report", "--ledger", path.join(tmpdir(), "does-not-exist-token-savings.json"), "--json"],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 2);
});
