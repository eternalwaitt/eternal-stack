---
name: etrnl-disk-cleanup
description: ETRNL safe local disk cleanup workflow for Claude Code. Use when the user asks to free disk, SSD, or storage space; hidden from model auto-invocation.
disable-model-invocation: true
---
# Disk Cleanup

Reclaim local disk space with an inspect-first, trash-only workflow.

## Required Flow

1. Identify the target host and filesystem first with `pwd`, `df -h`, and a bounded usage command such as `dust -d 2 "$HOME"` or a focused project path.
2. Build a dry-run manifest before deleting anything. Include exact absolute paths, category, reason, and estimated bytes.
3. Only cleanup transient paths: caches, build outputs, logs, package-manager caches, simulator/build artifacts, and explicitly disposable temp files.
4. Use `trash` for deletion. Do not use `rm -r` or `rm -rf` for cleanup.
5. Never delete source checkouts, documents, photos, mail stores, keychains, databases, or project data unless Victor explicitly names that exact path and confirms the deletion after seeing the manifest.
6. After trashing files, rerun `df -h` or the same usage command and report before/after space.

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
- Exact cleanup command used
- Before/after free space
- Anything intentionally left untouched
