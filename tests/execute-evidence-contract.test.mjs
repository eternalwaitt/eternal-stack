import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reviewReceiptFixture } from "./helpers/review-receipt-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveWorkflowContract } from "../scripts/lib/workflow-contract.mjs";

const checker = fileURLToPath(new URL("../scripts/execute-evidence-check.mjs", import.meta.url));
const at = "2026-10-10T12:00:00.000Z";
const digest = createHash("sha256").update("").digest("hex");

function baseState(contract) {
  return {
    workflowContract: contract,
    requestedSkills: [{ value: "etrnl-dev-execute", at }],
    edits: { "src/change.js": { at, created: false } },
  };
}

function status(state) {
  const result = spawnSync(process.execPath, [checker], { input: JSON.stringify(state), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commandReceipt() {
  return [{
    evidenceKind: "command-run",
    status: "passed",
    exitCode: 0,
    argv: ["node", "test.js"],
    outputDigest: digest,
    startedTreeHash: "a".repeat(64),
    treeHash: "a".repeat(64),
    at,
  }];
}

test("direct source task completes with captured verification and no packet or agent paperwork", () => {
  const contract = resolveWorkflowContract({ version: 1, intent: "fix", scope: "contained", risk: "low" });
  const state = baseState(contract);
  assert.equal(status(state), "missing-mechanical-verification");
  state.commandRunEvidence = commandReceipt();
  assert.equal(status(state), "");
});

test("high-risk structured source task requires recorded review plus mechanical verification", (t) => {
  const contract = resolveWorkflowContract({ version: 1, intent: "build", scope: "coupled", risk: "high" });
  const state = baseState(contract);
  state.commandRunEvidence = commandReceipt();
  assert.equal(status(state), "missing-independent-review");
  state.contractReviewEvidence = [{ reviewer: "independent-reviewer", independent: true, status: "verified", at }];
  assert.equal(status(state), "missing-independent-review", "self-attestation is not reviewer output");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-review-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = reviewReceiptFixture(root, {}, "a".repeat(64));
  state.contractReviewEvidence = [{ ...receipt, independent: true, at }];
  assert.equal(status(state), "");
  fs.appendFileSync(receipt.artifactPath, " ");
  assert.equal(status(state), "missing-independent-review", "tampered output invalidates receipt");
});

test("high-risk read-only work does not demand a second reviewer or a verification command", () => {
  const contract = resolveWorkflowContract({ version: 1, intent: "review", scope: "contained", risk: "high" });
  assert.equal(status(baseState(contract)), "");
});

test("forged or invalid workflow contracts fail visibly", () => {
  const invalid = { ...resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }), mode: "program" };
  assert.equal(status(baseState(invalid)), "invalid-workflow-contract");
});
