import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const script = path.join(repoRoot, "scripts", "codex-rollout-baseline.mjs");
const fixtureDir = path.join(repoRoot, "tests", "fixtures", "codex-rollout");
const parentRollout = path.join(fixtureDir, "parent-thread-0001-rollout.jsonl");

const run = (scriptArgs, env = {}) =>
  spawnSync("node", [script, ...scriptArgs], { encoding: "utf8", env: { ...process.env, ...env } });

const aggregate = (rollout = parentRollout) => {
  const result = run(["--rollout", rollout, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("aggregate totals parent, subagents, and combined token usage", () => {
  const report = aggregate();
  assert.equal(report.parent.tokens.inputTokens, 300);
  assert.equal(report.parent.tokens.cachedInputTokens, 30);
  assert.equal(report.parent.tokens.cacheWriteInputTokens, 5);
  assert.equal(report.parent.tokens.outputTokens, 130);
  assert.equal(report.parent.tokens.reasoningOutputTokens, 15);
  assert.equal(report.parent.tokens.totalTokens, 480);

  assert.equal(report.subagents.count, 2);
  assert.equal(report.subagents.tokens.inputTokens, 3000);
  assert.equal(report.subagents.tokens.cachedInputTokens, 300);
  assert.equal(report.subagents.tokens.cacheWriteInputTokens, 10);
  assert.equal(report.subagents.tokens.outputTokens, 1300);
  assert.equal(report.subagents.tokens.reasoningOutputTokens, 130);
  assert.equal(report.subagents.tokens.totalTokens, 4740);

  assert.equal(report.combined.tokens.inputTokens, 3300);
  assert.equal(report.combined.tokens.totalTokens, 5220);
});

test("duplicate token_count events are deduplicated before summing", () => {
  const report = aggregate();
  assert.equal(report.parent.tokens.inputTokens, 300);
  assert.notEqual(report.parent.tokens.inputTokens, 400);
});

test("subagent share highlights subagent token dominance", () => {
  const report = aggregate();
  assert.equal(report.subagentSharePct.inputTokens, 90.91);
  assert.equal(report.subagentSharePct.totalTokens, 90.8);
});

test("spawn_agent explicit-model and inherited-model split is reported", () => {
  const report = aggregate();
  assert.equal(report.parent.spawnAgentCount, 3);
  assert.equal(report.parent.spawnModelSplit.explicit, 1);
  assert.equal(report.parent.spawnModelSplit.inherited, 2);
});

test("turn model distribution is captured for parent and subagents", () => {
  const report = aggregate();
  assert.deepEqual(report.parent.turnModels, { "gpt-5.6-sol": 2, "claude-sonnet-5": 1 });
  assert.deepEqual(report.subagents.turnModels, { "gpt-5.6-sol": 1, "gpt-5.6-terra": 1 });
});

test("wall-clock duration spans first and last timestamps across rollouts", () => {
  const report = aggregate();
  assert.equal(report.durationMs, 330_000);
});

test("compaction count and subagent file discovery work on the fixture", () => {
  const report = aggregate();
  assert.equal(report.combined.compactionCount, 1);
  assert.equal(report.subagents.files.length, 2);
  assert.ok(report.subagents.files.every((file) => file.includes("sub-thread-")));
});

test("malformed lines are skipped without failing aggregation", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-rollout-"));
  const file = path.join(dir, "broken-rollout.jsonl");
  writeFileSync(file, [
    '{"type":"turn_context","timestamp":"2026-01-01T10:00:00.000Z","payload":{"model":"gpt-5.6-sol"}}',
    "not-json",
    '{"type":"event_msg","timestamp":"2026-01-01T10:01:00.000Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0,"total_tokens":15}}}}',
    '{"type":"response_item","payload":{"type":"function_call","name":"spawn_agent","arguments":"ENCRYPTED"}}',
  ].join("\n"));
  const report = aggregate(file);
  assert.equal(report.parent.tokens.inputTokens, 10);
  assert.equal(report.parent.spawnAgentCount, 1);
  assert.equal(report.parent.spawnModelSplit.inherited, 1);
});

test("baseline and trend round-trip against captured metrics", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-baseline-"));
  const before = path.join(dir, "before.json");
  const write = run([
    "baseline",
    "--rollout",
    parentRollout,
    "--path",
    before,
    "--id",
    "codex-before",
    "--target",
    "fixture-run",
  ], { ETRNL_ARTIFACTS_DIR: dir });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(run(["validate-baseline", before]).status, 0);

  const baseline = JSON.parse(readFileSync(before, "utf8"));
  assert.equal(baseline.targetLabel, "fixture-run");
  assert.equal(baseline.metrics.combined.tokens.inputTokens, 3300);

  const improved = {
    ...baseline,
    baselineId: "codex-after",
    metrics: {
      ...baseline.metrics,
      combined: {
        ...baseline.metrics.combined,
        tokens: {
          ...baseline.metrics.combined.tokens,
          inputTokens: 2500,
          totalTokens: 4000,
        },
      },
      subagentSharePct: {
        inputTokens: 80,
        outputTokens: 75,
        totalTokens: 78,
      },
    },
  };
  const after = path.join(dir, "after.json");
  writeFileSync(after, JSON.stringify(improved));

  const trend = run(["trend", "--before", before, "--after", after]);
  assert.equal(trend.status, 0, trend.stderr);
  const payload = JSON.parse(trend.stdout);
  assert.equal(payload.tokenDelta.inputTokens.delta, -800);
  assert.equal(payload.subagentShareDelta.inputTokens.delta, -10.91);
});

test("validate-baseline rejects an invalid codex baseline artifact", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-baseline-"));
  const file = path.join(dir, "baseline.json");
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    baselineId: "codex",
    targetLabel: "app",
  }));
  const result = run(["validate-baseline", file]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /metrics is required/);
});
