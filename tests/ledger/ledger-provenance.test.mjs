import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const ledgerCli = path.join(repoRoot, "scripts", "execution-ledger.mjs");

function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), "etrnl-ledger-"));
  const runs = path.join(root, "runs");
  const project = path.join(root, "project");
  mkdirSync(runs, { recursive: true });
  mkdirSync(project, { recursive: true });
  return { root, runs, project };
}

// CLAUDE_SESSION_ID is cleared so the harness cannot leak a real session into the
// "unset session" cases, which are the ones that reproduce the shared-bucket bug.
function ledger(runs, args, options = {}) {
  return spawnSync("node", [ledgerCli, ...args], {
    encoding: "utf8",
    ...options,
    env: { ...process.env, ETRNL_RUNS_DIR: runs, CLAUDE_SESSION_ID: "", ...(options.env ?? {}) },
  });
}

const readLedger = (runs, session) =>
  JSON.parse(readFileSync(JSON.parse(readFileSync(path.join(runs, `current-${session}.json`), "utf8")).path, "utf8"));

test("every ledger event records the process that wrote it", () => {
  const { runs, project } = sandbox();
  assert.equal(ledger(runs, ["init", "--session", "s1", "--cwd", project]).status, 0);
  assert.equal(ledger(runs, ["set-task", "--session", "s1", "--task", "T1", "--title", "T", "--status", "in_progress"]).status, 0);

  const events = readLedger(runs, "s1").events;
  assert.ok(events.length >= 2, "init and task.set both recorded");
  for (const event of events) {
    assert.equal(event.actor.session, "s1", `${event.type} records the resolved session`);
    assert.equal(typeof event.actor.pid, "number");
    assert.equal(typeof event.actor.cwd, "string");
  }
});

test("self-reported agent identity is recorded separately as a claim", () => {
  const { runs, project } = sandbox();
  ledger(runs, ["init", "--session", "s2", "--cwd", project]);
  ledger(runs, ["set-phase", "--session", "s2", "--phase", "P1", "--status", "in_progress"], {
    env: { ETRNL_AGENT: "etrnl-executor" },
  });

  const events = readLedger(runs, "s2").events;
  const phase = events.find((event) => event.type === "phase.set");
  assert.equal(phase.actor.claims, "etrnl-executor", "untrusted identity is kept under claims");
  const init = events.find((event) => event.type === "ledger.init");
  assert.equal(init.actor.claims, undefined, "no claim recorded when none is offered");
});

// The incident signature: an unset CLAUDE_SESSION_ID expands to an empty --session, so
// writes used to land in a machine-wide "default" bucket that unrelated repositories
// shared. The bucket is now qualified by worktree, so the collapse cannot cross projects.
test("an empty session resolves to a worktree-scoped bucket, not a machine-wide one", () => {
  const { runs, project } = sandbox();
  assert.equal(ledger(runs, ["init", "--session", "", "--cwd", project]).status, 0);
  assert.ok(!existsSync(path.join(runs, "current-default.json")), "no machine-wide default pointer");

  const scoped = readdirSync(runs).filter((name) => /^current-default-[0-9a-f]+\.json$/.test(name));
  assert.equal(scoped.length, 1, "exactly one worktree-scoped pointer");

  const bucket = scoped[0].replace(/^current-/, "").replace(/\.json$/, "");
  assert.equal(ledger(runs, ["set-task", "--session", "", "--task", "D1R7", "--title", "x", "--status", "in_progress"], { cwd: project }).status, 0);
  const event = readLedger(runs, bucket).events.find((row) => row.taskId === "D1R7");
  assert.equal(event.actor.session, bucket, "the resolved bucket is visible on the event");
});

test("a session in another worktree cannot resolve this run ledger", () => {
  const { runs, project } = sandbox();
  ledger(runs, ["init", "--session", "", "--cwd", project]);

  const stray = path.join(path.dirname(project), "unrelated-repo");
  mkdirSync(stray, { recursive: true });
  const write = ledger(runs, ["set-task", "--session", "", "--task", "D1R7", "--title", "x", "--status", "in_progress"], { cwd: stray });
  assert.equal(write.status, 1, "the cross-project write is refused");
  assert.match(write.stderr, /No active execution ledger/);

  const scoped = readdirSync(runs).filter((name) => name.startsWith("current-default-"));
  assert.equal(scoped.length, 1, "the refused write did not open a pointer of its own");
  const owner = readLedger(runs, scoped[0].replace(/^current-/, "").replace(/\.json$/, ""));
  assert.equal(owner.tasks.length, 0, "the other worktree's ledger is untouched");
});

// A session that started before scoping has only the shared pointer. It keeps working
// in its own worktree; the same pointer read from anywhere else resolves to nothing.
test("the pre-scoping shared pointer is honoured only inside its own worktree", () => {
  const { runs, project } = sandbox();
  ledger(runs, ["init", "--session", "legacy", "--cwd", project]);
  const target = JSON.parse(readFileSync(path.join(runs, "current-legacy.json"), "utf8")).path;
  writeFileSync(path.join(runs, "current-default.json"), JSON.stringify({ path: target, updatedAt: "2026-01-01T00:00:00Z" }));

  const owned = ledger(runs, ["set-task", "--session", "", "--task", "OWN", "--title", "x", "--status", "in_progress"], { cwd: project });
  assert.equal(owned.status, 0, "the owning worktree still resolves its in-flight ledger");

  const stray = path.join(path.dirname(project), "other-repo");
  mkdirSync(stray, { recursive: true });
  const foreign = ledger(runs, ["set-task", "--session", "", "--task", "FOREIGN", "--title", "x", "--status", "in_progress"], { cwd: stray });
  assert.equal(foreign.status, 1, "another worktree is refused through the same pointer");
  assert.match(foreign.stderr, /belongs to another worktree/);

  const after = JSON.parse(readFileSync(target, "utf8"));
  assert.deepEqual(after.tasks.map((task) => task.id), ["OWN"]);
});

test("reconcile reports events written from outside the ledger's worktree", () => {
  const { runs, project } = sandbox();
  ledger(runs, ["init", "--session", "mixed", "--cwd", project]);
  const target = JSON.parse(readFileSync(path.join(runs, "current-mixed.json"), "utf8")).path;

  const contaminated = JSON.parse(readFileSync(target, "utf8"));
  contaminated.events.push(
    { type: "task.set", at: "2026-01-01T00:00:00Z", taskId: "X1", actor: { session: "mixed", cwd: path.join(path.dirname(project), "elsewhere") } },
    { type: "task.set", at: "2026-01-01T00:01:00Z", taskId: "X2", actor: { session: "mixed", cwd: project } },
    { type: "task.set", at: "2026-01-01T00:02:00Z", taskId: "X3" },
  );
  writeFileSync(target, JSON.stringify(contaminated));

  const report = JSON.parse(ledger(runs, ["reconcile", "--json"]).stdout);
  const finding = report.findings.find((row) => row.kind === "foreign-writer");
  assert.ok(finding, "cross-worktree writes are reported");
  assert.equal(finding.foreignEvents, 1, "only the event from another worktree counts");
  assert.equal(finding.foreignWorktrees, 1);
});

test("validate rejects a malformed actor but accepts events written before provenance", () => {
  const { runs, project } = sandbox();
  ledger(runs, ["init", "--session", "s3", "--cwd", project]);
  const file = JSON.parse(readFileSync(path.join(runs, "current-s3.json"), "utf8")).path;

  const legacy = JSON.parse(readFileSync(file, "utf8"));
  legacy.events = [{ type: "ledger.init", at: "2026-01-01T00:00:00Z" }];
  writeFileSync(file, JSON.stringify(legacy));
  assert.equal(ledger(runs, ["validate", file]).status, 0, "actor-less history stays valid");

  legacy.events = [{ type: "ledger.init", at: "2026-01-01T00:00:00Z", actor: "etrnl-executor" }];
  writeFileSync(file, JSON.stringify(legacy));
  const bad = ledger(runs, ["validate", file]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /actor must be an object/);

  legacy.events = [{ type: "ledger.init", at: "2026-01-01T00:00:00Z", actor: null }];
  writeFileSync(file, JSON.stringify(legacy));
  const nullActor = ledger(runs, ["validate", file]);
  assert.equal(nullActor.status, 1);
  assert.match(nullActor.stderr, /actor must be an object/);
});

function seedAliasedRuns(runs) {
  const write = (name, body) => writeFileSync(path.join(runs, name), JSON.stringify(body, null, 2));
  const target = path.join(runs, "run-default-111.json");
  write("run-default-111.json", {
    schemaVersion: 2,
    runId: "run-default-111",
    sessionId: "uuid-x",
    cwd: "/somewhere",
    tasks: [],
    agents: [],
    checks: [],
    events: [],
  });
  write("current-default.json", { path: target, updatedAt: "2026-01-01T00:00:00Z" });
  write("current-uuid-x.json", { path: target, updatedAt: "2026-01-02T00:00:00Z" });
  write("current-gone.json", { path: path.join(runs, "run-missing-999.json"), updatedAt: "2026-01-03T00:00:00Z" });
  return target;
}

test("reconcile reports without changing anything until --apply", () => {
  const { runs } = sandbox();
  seedAliasedRuns(runs);

  const dry = ledger(runs, ["reconcile", "--json"]);
  assert.equal(dry.status, 0, dry.stderr);
  const report = JSON.parse(dry.stdout);
  assert.equal(report.applied, false);
  assert.deepEqual(
    report.findings.map((finding) => finding.kind).sort(),
    ["aliased-pointer", "dangling-pointer", "session-divergence"],
  );
  assert.ok(existsSync(path.join(runs, "current-default.json")), "dry run leaves pointers in place");
});

test("reconcile retires stale pointers, keeps the owning session, and is idempotent", () => {
  const { runs } = sandbox();
  const target = seedAliasedRuns(runs);

  assert.equal(ledger(runs, ["reconcile", "--apply"]).status, 0);
  assert.ok(existsSync(path.join(runs, "current-uuid-x.json")), "owning session keeps its pointer");
  assert.ok(!existsSync(path.join(runs, "current-default.json")), "shared bucket alias is retired");
  assert.ok(!existsSync(path.join(runs, "current-gone.json")), "dangling pointer is retired");
  // Retired pointers are moved, not deleted, so a bad call stays recoverable.
  assert.equal(readdirSync(path.join(runs, "retired-pointers")).length, 2);

  const after = JSON.parse(readFileSync(target, "utf8"));
  const kinds = after.events.filter((event) => event.type === "ledger.reconciled").map((event) => event.finding);
  assert.deepEqual(kinds.sort(), ["aliased-pointer", "session-divergence"]);
  assert.equal(after.sessionId, "uuid-x", "divergence is recorded, never silently rewritten");

  ledger(runs, ["reconcile", "--apply"]);
  ledger(runs, ["reconcile", "--apply"]);
  const repeated = JSON.parse(readFileSync(target, "utf8"));
  assert.equal(
    repeated.events.filter((event) => event.type === "ledger.reconciled").length,
    2,
    "re-running does not restamp standing findings",
  );
});
