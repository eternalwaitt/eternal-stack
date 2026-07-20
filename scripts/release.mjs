#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argValue } from "./lib/cli-args.mjs";
import { SEMVER_CORE } from "./lib/semver.mjs";

// Match a `## vX.Y.Z` release heading via the shared strict semver core so
// boundary detection here agrees with changelog-scaffold's RELEASE_HEADING_RE
// and STABLE_TAG_RE — a leading-zero heading like `## v01.2.3` is not a release
// section under the single-source-of-truth semver rules.
const RELEASE_HEADING_RE = new RegExp(`^## v${SEMVER_CORE}\\s*$`);
// A requested version must match the same strict semver core, so `prepare 01.2.3`
// is rejected before any artifact is written. A looser `\d+\.\d+\.\d+` would let
// prepare emit VERSION=01.2.3 and a `## v01.2.3` heading that RELEASE_HEADING_RE,
// STABLE_TAG_RE, and the tag action then all refuse — an invalid-artifact footgun.
const VERSION_RE = new RegExp(`^${SEMVER_CORE}$`);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// Honor an optional --root so release actions target the intended repo instead
// of always mutating this checkout. Running from another cwd without --root
// keeps the historical self-relative default. But a --root that was PROVIDED yet
// resolves to no usable value (`--root` with a missing/flag-shaped value, or an
// empty `--root=`) must FAIL rather than silently fall back to this checkout —
// otherwise a malformed explicit target would make release actions mutate the
// installer's own repo instead of the one the caller intended.
const rootProvided = args.some((arg) => arg === "--root" || arg.startsWith("--root="));
const rootArg = argValue(args, "--root");
if (rootProvided && !rootArg) {
  fail("--root requires a path value.");
}
const root = rootArg ? path.resolve(rootArg) : path.resolve(scriptDir, "..");
const changelogPath = path.join(root, "CHANGELOG.md");
const versionPath = path.join(root, "VERSION");
const KEEP_A_CHANGELOG_CATEGORIES = new Set([
  "### Added",
  "### Changed",
  "### Fixed",
  "### Removed",
  "### Security",
  "### Deprecated",
]);

function usage() {
  console.error("usage: release.mjs prepare <X.Y.Z> | tag [--message <text>] | check");
  process.exit(2);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeVersion(input) {
  const trimmed = String(input || "").trim().replace(/^v/i, "");
  if (!VERSION_RE.test(trimmed)) {
    fail(`Invalid semver version: ${input}`);
  }
  return trimmed;
}

function readLines(filePath) {
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

function writeLines(filePath, lines) {
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyUnreleasedBlock() {
  return [
    "## Unreleased",
    "",
    ...[...KEEP_A_CHANGELOG_CATEGORIES].flatMap((heading) => [heading, ""]),
  ];
}

// Drop category headings that carry no bullets so a cut release section contains only
// populated Keep a Changelog categories. `prepare` used to copy the Unreleased template's
// empty headings (e.g. an unused ### Removed / ### Deprecated) into the release section,
// which the strict release check then rejected as "category ... is empty".
function stripEmptyCategories(body) {
  const kept = [];
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    if (KEEP_A_CHANGELOG_CATEGORIES.has(line.trim())) {
      let end = i + 1;
      while (
        end < body.length &&
        !KEEP_A_CHANGELOG_CATEGORIES.has(body[end].trim()) &&
        !body[end].trim().startsWith("## ")
      ) {
        end += 1;
      }
      const section = body.slice(i, end);
      const hasBullets = section.slice(1).some((entry) => entry.trim() !== "");
      if (hasBullets) kept.push(...section);
      i = end;
    } else {
      kept.push(line);
      i += 1;
    }
  }
  return kept;
}

function prepare(versionArg) {
  const version = normalizeVersion(versionArg);
  const tagVersion = `v${version}`;
  const lines = readLines(changelogPath);
  const unreleasedIndex = lines.findIndex((line) => line.trim() === "## Unreleased");
  if (unreleasedIndex < 0) fail("CHANGELOG.md missing ## Unreleased section.");

  const nextHeadingOffset = lines.slice(unreleasedIndex + 1).findIndex((line) => RELEASE_HEADING_RE.test(line.trim()));
  if (nextHeadingOffset < 0) fail("CHANGELOG.md missing a release section after ## Unreleased.");

  const nextHeadingIndex = unreleasedIndex + 1 + nextHeadingOffset;
  const unreleasedBody = lines.slice(unreleasedIndex + 1, nextHeadingIndex);
  const meaningful = unreleasedBody
    .map((line) => line.trim())
    .filter((line) => line !== "" && !KEEP_A_CHANGELOG_CATEGORIES.has(line));
  if (meaningful.length === 0) {
    fail("Nothing to release: add categorized bullets under ## Unreleased before running prepare.");
  }

  const releaseSection = [
    `## ${tagVersion}`,
    "",
    todayIsoDate(),
    "",
    ...stripEmptyCategories(unreleasedBody.filter((line) => line.trim() !== "## Unreleased")),
  ];
  while (releaseSection.length > 0 && releaseSection[releaseSection.length - 1].trim() === "") {
    releaseSection.pop();
  }
  releaseSection.push("");

  const tail = lines.slice(nextHeadingIndex);
  const next = [
    ...lines.slice(0, unreleasedIndex),
    ...emptyUnreleasedBlock(),
    ...releaseSection,
    ...tail,
  ];
  writeLines(changelogPath, next);
  writeFileSync(versionPath, `${version}\n`, "utf8");
  console.log(`Prepared ${tagVersion} in CHANGELOG.md and VERSION`);
}

function runChangelogCheck({ skipTagExistence = false } = {}) {
  const checkArgs = [path.join(scriptDir, "changelog-release-check.mjs"), "--root", root, "--strict-unreleased"];
  // `release.mjs tag` validates release hygiene BEFORE it creates the tag, so the
  // top-release tag-existence rule (the very thing the tag is about to satisfy) must be
  // skipped for that pre-tag pass — otherwise the check can never pass and the first tag
  // for a version can never be created. The standalone strict check still enforces it.
  if (skipTagExistence) checkArgs.push("--skip-tag-existence");
  const result = spawnSync(process.execPath, checkArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status ?? 1);
  }
  process.stdout.write(result.stdout || "");
}

function tag(messageArg) {
  runChangelogCheck({ skipTagExistence: true });
  const version = readFileSync(versionPath, "utf8").trim();
  const tagName = `v${normalizeVersion(version)}`;
  const message = messageArg || `Release ${tagName}`;
  const existing = spawnSync("git", ["-C", root, "tag", "--list", tagName], { encoding: "utf8" });
  if (existing.stdout.trim() === tagName) {
    fail(`Tag ${tagName} already exists.`);
  }
  const result = spawnSync("git", ["-C", root, "tag", "-a", tagName, "-m", message], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || `Failed to create tag ${tagName}`);
  }
  console.log(`Created annotated tag ${tagName}`);
  console.log(`Push with: git push origin ${tagName}`);
}

// First non-flag token that is not the value consumed by a known value-flag.
// Lets `prepare <ver> --root <dir>` and `prepare --root <dir> <ver>` both resolve
// the version positionally instead of mistaking `--root` for the version.
function firstPositional(tokens) {
  const valueFlags = new Set(["--root", "--message"]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith("-")) continue;
    const prev = tokens[index - 1];
    if (prev && valueFlags.has(prev)) continue;
    return token;
  }
  return undefined;
}

const [command, ...rest] = args;
if (!command || command === "--help" || command === "-h") usage();

if (command === "prepare") {
  const versionArg = firstPositional(rest);
  if (!versionArg) fail("prepare requires a version argument, for example 0.4.0");
  prepare(versionArg);
} else if (command === "tag") {
  const messageIndex = rest.indexOf("--message");
  const message = messageIndex >= 0 ? rest[messageIndex + 1] : "";
  tag(message);
} else if (command === "check") {
  runChangelogCheck();
} else {
  usage();
}
