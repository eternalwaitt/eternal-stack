#!/usr/bin/env node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argValue } from "./lib/cli-args.mjs";

const args = process.argv.slice(2);

const root = path.resolve(argValue(args, "--root", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const keepTemp = args.includes("--keep-temp");
const tmp = mkdtempSync(path.join(tmpdir(), "etrnl-skill-smoke-"));
const runsDir = path.join(tmp, "runs");
const artifactsDir = path.join(tmp, "artifacts");
const claudeHome = path.join(tmp, "claude-home");
const defaultRunTimeoutMs = (() => {
  const parsed = Number.parseInt(String(process.env.SMOKE_RUN_TIMEOUT_MS || "30000"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30_000;
  return parsed;
})();
mkdirSync(runsDir, { recursive: true, mode: 0o700 });
mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
mkdirSync(claudeHome, { recursive: true, mode: 0o700 });

const checks = [];
const baseEnv = {
  ...process.env,
  CLAUDE_CONTROL_PLANE_RUNS_DIR: runsDir,
  CLAUDE_CONTROL_PLANE_ARTIFACTS_DIR: artifactsDir,
  CLAUDE_HOME: claudeHome,
  CLAUDE_SESSION_ID: "skill-smoke",
};

function script(name) {
  return path.join(root, "scripts", name);
}

function run(command, commandArgs = [], options = {}) {
  const timeoutMs = options.timeout ?? defaultRunTimeoutMs;
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    input: options.input,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...baseEnv, ...(options.env || {}) },
  });
  const timedOut = result.error?.code === "ETIMEDOUT" || (result.status === null && result.signal != null);
  if (!timedOut) return result;
  const rendered = [command, ...commandArgs].join(" ");
  const detail = result.error?.message || `terminated by ${result.signal || "unknown signal"}`;
  return {
    ...result,
    timedOut: true,
    timeoutDetail: `command timed out after ${timeoutMs}ms: ${rendered} (${detail})`,
  };
}

function ok(name) {
  checks.push({ name, ok: true });
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail: String(detail || "").trim() });
}

function expectPass(name, command, commandArgs = [], options = {}) {
  const result = run(command, commandArgs, options);
  if (result.timedOut) {
    fail(name, result.timeoutDetail);
    return "";
  }
  if (result.status === 0) {
    ok(name);
    return result.stdout.trim();
  }
  fail(name, result.stderr || result.stdout || `exit ${result.status}`);
  return "";
}

function expectFail(name, command, commandArgs = [], options = {}) {
  const { expectedText, ...runOptions } = options;
  const result = run(command, commandArgs, runOptions);
  if (result.timedOut) {
    fail(name, result.timeoutDetail);
    return "";
  }
  const output = `${result.stderr || ""}${result.stdout || ""}`;
  if (result.status !== 0 && (!expectedText || output.includes(expectedText))) {
    ok(name);
    return output.trim();
  }
  fail(
    name,
    `expected failure containing ${expectedText === undefined ? "<none>" : JSON.stringify(expectedText)}, exit ${result.status}; output: ${output || "<no output>"}`,
  );
  return output.trim();
}

function detectStaleState(contextRestore) {
  // context-state restore can emit JSON or plain text depending on caller surface.
  // We parse JSON first, then fall back to text-pattern detection for compatibility.
  let parsedStale = null;
  try {
    const parsed = JSON.parse(contextRestore);
    if (parsed && typeof parsed === "object") {
      if ("isStale" in parsed) parsedStale = parsed.isStale;
      else if ("stale" in parsed) parsedStale = parsed.stale;
    }
  } catch {
    const match = contextRestore.match(/["']?(?:isstale|stale)["']?\s*(?::|=|\s)\s*["']?(true|false|1|0)["']?/i);
    if (!match) return { hasStaleKey: false, hasStaleValue: false, rawValue: null };
    const normalized = match[1].toLowerCase();
    return { hasStaleKey: true, hasStaleValue: true, rawValue: normalized === "true" || normalized === "1" };
  }
  if (parsedStale === null) return { hasStaleKey: false, hasStaleValue: false, rawValue: null };
  if ([true, 1, "true", "1"].includes(parsedStale)) return { hasStaleKey: true, hasStaleValue: true, rawValue: true };
  if ([false, 0, "false", "0"].includes(parsedStale)) return { hasStaleKey: true, hasStaleValue: true, rawValue: false };
  return { hasStaleKey: true, hasStaleValue: false, rawValue: parsedStale };
}

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, content, { mode: 0o600 });
}

const goodPlan = path.join(root, "hooks/fixtures/plans/good-plan.md");
const badPlan = path.join(tmp, "bad-plan.md");
write(badPlan, "# Bad Plan\n\nStatus: Final\n\nGoal: too thin\n");

expectFail("plan readiness rejects thin plan", "node", [script("plan-readiness-check.mjs"), badPlan], { expectedText: "missing Evidence" });
expectPass("plan readiness accepts fixture plan", "node", [script("plan-readiness-check.mjs"), goodPlan]);

const ledgerPath = expectPass("execution ledger init creates active run", "node", [
  script("execution-ledger.mjs"),
  "init",
  "--plan",
  goodPlan,
  "--session",
  "skill-smoke",
]);
expectPass("execution ledger records in-progress task", "node", [
  script("execution-ledger.mjs"),
  "set-task",
  "--task",
  "T1",
  "--title",
  "Smoke task",
  "--status",
  "in_progress",
  "--session",
  "skill-smoke",
]);
expectPass("execution ledger records required browser artifact", "node", [
  script("execution-ledger.mjs"),
  "require-artifact",
  "--type",
  "browser-qa-report",
  "--session",
  "skill-smoke",
]);
expectFail(
  "execution ledger check-stop blocks unfinished work",
  "node",
  [script("execution-ledger.mjs"), "check-stop", "--session", "skill-smoke"],
  { expectedText: "unfinished tasks" },
);
expectPass("execution ledger marks task verified", "node", [
  script("execution-ledger.mjs"),
  "set-task",
  "--task",
  "T1",
  "--status",
  "verified",
  "--session",
  "skill-smoke",
]);
expectPass("execution ledger records verification check", "node", [
  script("execution-ledger.mjs"),
  "record-check",
  "--name",
  "smoke",
  "--command",
  "skill-behavior-smoke",
  "--status",
  "passed",
  "--session",
  "skill-smoke",
]);

const qaReport = expectPass("browser QA report create supports skill command flags", "node", [
  script("browser-qa-report.mjs"),
  "create",
  "--routes",
  "/,/campaigns",
  "--viewports",
  "desktop,mobile",
  "--status",
  "complete",
  "--path",
  path.join(tmp, "browser-qa.json"),
]);
expectPass("browser QA report validates", "node", [script("browser-qa-report.mjs"), "validate", qaReport]);
expectPass("execution ledger records browser artifact", "node", [
  script("execution-ledger.mjs"),
  "record-artifact",
  "--type",
  "browser-qa-report",
  "--path",
  qaReport,
  "--session",
  "skill-smoke",
]);
expectPass("execution ledger check-stop accepts complete run", "node", [
  script("execution-ledger.mjs"),
  "check-stop",
  "--session",
  "skill-smoke",
]);

const reviewPath = path.join(tmp, "review-log.jsonl");
expectPass("review log add records finding", "node", [
  script("review-log.mjs"),
  "add",
  "--path",
  reviewPath,
  "--finding",
  "Smoke review finding",
  "--severity",
  "P2",
  "--status",
  "open",
]);
expectPass("review log validates", "node", [script("review-log.mjs"), "validate", "--path", reviewPath]);

const contextPath = expectPass("context save creates resumable context", "node", [
  script("context-state.mjs"),
  "save",
  "--id",
  "skill-smoke-context",
  "--title",
  "Skill smoke",
  "--decision",
  "contracts tested",
  "--remaining",
  "none",
  "--verification",
  "skill-behavior-smoke",
]);
expectPass("context validate command works", "node", [script("context-state.mjs"), "validate", contextPath]);
const contextRestore = expectPass("context restore command works", "node", [script("context-state.mjs"), "restore", contextPath]);
const { hasStaleKey, hasStaleValue, rawValue } = detectStaleState(contextRestore);
if (hasStaleKey && hasStaleValue && rawValue === false) ok("context restore reports fresh state");
else fail("context restore reports fresh state", `hasStaleKey=${hasStaleKey} hasStaleValue=${hasStaleValue} rawValue=${rawValue}`);

const validTaskPacket = {
  tool_input: {
    packet: {
      mode: "write",
      goal: "test",
      contextSummary: "smoke",
      cwd: "repo",
      scope: "scripts only",
      readSet: ["scripts"],
      writeScope: "scripts/*",
      forbiddenPaths: ["package.json"],
      expectedOutput: "report",
      verificationCommand: "test",
      modelTier: "sonnet",
      timeoutSec: 60,
      retryPolicy: "none",
      noRevert: true,
      webSearchGuidance: "no internet",
    },
  },
};
expectPass("task packet checker accepts complete packet", "node", [script("agent-task-packet-check.mjs")], {
  input: JSON.stringify(validTaskPacket),
});
expectFail("task packet checker rejects incomplete packet", "node", [script("agent-task-packet-check.mjs")], {
  expectedText: "missing",
  input: JSON.stringify({ tool_input: { packet: { mode: "read-only", goal: "only" } } }),
});

const waveInput = JSON.stringify({
  useWorktrees: true,
  submodules: ["vendor/lib"],
  plans: [
    { id: "T1", wave: 1, files: ["src/a.ts"] },
    { id: "T2", wave: 1, files: ["src/a.ts"] },
    { id: "T3", wave: 2, files: ["vendor/lib/x.ts"] },
  ],
});
const waveOutput = expectPass("execution wave checker runs", "node", [script("execution-wave-check.mjs")], { input: waveInput });
if (waveOutput.includes('"parallelSafe": false') && waveOutput.includes('"worktreeEligible": false')) ok("execution wave checker detects overlaps and submodules");
else fail("execution wave checker detects overlaps and submodules", waveOutput);

const inventoryRepo = path.join(tmp, "inventory-repo");
mkdirSync(inventoryRepo, { recursive: true, mode: 0o700 });
write(path.join(inventoryRepo, "src/index.ts"), "export const value = 1;\n");
expectPass("inventory fixture git init", "git", ["init", "-q", "-b", "main"], { cwd: inventoryRepo });
expectPass("inventory fixture git config email", "git", ["config", "user.email", "test@example.com"], { cwd: inventoryRepo });
expectPass("inventory fixture git config name", "git", ["config", "user.name", "Test User"], { cwd: inventoryRepo });
expectPass("inventory fixture git add", "git", ["add", "src/index.ts"], { cwd: inventoryRepo });
const inventory = expectPass("code health inventory runs on git repo", "node", [
  script("code-health-inventory.mjs"),
  `--root=${inventoryRepo}`,
  "--json",
  "--quiet",
]);
try {
  if (JSON.parse(inventory).totalFiles === 1) ok("code health inventory counts tracked file");
  else fail("code health inventory counts tracked file", inventory);
} catch (error) {
  const detail = error instanceof Error
    ? (error.stack || error.message)
    : String(error ?? "<unrepresentable error>");
  fail("code health inventory counts tracked file", `invalid JSON output\nraw=${inventory}\nerror=${detail}`);
}

const budgetRoot = path.join(tmp, "budget-root");
write(path.join(budgetRoot, "skills/etrnl-small/SKILL.md"), "---\nname: etrnl-small\n---\n# Small\n");
expectPass("prompt budget accepts small owned skill", "node", [script("prompt-budget-check.mjs"), budgetRoot, "--owned-only"]);

expectPass("skill contract check passes source", "node", [script("skill-contract-check.mjs"), "--root", root]);

if (!ledgerPath) {
  fail("execution ledger persisted browser artifact", "missing ledger path from init");
} else if (!existsSync(ledgerPath)) {
  fail("execution ledger persisted browser artifact", `ledger file missing: ${ledgerPath}`);
} else {
  try {
    if (!readFileSync(ledgerPath, "utf8").includes("browser-qa-report")) {
      fail("execution ledger persisted browser artifact", `ledger missing browser-qa-report artifact: ${ledgerPath}`);
    } else {
      ok("execution ledger persisted browser artifact");
    }
  } catch (error) {
    fail(
      "execution ledger persisted browser artifact",
      error instanceof Error ? error.message : String(error ?? "unknown read error"),
    );
  }
}

const failures = checks.filter((check) => !check.ok);
for (const [index, check] of checks.entries()) {
  if (check.ok) console.log(`ok ${String(index + 1).padStart(3, "0")} - ${check.name}`);
  else console.error(`not ok ${String(index + 1).padStart(3, "0")} - ${check.name}: ${check.detail}`);
}

if (!keepTemp) {
  rmSync(tmp, { recursive: true, force: true });
} else {
  console.log(`temp=${tmp}`);
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} skill smoke check(s) failed`);
  process.exit(1);
}

console.log(`PASSED: ${checks.length} skill smoke checks`);
