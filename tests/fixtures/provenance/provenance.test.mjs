import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const provenance = path.join(repoRoot, "scripts", "provenance.mjs");
const deepDive = path.join(repoRoot, "scripts", "session-deep-dive.mjs");
const sessionFixture = path.join(repoRoot, "tests", "fixtures", "session-deep-dive");

const node = (script, args, options = {}) =>
  spawnSync("node", [script, ...args], { encoding: "utf8", ...options });

const git = (root, gitArgs) =>
  spawnSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });

function gitAvailable() {
  const probe = spawnSync("git", ["--version"], { encoding: "utf8" });
  return probe.status === 0 && !probe.error;
}

// Deterministic identity, no signing, no reliance on ambient git config.
function newRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "prov-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["config", "notes.rewriteRef", "refs/notes/etrnl-provenance"]);
  return root;
}

// The temp repo mirrors the fixture ledger's artifact path (src/widget.mjs).
function seedRepo(root) {
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "widget.mjs"), "export const one = 1;\nexport const two = 2;\nexport const three = 3;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add widget"]);
  return git(root, ["rev-parse", "HEAD"]).stdout.trim();
}

test("provenance anchor + why round-trips the run/commit that touched a file", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  const commit = seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");

  const anchored = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchored.status, 0, `${anchored.stdout}${anchored.stderr}`);
  const anchorOut = JSON.parse(anchored.stdout);
  assert.equal(anchorOut.ok, true);
  assert.equal(anchorOut.commit, commit, "note anchored to HEAD commit");
  assert.equal(anchorOut.files, 1, "one hashed file recorded");

  // The note is a real git note on the provenance ref.
  const noteRaw = git(root, ["notes", "--ref=etrnl-provenance", "show", "HEAD"]);
  assert.equal(noteRaw.status, 0, noteRaw.stderr);
  const note = JSON.parse(noteRaw.stdout);
  assert.equal(note.kind, "etrnl-provenance");
  assert.equal(note.summary.runId, "run-fixture-provenance-001");
  assert.ok(note.files[0].sha256, "file hash recorded in note");

  // why <file>:<line> resolves the commit + run + reason + hash back out.
  const whyJson = node(deepDive, ["why", "src/widget.mjs:2", "--cwd", root, "--json"]);
  assert.equal(whyJson.status, 0, `${whyJson.stdout}${whyJson.stderr}`);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, true);
  assert.equal(answer.commit, commit, "why returns the anchoring commit");
  assert.equal(answer.runId, "run-fixture-provenance-001");
  assert.equal(answer.sha256, note.files[0].sha256, "why returns the recorded artifact hash");
  assert.match(answer.reason, /sample-feature\.md/);
  assert.equal(answer.line, 2);

  // Human-readable form also carries the commit + run.
  const whyText = node(deepDive, ["why", "src/widget.mjs:2", "--cwd", root]);
  assert.equal(whyText.status, 0, `${whyText.stdout}${whyText.stderr}`);
  assert.match(whyText.stdout, new RegExp(commit.slice(0, 12)));
  assert.match(whyText.stdout, /run-fixture-provenance-001/);
});

test("why returns the newest note when two commits touch the same file (newest-wins)", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  const commitA = seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");

  // Note 1 anchored on commit A with the fixture runId.
  const anchoredA = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchoredA.status, 0, `${anchoredA.stdout}${anchoredA.stderr}`);
  assert.equal(JSON.parse(anchoredA.stdout).commit, commitA, "first note anchored to commit A");

  // Second commit B touches the SAME file, anchored with a DIFFERENT runId.
  writeFileSync(
    path.join(root, "src", "widget.mjs"),
    "export const one = 1;\nexport const two = 22;\nexport const three = 3;\n",
  );
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "touch widget again"]);
  const commitB = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  assert.notEqual(commitB, commitA, "commit B is distinct from commit A");

  // A second ledger reusing the same artifact path but a distinct runId, anchored on B.
  const ledgerBObj = { ...JSON.parse(readFileSync(ledger, "utf8")), runId: "run-fixture-provenance-002" };
  const ledgerB = path.join(root, "ledger-b.json");
  writeFileSync(ledgerB, JSON.stringify(ledgerBObj));
  const anchoredB = node(provenance, ["anchor", "--ledger", ledgerB, "--cwd", root, "--json"]);
  assert.equal(anchoredB.status, 0, `${anchoredB.stdout}${anchoredB.stderr}`);
  assert.equal(JSON.parse(anchoredB.stdout).commit, commitB, "second note anchored to commit B");

  // why must resolve to the NEWEST note-bearing commit (B) and B's runId, not A's.
  const whyJson = node(deepDive, ["why", "src/widget.mjs:2", "--cwd", root, "--json"]);
  assert.equal(whyJson.status, 0, `${whyJson.stdout}${whyJson.stderr}`);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, true);
  assert.equal(answer.commit, commitB, "why returns the newest commit (B)");
  assert.equal(answer.runId, "run-fixture-provenance-002", "why returns commit B's runId, proving newest-wins");
});

test("why fails gracefully (exit 0) when no provenance notes exist", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  seedRepo(root);
  const whyJson = node(deepDive, ["why", "src/widget.mjs:1", "--cwd", root, "--json"]);
  assert.equal(whyJson.status, 0, whyJson.stderr);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, false);
  assert.match(answer.reason, /no provenance notes/i);
});

test("why fails gracefully when the queried file has no provenance note", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");
  const anchored = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchored.status, 0, `${anchored.stdout}${anchored.stderr}`);
  const whyJson = node(deepDive, ["why", "src/unrelated.mjs:5", "--cwd", root, "--json"]);
  assert.equal(whyJson.status, 0, whyJson.stderr);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, false);
  assert.match(answer.reason, /no provenance note records/i);
});

test("anchor fails closed (non-zero) outside a git work tree", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const nonRepo = mkdtempSync(path.join(tmpdir(), "prov-nonrepo-"));
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");
  const anchored = node(provenance, ["anchor", "--ledger", ledger, "--cwd", nonRepo]);
  assert.equal(anchored.status, 1, "anchor is fail-closed outside a repo");
  assert.match(anchored.stderr, /git work tree|not a git repository/i);
});

test("why prefers an OLDER exact-path note over a NEWER basename-only note (exact wins globally)", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");

  // OLDER note (commit A): records the EXACT queried path src/widget.mjs.
  const anchoredA = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchoredA.status, 0, `${anchoredA.stdout}${anchoredA.stderr}`);
  const commitA = JSON.parse(anchoredA.stdout).commit;

  // NEWER commit B touches a DIFFERENT file that only shares the basename widget.mjs
  // (src/nested/widget.mjs). Its ledger uses a distinct runId and points at that file.
  mkdirSync(path.join(root, "src", "nested"), { recursive: true });
  writeFileSync(path.join(root, "src", "nested", "widget.mjs"), "export const other = 9;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add nested widget"]);
  const commitB = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  assert.notEqual(commitB, commitA, "commit B is distinct from commit A");

  const baseLedger = JSON.parse(readFileSync(ledger, "utf8"));
  const ledgerBObj = {
    ...baseLedger,
    runId: "run-fixture-provenance-basename",
    tddEvidence: [{ taskId: "TG1", status: "verified", sourceFiles: "src/nested/widget.mjs" }],
    artifacts: [{ type: "source", path: "src/nested/widget.mjs", status: "recorded" }],
  };
  const ledgerB = path.join(root, "ledger-basename.json");
  writeFileSync(ledgerB, JSON.stringify(ledgerBObj));
  const anchoredB = node(provenance, ["anchor", "--ledger", ledgerB, "--cwd", root, "--json"]);
  assert.equal(anchoredB.status, 0, `${anchoredB.stdout}${anchoredB.stderr}`);
  assert.equal(JSON.parse(anchoredB.stdout).commit, commitB, "basename note anchored to newer commit B");

  // why for the exact path must return the OLDER exact-path note (A + its runId),
  // NOT the newer commit's basename-only match.
  const whyJson = node(deepDive, ["why", "src/widget.mjs:2", "--cwd", root, "--json"]);
  assert.equal(whyJson.status, 0, `${whyJson.stdout}${whyJson.stderr}`);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, true);
  assert.equal(answer.commit, commitA, "exact-path note (older commit A) wins over newer basename note");
  assert.equal(answer.runId, "run-fixture-provenance-001", "returns the exact-path note's runId, not the basename note's");
});

test("why --cwd <dir> <file>:<line> resolves the file, not the flag value (finding #22)", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");
  const anchored = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchored.status, 0, `${anchored.stdout}${anchored.stderr}`);
  const commit = JSON.parse(anchored.stdout).commit;

  // --cwd comes BEFORE the positional target here. The old find(!startsWith("-"))
  // grabbed the value of --cwd (root) as the target and failed to parse it.
  const whyJson = node(deepDive, ["why", "--cwd", root, "src/widget.mjs:2", "--json"]);
  assert.equal(whyJson.status, 0, `${whyJson.stdout}${whyJson.stderr}`);
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.found, true, "the <file>:<line> positional is selected, not the --cwd value");
  assert.equal(answer.file, "src/widget.mjs");
  assert.equal(answer.line, 2);
  assert.equal(answer.commit, commit, "resolves the anchored commit for the real target file");
});

test("why exits non-zero (not found:false) when a provenance note is unreadable (finding #23)", { skip: gitAvailable() ? false : "git unavailable" }, () => {
  const root = newRepo();
  seedRepo(root);
  const ledger = path.join(repoRoot, "tests", "fixtures", "provenance", "sample-ledger.json");
  const anchored = node(provenance, ["anchor", "--ledger", ledger, "--cwd", root, "--json"]);
  assert.equal(anchored.status, 0, `${anchored.stdout}${anchored.stderr}`);

  // Corrupt the note so it stays ENUMERABLE by `git notes list` but UNREADABLE by
  // `git notes show` — the exact "unreadable note" condition finding #23 guards
  // against. Build the notes tree by hand with plumbing so HEAD's note entry
  // points at a DANGLING (nonexistent) blob object: `list` reads the tree entry
  // fine, but `show` fails to read the missing object. `git notes add` would
  // reject a corrupt source up front, so plumbing is required here.
  const noteRef = "refs/notes/etrnl-provenance";
  const headCommit = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const missingBlob = "0000000000000000000000000000000000000001";
  const mktree = spawnSync("git", ["-C", root, "mktree", "--missing"], {
    encoding: "utf8",
    input: `100644 blob ${missingBlob}\t${headCommit}\n`,
  });
  assert.equal(mktree.status, 0, `mktree failed: ${mktree.stderr}`);
  const notesTree = mktree.stdout.trim();
  const commitTree = spawnSync(
    "git",
    ["-C", root, "commit-tree", notesTree, "-m", "corrupt note"],
    { encoding: "utf8" },
  );
  assert.equal(commitTree.status, 0, `commit-tree failed: ${commitTree.stderr}`);
  const notesCommit = commitTree.stdout.trim();
  const updateRef = git(root, ["update-ref", noteRef, notesCommit]);
  assert.equal(updateRef.status, 0, `update-ref failed: ${updateRef.stderr}`);
  // Sanity: the note is now enumerable but unshowable.
  const listCheck = git(root, ["notes", `--ref=${noteRef}`, "list"]);
  assert.equal(listCheck.status, 0, listCheck.stderr);
  assert.match(listCheck.stdout, new RegExp(headCommit), "corrupt note is still enumerable");
  const showCheck = git(root, ["notes", `--ref=${noteRef}`, "show", headCommit]);
  assert.notEqual(showCheck.status, 0, "corrupt note must fail `git notes show`");

  const whyJson = node(deepDive, ["why", "src/widget.mjs:2", "--cwd", root, "--json"]);
  assert.notEqual(whyJson.status, 0, "unreadable note must not be reported as a clean not-found");
  assert.equal(whyJson.status, 3, "unreadable/unparseable notes surface as error exit 3");
  const answer = JSON.parse(whyJson.stdout);
  assert.equal(answer.ok, false, "error payload, not a found:false answer");
  assert.notEqual(answer.found, false, "must not claim found:false for a note it could not read");
  assert.match(String(answer.error || ""), /unreadable|unparseable|note/i);
});

test("session-deep-dive with NO 'why' arg still runs its normal flag-only path unchanged", () => {
  const jsonRun = node(deepDive, ["--fixture", sessionFixture, "--json"]);
  assert.equal(jsonRun.status, 0, jsonRun.stderr);
  const report = JSON.parse(jsonRun.stdout);
  assert.equal(report.command, "session-deep-dive");
  assert.equal(report.sources.filesScanned, 4);
  assert.equal(report.totals.sessionCount, 4);
  assert.equal(report.privacy.outputSafe, true);

  const textRun = node(deepDive, ["--fixture", sessionFixture]);
  assert.equal(textRun.status, 0, textRun.stderr);
  assert.match(textRun.stdout, /session-deep-dive sessions=4 codeEligible=3/);

  // --help still exits 2 with the original flag-only usage (no 'why' mention leaking into it).
  const help = node(deepDive, ["--help"]);
  assert.equal(help.status, 2);
  assert.match(help.stderr, /usage: session-deep-dive\.mjs \[--fixture/);
});
