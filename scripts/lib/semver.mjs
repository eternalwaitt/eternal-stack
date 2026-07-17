// Strict SemVer helpers shared across the changelog/release tooling so the
// stable-tag policy has a single source of truth. STABLE_TAG_RE was previously
// duplicated in scripts/changelog-scaffold.mjs and scripts/changelog-release-check.mjs.

// Strict SemVer core: each numeric component is `0` or has no leading zero, so
// `01.2.3` is rejected.
export const SEMVER_CORE = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";

// A stable release tag: `vX.Y.Z`, no leading zeros, no prerelease/build suffix.
// `git tag --list v[0-9]*` also matches prerelease tags like `v2.0.0-rc.1`, but a
// changelog only carries `## vX.Y.Z` stable sections, so tag arrays are filtered
// through this before any changelog comparison.
export const STABLE_TAG_RE = new RegExp(`^v${SEMVER_CORE}$`);
