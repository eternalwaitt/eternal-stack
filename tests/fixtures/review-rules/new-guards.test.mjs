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

test("no-skipped-test blocks a parameterized test.skip.each in an .mjs test file", () => {
  // CodeRabbit round-1 #8: .mjs/.cjs test+spec files must be in scope, and the
  // pattern must catch describe/it/test .skip.each(...) parameterized skips, not
  // only bare .skip(...). The repo's own suite is .test.mjs, so a missing .mjs
  // glob would let a skipped test bypass the guard in this very repository.
  const bad = runRule("no-skipped-test", { "a.test.mjs": "test.skip.each([[1],[2]])('case %s', (n) => {});\n" });
  assert.equal(bad.code, 1);
  assert.equal(bad.out.status, "block");
  const badIt = runRule("no-skipped-test", { "b.spec.cjs": "it.skip.each([1, 2])('n', () => {});\n" });
  assert.equal(badIt.code, 1);
  // A non-skipped .each parameterization in an .mjs file must still pass.
  const good = runRule("no-skipped-test", { "c.test.mjs": "it.each([1, 2])('runs %s', (n) => { expect(n).toBeTruthy(); });\n" });
  assert.equal(good.code, 0);
});

test("no-empty-catch blocks an empty catch and passes a handled one", () => {
  const bad = runRule("no-empty-catch", { "src/x.ts": "try { risky(); } catch (e) {}\n" });
  assert.equal(bad.code, 1);
  // CodeRabbit round-1 #9: the ES2019 optional catch binding (no parens) must also
  // block — `catch {}` swallows just as silently as `catch (e) {}`.
  const bareBinding = runRule("no-empty-catch", { "src/y.ts": "try { risky(); } catch {}\n" });
  assert.equal(bareBinding.code, 1);
  assert.equal(bareBinding.out.status, "block");
  const good = runRule("no-empty-catch", { "src/x.ts": "try { risky(); } catch (e) { logger.error(e); throw e; }\n" });
  assert.equal(good.code, 0);
  const goodBare = runRule("no-empty-catch", { "src/z.ts": "try { risky(); } catch { logger.error('failed'); }\n" });
  assert.equal(goodBare.code, 0);
});

test("nextjs-no-redirect-in-try-catch blocks a redirect nested one level deep in a try", () => {
  // CodeRabbit round-1 #10: the flat regex missed calls nested one brace level
  // deep, e.g. `try { if (x) { redirect('/login'); } }`. The broadened pattern
  // allows one nested brace group before the call; deeper nesting is out of scope
  // (documented one-level boundary).
  const bad = runRule("nextjs-no-redirect-in-try-catch", {
    "src/page.ts": "export async function load(x) { try { if (x) { redirect('/login'); } } catch (e) { report(e); } }\n",
  });
  assert.equal(bad.code, 1);
  assert.equal(bad.out.status, "block");
  const badNotFound = runRule("nextjs-no-redirect-in-try-catch", {
    "src/page2.ts": "export async function load(x) { try { if (!x) { notFound(); } } catch (e) { report(e); } }\n",
  });
  assert.equal(badNotFound.code, 1);
  // A legitimate redirect() outside any try still passes, even when a redirect-free
  // try/catch precedes it — the one-level pattern must not false-positive here.
  const good = runRule("nextjs-no-redirect-in-try-catch", {
    "src/page3.ts": "export async function load() { try { doWork(); } catch (e) { log(e); } const u = await getUser(); if (!u) redirect('/login'); }\n",
  });
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
