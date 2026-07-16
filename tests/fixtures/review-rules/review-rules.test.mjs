import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const runner = path.join(repoRoot, "scripts", "review-rules.mjs");
const astFixtures = path.join(here, "ast");

function run(configObj, root, { changedOnly = false, base = null } = {}) {
  const cfg = path.join(mkdtempSync(path.join(tmpdir(), "rr-")), "review-rules.json");
  writeFileSync(cfg, JSON.stringify(configObj));
  const args = [runner, "check", "--config", cfg, "--root", root];
  if (changedOnly) args.push("--changed-only");
  if (base) args.push("--base", base);
  args.push("--json");
  const res = spawnSync("node", args, { encoding: "utf8" });
  return { code: res.status, out: JSON.parse(res.stdout) };
}

const git = (root, args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
function gitRepo(root) {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
}

const focusedRule = {
  ruleId: "no-focused-tests", engine: "literal", mode: "block", scopeGlobs: ["*.test.ts"],
  lensId: "test_delta", findingKind: "test", category: "focused-test", severity: "high",
  astGrep: null, literal: { needle: ".only(", caseSensitive: true },
};

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

test("the shipped no-focused-tests rule catches focused tests in .spec.{ts,tsx,js} files", () => {
  // Exercises the REAL review-rules.json scopeGlobs (not a mirror) so the added
  // **/*.spec.* patterns are proven to match, not just present in the config.
  const realConfig = JSON.parse(readFileSync(path.join(repoRoot, "review-rules.json"), "utf8"));
  const dir = mkdtempSync(path.join(tmpdir(), "rr-spec-"));
  writeFileSync(path.join(dir, "a.spec.ts"), 'it.only("x", () => {});\n');
  writeFileSync(path.join(dir, "b.spec.tsx"), 'describe.only("y", () => {});\n');
  writeFileSync(path.join(dir, "c.spec.js"), 'test.only("z", () => {});\n');
  writeFileSync(path.join(dir, "clean.spec.ts"), 'it("ok", () => {});\n');
  const cfg = { ...realConfig, enabledRuleIds: ["no-focused-tests"] };
  const { code, out } = run(cfg, dir);
  assert.equal(code, 1);
  assert.deepEqual(out.findings.map((f) => f.file).sort(), ["a.spec.ts", "b.spec.tsx", "c.spec.js"].sort(),
    "focused tests in .spec.ts/.spec.tsx/.spec.js are all caught; the non-focused .spec.ts is not");
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

test("--changed-only evaluates working-tree changes, not committed-clean files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rr-changed-"));
  gitRepo(dir);
  writeFileSync(path.join(dir, "clean.test.ts"), 'it.only("clean", () => {});\n');
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  // dirty.test.ts is a new untracked change; clean.test.ts stays committed-clean.
  writeFileSync(path.join(dir, "dirty.test.ts"), 'it.only("dirty", () => {});\n');
  const cfg = { schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-focused-tests"], rules: [focusedRule] };

  const full = run(cfg, dir);
  assert.deepEqual(full.out.findings.map((f) => f.file).sort(), ["clean.test.ts", "dirty.test.ts"]);

  const changed = run(cfg, dir, { changedOnly: true });
  assert.deepEqual(changed.out.findings.map((f) => f.file), ["dirty.test.ts"],
    "changed-only must exclude committed-clean files");
});

test("a malformed ast-grep pattern fails closed (exit 2, status error), not a false pass", () => {
  const rule = { ...astRule, astGrep: { language: "typescript", pattern: "const (((" } };
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expect-any"], rules: [rule] }, astFixtures);
  assert.equal(code, 2);
  assert.equal(out.status, "error");
});

test("an invalid ast-grep --lang fails closed (exit 2), not a silent no-match pass", () => {
  const rule = { ...astRule, astGrep: { language: "definitely-not-a-language", pattern: "$V as any" } };
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expect-any"], rules: [rule] }, astFixtures);
  assert.equal(code, 2);
  assert.equal(out.status, "error");
});

test("a typo in enabledRuleIds fails closed (exit 2), not an empty clean pass", () => {
  const { code, out } = run({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-expct-any"], rules: [astRule] }, astFixtures);
  assert.equal(code, 2);
  assert.equal(out.status, "error");
  assert.match(out.error, /unknown ruleId/);
});

test("an invalid config (bad schemaVersion) fails closed (exit 2)", () => {
  const { code, out } = run({ schemaVersion: 99, rules: [] }, astFixtures);
  assert.equal(code, 2);
  assert.equal(out.status, "error");
});

test("--base scopes to the outgoing commit range, catching commits a clean worktree hides", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rr-base-"));
  gitRepo(dir);
  writeFileSync(path.join(dir, "clean.test.ts"), 'it("ok", () => {});\n');
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  git(dir, ["branch", "base-ref"]); // pre-push base marker
  // A focused test committed on top; the worktree ends clean (the pre-push shape).
  writeFileSync(path.join(dir, "dirty.test.ts"), 'it.only("x", () => {});\n');
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "outgoing"]);
  const cfg = { schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-focused-tests"], rules: [focusedRule] };

  // --changed-only alone sees nothing: the change is committed, worktree is clean.
  assert.equal(run(cfg, dir, { changedOnly: true }).out.findings.length, 0);
  // --base sees the committed outgoing change and blocks.
  const ranged = run(cfg, dir, { base: "base-ref" });
  assert.equal(ranged.code, 1);
  assert.deepEqual(ranged.out.findings.map((f) => f.file), ["dirty.test.ts"]);
});

test("--base fails closed when the ref cannot be resolved", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rr-base-bad-"));
  gitRepo(dir);
  writeFileSync(path.join(dir, "a.test.ts"), 'it("ok", () => {});\n');
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  const cfg = { schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: ["no-focused-tests"], rules: [focusedRule] };
  const { code, out } = run(cfg, dir, { base: "no-such-ref" });
  assert.equal(code, 2);
  assert.equal(out.status, "error");
  assert.match(out.error, /cannot resolve --base/);
});
