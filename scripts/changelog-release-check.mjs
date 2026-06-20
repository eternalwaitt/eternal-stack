#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitSubprocessLimits } from "./lib/env-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DEFAULT_GIT_TIMEOUT_MS = 10_000;
const DEFAULT_GIT_MAX_BUFFER = 1024 * 1024;
const GIT_LIMITS = gitSubprocessLimits({
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
  maxBufferBytes: DEFAULT_GIT_MAX_BUFFER,
});
const KEEP_A_CHANGELOG_CATEGORIES = new Set([
  "### Added",
  "### Changed",
  "### Fixed",
  "### Removed",
  "### Security",
  "### Deprecated",
]);

function usage() {
  console.error("usage: changelog-release-check.mjs [--root <path>] [--allow-unreleased] [--strict-unreleased] [--allow-clean-history-changelog] [--allow-pending-release] [--skip-version-file] [--skip-categories]");
  console.error("--strict-unreleased takes precedence over --allow-unreleased when both are present.");
  console.error("--allow-clean-history-changelog permits older changelog sections without tags after a clean-root public release.");
  console.error("--allow-pending-release permits VERSION to point at an untagged top changelog section for PR health checks.");
  console.error("--skip-version-file skips VERSION file alignment checks (test fixtures only).");
  console.error("--skip-categories skips Keep a Changelog category validation (test fixtures only).");
  process.exit(2);
}

if (args.includes("--help") || args.includes("-h")) usage();

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
    timeout: GIT_LIMITS.timeout,
    maxBuffer: GIT_LIMITS.maxBuffer,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

function parseReleaseHeading(line) {
  const match = line.match(/^## (v\d+\.\d+\.\d+)\s*$/);
  if (!match) return null;
  return { version: match[1], lineIndex: -1 };
}

function parseReleaseSections(lines) {
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseReleaseHeading(lines[index]);
    if (parsed) sections.push({ ...parsed, lineIndex: index });
  }
  return sections;
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

function releaseSectionBody(lines, startIndex) {
  const nextRelease = lines.slice(startIndex + 1).findIndex((line) => /^## v\d+\.\d+\.\d+\s*$/.test(line.trim()));
  const endIndex = nextRelease < 0 ? lines.length : startIndex + 1 + nextRelease;
  return lines.slice(startIndex + 1, endIndex);
}

function validateReleaseCategories(lines, releaseSections, skipCategories) {
  const errors = [];
  if (skipCategories) return errors;
  for (const release of releaseSections) {
    const body = releaseSectionBody(lines, release.lineIndex);
    const categoriesPresent = new Set(
      body
        .map((line) => line.trim())
        .filter((line) => KEEP_A_CHANGELOG_CATEGORIES.has(line)),
    );
    if (categoriesPresent.size === 0) {
      errors.push(`${release.version} must include at least one Keep a Changelog category (### Added, Changed, Fixed, Removed, Security, or Deprecated).`);
      continue;
    }
    let activeCategory = "";
    let bulletsInCategory = 0;
    let categoryHasBullet = false;
    let anyBullet = false;
    for (const rawLine of body) {
      const line = rawLine.trim();
      if (KEEP_A_CHANGELOG_CATEGORIES.has(line)) {
        if (activeCategory && !categoryHasBullet) {
          errors.push(`${release.version} category ${activeCategory} is empty.`);
        }
        activeCategory = line;
        bulletsInCategory = 0;
        categoryHasBullet = false;
        continue;
      }
      if (/^-\s+/.test(line)) {
        anyBullet = true;
        if (activeCategory) {
          bulletsInCategory += 1;
          categoryHasBullet = true;
        }
      }
    }
    if (activeCategory && !categoryHasBullet) {
      errors.push(`${release.version} category ${activeCategory} is empty.`);
    }
    if (!anyBullet) {
      errors.push(`${release.version} must include at least one changelog bullet.`);
    }
  }
  return errors;
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
  unreleasedEntries = meaningfulLines(sourceLines.slice(unreleasedIndex + 1, nextHeadingIndex))
    .filter((line) => !KEEP_A_CHANGELOG_CATEGORIES.has(line.trim()));
  topRelease = parseReleaseHeading(sourceLines[nextHeadingIndex]);
  if (!topRelease) {
    errors.push(`First release heading must be a semantic version heading like "## vX.Y.Z": ${sourceLines[nextHeadingIndex]}`);
  } else {
    topRelease.lineIndex = nextHeadingIndex;
  }
  return { topRelease, unreleasedEntries, errors };
}

function validateVersionFile(root, topRelease, skipVersionFile) {
  const errors = [];
  if (skipVersionFile || !topRelease) return errors;
  const versionPath = path.join(root, "VERSION");
  if (!existsSync(versionPath)) {
    errors.push("VERSION file missing. Add VERSION as the single source of truth for the current release.");
    return errors;
  }
  const version = readFileSync(versionPath, "utf8").trim().replace(/^v/i, "");
  const expected = topRelease.version.replace(/^v/, "");
  if (version !== expected) {
    errors.push(`VERSION (${version}) does not match top changelog release (${expected}).`);
  }
  return errors;
}

function validateTopReleaseTagged(root, topRelease, skipVersionFile, allowPendingRelease) {
  const errors = [];
  if (skipVersionFile || allowPendingRelease || !topRelease) return errors;
  const versionPath = path.join(root, "VERSION");
  if (!existsSync(versionPath)) return errors;
  const version = readFileSync(versionPath, "utf8").trim().replace(/^v/i, "");
  if (version !== topRelease.version.replace(/^v/, "")) return errors;

  const inGit = git(["rev-parse", "--is-inside-work-tree"], root);
  if (!inGit.ok || inGit.stdout !== "true") return errors;
  const tags = new Set(git(["tag", "--list", "v[0-9]*"], root).stdout.split(/\r?\n/).filter(Boolean));
  if (!tags.has(topRelease.version)) {
    errors.push(`Release ${topRelease.version} is documented in CHANGELOG.md and VERSION but is not tagged. Run: node scripts/release.mjs tag`);
  }
  return errors;
}

function validateGitTagAlignment(root, releaseVersions, topRelease) {
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
  if (!topRelease || !head.ok || !tagCommit.ok || head.stdout === tagCommit.stdout) {
    return errors;
  }
  try {
    if (compareSemver(topRelease.version, latestTag) <= 0) {
      errors.push(`HEAD has commits after ${latestTag}, but the latest changelog release is still ${topRelease.version}. Cut the next semantic version section.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
  }
  return errors;
}

function validateUntaggedReleaseDrift(root, releaseSections, allowCleanHistoryChangelog) {
  const errors = [];
  if (allowCleanHistoryChangelog) return errors;
  const inGit = git(["rev-parse", "--is-inside-work-tree"], root);
  if (!inGit.ok || inGit.stdout !== "true" || releaseSections.length === 0) return errors;
  const tags = new Set(git(["tag", "--list", "v[0-9]*"], root).stdout.split(/\r?\n/).filter(Boolean));
  if (tags.size === 0) return errors;
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
const allowUnreleased = args.includes("--allow-unreleased") && !args.includes("--strict-unreleased");
const allowCleanHistoryChangelog = args.includes("--allow-clean-history-changelog");
const allowPendingRelease = args.includes("--allow-pending-release");
const skipVersionFile = args.includes("--skip-version-file");
const skipCategories = args.includes("--skip-categories");
const changelogPath = path.join(root, "CHANGELOG.md");
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
if (unreleasedEntries.length > 0 && !allowUnreleased) {
  const preview = unreleasedEntries.slice(0, 3).join(" | ");
  errors.push(`CHANGELOG.md has ${unreleasedEntries.length} entries under ## Unreleased: ${preview}. Move them into a semantic version section before claiming repo health.`);
}
errors.push(...validateReleaseCategories(lines, releaseSections, skipCategories));
errors.push(...validateVersionFile(root, topRelease, skipVersionFile));
errors.push(...validateTopReleaseTagged(root, topRelease, skipVersionFile, allowPendingRelease));
errors.push(...validateGitTagAlignment(root, releaseVersions, topRelease));
errors.push(...validateUntaggedReleaseDrift(root, releaseSections, allowCleanHistoryChangelog));

if (errors.length > 0) fail(errors);

const releaseLabel = topRelease ? topRelease.version : "none";
console.log(`latest release section ${releaseLabel}`);
if (unreleasedEntries.length === 0) {
  console.log("unreleased section empty");
} else {
  console.log("unreleased section has entries");
}
