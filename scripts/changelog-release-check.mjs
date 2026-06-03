#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const GIT_TIMEOUT_MS = 10_000;
const DEFAULT_GIT_MAX_BUFFER = 1024 * 1024;
const configuredGitMaxBuffer = Number.parseInt(process.env.GIT_MAX_BUFFER_BYTES || process.env.GIT_MAX_BUFFER || "", 10);
const GIT_MAX_BUFFER = Number.isFinite(configuredGitMaxBuffer) && configuredGitMaxBuffer > 0
  ? configuredGitMaxBuffer
  : DEFAULT_GIT_MAX_BUFFER;

function argValue(flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    fail([`${flag} requires a value`]);
  }
  return value;
}

function fail(errors) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

function git(argsForGit, root) {
  const result = spawnSync("git", ["-C", root, ...argsForGit], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

function parseReleaseHeading(line) {
  const match = line.match(/^## (v\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})\s*$/);
  if (!match) return null;
  return { version: match[1], date: match[2] };
}

function parseReleaseSections(lines) {
  return lines
    .map((line) => parseReleaseHeading(line))
    .filter(Boolean);
}

function semverParts(version) {
  const parts = version.replace(/^v/, "").split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return parts.map((part) => Number(part));
}

function compareSemver(left, right) {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

function stripHtmlComments(line, state) {
  let text = line;
  let output = "";
  while (text.length > 0) {
    const before = text.length;
    if (state.inComment) {
      const end = text.indexOf("-->");
      if (end < 0) return output;
      text = text.slice(end + 3);
      state.inComment = false;
      if (text.length === before) return output;
      continue;
    }
    const start = text.indexOf("<!--");
    if (start < 0) return `${output}${text}`;
    output += text.slice(0, start);
    if (text.startsWith("<!-->", start)) {
      text = text.slice(start + 5);
      continue;
    }
    const end = text.indexOf("-->", start + 4);
    if (end < 0) {
      state.inComment = true;
      return output;
    }
    text = text.slice(end + 3);
    if (text.length === before) return output;
  }
  return output;
}

function meaningfulLines(sourceLines) {
  const state = { inComment: false };
  return sourceLines.filter((line) => stripHtmlComments(line, state).trim() !== "");
}

function currentBranch(root) {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root);
  return branch.ok ? branch.stdout : "";
}

function validateUnreleasedSection(sourceLines) {
  const errors = [];
  const unreleasedIndex = sourceLines.findIndex((line) => line.trim() === "## Unreleased");
  let topRelease = null;
  let unreleasedEntries = [];
  if (unreleasedIndex < 0) {
    errors.push("CHANGELOG.md missing top-level ## Unreleased section.");
    return { topRelease, unreleasedEntries, errors };
  }
  const nextHeadingOffset = sourceLines.slice(unreleasedIndex + 1).findIndex((line) => /^##\s+/.test(line));
  if (nextHeadingOffset < 0) {
    errors.push("CHANGELOG.md missing a release section after ## Unreleased.");
    return { topRelease, unreleasedEntries, errors };
  }
  const nextHeadingIndex = unreleasedIndex + 1 + nextHeadingOffset;
  unreleasedEntries = meaningfulLines(sourceLines.slice(unreleasedIndex + 1, nextHeadingIndex));
  topRelease = parseReleaseHeading(sourceLines[nextHeadingIndex]);
  if (!topRelease) {
    errors.push(`First release heading must look like "## vX.Y.Z - YYYY-MM-DD": ${sourceLines[nextHeadingIndex]}`);
  }
  return { topRelease, unreleasedEntries, errors };
}

function validateGitTagAlignment(root, releaseVersions, topRelease, strictUnreleased) {
  const errors = [];
  const inGit = git(["rev-parse", "--is-inside-work-tree"], root);
  if (!inGit.ok || inGit.stdout !== "true") return errors;
  const latestTag = git(["tag", "--list", "v[0-9]*", "--sort=-v:refname"], root).stdout.split(/\r?\n/).filter(Boolean)[0] || "";
  if (!latestTag) return errors;
  if (!releaseVersions.has(latestTag)) {
    errors.push(`CHANGELOG.md missing latest git tag section: ## ${latestTag}`);
  }
  const head = git(["rev-parse", "HEAD"], root);
  const tagCommit = git(["rev-parse", `${latestTag}^{}`], root);
  if (!topRelease || !strictUnreleased || !head.ok || !tagCommit.ok || head.stdout === tagCommit.stdout) {
    return errors;
  }
  try {
    if (compareSemver(topRelease.version, latestTag) <= 0) {
      errors.push(`HEAD has commits after ${latestTag}, but the latest changelog release is still ${topRelease.version}. Cut the next dated release section.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
  }
  return errors;
}

function validateUntaggedReleaseDrift(root, releaseSections) {
  const errors = [];
  const inGit = git(["rev-parse", "--is-inside-work-tree"], root);
  if (!inGit.ok || inGit.stdout !== "true" || releaseSections.length === 0) return errors;
  const tags = new Set(git(["tag", "--list", "v[0-9]*"], root).stdout.split(/\r?\n/).filter(Boolean));
  if (tags.size === 0) return errors;
  const latestTag = git(["tag", "--list", "v[0-9]*", "--sort=-v:refname"], root).stdout.split(/\r?\n/).filter(Boolean)[0] || "";
  if (!latestTag) return errors;
  const untaggedOlderSections = releaseSections
    .slice(1)
    .filter((release) => !tags.has(release.version))
    .map((release) => release.version);
  if (untaggedOlderSections.length > 0) {
    errors.push(
      `CHANGELOG.md has untagged release sections below the top pending release: ${untaggedOlderSections.join(", ")}. Tag those releases or collapse them into the current pending release section.`,
    );
  }
  return errors;
}

const root = path.resolve(argValue("--root", path.join(scriptDir, "..")));
const changelogPath = path.join(root, "CHANGELOG.md");
const allowUnreleased = args.includes("--allow-unreleased");
const forceStrictUnreleased = args.includes("--strict-unreleased");
let lines = [];
try {
  lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail([`Failed to read CHANGELOG.md at ${changelogPath}: ${message}`]);
}
const errors = [];

const unreleasedResult = validateUnreleasedSection(lines);
const { topRelease, unreleasedEntries } = unreleasedResult;
errors.push(...unreleasedResult.errors);
const releaseSections = parseReleaseSections(lines);
const releaseVersions = new Set(releaseSections.map((release) => release.version));
const inGit = git(["rev-parse", "--is-inside-work-tree"], root);
const branch = inGit.ok && inGit.stdout === "true" ? currentBranch(root) : "";
const strictUnreleased = forceStrictUnreleased || (!allowUnreleased && (branch === "main" || branch === "master"));
if (strictUnreleased && unreleasedEntries.length > 0) {
  const preview = unreleasedEntries.slice(0, 3).join(" | ");
  errors.push(`CHANGELOG.md has ${unreleasedEntries.length} entries under ## Unreleased on the release branch: ${preview}. Move them into a dated release section before claiming repo health.`);
}
errors.push(...validateGitTagAlignment(root, releaseVersions, topRelease, strictUnreleased));
errors.push(...validateUntaggedReleaseDrift(root, releaseSections));

if (errors.length > 0) fail(errors);

const releaseLabel = topRelease ? topRelease.version : "none";
console.log(`latest release section ${releaseLabel}`);
if (unreleasedEntries.length === 0) {
  console.log("unreleased section empty");
} else {
  console.log(`unreleased entries allowed on branch ${branch || "unknown"}`);
}
