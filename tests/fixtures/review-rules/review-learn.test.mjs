import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const learn = path.join(repoRoot, "scripts", "review-learn.mjs");

function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "rl-"));
  mkdirSync(path.join(root, "templates"));
  copyFileSync(path.join(repoRoot, "templates", "review-rules.example.json"), path.join(root, "templates", "review-rules.example.json"));
  writeFileSync(path.join(root, "review-rules.json"), JSON.stringify({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: [], rules: [] }));
  return root;
}

function runLearn(root, findings, { reviewId = null } = {}) {
  const fp = path.join(root, "findings.json");
  writeFileSync(fp, JSON.stringify(findings));
  const args = [learn, "learn", "--findings", fp, "--root", root, "--json"];
  if (reviewId) args.push("--review-id", reviewId);
  const res = spawnSync("node", args, { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return {
    metric: JSON.parse(res.stdout),
    rules: JSON.parse(readFileSync(path.join(root, "review-rules.json"), "utf8")),
    ledger: JSON.parse(readFileSync(path.join(root, "review-learnings.json"), "utf8")),
  };
}

const asAny = [{ summary: "Avoid `as any` cast", body: "unsafe type escape", severity: "minor", lensId: "types_schema_contracts", category: "unsafe-type-escape" }];
const tenant = [{ summary: "Missing tenantId filter", body: "query not scoped to tenant", severity: "major", lensId: "security_privacy_tenancy", category: "tenant-scope" }];

test("3 recurrences of a template-matching finding auto-promote a WARN guard", () => {
  const root = freshRoot();
  runLearn(root, asAny); // 1
  runLearn(root, asAny); // 2
  const third = runLearn(root, asAny); // 3 -> promote
  assert.equal(third.metric.newGuardPromotions.length, 1);
  const rule = third.rules.rules.find((r) => r.ruleId === "no-expect-any");
  assert.ok(rule, "no-expect-any rule was added");
  assert.equal(rule.mode, "warn", "auto-promoted guard starts in warn mode");
  assert.ok(third.rules.enabledRuleIds.includes("no-expect-any"));
});

test("a promoted warn guard escalates to BLOCK after 2 clean runs", () => {
  const root = freshRoot();
  runLearn(root, asAny); runLearn(root, asAny); runLearn(root, asAny); // promote -> warn
  runLearn(root, tenant); // clean run 1 (no as-any)
  const after = runLearn(root, tenant); // clean run 2 -> escalate
  const rule = after.rules.rules.find((r) => r.ruleId === "no-expect-any");
  assert.equal(rule.mode, "block", "warn escalates to block after 2 clean runs");
  assert.equal(after.metric.escalations.length, 1);
});

test("a non-template finding becomes a checklist candidate, not a guard", () => {
  const root = freshRoot();
  runLearn(root, tenant); runLearn(root, tenant);
  const third = runLearn(root, tenant);
  assert.equal(third.metric.newGuardPromotions.length, 0);
  assert.equal(third.metric.newChecklistCandidates.length, 1);
  assert.equal(third.rules.rules.length, 0, "no deterministic rule invented from prose");
});

test("re-processing the same --review-id leaves recurrence counters unchanged (idempotent)", () => {
  const root = freshRoot();
  const first = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  const recurrenceAfterFirst = first.ledger.recurrences;
  // Re-run the SAME review id twice more: must not advance recurrence counts.
  const again = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  const final = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  assert.equal(again.metric.alreadyProcessed, true, "the second run is a no-op");
  assert.deepEqual(final.ledger.recurrences, recurrenceAfterFirst, "counts frozen at the first processing");
  assert.equal(final.metric.newGuardPromotions.length, 0, "reprocessing never promotes");

  // A DISTINCT review id with the same class DOES count as a new recurrence.
  const distinct = runLearn(root, asAny, { reviewId: "pr-43-review-1" });
  const key = Object.keys(recurrenceAfterFirst)[0];
  assert.equal(distinct.ledger.recurrences[key], recurrenceAfterFirst[key] + 1, "a new review advances the count");
});

test("--threshold rejects non-positive-integer values", () => {
  const root = freshRoot();
  const fp = path.join(root, "findings.json");
  writeFileSync(fp, JSON.stringify(asAny));
  for (const bad of ["0", "-1", "1.5", "abc"]) {
    const res = spawnSync("node", [learn, "learn", "--findings", fp, "--root", root, "--threshold", bad, "--json"], { encoding: "utf8" });
    assert.notEqual(res.status, 0, `threshold ${bad} must be rejected`);
    assert.match(res.stderr, /threshold must be a positive integer/);
  }
});

test("an already-present guard records a promotion, not a duplicate checklist candidate", () => {
  const root = freshRoot();
  // Seed the guard as if no-expect-any already shipped enabled in review-rules.json.
  writeFileSync(path.join(root, "review-rules.json"), JSON.stringify({
    schemaVersion: 1, rulesetId: "t", version: 1,
    enabledRuleIds: ["no-expect-any"],
    rules: [{ ruleId: "no-expect-any", mode: "warn", version: 1 }],
  }));
  runLearn(root, asAny); runLearn(root, asAny);
  const third = runLearn(root, asAny); // threshold reached with the guard already present
  assert.equal(third.metric.newGuardPromotions.length, 1, "existing guard recorded as a promotion");
  assert.equal(third.metric.newChecklistCandidates.length, 0, "not relabeled as a checklist candidate");
  assert.equal(third.rules.rules.filter((r) => r.ruleId === "no-expect-any").length, 1, "no duplicate rule appended");
});
