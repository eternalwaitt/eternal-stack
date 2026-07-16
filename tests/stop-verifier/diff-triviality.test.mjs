import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const script = path.join(repoRoot, "scripts", "diff-triviality.mjs");

// Classify a path set through the CLI and return the parsed verdict.
const classify = (paths, root) => {
  const args = ["classify", "--json"];
  if (root) args.push("--root", root);
  const res = spawnSync("node", [script, ...args, ...paths], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
};

test("a docs/changelog/metadata-only path set is trivial", () => {
  const v = classify(["docs/skills.md", "README.md", "CHANGELOG.md", "VERSION", "LICENSE", ".gitignore"]);
  assert.equal(v.trivial, true);
  assert.equal(v.runtime.length, 0);
  assert.equal(v.nonRuntime.length, 6);
});

test("pure asset paths (no code extension) are non-runtime", () => {
  const v = classify(["public/logo.svg", "assets/icon.png", "docs/img/hero.webp", "fonts/x.woff2"]);
  assert.equal(v.trivial, true);
});

test("a code file under dist/ or node_modules/ stays runtime (source extension wins over generated/vendor)", () => {
  for (const p of ["dist/bundle.js", "node_modules/x/index.js", "vendor/lib.py"]) {
    const v = classify([p]);
    assert.equal(v.trivial, false, `expected ${p} to be runtime`);
  }
});

test("any source/schema/script/test path makes the set non-trivial", () => {
  for (const runtimePath of ["src/app.ts", "packages/api/x.mjs", "schemas/rules.json", "scripts/tool.sh", "tests/a.test.ts", "prisma/migrations/1_init/migration.sql", ".github/workflows/ci.yml"]) {
    const v = classify(["docs/guide.md", runtimePath]);
    assert.equal(v.trivial, false, `expected non-trivial with ${runtimePath}`);
    assert.ok(v.runtime.length >= 1);
  }
});

test("a .md nested under scripts/ is runtime (conservative: script tag wins)", () => {
  const v = classify(["scripts/notes.md"]);
  assert.equal(v.trivial, false);
});

test("an unclassified path (fallback => source) is runtime, not trivial", () => {
  const v = classify(["Makefile", "some/unknown.bin"]);
  assert.equal(v.trivial, false);
  assert.equal(v.runtime.length, 2);
});

test("an empty path set is never trivial", () => {
  const v = classify([]);
  assert.equal(v.trivial, false);
  assert.equal(v.total, 0);
});

test("absolute paths relativize against --root and still classify correctly", () => {
  const root = "/tmp/example-repo";
  const v = classify([`${root}/docs/a.md`, `${root}/CHANGELOG.md`], root);
  assert.equal(v.trivial, true);
  assert.deepEqual(v.nonRuntime.sort(), ["CHANGELOG.md", "docs/a.md"]);
});

test("stdin JSON array is accepted (the Stop-verifier call path)", () => {
  const res = spawnSync("node", [script, "classify", "--root", "/x", "--stdin-json", "--json"],
    { encoding: "utf8", input: JSON.stringify(["/x/docs/skills.md", "/x/src/app.ts"]) });
  assert.equal(res.status, 0, res.stderr);
  const v = JSON.parse(res.stdout);
  assert.equal(v.trivial, false);
  assert.deepEqual(v.runtime, ["src/app.ts"]);
});

test("a data/config extension forces runtime even under a docs/ or generated/ directory", () => {
  // These carry no source tag from the path taxonomy, so only the extension
  // allowlist keeps them out of the non-runtime bucket (fail-safe).
  for (const p of ["docs/config.json", "docs/data.yaml", "generated/migrate.sql", "docs/schema.graphql", "assets/app.toml"]) {
    const v = classify([p]);
    assert.equal(v.trivial, false, `expected ${p} to be runtime`);
    assert.deepEqual(v.runtime, [p]);
  }
});

test("a missing classification schema is never trivial (fail-safe)", () => {
  // Run a copy of the script from a location with no sibling schemas/ dir so the
  // schema lookup misses; the whole set must then read as non-trivial regardless
  // of how docs-like the paths are.
  const sandbox = mkdtempSync(path.join(tmpdir(), "dt-noschema-"));
  mkdirSync(path.join(sandbox, "scripts"));
  const orphan = path.join(sandbox, "scripts", "diff-triviality.mjs");
  copyFileSync(script, orphan);
  const res = spawnSync("node", [orphan, "classify", "--json", "docs/guide.md", "README.md"],
    { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  const v = JSON.parse(res.stdout);
  assert.equal(v.trivial, false);
  assert.equal(v.reason, "schema-missing");
});
