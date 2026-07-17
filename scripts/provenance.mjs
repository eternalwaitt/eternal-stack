#!/usr/bin/env node
// Commit-anchored provenance: persist a run ledger's per-file/artifact hashes and
// run summary into a git note attached to HEAD (ref refs/notes/etrnl-provenance).
// The note lets `session-deep-dive.mjs why <file>:<line>` answer which run/commit
// last touched a file, and with what recorded reason and artifact hash.
//
// Fail-closed: a missing git binary or a non-repo directory is a hard error, not a
// silent skip. The note body is deterministic — the only timestamps it carries are
// the ones the ledger already stamped (startedAt/updatedAt); no wall-clock is added.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argValue as readArgValue } from "./lib/cli-args.mjs";
import { canonicalJson, fileSha256 } from "./lib/evidence-trace.mjs";
import { gitSubprocessLimits } from "./lib/env-utils.mjs";

export const PROVENANCE_REF = "refs/notes/etrnl-provenance";

const DEFAULT_GIT_TIMEOUT_MS = 10_000;
const DEFAULT_GIT_MAX_BUFFER = 4 * 1024 * 1024;
const GIT_LIMITS = gitSubprocessLimits({
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
  maxBufferBytes: DEFAULT_GIT_MAX_BUFFER,
});

/**
 * Runs git in `cwd` and returns a normalized result. A missing git binary
 * surfaces as `ok: false` with `missing: true` so callers can fail closed with a
 * clear message instead of a raw spawn error.
 *
 * @param {string[]} gitArgs Arguments passed after `git`.
 * @param {string} cwd Working directory for the git invocation.
 * @returns {{ok: boolean, missing: boolean, status: number|null, stdout: string, stderr: string}}
 */
export function runGit(gitArgs, cwd) {
  const result = spawnSync("git", gitArgs, {
    cwd,
    encoding: "utf8",
    timeout: GIT_LIMITS.timeout,
    maxBuffer: GIT_LIMITS.maxBuffer,
  });
  const missing = Boolean(result.error && result.error.code === "ENOENT");
  return {
    ok: result.status === 0 && !result.error,
    missing,
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

/**
 * Resolves the git repository top-level for `cwd`, failing closed when git is
 * absent or the directory is not inside a work tree.
 *
 * @param {string} cwd Directory to probe.
 * @returns {string} Absolute repository root.
 */
export function requireGitRoot(cwd) {
  const probe = runGit(["rev-parse", "--show-toplevel"], cwd);
  if (probe.missing) {
    throw new Error("git is not installed or not on PATH; cannot anchor provenance");
  }
  if (!probe.ok) {
    const detail = probe.stderr || "not a git repository";
    throw new Error(`not inside a git work tree (${cwd}): ${detail}`);
  }
  const root = probe.stdout.trim();
  if (!root) {
    throw new Error(`could not resolve git repository root for ${cwd}`);
  }
  return root;
}

/**
 * Reads the JSON run ledger from `ledgerPath`, failing with path context rather
 * than treating an unreadable ledger as empty provenance.
 *
 * @param {string} ledgerPath Path to a run ledger JSON file.
 * @returns {object} Parsed ledger.
 */
export function readLedger(ledgerPath) {
  let raw;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ledger ${ledgerPath}: ${detail}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`ledger ${ledgerPath} is not valid JSON: ${detail}`);
  }
}

/**
 * Collects the distinct file paths a ledger touched: every recorded artifact
 * path plus any TDD-evidence source files. Only paths that resolve under the
 * repo root are kept, and they are stored repo-relative so provenance keys line
 * up with the paths a caller passes to `why <file>:<line>`. Paths that escape
 * the repo root are omitted entirely: this note is committed and shared, so
 * writing an absolute path would leak the local username and filesystem layout.
 *
 * @param {object} ledger Parsed run ledger.
 * @param {string} repoRoot Absolute git repository root.
 * @returns {Array<{path: string, resolved: string, kind: string}>}
 */
export function collectTouchedFiles(ledger, repoRoot) {
  const cwd = ledger.cwd && path.isAbsolute(ledger.cwd) ? ledger.cwd : repoRoot;
  const seen = new Map();
  const add = (rawPath, kind) => {
    const value = String(rawPath || "").trim();
    if (!value) return;
    const resolved = path.resolve(cwd, value);
    const relative = path.relative(repoRoot, resolved);
    // Omit anything outside the repo root rather than storing an absolute path:
    // the note is shared and an absolute path would leak local user/FS layout.
    if (relative.startsWith("..") || path.isAbsolute(relative)) return;
    const key = relative;
    if (seen.has(key)) return;
    seen.set(key, { path: key, resolved, kind });
  };
  for (const artifact of Array.isArray(ledger.artifacts) ? ledger.artifacts : []) {
    add(artifact.path, artifact.type ? `artifact:${artifact.type}` : "artifact");
  }
  for (const evidence of Array.isArray(ledger.tddEvidence) ? ledger.tddEvidence : []) {
    // sourceFiles is a free-form comma/space separated list stamped by record-tdd.
    for (const file of String(evidence.sourceFiles || "").split(/[\s,]+/)) add(file, "source");
  }
  return [...seen.values()];
}

/**
 * Extracts the deterministic run summary the note carries. Only ledger-stamped
 * timestamps are copied through; no wall-clock reading happens here.
 *
 * @param {object} ledger Parsed run ledger.
 * @returns {object} Summary object embedded in the provenance note.
 */
export function runSummary(ledger) {
  const tasks = Array.isArray(ledger.tasks) ? ledger.tasks : [];
  const checks = Array.isArray(ledger.checks) ? ledger.checks : [];
  const reasonParts = [];
  if (ledger.planPath) reasonParts.push(`plan=${ledger.planPath}`);
  const verifiedTasks = tasks.filter((task) => task.status === "verified").length;
  const taskTitles = tasks
    .map((task) => task.title || task.id)
    .filter(Boolean)
    .slice(0, 8);
  return {
    runId: ledger.runId || "",
    planPath: ledger.planPath || "",
    mode: ledger.mode || "",
    startedAt: ledger.startedAt || "",
    updatedAt: ledger.updatedAt || "",
    taskCount: tasks.length,
    verifiedTasks,
    checkCount: checks.length,
    passedChecks: checks.filter((check) => check.status === "passed").length,
    taskTitles,
    reason: reasonParts.join(" ") || (taskTitles[0] ? `implemented: ${taskTitles.join("; ")}` : ""),
  };
}

/**
 * Builds the deterministic provenance note body for a ledger. Files are sorted by
 * path and hashed with SHA-256; unreadable/missing files record a null hash and a
 * short error rather than aborting the whole anchor.
 *
 * @param {object} ledger Parsed run ledger.
 * @param {string} repoRoot Absolute git repository root.
 * @returns {object} Note body object (serialized with canonicalJson before writing).
 */
export function buildNote(ledger, repoRoot) {
  const touched = collectTouchedFiles(ledger, repoRoot);
  const files = touched
    .map((entry) => {
      let hash = null;
      let error;
      if (existsSync(entry.resolved)) {
        try {
          hash = fileSha256(entry.resolved);
        } catch (hashError) {
          error = hashError instanceof Error ? hashError.message : String(hashError);
        }
      } else {
        error = "missing";
      }
      const row = { path: entry.path, kind: entry.kind, sha256: hash };
      if (error) row.error = error;
      return row;
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return {
    schemaVersion: 1,
    kind: "etrnl-provenance",
    summary: runSummary(ledger),
    files,
  };
}

/**
 * Writes (force-replacing) the provenance note for HEAD.
 *
 * @param {object} params
 * @param {string} params.repoRoot Absolute git repository root.
 * @param {string} params.ref Notes ref to attach to (e.g. refs/notes/etrnl-provenance).
 * @param {string} params.body Serialized note body.
 * @returns {{commit: string}} The commit the note was attached to.
 */
export function writeNote({ repoRoot, ref, body }) {
  const head = runGit(["rev-parse", "HEAD"], repoRoot);
  if (!head.ok || !head.stdout.trim()) {
    const detail = head.stderr || "no commit at HEAD";
    throw new Error(`cannot resolve HEAD to anchor provenance: ${detail}`);
  }
  const commit = head.stdout.trim();
  const add = runGit(["notes", `--ref=${ref}`, "add", "-f", "-m", body, "HEAD"], repoRoot);
  if (!add.ok) {
    const detail = add.stderr || `git notes exited with status ${add.status}`;
    throw new Error(`failed to write provenance note: ${detail}`);
  }
  return { commit };
}

/**
 * `anchor` subcommand: read a ledger, hash its touched files, and write the note.
 *
 * @param {string[]} args CLI args after the subcommand.
 * @returns {{commit: string, ref: string, files: number, ledger: string}}
 */
export function anchor(args) {
  const ref = readArgValue(args, "--ref", PROVENANCE_REF);
  const cwd = path.resolve(readArgValue(args, "--cwd", process.cwd()));
  const repoRoot = requireGitRoot(cwd);
  const ledgerArg = readArgValue(args, "--ledger");
  const ledgerPath = ledgerArg
    ? path.resolve(cwd, ledgerArg)
    : resolveCurrentLedger(readArgValue(args, "--session", process.env.CLAUDE_SESSION_ID || "default"));
  if (!ledgerPath) {
    throw new Error("no ledger to anchor; pass --ledger <path> or run within an active session ledger");
  }
  const ledger = readLedger(ledgerPath);
  const note = buildNote(ledger, repoRoot);
  const body = canonicalJson(note);
  const { commit } = writeNote({ repoRoot, ref, body });
  return { commit, ref, files: note.files.length, ledger: ledgerPath };
}

/**
 * Resolves the current run ledger path from the execution-ledger pointer file for
 * a session, mirroring execution-ledger.mjs's runs directory resolution. Returns
 * an empty string when no pointer exists (the caller fails closed with guidance).
 *
 * @param {string} sessionId Session id whose pointer file to read.
 * @returns {string} Ledger path or "".
 */
function resolveCurrentLedger(sessionId) {
  const runsDir = process.env.ETRNL_RUNS_DIR
    || path.join(process.env.CLAUDE_HOME || path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude"), "etrnl", "runs");
  const safe = String(sessionId || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
  const pointer = path.join(runsDir, `current-${safe}.json`);
  if (!existsSync(pointer)) return "";
  try {
    return JSON.parse(readFileSync(pointer, "utf8")).path || "";
  } catch {
    return "";
  }
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.error("usage: provenance.mjs anchor [--ledger <path>] [--ref refs/notes/etrnl-provenance] [--cwd <dir>] [--session <id>] [--json]");
    process.exit(command ? 0 : 2);
  }
  const rest = argv.slice(1);
  const jsonMode = rest.includes("--json");
  try {
    if (command === "anchor") {
      const result = anchor(rest);
      if (jsonMode) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      else console.log(`anchored provenance ref=${result.ref} commit=${result.commit.slice(0, 12)} files=${result.files}`);
      return;
    }
    console.error(`provenance.mjs: unknown subcommand ${command}`);
    process.exit(2);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: detail }, null, 2));
    else console.error(`provenance error: ${detail}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
