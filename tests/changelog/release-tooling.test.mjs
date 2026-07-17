import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const run = (script, args, cwd) => spawnSync("node", [script, ...args], { encoding: "utf8", cwd });
const git = (root, gitArgs) => spawnSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });

// release.mjs resolves its root as scriptDir/.., so to exercise the real prepare/tag
// against a fixture we copy the release scripts into a temp repo's scripts/ dir.
function releaseRepo(changelog, version) {
  const root = mkdtempSync(path.join(tmpdir(), "rel-"));
  mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  cpSync(path.join(repoRoot, "scripts", "release.mjs"), path.join(root, "scripts", "release.mjs"));
  cpSync(
    path.join(repoRoot, "scripts", "changelog-release-check.mjs"),
    path.join(root, "scripts", "changelog-release-check.mjs"),
  );
  cpSync(path.join(repoRoot, "scripts", "lib"), path.join(root, "scripts", "lib"), { recursive: true });
  writeFileSync(path.join(root, "CHANGELOG.md"), changelog);
  writeFileSync(path.join(root, "VERSION"), `${version}\n`);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

// Unreleased carries the full six-category template with only Added + Fixed populated —
// the empty Removed/Changed/Security/Deprecated headings are what prepare must drop.
const UNRELEASED_WITH_EMPTY_CATEGORIES =
  "# Changelog\n\n## Unreleased\n\n### Added\n\n- Something new.\n\n### Changed\n\n### Fixed\n\n- A fix.\n\n### Removed\n\n### Security\n\n### Deprecated\n\n## v1.0.0\n\n2026-01-01\n\n### Added\n\n- First.\n";

test("prepare drops empty category headings from the cut release section", () => {
  const root = releaseRepo(UNRELEASED_WITH_EMPTY_CATEGORIES, "1.0.0");
  git(root, ["tag", "v1.0.0"]);
  const res = run(path.join(root, "scripts", "release.mjs"), ["prepare", "1.1.0"], root);
  assert.equal(res.status, 0, res.stderr);

  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const release = changelog.slice(changelog.indexOf("## v1.1.0"), changelog.indexOf("## v1.0.0"));
  // Populated categories survive; empty ones are gone.
  assert.match(release, /### Added\n\n- Something new\./);
  assert.match(release, /### Fixed\n\n- A fix\./);
  assert.doesNotMatch(release, /### Changed/, "empty Changed heading must be dropped");
  assert.doesNotMatch(release, /### Removed/, "empty Removed heading must be dropped");
  assert.doesNotMatch(release, /### Security/, "empty Security heading must be dropped");
  assert.doesNotMatch(release, /### Deprecated/, "empty Deprecated heading must be dropped");
  assert.equal(readFileSync(path.join(root, "VERSION"), "utf8").trim(), "1.1.0");
});

// prepare's next-release-heading boundary uses the shared SEMVER_CORE (RELEASE_HEADING_RE),
// so a leading-zero pseudo-heading like `## v01.2.3` is NOT a valid release section — the
// same strict rule changelog-scaffold and STABLE_TAG_RE enforce. The old loose
// `/^## v\d+\.\d+\.\d+$/` would have accepted it as the boundary; now, when it is the only
// heading after Unreleased, prepare finds no release section and fails.
const LEADING_ZERO_ONLY_HEADING =
  "# Changelog\n\n## Unreleased\n\n### Added\n\n- New thing.\n\n## v01.2.3\n\n2026-01-01\n\n### Added\n\n- Leading-zero heading is not a valid release section.\n";

test("prepare rejects a leading-zero pseudo-heading as the release boundary", () => {
  const root = releaseRepo(LEADING_ZERO_ONLY_HEADING, "1.0.0");
  const res = run(path.join(root, "scripts", "release.mjs"), ["prepare", "1.1.0"], root);
  assert.notEqual(res.status, 0, "prepare must fail when the only heading after Unreleased is an invalid semver heading");
  assert.match(`${res.stderr}${res.stdout}`, /missing a release section after ## Unreleased/);
});

// normalizeVersion validates the requested version against the shared strict
// SEMVER_CORE (VERSION_RE), so `prepare 01.2.3` is rejected up front — before any
// artifact is written. The old loose `\d+\.\d+\.\d+` would have emitted VERSION=01.2.3
// and a `## v01.2.3` heading that RELEASE_HEADING_RE, STABLE_TAG_RE, and tag all refuse.
test("prepare rejects a leading-zero version argument before writing artifacts", () => {
  const root = releaseRepo(UNRELEASED_WITH_EMPTY_CATEGORIES, "1.0.0");
  const versionBefore = readFileSync(path.join(root, "VERSION"), "utf8");
  const res = run(path.join(root, "scripts", "release.mjs"), ["prepare", "01.2.3"], root);
  assert.notEqual(res.status, 0, "a leading-zero version argument must be rejected");
  assert.match(`${res.stderr}${res.stdout}`, /Invalid semver version: 01\.2\.3/);
  // No artifact mutation: VERSION unchanged and no `## v01.2.3` heading written.
  assert.equal(
    readFileSync(path.join(root, "VERSION"), "utf8"),
    versionBefore,
    "VERSION must not change on a rejected prepare",
  );
  assert.doesNotMatch(
    readFileSync(path.join(root, "CHANGELOG.md"), "utf8"),
    /## v01\.2\.3/,
    "no invalid release heading may be written",
  );
});

// A --root that is PROVIDED but resolves to no usable value (`--root` with no
// following path) must fail rather than silently fall back to the installer's own
// checkout — otherwise a malformed explicit target mutates the wrong repo.
test("release rejects a value-less --root instead of silently falling back", () => {
  const root = releaseRepo(UNRELEASED_WITH_EMPTY_CATEGORIES, "1.0.0");
  const res = run(path.join(root, "scripts", "release.mjs"), ["check", "--root"], root);
  assert.notEqual(res.status, 0, "a value-less --root must be rejected");
  assert.match(`${res.stderr}${res.stdout}`, /--root requires a path value/);
});

// compareSemver must compare components with BigInt, not Number. 2^53 =
// 9007199254740992, and Number("9007199254740993") === 9007199254740992, so a
// Number()-based compare treats a `...992` changelog top as EQUAL to a `...993`
// tag and misses the drift. With BigInt the two stay distinct, so the checker
// reports the changelog as behind the latest tag.
test("compareSemver distinguishes version components beyond Number.MAX_SAFE_INTEGER", () => {
  const changelog =
    "# Changelog\n\n## Unreleased\n\n### Added\n\n## v9007199254740992.0.0\n\n2026-01-01\n\n### Added\n\n- Top release, one below the tag.\n";
  const root = releaseRepo(changelog, "9007199254740992.0.0");
  // Tag ...993 on the initial commit, then add a commit so HEAD is past the tag
  // (the drift check only runs when HEAD differs from the tagged commit).
  git(root, ["tag", "v9007199254740993.0.0"]);
  writeFileSync(path.join(root, "marker.txt"), "x\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "second"]);
  const res = run(
    path.join(root, "scripts", "changelog-release-check.mjs"),
    ["--root", root, "--active-dev"],
    root,
  );
  assert.notEqual(res.status, 0, "a changelog top behind the tag must be reported as drift");
  assert.match(`${res.stderr}${res.stdout}`, /behind the latest tag v9007199254740993\.0\.0/);
});

test("tag creates the annotated tag when it does not pre-exist, then full strict passes", () => {
  const root = releaseRepo(UNRELEASED_WITH_EMPTY_CATEGORIES, "1.0.0");
  git(root, ["tag", "v1.0.0"]);
  run(path.join(root, "scripts", "release.mjs"), ["prepare", "1.1.0"], root);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "chore: release v1.1.0"]);

  // The paradox: tag validates hygiene before creating the tag. It must not require the
  // v1.1.0 tag to already exist (it is about to create it).
  const tagged = run(path.join(root, "scripts", "release.mjs"), ["tag"], root);
  assert.equal(tagged.status, 0, `tag should succeed pre-tag: ${tagged.stderr}`);
  assert.equal(git(root, ["tag", "--list", "v1.1.0"]).stdout.trim(), "v1.1.0", "v1.1.0 tag was created");

  // After tagging, the FULL strict check (including tag-existence) passes.
  const strict = run(
    path.join(root, "scripts", "changelog-release-check.mjs"),
    ["--root", root, "--strict-unreleased"],
    root,
  );
  assert.equal(strict.status, 0, `full strict should pass after tagging: ${strict.stdout}${strict.stderr}`);
});

test("--skip-tag-existence skips only the tag-existence rule", () => {
  // Top release matches VERSION but is NOT tagged: strict fails, --skip-tag-existence passes.
  const root = releaseRepo(
    "# Changelog\n\n## Unreleased\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Removed\n\n### Security\n\n### Deprecated\n\n## v1.1.0\n\n2026-01-01\n\n### Added\n\n- New.\n\n## v1.0.0\n\n2026-01-01\n\n### Added\n\n- First.\n",
    "1.1.0",
  );
  git(root, ["tag", "v1.0.0"]);
  const check = path.join(root, "scripts", "changelog-release-check.mjs");
  const strict = run(check, ["--root", root, "--strict-unreleased"], root);
  assert.equal(strict.status, 1, "strict fails when the top release is untagged");
  assert.match(`${strict.stdout}${strict.stderr}`, /is not tagged/);

  const skipped = run(check, ["--root", root, "--strict-unreleased", "--skip-tag-existence"], root);
  assert.equal(skipped.status, 0, `skip-tag-existence should pass: ${skipped.stdout}${skipped.stderr}`);
});
