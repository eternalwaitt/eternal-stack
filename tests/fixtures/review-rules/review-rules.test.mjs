import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const runner = path.join(repoRoot, "scripts", "review-rules.mjs");
const astFixtures = path.join(here, "ast");

function run(configObj, root) {
  const cfg = path.join(mkdtempSync(path.join(tmpdir(), "rr-")), "review-rules.json");
  writeFileSync(cfg, JSON.stringify(configObj));
  const res = spawnSync("node", [runner, "check", "--config", cfg, "--root", root, "--json"], { encoding: "utf8" });
  return { code: res.status, out: JSON.parse(res.stdout) };
}

const astRule = {
  ruleId: "no-expect-any", engine: "ast_grep", mode: "block", scopeGlobs: ["*.ts"],
  lensId: "types_schema_contracts", findingKind: "maintainability", category: "unsafe-type-escape",
  severity: "medium", astGrep: { language: "typescript", pattern: "$VALUE as any" }, literal: null,
};

test("ast_grep rule flags a real cast and is AST-aware (skips the string literal)", () => {
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expect-any"], rules: [astRule] }, astFixtures);
  assert.equal(out.status, "block");
  assert.equal(code, 1);
  const files = out.findings.map((f) => f.file);
  assert.deepEqual(files, ["failing.ts"], "only failing.ts should match; near-miss string + passing must not");
});

test("literal rule flags a focused test", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rr-lit-"));
  writeFileSync(path.join(dir, "a.test.ts"), 'it.only("x", () => {});\n');
  writeFileSync(path.join(dir, "b.test.ts"), 'it("ok", () => {});\n');
  const rule = { ruleId: "no-focused-tests", engine: "literal", mode: "block", scopeGlobs: ["*.test.ts"],
    lensId: "test_delta", findingKind: "test", category: "focused-test", severity: "high",
    astGrep: null, literal: { needle: ".only(", caseSensitive: true } };
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-focused-tests"], rules: [rule] }, dir);
  assert.equal(code, 1);
  assert.deepEqual(out.findings.map((f) => f.file), ["a.test.ts"]);
});

test("warn-mode matches report but do not fail the gate", () => {
  const rule = { ...astRule, mode: "warn" };
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expect-any"], rules: [rule] }, astFixtures);
  assert.equal(out.status, "pass", "warn matches keep status pass");
  assert.equal(code, 0, "warn-mode must not fail the gate");
  assert.equal(out.findings.length, 1);
});

test("clean tree passes with zero findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rr-clean-"));
  mkdirSync(path.join(dir, "src"));
  writeFileSync(path.join(dir, "src", "ok.ts"), "export const x = 1;\n");
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expect-any"], rules: [{ ...astRule, scopeGlobs: ["src/**/*.ts"] }] }, dir);
  assert.equal(code, 0);
  assert.equal(out.findings.length, 0);
});
