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

const git = (root, gitArgs) =>
  spawnSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });

// Init a repo with one commit so tags resolve to a real HEAD; deterministic
// identity, no signing, no reliance on ambient git config.
function gitRepo(root) {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  writeFileSync(path.join(root, "seed.txt"), "seed\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
}

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

test("scaffold refuses to seed VERSION from a prerelease tag (falls back to 0.1.0)", () => {
  const root = freshRoot();
  gitRepo(root);
  git(root, ["tag", "v2.0.0-rc.1"]);
  const res = run(scaffold, ["scaffold", "--root", root]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(path.join(root, "VERSION"), "utf8").trim(), "0.1.0");
});

test("scaffold seeds VERSION from the latest strict-semver tag", () => {
  const root = freshRoot();
  gitRepo(root);
  git(root, ["tag", "v1.2.3"]);
  run(scaffold, ["scaffold", "--root", root]);
  assert.equal(readFileSync(path.join(root, "VERSION"), "utf8").trim(), "1.2.3");
});

test("scaffold rejects a non-semver --seed instead of silently falling back", () => {
  const root = freshRoot();
  const res = run(scaffold, ["scaffold", "--root", root, "--seed", "2.0.0-rc.1"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /--seed must be X\.Y\.Z/);
  assert.equal(existsSync(path.join(root, "VERSION")), false);
});

test("--active-dev still fails when the latest git tag is absent from the changelog", () => {
  const root = freshRoot();
  gitRepo(root);
  writeFileSync(path.join(root, "CHANGELOG.md"),
    "# Changelog\n\n## Unreleased\n\n## v0.9.0\n\n2026-01-01\n\n### Added\n\n- old.\n");
  git(root, ["tag", "v1.0.0"]);
  const res = run(check, ["--root", root, "--active-dev", "--skip-version-file"]);
  assert.equal(res.status, 1);
  assert.match(`${res.stdout}${res.stderr}`, /latest git tag/i);
});

test("--active-dev passes when the latest tag has a matching changelog section", () => {
  const root = freshRoot();
  gitRepo(root);
  writeFileSync(path.join(root, "CHANGELOG.md"),
    "# Changelog\n\n## Unreleased\n\n## v1.0.0\n\n2026-01-01\n\n### Added\n\n- first.\n");
  git(root, ["tag", "v1.0.0"]);
  const res = run(check, ["--root", root, "--active-dev", "--skip-version-file"]);
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
});
