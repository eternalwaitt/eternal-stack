import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { walkFiles } from "../../scripts/lib/fs-walk.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

// Build a fixture tree and return the base plus the outside dir the symlink targets.
function buildTree() {
  const base = mkdtempSync(path.join(tmpdir(), "fs-walk-"));
  const outside = mkdtempSync(path.join(tmpdir(), "fs-walk-out-"));
  mkdirSync(path.join(base, "sub"));
  mkdirSync(path.join(base, "node_modules"));
  writeFileSync(path.join(base, "a.mjs"), "a\n");
  writeFileSync(path.join(base, "sub", "b.txt"), "b\n");
  writeFileSync(path.join(base, ".hidden.mjs"), "h\n");
  writeFileSync(path.join(base, ".gitignore"), "ignored\n");
  writeFileSync(path.join(base, "node_modules", "dep.js"), "d\n");
  writeFileSync(path.join(outside, "leak.mjs"), "OUTSIDE\n");
  // A symlinked directory INSIDE base that points OUTSIDE base.
  symlinkSync(outside, path.join(base, "linkdir"));
  return { base, outside };
}

const rel = (base, abs) => abs.slice(base.length + 1).split(path.sep).join("/");

test("walkFiles yields every regular file and does not follow symlinked dirs", () => {
  const { base } = buildTree();
  const got = [...walkFiles(base)].map((abs) => rel(base, abs)).sort();
  assert.deepEqual(got, [
    ".gitignore",
    ".hidden.mjs",
    "a.mjs",
    "node_modules/dep.js",
    "sub/b.txt",
  ]);
  // The symlinked dir's out-of-tree target must NOT appear — no symlink follow.
  assert.ok(!got.some((p) => p.includes("linkdir") || p.includes("leak.mjs")));
});

test("walkFiles never yields a path outside the root, even with a symlinked dir present", () => {
  // Security invariant the TOCTOU lstat guard defends: no yielded path may escape
  // the root through a symlinked directory. A symlink discovered at readdir time is
  // skipped by the Dirent check; the pre-descent lstat additionally rejects an entry
  // that was a real dir at readdir but is a symlink by the time we would recurse.
  const { base, outside } = buildTree();
  const outsideReal = path.resolve(outside);
  for (const abs of walkFiles(base)) {
    assert.ok(
      abs === base || abs.startsWith(base + path.sep),
      `yielded a path outside the root: ${abs}`,
    );
    assert.ok(
      !abs.startsWith(outsideReal + path.sep),
      `yielded an out-of-root file via a symlink: ${abs}`,
    );
  }
});

test("skipDir prunes a subtree, skipFile omits matching files", () => {
  const { base } = buildTree();
  const isHidden = (name) => name.startsWith(".") && name !== ".gitignore";
  const got = [...walkFiles(base, {
    skipDir: (name) => isHidden(name) || name === "node_modules",
    skipFile: isHidden,
  })].map((abs) => rel(base, abs)).sort();
  // node_modules pruned by skipDir; .hidden.mjs omitted by skipFile; .gitignore kept.
  assert.deepEqual(got, [".gitignore", "a.mjs", "sub/b.txt"]);
});

test("walkFiles yields nothing for a missing directory", () => {
  const base = mkdtempSync(path.join(tmpdir(), "fs-walk-"));
  const got = [...walkFiles(path.join(base, "does-not-exist"))];
  assert.deepEqual(got, []);
});

test("walkFiles honors the absolute-path contract even for a relative dir", () => {
  const { base } = buildTree();
  // Point at base via a relative path from cwd so path.join alone would keep it
  // relative; the resolve-once normalization must still yield absolute paths.
  const relBase = path.relative(process.cwd(), base);
  const got = [...walkFiles(relBase)];
  assert.ok(got.length > 0);
  assert.ok(got.every((p) => path.isAbsolute(p)), `expected absolute paths, got e.g. ${got[0]}`);
});
