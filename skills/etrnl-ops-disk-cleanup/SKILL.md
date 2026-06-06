---
name: etrnl-ops-disk-cleanup
description: ETRNL safe local disk cleanup workflow for Claude Code. Use when the user asks to free disk, SSD, or storage space; hidden from model auto-invocation.
disable-model-invocation: true
---
# Disk Cleanup

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-ops-disk-cleanup`; on update, ask update/snooze/continue.

Reclaim local disk space with an inspect-first, trash-only workflow.

## Required Flow

1. Verify `trash` is available before building the manifest: `command -v trash`. If it is missing, abort with `trash is required - install via npm i -g trash-cli or your OS package manager`.
2. Identify the target host and filesystem first with `pwd`, `df -h`, and a bounded usage command such as `dust -d 2 "$HOME"` or a focused project path.
3. Build a dry-run manifest before deleting anything. Include exact absolute paths, category, estimated bytes, contents description, why the path is safe to trash, cleanup command, and risk tier.
   Validate structured manifests with `node ~/.claude/scripts/disk-cleanup-manifest.mjs validate < manifest.json` when the helper is installed.
4. Only cleanup transient paths: caches, build outputs, logs, package-manager caches, simulator/build artifacts, and explicitly disposable temp files.
5. Use owner cleanup commands before direct path trashing when they exist, such as `brew cleanup`, package-manager cache clean commands, `go clean -cache`, or Docker prune commands after `docker system df` and explicit confirmation.
6. Use `trash` for deletion. Do not use `rm -r` or `rm -rf` for cleanup.
7. Never delete source checkouts, documents, photos, mail stores, keychains, databases, or project data unless Victor explicitly names that exact path and confirms the deletion after seeing the manifest.
8. Do not empty the whole Trash unless Victor explicitly asks after seeing the current Trash contents and estimated size.
9. After trashing files, rerun `df -h` or the same usage command and report before/after space.

## Risk Tiers

- Tier 1 trashable transient: cache, build output, logs, dependency cache, simulator/build artifacts, or temp files with clear owner and no source-control membership.
- Tier 2 report-only app data: browser profiles, mail/download folders, Docker volumes, VM images, databases, package stores shared across projects, or app support data. Report size and cleanup command; wait for explicit approval before mutation.
- Tier 3 never by default: source checkouts, documents, photos, mail stores, keychains, credentials, databases, backups, and project data.

## Approved Path Classes

The approved paths below are macOS-oriented because this workflow targets Victor's local Claude/Codex host. On non-macOS systems, skip macOS-only paths such as `$HOME/Library/**`, Xcode `DerivedData`, and `/private/var/folders/**`, or replace them with reviewed platform-specific cache/temp equivalents before building the dry-run manifest.

- `$HOME/Library/Caches/**`
- `$HOME/Library/Developer/Xcode/DerivedData/**`
- `$HOME/Library/Logs/**`
- `$HOME/.cache/**`
- `$HOME/.npm/_cacache/**`
- `$HOME/.pnpm-store/**`
- `$HOME/.bun/install/cache/**`
- `/tmp/**`, `/private/tmp/**`, `/var/folders/**`, `/private/var/folders/**`
- Project-local build/cache folders such as `dist/`, `build/`, `.next/`, `target/`, `node_modules/.cache/`, `.cache/`, or `.parcel-cache/` after verifying `.gitignore`, parent directory structure, and absence from source control; never include paths that contain source file extensions or look like source checkouts.

## Completion Evidence

Report:

- Host and filesystem checked
- Dry-run manifest path or inline manifest
- Manifest validation command and result when a structured manifest is used
- Exact cleanup command used
- Before/after free space
- Anything intentionally left untouched
