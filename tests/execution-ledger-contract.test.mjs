import { stateAckErrors } from "../scripts/lib/project-state.mjs";
import { worktreeHash } from "../scripts/lib/etrnl-state-core.mjs";
import { reviewReceiptFixture } from "./helpers/review-receipt-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveWorkflowContract } from "../scripts/lib/workflow-contract.mjs";

const ledgerCli = fileURLToPath(new URL("../scripts/execution-ledger.mjs", import.meta.url));
const executeChecker = fileURLToPath(new URL("../scripts/execute-evidence-check.mjs", import.meta.url));

function initGit(cwd) {
  const env = { ...process.env, GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "ETRNL Test", GIT_CONFIG_KEY_1: "user.email", GIT_CONFIG_VALUE_1: "test@example.invalid" };
  for (const args of [["init", "-q"], ["add", "-A"], ["commit", "-qm", "fixture"]]) {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
}

function fixture(t, contract) {
  const root = mkdtempSync(path.join(tmpdir(), "eternal-ledger-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const runs = path.join(root, "runs");
  const contractFile = path.join(project, "workflow.json");
  mkdirSync(project);
  writeFileSync(contractFile, JSON.stringify(contract));
  initGit(project);
  const env = { ...process.env, ETRNL_RUNS_DIR: runs, CLAUDE_SESSION_ID: "contract-test" };
  const rawRun = (...args) => spawnSync(process.execPath, [ledgerCli, ...args], { cwd: project, env, encoding: "utf8" });
  const ledger = () => {
    const file = readdirSync(runs).find(entry => entry.endsWith('.json') && !entry.startsWith('current-'));
    return JSON.parse(readFileSync(path.join(runs, file), 'utf8'));
  };
  const maintain = () => {
    const current = ledger();
    if (!stateAckErrors(current).length) return;
    const task = current.tasks.at(-1);
    const read = rawRun('read-state', '--session', 'contract-test', '--task', task.id);
    assert.equal(read.status, 0, read.stderr);
    const snapshot = JSON.parse(read.stdout);
    const unchanged = current.projectState?.ack?.taskNoteKey === snapshot.taskNoteKey;
    const args = unchanged
      ? ['--unchanged-reason', 'Authored fixture scope and pending work remain unchanged; bind the current source and task scope']
      : ['--outcome', 'Fixture implementation scope selected for captured verification', '--pending', 'Retain unfinished fixture scope', '--disposition', 'open'];
    const ack = rawRun('record-state', '--session', 'contract-test', '--task', task.id,
      '--owner', 'contract-test', '--learning', 'none', '--revision', snapshot.revision,
      '--entry-revision', snapshot.entryRevision, ...args);
    assert.equal(ack.status, 0, ack.stderr);
  };
  const run = (...args) => {
    if (args[0] === 'run-check') maintain();
    return rawRun(...args);
  };
  const init = rawRun('init', '--cwd', project, '--session', 'contract-test', '--workflow-contract', contractFile);
  assert.equal(init.status, 0, init.stderr);
  assert.equal(rawRun('set-task', '--session', 'contract-test', '--task', 'fixture-verification',
    '--title', 'Verify substantive fixture implementation', '--owner', 'contract-test', '--status', 'verified').status, 0);
  const missingAck = rawRun('check-stop', '--session', 'contract-test');
  assert.notEqual(missingAck.status, 0);
  assert.match(missingAck.stderr, /maintain authored project state/);
  maintain();
  const review = () => {
    maintain();
    // Unit-only host receipt fixture; public manual admission is tested rejected.
    const file = path.join(runs, readdirSync(runs).find(entry => entry.endsWith(".json") && !entry.startsWith("current-")));
    const ledger = JSON.parse(readFileSync(file, "utf8"));
    (ledger.workflowReviews ||= []).push(reviewReceiptFixture(root, ledger, worktreeHash(project)));
    ledger.workflowBudgetUsage ||= {};
    ledger.workflowBudgetUsage.reviews = (ledger.workflowBudgetUsage.reviews || 0) + 1;
    writeFileSync(file, JSON.stringify(ledger));
    return { status: 0 };
  };
  return { root, runs, env, run, review, ledger() {
    const file = readdirSync(runs).find((entry) => entry.endsWith(".json") && !entry.startsWith("current-"));
    return JSON.parse(readFileSync(path.join(runs, file), "utf8"));
  } };
}

test("caller-recorded passed status is visibly self-reported and cannot satisfy a mechanical gate", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const manual = f.run("record-check", "--session", "contract-test", "--name", "tests", "--command", "tests passed", "--status", "passed");
  assert.equal(manual.status, 0, manual.stderr);
  assert.equal(f.ledger().checks[0].evidenceKind, "self-reported");
  const stop = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(stop.status, 0);
  assert.match(stop.stderr, /self-reports do not satisfy/);
});

test("run-check captures real argv, exit status and output digest; a direct quick path completes", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "fix", scope: "contained", risk: "low" }));
  const check = f.run("run-check", "--session", "contract-test", "--name", "smoke", "--", process.execPath, "-e", "process.stdout.write('ok')");
  assert.equal(check.status, 0, check.stderr);
  const row = f.ledger().checks[0];
  assert.equal(row.evidenceKind, "command-run");
  assert.deepEqual(row.argv.slice(1), ["-e", "process.stdout.write('ok')"]);
  assert.equal(row.exitCode, 0);
  assert.match(row.commandDigest, /^[a-f0-9]{64}$/);
  assert.match(row.outputDigest, /^[a-f0-9]{64}$/);
  const projected = f.run("workflow-state", "--session", "contract-test");
  assert.equal(projected.status, 0, projected.stderr);
  const hookState = JSON.parse(projected.stdout);
  assert.equal(hookState.commandRunEvidence[0].evidenceKind, "command-run");
  const executeState = {
    ...hookState,
    requestedSkills: [{ value: "etrnl-dev-execute", at: row.startedAt }],
    edits: { "src/change.js": { at: row.startedAt } },
  };
  const executeGate = spawnSync(process.execPath, [executeChecker], { input: JSON.stringify(executeState), encoding: "utf8" });
  assert.equal(executeGate.status, 0, executeGate.stderr);
  assert.equal(executeGate.stdout, "", "ledger-captured receipt satisfies the contract-aware execute gate");
  const stopped = f.run("check-stop", "--session", "contract-test");
  assert.equal(stopped.status, 0, stopped.stderr);
});

test("failing command is captured as failed and does not claim completion", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const check = f.run("run-check", "--session", "contract-test", "--name", "failing", "--", process.execPath, "-e", "process.stderr.write('no'); process.exit(7)");
  assert.equal(check.status, 1);
  const row = f.ledger().checks[0];
  assert.equal(row.status, "failed");
  assert.equal(row.exitCode, 7);
  assert.match(row.stderrDigest, /^[a-f0-9]{64}$/);
  const stop = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(stop.status, 0);
  assert.match(stop.stderr, /failing:failed/);
});

test("verification budget exhaustion stops before launching another attempt", (t) => {
  const contract = resolveWorkflowContract({
    version: 1, intent: "build", scope: "contained", risk: "low",
    authorizedBudget: { maxVerificationAttempts: 1, maxRetries: 0 },
  });
  const f = fixture(t, contract);
  const first = f.run("run-check", "--session", "contract-test", "--name", "limited", "--", process.execPath, "-e", "process.exit(1)");
  assert.equal(first.status, 1);
  assert.match(first.stdout, /Captured command check limited: failed/);
  const second = f.run("run-check", "--session", "contract-test", "--name", "limited", "--", process.execPath, "-e", "process.exit(0)");
  assert.equal(second.status, 1);
  assert.match(second.stderr, /retry-budget-exhausted/);
  assert.equal(f.ledger().checks.length, 1);
});

test("contract worker reservations enforce active concurrency past the burst window and release by identity", (t) => {
  const contract = resolveWorkflowContract({
    version: 1, intent: "build", scope: "broad", risk: "low",
    authorizedBudget: { maxWorkers: 2, maxConcurrentWorkers: 1 },
  });
  const f = fixture(t, contract);
  const plan = path.join(f.root, "project", "plan.md");
  writeFileSync(plan, "# Plan\n\nRisk tier: 1\nScope triage: broad\n\n- [ ] T1 first\n- [ ] T2 second\n");
  const registry = f.run("record-spawn-registry", "--session", "contract-test", "--plan", plan);
  assert.equal(registry.status, 0, registry.stderr);
  const file = readdirSync(f.runs).find((entry) => entry.endsWith(".json") && !entry.startsWith("current-"));
  const ledgerPath = path.join(f.runs, file);
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.executeProfile = { maxConcurrentLanes: 20 };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  const first = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--task-name", "T1_writer", "--wave", "wave-1", "--json");
  assert.equal(first.status, 0, first.stderr);
  const reservationId = JSON.parse(first.stdout).reservationId;
  assert.match(reservationId, /^[0-9a-f-]{36}$/);

  const afterMinute = JSON.parse(readFileSync(ledgerPath, "utf8"));
  afterMinute.spawns[0].at = new Date(Date.now() - 120_000).toISOString();
  afterMinute.activeWorkerReservations[0].reservedAt = afterMinute.spawns[0].at;
  writeFileSync(ledgerPath, `${JSON.stringify(afterMinute, null, 2)}\n`);
  const second = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--task-name", "T2_writer", "--wave", "wave-1", "--json");
  assert.notEqual(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /concurrent-worker-budget-exhausted/);
  assert.equal(f.ledger().workflowBudgetUsage.concurrentWorkers, 1);
  const incomplete = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /active worker reservations remain/);

  assert.equal(f.run("set-task", "--session", "contract-test", "--task", "T1", "--status", "verified", "--title", "First").status, 0);
  assert.equal(f.run("record-agent", "--session", "contract-test", "--id", "worker-1", "--task", "T1", "--role", "subagent", "--mode", "read", "--status", "completed", "--reservation-id", reservationId).status, 0);
  assert.equal(f.ledger().workflowBudgetUsage.concurrentWorkers, 0);
  const next = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--task-name", "T2_writer", "--wave", "wave-1", "--json");
  assert.equal(next.status, 0, next.stderr);
  const nextReservationId = JSON.parse(next.stdout).reservationId;
  assert.ok(nextReservationId);
  assert.equal(f.run("set-task", "--session", "contract-test", "--task", "T2", "--status", "blocked", "--title", "Second").status, 0);
  const noReason = f.run("record-agent", "--session", "contract-test", "--id", "worker-2", "--task", "T2", "--role", "subagent", "--mode", "read", "--status", "cancelled", "--release-reservation", nextReservationId);
  assert.notEqual(noReason.status, 0);
  assert.match(noReason.stderr, /requires --release-reason/);
  const cancelled = f.run("record-agent", "--session", "contract-test", "--id", "worker-2", "--task", "T2", "--role", "subagent", "--mode", "read", "--status", "cancelled", "--release-reservation", nextReservationId, "--release-reason", "Host did not launch the requested worker");
  assert.equal(cancelled.status, 0, cancelled.stderr);
  assert.equal(f.ledger().workflowBudgetUsage.concurrentWorkers, 0);
});

test("contract-backed spawns require identity and bypass legacy plan registry and review-round policy", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "broad", risk: "low" }));
  const missingName = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--json");
  assert.notEqual(missingName.status, 0);
  assert.match(`${missingName.stdout}${missingName.stderr}`, /missing-task-name/);

  // No plan registry is installed. An explicit contract owns scope and budget,
  // so a valid named worker does not inherit the legacy allowlist requirement.
  const worker = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--task-name", "T1_writer", "--wave", "wave-1", "--json");
  assert.equal(worker.status, 0, worker.stderr);
  assert.ok(JSON.parse(worker.stdout).reservationId);

  // Review r99 would exceed the legacy tier cap and is not allowlisted by a
  // plan. Contract admission instead applies the explicit finite review budget.
  const reviewer = f.run("check-spawn", "--allow-record", "--session", "contract-test", "--task-name", "T1_quality_review_r99", "--wave", "wave-99", "--subagent-type", "etrnl-quality-reviewer", "--packet-mode", "read-only", "--json");
  assert.equal(reviewer.status, 0, reviewer.stderr);
  assert.ok(JSON.parse(reviewer.stdout).reservationId);
  assert.equal(f.ledger().workflowBudgetUsage.reviewWorkers, 1);
});

test("run-check timeout kills a hung command and records a failed receipt", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const timed = f.run("run-check", "--session", "contract-test", "--name", "hang", "--timeout-ms", "100", "--", process.execPath, "-e", "setTimeout(() => {}, 10000)");
  assert.equal(timed.status, 1);
  const receipt = f.ledger().checks[0];
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.timedOut, true);
  assert.equal(receipt.timeoutMs, 100);
});

test("run-check parent SIGTERM kills the command process group and records interruption", async (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const marker = path.join(f.root, "descendant-signal.txt");
  const pidFile = path.join(f.root, "descendant.pid");
  const descendantCode = [
    "const fs = require('node:fs');",
    `process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(marker)}, 'terminated'); process.exit(0); });`,
    `fs.writeFileSync(${JSON.stringify(marker)}, 'ready');`,
    `setTimeout(() => { fs.writeFileSync(${JSON.stringify(marker)}, 'survived'); process.exit(0); }, 5000);`,
  ].join("\n");
  const code = [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { stdio: 'ignore' });`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const runner = spawn(process.execPath, [ledgerCli, "run-check", "--session", "contract-test", "--name", "interrupted", "--timeout-ms", "10000", "--", process.execPath, "-e", code], {
    cwd: f.root,
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  runner.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  runner.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => runner.once("close", (codeValue, signalValue) => resolve({ codeValue, signalValue })));
  const deadline = Date.now() + 3_000;
  while (!existsSync(pidFile) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(existsSync(pidFile), `check command did not start; stdout=${stdout} stderr=${stderr}`);
  const readyDeadline = Date.now() + 3_000;
  while ((!existsSync(marker) || readFileSync(marker, "utf8") !== "ready") && Date.now() < readyDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(existsSync(marker) && readFileSync(marker, "utf8") === "ready", "descendant did not initialize its signal handler");
  runner.kill("SIGTERM");
  const result = await closed;
  assert.equal(result.codeValue, 1, `${JSON.stringify(result)} stdout=${stdout} stderr=${stderr}`);
  const receipt = f.ledger().checks.find((check) => check.name === "interrupted");
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.interruptedBy, "SIGTERM");
  const markerDeadline = Date.now() + 1_000;
  while (!existsSync(marker) && Date.now() < markerDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
  if (!existsSync(marker)) {
    const descendantPid = Number(readFileSync(pidFile, "utf8"));
    try { process.kill(descendantPid, "SIGKILL"); } catch { /* already exited */ }
  }
  assert.equal(readFileSync(marker, "utf8"), "terminated", "the command process group must receive the forwarded interrupt");
});

test("high-risk structured work without packet requirements needs one independent review", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "coupled", risk: "high" }));
  assert.equal(f.run("set-task", "--session", "contract-test", "--task", "T1", "--status", "verified", "--title", "Coupled fix").status, 0);
  assert.equal(f.run("run-check", "--session", "contract-test", "--name", "tests", "--", process.execPath, "-e", "process.exit(0)").status, 0);
  const before = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(before.status, 0);
  assert.match(before.stderr, /requires a recorded independent review/);
  assert.equal(f.review().status, 0);
  // The stop hook adds legacy flags when it sees a plan-execution prompt. An
  // explicit contract still owns workflow shape and this structured path has
  // no mandatory phases.
  const afterReview = f.run("check-stop", "--session", "contract-test", "--require-ledger", "--require-tasks", "--require-plan-phases");
  assert.equal(afterReview.status, 0, afterReview.stderr);
  writeFileSync(path.join(f.root, "project", "src-coupled.js"), "export const changed = true;\n");
  const stale = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale|current worktree/);
  assert.equal(f.run("run-check", "--session", "contract-test", "--name", "tests", "--", process.execPath, "-e", "process.exit(0)").status, 0);
  assert.equal(f.review().status, 0);
  const fresh = f.run("check-stop", "--session", "contract-test");
  assert.equal(fresh.status, 0, fresh.stderr);
});

test("latest captured gate supports red-to-green and rejects a later self-reported pass", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const red = f.run("run-check", "--session", "contract-test", "--name", "tests", "--", process.execPath, "-e", "process.exit(1)");
  assert.equal(red.status, 1);
  const green = f.run("run-check", "--session", "contract-test", "--name", "tests", "--", process.execPath, "-e", "process.exit(0)");
  assert.equal(green.status, 0, green.stderr);
  assert.equal(f.run("check-stop", "--session", "contract-test").status, 0);
  const selfReported = f.run("record-check", "--session", "contract-test", "--name", "tests", "--command", "trust me", "--status", "passed");
  assert.equal(selfReported.status, 0, selfReported.stderr);
  const afterSelfReport = f.run("check-stop", "--session", "contract-test");
  assert.equal(afterSelfReport.status, 0, afterSelfReport.stderr);
  assert.equal(f.ledger().checks.at(-1).evidenceKind, "self-reported");
});

test("a passing receipt becomes stale after edits and a fresh rerun restores completion", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" }));
  const check = () => f.run("run-check", "--session", "contract-test", "--name", "smoke", "--", process.execPath, "-e", "process.exit(0)");
  assert.equal(check().status, 0);
  writeFileSync(path.join(f.root, "project", "src-new.js"), "export const changed = true;\n");
  const stale = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /verification checks are stale/);
  assert.equal(check().status, 0);
  const fresh = f.run("check-stop", "--session", "contract-test");
  assert.equal(fresh.status, 0, fresh.stderr);
});

test("program fix requires task, plan phases, packet binding, TDD, review, and captured verification", (t) => {
  const contract = resolveWorkflowContract({ version: 1, intent: "fix", scope: "broad", risk: "high" });
  const f = fixture(t, contract);
  const plan = path.join(f.root, "project", "plan.md");
  writeFileSync(plan, "# Plan\n\n- [ ] Fix\n");
  const initFile = readdirSync(f.runs).find((entry) => entry.endsWith(".json") && !entry.startsWith("current-"));
  const ledgerBefore = JSON.parse(readFileSync(path.join(f.runs, initFile), "utf8"));
  // Reinitialize with plan metadata so the phase gate checks this plan's phase rows.
  const reinit = spawnSync(process.execPath, [ledgerCli, "init", "--cwd", ledgerBefore.cwd, "--session", "contract-test", "--workflow-contract", path.join(f.root, "project", "workflow.json"), "--plan", plan], {
    cwd: ledgerBefore.cwd, env: f.env, encoding: "utf8",
  });
  assert.equal(reinit.status, 0, reinit.stderr);
  const hash = "a".repeat(64);
  assert.equal(f.run("set-task", "--session", "contract-test", "--task", "T-program", "--status", "verified", "--title", "Program fix", "--lineage", "wave-1.T-program", "--packet-hash", hash).status, 0);
  assert.equal(f.run("set-phase", "--session", "contract-test", "--phase", "P1", "--status", "verified").status, 0);
  const beforeTdd = f.run("check-stop", "--session", "contract-test");
  assert.notEqual(beforeTdd.status, 0);
  assert.match(beforeTdd.stderr, /requires recorded red\/green TDD evidence/);
  assert.equal(f.run("record-tdd", "--session", "contract-test", "--task", "T-program", "--lineage", "wave-1.T-program", "--packet-hash", hash, "--source-files", "src/a.js", "--red-command", "node test.js", "--red-status", "failed", "--red-failure", "regression reproduced", "--green-command", "node test.js", "--green-status", "passed").status, 0);
  assert.equal(f.review().status, 0);
  assert.equal(f.run("run-check", "--session", "contract-test", "--name", "tests", "--", process.execPath, "-e", "process.exit(0)").status, 0);
  const complete = f.run("check-stop", "--session", "contract-test");
  assert.equal(complete.status, 0, complete.stderr);
});

test("companion helper-run captures checks under the selected Codex home", (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), "eternal-helper-run-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const project = path.join(temp, "project");
  mkdirSync(project);
  writeFileSync(path.join(project, "README.md"), "fixture project\n");
  initGit(project);
  const hostHome = path.join(temp, "codex-home");
  const contractFile = path.join(temp, "workflow.json");
  writeFileSync(contractFile, JSON.stringify(resolveWorkflowContract({ version: 1, intent: "build", scope: "contained", risk: "low" })));
  const companion = fileURLToPath(new URL("../scripts/companion.mjs", import.meta.url));
  const hostEnv = { ...process.env };
  // The companion honors explicit ETRNL_* overrides. Remove the doctor suite's
  // shared temp dirs so this fixture proves Codex defaults resolve under the
  // selected host home.
  delete hostEnv.ETRNL_STATE_DIR;
  delete hostEnv.ETRNL_RUNS_DIR;
  delete hostEnv.ETRNL_ARTIFACTS_DIR;
  delete hostEnv.ETRNL_ARTIFACT_DIR;
  const run = (...argv) => spawnSync(process.execPath, [companion, "run", "--host", "codex", "--home", hostHome, "scripts/execution-ledger.mjs", "--", ...argv], {
    cwd: project, env: hostEnv, encoding: "utf8",
  });
  const init = spawnSync(process.execPath, [companion, "run", "--host", "codex", "--home", hostHome, "scripts/execution-ledger.mjs", "--", "init", "--cwd", project, "--session", "helper-run", "--workflow-contract", "-"], {
    cwd: project, env: hostEnv, input: readFileSync(contractFile, "utf8"), encoding: "utf8",
  });
  assert.equal(init.status, 0, init.stderr);
  assert.equal(run('set-task', '--session', 'helper-run', '--task', 'helper-verification',
    '--title', 'Verify substantive helper fixture', '--owner', 'helper-run', '--status', 'verified').status, 0);
  const missingAck = run('check-stop', '--session', 'helper-run');
  assert.notEqual(missingAck.status, 0);
  assert.match(missingAck.stderr, /maintain authored project state/);
  const read = run('read-state', '--session', 'helper-run', '--task', 'helper-verification');
  assert.equal(read.status, 0, read.stderr);
  const snapshot = JSON.parse(read.stdout);
  const ack = run('record-state', '--session', 'helper-run', '--task', 'helper-verification',
    '--owner', 'helper-run', '--revision', snapshot.revision, '--entry-revision', snapshot.entryRevision,
    '--learning', 'none', '--outcome', 'Substantive helper fixture ready for captured verification',
    '--pending', 'No live host behavior claimed', '--disposition', 'resolved');
  assert.equal(ack.status, 0, ack.stderr);
  const check = run("run-check", "--session", "helper-run", "--name", "helper-smoke", "--", process.execPath, "-e", "process.exit(0)");
  assert.equal(check.status, 0, check.stderr);
  const runs = path.join(hostHome, "etrnl/runs");
  const ledgerFile = readdirSync(runs).find((entry) => entry.endsWith(".json") && !entry.startsWith("current-"));
  const ledger = JSON.parse(readFileSync(path.join(runs, ledgerFile), "utf8"));
  assert.equal(ledger.workflowContract.mode, "direct");
  assert.equal(ledger.checks[0].evidenceKind, "command-run");
  assert.equal(run("check-stop", "--session", "helper-run").status, 0);
});


test("review recording rejects self-attestation without spending a review attempt", (t) => {
  const f = fixture(t, resolveWorkflowContract({ version: 1, intent: "build", scope: "coupled", risk: "high" }));
  const rejected = f.run("record-workflow-review", "--session", "contract-test", "--reviewer", "independent-reviewer");
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /verified review imports are not accepted/);
  assert.equal(f.ledger().workflowBudgetUsage?.reviews ?? 0, 0);
  assert.equal(f.run("set-task", "--task", "review-fixture", "--title", "Accepted review fixture", "--status", "verified").status, 0);
  assert.equal(f.review().status, 0);
  assert.equal(JSON.parse(f.run("workflow-state", "--session", "contract-test").stdout).contractReviewEvidence[0].independent, true);
  writeFileSync(path.join(f.root, "review-output.json"), "tampered");
  assert.equal(JSON.parse(f.run("workflow-state", "--session", "contract-test").stdout).contractReviewEvidence[0].independent, false);
});
