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
const overlay = path.join(repoRoot, "templates", "review-rules.saas.example.json");

function runOverlay(files) {
  const root = mkdtempSync(path.join(tmpdir(), "saas-"));
  mkdirSync(path.join(root, "src"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(root, "src", name), body);
  const res = spawnSync("node", [runner, "check", "--config", overlay, "--root", root, "--json"], { encoding: "utf8" });
  return { status: res.status, out: JSON.parse(res.stdout) };
}

test("SaaS overlay flags manual memo + untrusted-cast in WARN mode (never blocks)", () => {
  const { status, out } = runOverlay({
    "comp.tsx": `import { useCallback, useMemo } from "react";
export function C({ searchParams }) {
  const a = useCallback(() => 1, []);
  const b = useMemo(() => 2, []);
  const region = searchParams.get("region") as Region;
  return <div>{a}{b}{region}</div>;
}
`,
  });
  const ids = out.findings.map((f) => f.ruleId).sort();
  assert.deepEqual(ids, ["input-searchparams-cast", "react-no-usecallback", "react-no-usememo"]);
  assert.ok(out.findings.every((f) => f.mode === "warn"), "every overlay rule is warn-mode");
  assert.equal(out.status, "pass", "warn-only overlay passes the gate");
  assert.equal(status, 0, "warn matches exit 0");
});

test("SaaS overlay does not flag validated input or memo-free code", () => {
  const { out } = runOverlay({
    "clean.tsx": `export function Clean({ searchParams }) {
  const region = validate(searchParams.get("region"));
  return <div>{region}</div>;
}
`,
  });
  assert.equal(out.findings.length, 0, "no findings on validated, memo-free code");
});
