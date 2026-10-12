import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(repo, "scripts/companion-evaluate.mjs");

async function runHarness(mode) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-eval-harness-"));
  const project = path.join(temp, "etrnl-eval-project");
  fs.mkdirSync(project);
  const pidFile = path.join(temp, "grandchild.pid");
  const stub = path.join(temp, "codex-stub.mjs");
  fs.writeFileSync(stub, `#!/usr/bin/env node\nimport { spawn } from 'node:child_process';\nimport fs from 'node:fs';\nif (process.argv.includes('--version')) { console.log('codex-cli test-stub'); process.exit(0); }\nconst child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: ['ignore', 'inherit', 'inherit'] });\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));\n${mode === "success-orphan" ? "setTimeout(() => process.exit(0), 300);" : ""}\n`);
  fs.chmodSync(stub, 0o755);
  const output = path.join(repo, ".audit/companion-evaluation/runs", `test-${process.pid}-${mode}-${Date.now()}`);
  const args = [runner, "--condition", "native", "--cwd", project, "--prompt-file", path.join(repo, "tests/companion-evaluation/prompts/readonly-password-reset.md"), "--name", `test-${mode}`, "--output", output];
  if (mode === "timeout") args.push("--seconds", "1");
  const parent = spawn(process.execPath, args, { env: { ...process.env, CODEX_BIN: stub }, stdio: "ignore" });
  const parentDone = new Promise(resolve => parent.once("close", (code, signal) => resolve({ code, signal })));
  let descendantPid = null;

  try {
    for (let i = 0; i < 100 && !fs.existsSync(pidFile); i += 1) await delay(50);
    assert.ok(fs.existsSync(pidFile), "stub CLI should start a descendant");
    descendantPid = Number(fs.readFileSync(pidFile, "utf8"));
    if (mode === "interrupt") parent.kill("SIGTERM");
    const exit = await parentDone;
    assert.equal(exit.code, mode === "timeout" ? 124 : mode === "success-orphan" ? 0 : 143);
    const metadata = JSON.parse(fs.readFileSync(path.join(output, "metadata.json"), "utf8"));
    assert.equal(metadata.timedOut, mode === "timeout");
    assert.equal(metadata.interrupted, mode === "interrupt" ? "SIGTERM" : null);

    assert.ok(metadata.resources.samples >= 0);
    if (mode !== "interrupt") {
      assert.ok(metadata.resources.samples > 0);
      assert.ok(metadata.resources.peakGroupProcesses >= 1);
      assert.ok(metadata.resources.peakGroupRssKiB > 0);
    } // An immediate interrupt can legitimately precede the first 100 ms sample.
    assert.ok(metadata.elapsedMs > 0);
    let state = "";
    for (let i = 0; i < 20; i += 1) {
      const ps = spawn("ps", ["-o", "stat=", "-p", String(descendantPid)], { encoding: "utf8" });
      state = await new Promise(resolve => {
        let text = "";
        ps.stdout.on("data", chunk => { text += chunk; });
        ps.once("close", () => resolve(text.trim()));
      });
      if (!state || state.startsWith("Z")) break;
      await delay(50);
    }
    assert.ok(!state || state.startsWith("Z"), `descendant should be gone or zombie after process-group cleanup, got ${state}`);
  } finally {
    // Assertions can fail before normal harness termination; do not leak the
    // evaluator or its deliberately stubborn fixture child on that path.
    if (parent.exitCode === null && parent.signalCode === null) {
      parent.kill("SIGTERM");
      const forced = setTimeout(() => parent.kill("SIGKILL"), 4500);
      try { await parentDone; } finally { clearTimeout(forced); }
    }
    if (!descendantPid && fs.existsSync(pidFile)) descendantPid = Number(fs.readFileSync(pidFile, "utf8"));
    if (Number.isInteger(descendantPid) && descendantPid > 0) {
      try { process.kill(descendantPid, "SIGKILL"); } catch { /* already cleaned */ }
    }
    fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

test("Codex runner timeout kills descendants and records an incomplete run", { timeout: 10000 }, async () => runHarness("timeout"));
test("Codex runner parent termination kills descendants and records interruption", { timeout: 10000 }, async () => runHarness("interrupt"));

test("Codex runner cleans descendants after successful CLI exit", { timeout: 10000 }, async () => runHarness("success-orphan"));
