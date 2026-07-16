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
  if (!existsSync(changelogPath)) {
    writeFileSync(changelogPath, CHANGELOG_TEMPLATE(repoName()));
    created.push("CHANGELOG.md");
  }
  if (!existsSync(versionPath)) {
    // Never seed a non-semver VERSION (e.g. from a prerelease tag like v2.3.4-rc.1),
    // which the companion release-check would reject. Error on an explicit bad
    // --seed rather than silently falling back.
    const explicitSeed = arg("--seed");
    if (explicitSeed && !/^\d+\.\d+\.\d+$/.test(explicitSeed)) {
      process.stderr.write(`changelog-scaffold: --seed must be X.Y.Z, got "${explicitSeed}"\n`);
      process.exit(2);
    }
    const derived = latestTag().replace(/^v/, "");
    const seed = explicitSeed || (/^\d+\.\d+\.\d+$/.test(derived) ? derived : "0.1.0");
    writeFileSync(versionPath, `${seed}\n`);
    created.push("VERSION");
  }
  emit({ root, created, alreadyPresent: created.length === 0 },
    created.length ? `scaffolded: ${created.join(", ")}` : "changelog + VERSION already present; nothing written");
} else {
  process.stderr.write("usage: changelog-scaffold.mjs detect|scaffold [--root <dir>] [--seed <X.Y.Z>] [--json]\n");
  process.exit(2);
}
