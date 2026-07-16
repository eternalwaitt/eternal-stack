import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const scaffold = path.join(repoRoot, "scripts", "changelog-scaffold.mjs");
const check = path.join(repoRoot, "scripts", "changelog-release-check.mjs");

const run = (script, args) => spawnSync("node", [script, ...args], { encoding: "utf8" });
const freshRoot = () => mkdtempSync(path.join(tmpdir(), "cl-"));

test("detect reports a bare project as unmanaged, scaffold creates both files", () => {
  const root = freshRoot();
  const det = JSON.parse(run(scaffold, ["detect", "--root", root, "--json"]).stdout);
  assert.equal(det.hasChangelog, false);
  assert.equal(det.hasVersion, false);
  assert.equal(det.isReleaseManaged, false);

  const res = run(scaffold, ["scaffold", "--root", root]);
  assert.equal(res.status, 0);
  assert.ok(existsSync(path.join(root, "CHANGELOG.md")));
  assert.equal(readFileSync(path.join(root, "VERSION"), "utf8").trim(), "0.1.0");
});

test("a freshly scaffolded changelog passes --active-dev", () => {
  const root = freshRoot();
  run(scaffold, ["scaffold", "--root", root]);
  const res = run(check, ["--root", root, "--active-dev", "--skip-version-file"]);
  assert.equal(res.status, 0, res.stderr);
});

test("scaffold never overwrites existing files (idempotent)", () => {
  const root = freshRoot();
  writeFileSync(path.join(root, "CHANGELOG.md"), "# Custom\n\n## Unreleased\n");
  const res = run(scaffold, ["scaffold", "--root", root]);
  assert.match(readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), /# Custom/);
  const second = JSON.parse(run(scaffold, ["scaffold", "--root", root, "--json"]).stdout);
  assert.deepEqual(second.created, []);
});

test("--active-dev accepts a populated Unreleased; strict rejects it", () => {
  const root = freshRoot();
  writeFileSync(path.join(root, "CHANGELOG.md"),
    "# Changelog\n\n## Unreleased\n\n### Added\n\n- A new thing.\n\n## v1.0.0\n\n2026-01-01\n\n### Added\n\n- First.\n");
  writeFileSync(path.join(root, "VERSION"), "1.0.0\n");
  const active = run(check, ["--root", root, "--active-dev"]);
  assert.equal(active.status, 0, active.stderr);
  const strict = run(check, ["--root", root, "--strict-unreleased"]);
  assert.equal(strict.status, 1, "strict rejects a populated Unreleased");
});
