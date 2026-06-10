# Releasing Eternal Stack

Eternal Stack follows [Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/).

## Sources of truth

| File | Role |
| --- | --- |
| `VERSION` | Current shipped version (`X.Y.Z`, no `v` prefix). Must match the first release section in `CHANGELOG.md`. |
| `CHANGELOG.md` | Human-readable history. `## Unreleased` holds work in progress; each shipped version is `## vX.Y.Z` with a release date and categorized bullets. |
| Git tags | Annotated tags named `vX.Y.Z` on the commit that matches the release section. |

## Changelog categories

Every shipped release section must include at least one Keep a Changelog category with at least one bullet:

- `### Added` — new capabilities
- `### Changed` — behavior or API changes
- `### Fixed` — bug fixes
- `### Removed` — deleted features or skills
- `### Security` — security-relevant fixes
- `### Deprecated` — features scheduled for removal

Use complete sentences. Group related bullets under the right category instead of a flat list.

## Day-to-day workflow

1. Land user-visible work on `main`.
2. Add bullets under `## Unreleased` in the correct category while the work is in flight.
3. Before claiming repo health on a release commit, ensure `Unreleased` is empty.

## Cutting a release

```bash
# 1. Move Unreleased into a new version section (updates VERSION)
node scripts/release.mjs prepare 0.4.0

# 2. Review CHANGELOG.md and VERSION, then commit
git add CHANGELOG.md VERSION
git commit -m "chore: release v0.4.0"

# 3. Validate hygiene, create annotated tag, push tag
node scripts/changelog-release-check.mjs --strict-unreleased
node scripts/release.mjs tag
git push origin main
git push origin v0.4.0
```

`prepare` inserts today's date, creates empty category headings under `## Unreleased` for the next cycle, and writes `VERSION`.

`tag` creates an annotated `vX.Y.Z` tag at `HEAD` when `VERSION` and `CHANGELOG.md` already agree.

## Validation

```bash
node scripts/changelog-release-check.mjs --strict-unreleased
```

Checks:

- `## Unreleased` exists and is empty (unless `--allow-unreleased`)
- Top release heading is valid semver (`## vX.Y.Z`)
- `VERSION` matches the top release when present
- Each shipped section uses Keep a Changelog categories
- Latest git tag appears in the changelog
- No untagged older release sections below the top release
- When `VERSION` matches the top release, that tag must exist
- When `HEAD` is ahead of the latest tag, the changelog top release must be newer than that tag

`scripts/doctor.sh` runs `changelog-release-check.mjs --strict-unreleased` against the repo root.

When release or public-facing surfaces change, keep `README.md`, `AGENTS.md`, root `CLAUDE.md`, `templates/CLAUDE.md`, `CREDITS.md`, `docs/skills.md`, `docs/health-stack.md`, and `docs/eternal-stack-coverage.md` aligned in the same change.

## Retroactive tags

If changelog sections were added without tags (for example `v0.2.0` and `v0.3.0` after a documentation cleanup), tag the merge commits that introduced each release:

```bash
git tag -a v0.2.0 ad73e45 -m "v0.2.0: Eternal Stack rebrand"
git tag -a v0.3.0 <merge-commit> -m "v0.3.0: deep-audit consolidation and release hygiene"
git push origin --tags
```

## Public GitHub rename

The canonical slug is `eternal-stack`. After renaming on GitHub, update your local remote:

```bash
gh repo rename eternal-stack --yes
git remote set-url origin git@github.com:<owner>/eternal-stack.git
```
