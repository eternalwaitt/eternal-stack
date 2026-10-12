import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { worktreeHash } from "../scripts/lib/etrnl-state-core.mjs";

test("worktree hash changes when untracked source content changes and does not follow symlinks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-untracked-hash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "user.name",
    GIT_CONFIG_VALUE_0: "ETRNL Test",
    GIT_CONFIG_KEY_1: "user.email",
    GIT_CONFIG_VALUE_1: "test@example.invalid",
  };
  for (const args of [["init", "-q"], ["commit", "--allow-empty", "-qm", "fixture"]]) {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  const baseline = worktreeHash(root);
  assert.match(baseline, /^[a-f0-9]{64}$/);
  const source = path.join(root, "new-source.mjs");
  fs.writeFileSync(source, "export const version = 1;\n");
  const first = worktreeHash(root);
  assert.notEqual(first, baseline, "new file content participates in receipt identity");
  fs.writeFileSync(source, "export const version = 2;\n");
  const second = worktreeHash(root);
  assert.notEqual(second, first, "editing an untracked file invalidates earlier receipts");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "etrnl-link-target-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const targetA = path.join(outside, "target-a");
  const targetB = path.join(outside, "target-b");
  fs.writeFileSync(targetA, "secret A");
  fs.writeFileSync(targetB, "secret B");
  fs.symlinkSync(targetA, path.join(root, "external-link"));
  const linkA = worktreeHash(root);
  fs.unlinkSync(path.join(root, "external-link"));
  fs.symlinkSync(targetB, path.join(root, "external-link"));
  const linkB = worktreeHash(root);
  assert.notEqual(linkB, linkA, "symlink target string participates without following its target");
});
