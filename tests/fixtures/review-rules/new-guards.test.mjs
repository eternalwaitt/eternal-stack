// P6 deterministic guards: test-decay (no-skipped-test), silent-fallback
// (no-empty-catch), and the react/next redirect-in-try-catch guard. Each rule is
// exercised through the real review-rules engine against a temp fixture tree.
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
const config = JSON.parse(readFileSync(path.join(repoRoot, "review-rules.json"), "utf8"));

function ruleConfig(ruleId) {
  const rule = config.rules.find((r) => r.ruleId === ruleId);
  assert.ok(rule, `rule ${ruleId} present in review-rules.json`);
  return { schemaVersion: 1, rulesetId: "test", version: 1, enabledRuleIds: [ruleId], rules: [rule] };
}

function runRule(ruleId, files) {
  const root = mkdtempSync(path.join(tmpdir(), "ng-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const cfg = path.join(root, "config.json");
  writeFileSync(cfg, JSON.stringify(ruleConfig(ruleId)));
  const res = spawnSync("node", [runner, "check", "--config", cfg, "--root", root, "--json"], { encoding: "utf8" });
  return { code: res.status, out: JSON.parse(res.stdout) };
}

test("no-skipped-test blocks it.skip / xit and passes clean tests", () => {
  const bad = runRule("no-skipped-test", { "a.test.ts": "it.skip('wip', () => {});\nxdescribe('later', () => {});\n" });
  assert.equal(bad.code, 1);
  assert.equal(bad.out.status, "block");
  const good = runRule("no-skipped-test", { "a.test.ts": "it('works', () => { expect(1).toBe(1); });\n" });
  assert.equal(good.code, 0);
});

test("no-empty-catch blocks an empty catch and passes a handled one", () => {
  const bad = runRule("no-empty-catch", { "src/x.ts": "try { risky(); } catch (e) {}\n" });
  assert.equal(bad.code, 1);
  const good = runRule("no-empty-catch", { "src/x.ts": "try { risky(); } catch (e) { logger.error(e); throw e; }\n" });
  assert.equal(good.code, 0);
});

test("nextjs-no-redirect-in-try-catch blocks redirect() inside try, allows it outside", () => {
  const bad = runRule("nextjs-no-redirect-in-try-catch", { "src/page.ts": "export async function load() { try { redirect('/login'); } catch (e) { report(e); } }\n" });
  assert.equal(bad.code, 1);
  const good = runRule("nextjs-no-redirect-in-try-catch", { "src/page.ts": "export async function load() { const u = await getUser(); if (!u) redirect('/login'); }\n" });
  assert.equal(good.code, 0);
});

test("nextjs-no-redirect-in-try-catch blocks notFound() inside try, allows it outside", () => {
  // The rule regex covers both redirect() and notFound(); this exercises the
  // notFound() branch, which the redirect-only test above never reaches.
  const bad = runRule("nextjs-no-redirect-in-try-catch", { "src/page.ts": "export async function load() { try { notFound(); } catch (e) { report(e); } }\n" });
  assert.equal(bad.code, 1);
  assert.equal(bad.out.status, "block");
  const good = runRule("nextjs-no-redirect-in-try-catch", { "src/page.ts": "export async function load() { const x = await find(); if (!x) notFound(); }\n" });
  assert.equal(good.code, 0);
});
