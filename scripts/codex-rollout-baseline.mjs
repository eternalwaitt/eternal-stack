#!/usr/bin/env node
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { argValue } from "./lib/cli-args.mjs";
import { SOL_ESCALATION_MODEL } from "./lib/codex-model-routing.mjs";
import { nowIso } from "./lib/evidence-trace.mjs";

const args = process.argv.slice(2);
const command = args[0];
const jsonOutput = args.includes("--json");

function usage() {
  console.error([
    "usage: codex-rollout-baseline.mjs [--rollout <file>] [--json]",
    "       codex-rollout-baseline.mjs baseline --rollout <file> [--path <file>] [--id <id>] [--target <label>]",
    "       codex-rollout-baseline.mjs validate-baseline <file>",
    "       codex-rollout-baseline.mjs trend --before <file> --after <file>",
  ].join("\n"));
  process.exit(2);
}

function baselinesDir() {
  return path.join(
    process.env.ETRNL_ARTIFACTS_DIR
      || path.join(process.env.CLAUDE_HOME || path.join(homedir(), ".claude"), "etrnl", "artifacts"),
    "codex-baselines",
  );
}

function emptyTokens() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function emptyStats() {
  return {
    tokens: emptyTokens(),
    compactionCount: 0,
    spawnAgentCount: 0,
    spawnModelSplit: { explicit: 0, inherited: 0 },
    turnModels: {},
    firstTimestamp: null,
    lastTimestamp: null,
    subagentThreadIds: new Set(),
  };
}

function addTokens(target, source) {
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.cacheWriteInputTokens += source.cacheWriteInputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningOutputTokens += source.reasoningOutputTokens;
  target.totalTokens += source.totalTokens;
}

function usageFingerprint(usage) {
  if (!usage || typeof usage !== "object") return null;
  return JSON.stringify([
    usage.input_tokens ?? 0,
    usage.cached_input_tokens ?? 0,
    usage.cache_write_input_tokens ?? 0,
    usage.output_tokens ?? 0,
    usage.reasoning_output_tokens ?? 0,
    usage.total_tokens ?? 0,
  ]);
}

function tokensFromUsage(usage) {
  const input = Number(usage?.input_tokens) || 0;
  const cached = Number(usage?.cached_input_tokens) || 0;
  const cacheWrite = Number(usage?.cache_write_input_tokens) || 0;
  const output = Number(usage?.output_tokens) || 0;
  const reasoning = Number(usage?.reasoning_output_tokens) || 0;
  const total = Number(usage?.total_tokens) || input + cached + cacheWrite + output + reasoning;
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    cacheWriteInputTokens: cacheWrite,
    outputTokens: output,
    reasoningOutputTokens: reasoning,
    totalTokens: total,
  };
}

function recordTimestamp(stats, value) {
  if (!value) return;
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return;
  if (stats.firstTimestamp === null || parsed < stats.firstTimestamp) stats.firstTimestamp = parsed;
  if (stats.lastTimestamp === null || parsed > stats.lastTimestamp) stats.lastTimestamp = parsed;
}

function extractTimestamp(record) {
  if (!record || typeof record !== "object") return null;
  if (record.timestamp) return record.timestamp;
  if (record.created_at) return record.created_at;
  if (record.ts) return record.ts;
  if (record.payload?.timestamp) return record.payload.timestamp;
  return null;
}

function incrementTurnModel(stats, model) {
  const key = String(model || "unknown").trim() || "unknown";
  stats.turnModels[key] = (stats.turnModels[key] || 0) + 1;
}

function parseSpawnArguments(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const start = raw.indexOf("{");
  if (start === -1) return null;
  const end = raw.lastIndexOf("}");
  if (end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function processRecord(stats, record, state) {
  recordTimestamp(stats, extractTimestamp(record));
  if (record.type === "turn_context") {
    incrementTurnModel(stats, record.payload?.model);
    return;
  }
  if (record.type === "compacted") {
    stats.compactionCount += 1;
    return;
  }
  if (record.type === "event_msg" && record.payload?.type === "token_count") {
    const usage = record.payload?.info?.last_token_usage;
    const fingerprint = usageFingerprint(usage);
    if (!fingerprint || fingerprint === state.lastUsageFingerprint) return;
    state.lastUsageFingerprint = fingerprint;
    addTokens(stats.tokens, tokensFromUsage(usage));
    return;
  }
  if (record.type === "event_msg" && record.payload?.type === "sub_agent_activity") {
    const threadId = String(record.payload?.agent_thread_id || "").trim();
    if (threadId) stats.subagentThreadIds.add(threadId);
    return;
  }
  if (record.type === "response_item" && record.payload?.type === "function_call" && record.payload?.name === "spawn_agent") {
    stats.spawnAgentCount += 1;
    const parsed = parseSpawnArguments(record.payload?.arguments);
    if (parsed?.model) stats.spawnModelSplit.explicit += 1;
    else stats.spawnModelSplit.inherited += 1;
  }
}

async function parseRolloutFile(file) {
  const stats = emptyStats();
  const state = { lastUsageFingerprint: null };
  const stream = createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      processRecord(stats, JSON.parse(trimmed), state);
    } catch {
      // skip malformed or partially encrypted lines
    }
  }
  return stats;
}

function subagentRolloutResolver(parentFile) {
  const dir = path.dirname(parentFile);
  const parentBase = path.basename(parentFile);
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    entries = [];
  }
  const candidates = entries.filter((name) => name.endsWith(".jsonl") && name !== parentBase);
  return (threadId) => {
    const name = candidates.find((candidate) => candidate.includes(threadId));
    return name ? path.join(dir, name) : "";
  };
}

// A subagent can spawn its own child agents — the task-packet contract models
// that case as `nativeChildAgents: "modeled"` — so a single-level scan drops a
// whole branch of the spawn tree out of `combined` and `subagentSharePct`.
// Discovery walks breadth-first, tracking both thread ids and resolved file
// paths: two ids can name the same rollout, and a cycle in the recorded ids
// must not loop forever.
// Every discovered id lands in exactly one of the two returned id lists, so a
// consumer can check `threadIds.length === count === files.length` and still see
// which ids the report does not account for. `threadIds` holds the ids that
// contributed a parsed rollout; `unresolvedThreadIds` holds the rest — an id with
// no rollout file on disk (a subagent whose log was not captured) or one whose
// rollout was already counted under another id.
async function collectSubagentRollouts(parentFile, parentStats) {
  const resolveThreadFile = subagentRolloutResolver(parentFile);
  const visitedThreads = new Set();
  const visitedFiles = new Set([path.resolve(parentFile)]);
  const files = [];
  const statsList = [];
  const threadIds = [];
  const unresolvedThreadIds = [];
  const queue = [...parentStats.subagentThreadIds];
  while (queue.length > 0) {
    const threadId = String(queue.shift() || "").trim();
    if (!threadId || visitedThreads.has(threadId)) continue;
    visitedThreads.add(threadId);
    const file = resolveThreadFile(threadId);
    if (!file) {
      unresolvedThreadIds.push(threadId);
      continue;
    }
    const resolved = path.resolve(file);
    if (visitedFiles.has(resolved)) {
      unresolvedThreadIds.push(threadId);
      continue;
    }
    visitedFiles.add(resolved);
    const stats = await parseRolloutFile(file);
    files.push(file);
    statsList.push(stats);
    threadIds.push(threadId);
    for (const nested of stats.subagentThreadIds) queue.push(nested);
  }
  return { files, statsList, threadIds, unresolvedThreadIds };
}

function mergeTurnModels(target, source) {
  for (const [model, count] of Object.entries(source)) {
    target[model] = (target[model] || 0) + count;
  }
}

function statsToSection(stats) {
  return {
    tokens: { ...stats.tokens },
    compactionCount: stats.compactionCount,
    spawnAgentCount: stats.spawnAgentCount,
    spawnModelSplit: { ...stats.spawnModelSplit },
    turnModels: { ...stats.turnModels },
    firstTimestamp: stats.firstTimestamp,
    lastTimestamp: stats.lastTimestamp,
  };
}

function sharePct(part, whole) {
  if (!whole) return whole === 0 && part === 0 ? 0 : null;
  return Number(((part / whole) * 100).toFixed(2));
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "unknown");
  return number.toLocaleString("en-US");
}

function formatPct(value) {
  if (value === null || value === undefined) return "unknown";
  return `${value}%`;
}

function formatTurnModelDistribution(turnModels) {
  return Object.entries(turnModels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([model, count]) => `${model}=${formatCount(count)}`)
    .join(", ");
}

function turnModelTotal(turnModels) {
  return Object.values(turnModels).reduce((sum, count) => sum + count, 0);
}

function subagentCompactionCount(report) {
  return report.combined.compactionCount - report.parent.compactionCount;
}

function printAggregateReport(report) {
  const spawnTotal = report.parent.spawnModelSplit.explicit + report.parent.spawnModelSplit.inherited;
  const explicitSpawnPct = sharePct(report.parent.spawnModelSplit.explicit, spawnTotal);
  const subagentTurnTotal = turnModelTotal(report.subagents.turnModels);
  const subagentSolTurns = report.subagents.turnModels[SOL_ESCALATION_MODEL] || 0;
  const subagentSolSharePct = sharePct(subagentSolTurns, subagentTurnTotal);
  const subagentCachedInputSharePct = sharePct(
    report.subagents.tokens.cachedInputTokens,
    report.subagents.tokens.inputTokens,
  );

  console.log(`rollout: ${report.rolloutPath}`);
  console.log(`durationMs: ${report.durationMs ?? "unknown"}`);
  console.log(`parent input/output/total: ${formatCount(report.parent.tokens.inputTokens)}/${formatCount(report.parent.tokens.outputTokens)}/${formatCount(report.parent.tokens.totalTokens)}`);
  console.log(`subagents (${report.subagents.count}) input/output/total: ${formatCount(report.subagents.tokens.inputTokens)}/${formatCount(report.subagents.tokens.outputTokens)}/${formatCount(report.subagents.tokens.totalTokens)}`);
  console.log(`subagent share (input/total): ${formatPct(report.subagentSharePct.inputTokens)} / ${formatPct(report.subagentSharePct.totalTokens)}`);
  console.log(`spawn_agent explicit/inherited: ${formatCount(report.parent.spawnModelSplit.explicit)}/${formatCount(report.parent.spawnModelSplit.inherited)} (${formatPct(explicitSpawnPct)} explicit model)`);
  console.log(`parent turn models: ${formatTurnModelDistribution(report.parent.turnModels) || "none"}`);
  console.log(`subagent turn models: ${formatTurnModelDistribution(report.subagents.turnModels) || "none"} (${SOL_ESCALATION_MODEL} ${formatPct(subagentSolSharePct)} of ${formatCount(subagentTurnTotal)} turns)`);
  console.log(`subagent cached input share: ${formatPct(subagentCachedInputSharePct)} (${formatCount(report.subagents.tokens.cachedInputTokens)} of ${formatCount(report.subagents.tokens.inputTokens)} input tokens)`);
  console.log(`compactions (parent): ${formatCount(report.parent.compactionCount)}`);
  console.log(`compactions (subagents): ${formatCount(subagentCompactionCount(report))}`);
  console.log(`compactions (combined): ${formatCount(report.combined.compactionCount)}`);
}

function aggregateReport(rolloutFile, parentStats, discovery) {
  const { files: subagentFiles, statsList: subagentStatsList, threadIds, unresolvedThreadIds } = discovery;
  const combined = emptyStats();
  const sections = [parentStats, ...subagentStatsList];
  for (const stats of sections) {
    addTokens(combined.tokens, stats.tokens);
    combined.compactionCount += stats.compactionCount;
    combined.spawnAgentCount += stats.spawnAgentCount;
    combined.spawnModelSplit.explicit += stats.spawnModelSplit.explicit;
    combined.spawnModelSplit.inherited += stats.spawnModelSplit.inherited;
    mergeTurnModels(combined.turnModels, stats.turnModels);
    if (stats.firstTimestamp !== null) {
      if (combined.firstTimestamp === null || stats.firstTimestamp < combined.firstTimestamp) combined.firstTimestamp = stats.firstTimestamp;
    }
    if (stats.lastTimestamp !== null) {
      if (combined.lastTimestamp === null || stats.lastTimestamp > combined.lastTimestamp) combined.lastTimestamp = stats.lastTimestamp;
    }
  }

  const subagentTokens = emptyTokens();
  for (const stats of subagentStatsList) addTokens(subagentTokens, stats.tokens);

  const durationMs = combined.firstTimestamp !== null && combined.lastTimestamp !== null
    ? combined.lastTimestamp - combined.firstTimestamp
    : null;

  return {
    schemaVersion: 1,
    rolloutPath: rolloutFile,
    durationMs,
    parent: statsToSection(parentStats),
    subagents: {
      count: subagentStatsList.length,
      threadIds,
      unresolvedThreadIds,
      files: subagentFiles,
      tokens: { ...subagentTokens },
      turnModels: subagentStatsList.reduce((acc, stats) => {
        mergeTurnModels(acc, stats.turnModels);
        return acc;
      }, {}),
    },
    combined: statsToSection(combined),
    subagentSharePct: {
      inputTokens: sharePct(subagentTokens.inputTokens, combined.tokens.inputTokens),
      outputTokens: sharePct(subagentTokens.outputTokens, combined.tokens.outputTokens),
      totalTokens: sharePct(subagentTokens.totalTokens, combined.tokens.totalTokens),
    },
  };
}

async function analyzeRollout(rolloutFile) {
  if (!rolloutFile) {
    console.error("codex-rollout-baseline requires --rollout <file>.");
    process.exit(2);
  }
  if (!existsSync(rolloutFile)) {
    console.error(`codex-rollout-baseline rollout file not found: ${rolloutFile}`);
    process.exit(2);
  }
  const parentStats = await parseRolloutFile(rolloutFile);
  return aggregateReport(rolloutFile, parentStats, await collectSubagentRollouts(rolloutFile, parentStats));
}

function readJson(flag, positional = false) {
  const file = positional && args[1] && !args[1].startsWith("-") ? args[1] : argValue(args, flag);
  if (!file) {
    console.error(`codex-rollout-baseline ${command} requires ${flag} <file>.`);
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`codex-rollout-baseline ${command} file not found: ${file}`);
    process.exit(2);
  }
  try {
    return { file, data: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    console.error(`codex-rollout-baseline ${command} cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

function baselineErrors(baseline) {
  const out = [];
  if (baseline.schemaVersion !== 1) out.push("schemaVersion must be 1");
  if (!baseline.baselineId) out.push("baselineId is required");
  if (!baseline.targetLabel) out.push("targetLabel is required");
  if (!baseline.capturedAt) out.push("capturedAt is required");
  if (!baseline.metrics || typeof baseline.metrics !== "object") out.push("metrics is required");
  const tokens = baseline.metrics?.combined?.tokens;
  if (!tokens || typeof tokens !== "object") out.push("metrics.combined.tokens is required");
  return out;
}

function metricsForBaseline(report) {
  return {
    durationMs: report.durationMs,
    parent: report.parent,
    subagents: {
      count: report.subagents.count,
      tokens: report.subagents.tokens,
      turnModels: report.subagents.turnModels,
    },
    combined: report.combined,
    subagentSharePct: report.subagentSharePct,
  };
}

async function runAggregate() {
  const report = await analyzeRollout(argValue(args, "--rollout"));
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printAggregateReport(report);
}

async function runBaseline() {
  const report = await analyzeRollout(argValue(args, "--rollout"));
  const baseline = {
    schemaVersion: 1,
    baselineId: argValue(args, "--id", `codex-baseline-${Date.now()}`),
    targetLabel: argValue(args, "--target", "codex-rollout"),
    capturedAt: nowIso(),
    rolloutPath: report.rolloutPath,
    metrics: metricsForBaseline(report),
  };
  const issues = baselineErrors(baseline);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  const previousUmask = process.umask(0o077);
  try {
    mkdirSync(baselinesDir(), { recursive: true, mode: 0o700 });
  } finally {
    process.umask(previousUmask);
  }
  const file = argValue(args, "--path", path.join(baselinesDir(), `${baseline.baselineId}.json`));
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
  console.log(file);
}

function runValidateBaseline() {
  const { file, data } = readJson("--path", true);
  const issues = baselineErrors(data);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log(`Codex baseline valid: ${file}`);
}

function metricDelta(before, after) {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  return Number((after - before).toFixed(2));
}

function runTrend() {
  const before = readJson("--before").data;
  const after = readJson("--after").data;
  const beforeMetrics = before.metrics || {};
  const afterMetrics = after.metrics || {};
  const tokenFields = ["inputTokens", "cachedInputTokens", "cacheWriteInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"];
  const tokenDelta = {};
  for (const field of tokenFields) {
    const prev = beforeMetrics.combined?.tokens?.[field] ?? null;
    const next = afterMetrics.combined?.tokens?.[field] ?? null;
    tokenDelta[field] = { before: prev, after: next, delta: metricDelta(prev, next) };
  }
  const shareFields = ["inputTokens", "outputTokens", "totalTokens"];
  const subagentShareDelta = {};
  for (const field of shareFields) {
    const prev = beforeMetrics.subagentSharePct?.[field] ?? null;
    const next = afterMetrics.subagentSharePct?.[field] ?? null;
    subagentShareDelta[field] = { before: prev, after: next, delta: metricDelta(prev, next) };
  }
  console.log(JSON.stringify({
    schemaVersion: 1,
    command: "trend",
    durationMs: {
      before: beforeMetrics.durationMs ?? null,
      after: afterMetrics.durationMs ?? null,
      delta: metricDelta(beforeMetrics.durationMs ?? null, afterMetrics.durationMs ?? null),
    },
    tokenDelta,
    subagentShareDelta,
    spawnAgentDelta: {
      before: beforeMetrics.combined?.spawnAgentCount ?? null,
      after: afterMetrics.combined?.spawnAgentCount ?? null,
      delta: metricDelta(beforeMetrics.combined?.spawnAgentCount ?? null, afterMetrics.combined?.spawnAgentCount ?? null),
    },
    compactionDelta: {
      before: beforeMetrics.combined?.compactionCount ?? null,
      after: afterMetrics.combined?.compactionCount ?? null,
      delta: metricDelta(beforeMetrics.combined?.compactionCount ?? null, afterMetrics.combined?.compactionCount ?? null),
    },
  }, null, 2));
}

try {
  if (command === "baseline") await runBaseline();
  else if (command === "validate-baseline") runValidateBaseline();
  else if (command === "trend") runTrend();
  else if (argValue(args, "--rollout")) await runAggregate();
  else usage();
} catch (error) {
  console.error(`codex-rollout-baseline failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
