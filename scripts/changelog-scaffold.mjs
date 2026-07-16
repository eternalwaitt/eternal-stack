#!/usr/bin/env node
// Detect and scaffold changelog + version maintenance for ANY project the stack
// runs against. Creates a Keep a Changelog CHANGELOG.md and a VERSION file only
// when absent — never overwrites. Fail-open: projects opt out simply by not
// being release-managed. No ledger or receipt surface.
//
// Usage:
//   node scripts/changelog-scaffold.mjs detect  [--root <dir>] [--json]
//   node scripts/changelog-scaffold.mjs scaffold [--root <dir>] [--seed <X.Y.Z>] [--json]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const argv = process.argv.slice(2);
const command = argv[0] || "help";
const arg = (flag, fallback = "") => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : fallback;
};
const root = path.resolve(arg("--root", process.cwd()));
const json = argv.includes("--json");
const changelogPath = path.join(root, "CHANGELOG.md");
const versionPath = path.join(root, "VERSION");

// Strict SemVer core: each numeric component is `0` or has no leading zero, so
// `01.2.3` is rejected. One source of truth for both tag selection and --seed
// validation, keeping the two sites from drifting apart.
const SEMVER_CORE = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const STABLE_TAG_RE = new RegExp(`^v${SEMVER_CORE}$`);
const SEED_RE = new RegExp(`^${SEMVER_CORE}$`);

const CHANGELOG_TEMPLATE = (name) => `# Changelog

All notable changes to ${name} are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

### Changed

### Fixed

### Removed

### Security

### Deprecated
`;

function latestTag() {
  const res = spawnSync("git", ["-C", root, "tag", "--list", "v[0-9]*", "--sort=-v:refname"],
    { encoding: "utf8", timeout: 5000 });
  if (res.status !== 0) return "";
  return (res.stdout || "").split(/\r?\n/).filter(Boolean)[0] || "";
}

// Newest strict-semver tag (vX.Y.Z), skipping prereleases like v2.3.4-rc.1. Used
// only to seed VERSION: with both v1.2.3 and a newer v2.0.0-rc.1, the seed must be
// 1.2.3, not a prerelease the companion release-check would reject. detect() keeps
// using latestTag() so a prerelease-only repo still reports as release-managed.
function latestStableTag() {
  const res = spawnSync("git", ["-C", root, "tag", "--list", "v[0-9]*", "--sort=-v:refname"],
    { encoding: "utf8", timeout: 5000 });
  if (res.status !== 0) return "";
  return (res.stdout || "").split(/\r?\n/).find((t) => STABLE_TAG_RE.test(t)) || "";
}

function repoName() {
  const pkg = path.join(root, "package.json");
  if (existsSync(pkg)) {
    try { return JSON.parse(readFileSync(pkg, "utf8")).name || path.basename(root); } catch { /* fall through */ }
  }
  return path.basename(root);
}

function detect() {
  const hasChangelog = existsSync(changelogPath);
  const hasVersion = existsSync(versionPath);
  const hasUnreleased = hasChangelog && /^## Unreleased\s*$/m.test(readFileSync(changelogPath, "utf8"));
  const hasReleaseSection = hasChangelog && /^## v\d+\.\d+\.\d+\s*$/m.test(readFileSync(changelogPath, "utf8"));
  const tag = latestTag();
  const isReleaseManaged = Boolean(tag) || hasVersion || hasReleaseSection;
  return { root, hasChangelog, hasVersion, hasUnreleased, hasReleaseSection, latestTag: tag, isReleaseManaged };
}

function emit(payload, human) {
  process.stdout.write(json ? JSON.stringify(payload, null, 2) + "\n" : human + "\n");
}

if (command === "detect") {
  const state = detect();
  emit(state, `changelog: hasChangelog=${state.hasChangelog} hasVersion=${state.hasVersion} hasUnreleased=${state.hasUnreleased} releaseManaged=${state.isReleaseManaged}`);
} else if (command === "scaffold") {
  const created = [];
  // Validate an explicit --seed BEFORE any filesystem write so a bad seed fails
  // atomically — never leaving a half-scaffolded CHANGELOG.md with no VERSION.
  const versionMissing = !existsSync(versionPath);
  const explicitSeed = versionMissing ? arg("--seed") : "";
  if (explicitSeed && !SEED_RE.test(explicitSeed)) {
    process.stderr.write(`changelog-scaffold: --seed must be X.Y.Z, got "${explicitSeed}"\n`);
    process.exit(2);
  }
  if (!existsSync(changelogPath)) {
    writeFileSync(changelogPath, CHANGELOG_TEMPLATE(repoName()));
    created.push("CHANGELOG.md");
  }
  if (versionMissing) {
    // Seed from the newest strict-semver tag (never a prerelease), else 0.1.0.
    const derived = latestStableTag().replace(/^v/, "");
    const seed = explicitSeed || derived || "0.1.0";
    writeFileSync(versionPath, `${seed}\n`);
    created.push("VERSION");
  }
  emit({ root, created, alreadyPresent: created.length === 0 },
    created.length ? `scaffolded: ${created.join(", ")}` : "changelog + VERSION already present; nothing written");
} else {
  process.stderr.write("usage: changelog-scaffold.mjs detect|scaffold [--root <dir>] [--seed <X.Y.Z>] [--json]\n");
  process.exit(2);
}
