import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Recursively yields the absolute path of every regular file under `dir`.
 *
 * A missing `dir` yields nothing. Entries are read with `withFileTypes`, so
 * symlinks are NOT followed: a symlinked directory is neither descended nor is
 * its target yielded, and a symlinked file is skipped. Before descending into a
 * directory the target is re-checked with a no-follow `lstat`, so an entry that
 * was a real directory at readdir time but is swapped for a symlink before the
 * recursion (a TOCTOU) is skipped rather than followed out of the tree. The walk
 * therefore stays inside the tree it was pointed at — the same containment posture
 * the rest of the repo enforces (see skill-contract-check's symlink canonicalization).
 *
 * Callers layer their own policy through the two predicates and by filtering the
 * yielded paths (e.g. by extension), so this helper owns only the recursion.
 *
 * @param {string} dir Directory to walk.
 * @param {object} [options]
 * @param {(name: string, absPath: string) => boolean} [options.skipDir]
 *   Return true to prune a subdirectory (and everything beneath it).
 * @param {(name: string, absPath: string) => boolean} [options.skipFile]
 *   Return true to omit a regular file from the walk.
 * @returns {Generator<string>} Absolute file paths, in directory-entry order.
 */
export function* walkFiles(dir, { skipDir, skipFile } = {}) {
  // Normalize once so the advertised absolute-path contract holds even when the
  // caller passes a relative `dir` (path.join would otherwise preserve it relative).
  const root = path.resolve(dir);
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (skipDir && skipDir(entry.name, abs)) continue;
      // TOCTOU guard: the Dirent reported "directory" at readdir time, but `abs`
      // could be swapped for a symlink before we descend — and readdirSync WOULD
      // follow a symlinked path, escaping the tree. Re-check with a no-follow lstat
      // immediately before recursing so a swapped-in symlink is skipped, not followed.
      let isRealDir = false;
      try {
        isRealDir = lstatSync(abs).isDirectory();
      } catch {
        isRealDir = false;
      }
      if (!isRealDir) continue;
      yield* walkFiles(abs, { skipDir, skipFile });
    } else if (entry.isFile()) {
      if (skipFile && skipFile(entry.name, abs)) continue;
      yield abs;
    }
  }
}
