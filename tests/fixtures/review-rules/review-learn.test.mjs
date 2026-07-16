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

function runLearn(root, findings) {
  const fp = path.join(root, "findings.json");
  writeFileSync(fp, JSON.stringify(findings));
  const res = spawnSync("node", [learn, "learn", "--findings", fp, "--root", root, "--json"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return {
    metric: JSON.parse(res.stdout),
    rules: JSON.parse(readFileSync(path.join(root, "review-rules.json"), "utf8")),
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
