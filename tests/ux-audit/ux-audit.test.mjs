import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGISTERED_DEEP_AUDIT_CATEGORIES,
  categoryLaneDispatch,
  resolveLaneDispatch,
} from "../../scripts/lib/deep-audit-categories.mjs";
import { CODEX_MODELS, MODEL_TIERS, REASONING_EFFORTS } from "../../scripts/lib/codex-model-routing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const inventoryScript = path.join(repoRoot, "scripts", "ux-inventory.mjs");
const checkScript = path.join(repoRoot, "scripts", "ux-audit-check.mjs");
const artifactCheck = path.join(repoRoot, "scripts", "deep-audit-artifact-check.mjs");
const syntheticApp = path.join(repoRoot, "tests", "fixtures", "ux-audit", "synthetic-app");
const inventoryFixture = path.join(repoRoot, "tests", "fixtures", "ux-audit", "inventory.json");
const deepAuditFixtures = path.join(repoRoot, "tests", "fixtures", "deep-audit");

const run = (script, args, env = {}) =>
  spawnSync("node", [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

const readFixture = (name) => JSON.parse(readFileSync(path.join(deepAuditFixtures, name), "utf8"));
const tempDir = () => mkdtempSync(path.join(tmpdir(), "ux-audit-"));

function inventory(extraArgs = []) {
  const result = run(inventoryScript, ["--root", syntheticApp, "--json", ...extraArgs]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("inventory enumerates every ux worklist with a count and a hash", () => {
  const report = inventory();
  const expected = ["ux_routes", "ux_components", "ux_states", "ux_styles", "ux_copy", "ux_accessibility"];
  assert.deepEqual(Object.keys(report.worklists).sort(), [...expected].sort());
  for (const id of expected) {
    assert.ok(report.worklists[id].count > 0, `${id} must enumerate at least one row`);
    assert.match(report.worklists[id].sha256, /^[0-9a-f]{64}$/);
  }
});

test("inventory hashes are stable across runs so a report can consume them", () => {
  const first = inventory();
  const second = inventory();
  assert.equal(first.worklists.ux_routes.sha256, second.worklists.ux_routes.sha256);
});

test("inventory derives coverage denominators from routes and surfaces", () => {
  const report = inventory();
  assert.equal(report.totals.routes, report.worklists.ux_routes.count);
  assert.equal(report.totals.routeViewportCells, report.totals.routes * report.axes.viewports.length);
  assert.equal(report.totals.stateCells, report.totals.surfaces * report.totals.statesPerSurface);
});

test("inventory detects the locale axis from the message catalog", () => {
  const report = inventory();
  assert.ok(report.axes.locales.includes("en"));
  assert.ok(report.axes.locales.includes("pt-BR"));
});

test("mechanical scan flags the anti-patterns seeded in the synthetic app", () => {
  const scan = inventory().mechanicalScan;
  for (const id of [
    "arbitrarySpacing",
    "arbitraryTypography",
    "smallBodyText",
    "gradientDefaults",
    "hardcodedColors",
    "missingAltText",
    "nonInteractiveClickHandler",
    "placeholderAsLabel",
  ]) {
    assert.ok(scan[id].count > 0, `${id} must fire on the synthetic app`);
  }
  assert.equal(scan.reducedMotionFallbackPresent, false);
  assert.equal(scan.designBaselinePresent, false);
});

test("inventory accepts both --root value and --root=value, rejects unknown flags", () => {
  const spaced = run(inventoryScript, ["--root", syntheticApp, "--quiet"]);
  const equals = run(inventoryScript, [`--root=${syntheticApp}`, "--quiet"]);
  const unknown = run(inventoryScript, ["--bogus"]);
  assert.equal(spaced.status, 0, spaced.stderr);
  assert.equal(equals.status, 0, equals.stderr);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown option: --bogus/);
});

test("coverage gate passes a fully dispositioned ux report", () => {
  const result = run(checkScript, [
    "coverage",
    "--inventory",
    inventoryFixture,
    "--artifact",
    path.join(deepAuditFixtures, "report.ux-valid.json"),
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test("coverage gate fails a sampled ux report with no coverage exception", () => {
  const result = run(checkScript, [
    "coverage",
    "--inventory",
    inventoryFixture,
    "--artifact",
    path.join(deepAuditFixtures, "report.ux-coverage-incomplete.json"),
    "--json",
  ]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.defects.some((defect) => defect.code === "uncovered-routes"));
});

test("a coverage exception with a reason clears the same shortfall", () => {
  const artifact = readFixture("report.ux-coverage-incomplete.json");
  const report = artifact.categoryReports.find((entry) => entry.categoryId === "ui-ux-product");
  report.coverageExceptions = [
    { kind: "routes", count: 1, reason: "Route is behind a paid third-party account this run." },
    { kind: "state-cells", count: 2, reason: "State cells belong to the unreachable route." },
  ];
  const file = path.join(tempDir(), "artifact.json");
  writeFileSync(file, JSON.stringify(artifact));
  const result = run(checkScript, ["coverage", "--inventory", inventoryFixture, "--artifact", file]);
  assert.equal(result.status, 0, result.stderr);
});

test("coverage gate rejects a report built against a stale worklist hash", () => {
  const artifact = readFixture("report.ux-valid.json");
  const report = artifact.categoryReports.find((entry) => entry.categoryId === "ui-ux-product");
  report.consumedWorklistHashes.ux_routes = "sha256:stale";
  const file = path.join(tempDir(), "artifact.json");
  writeFileSync(file, JSON.stringify(artifact));
  const result = run(checkScript, ["coverage", "--inventory", inventoryFixture, "--artifact", file, "--json"]);
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).defects.some((defect) => defect.code === "worklist-hash-mismatch"));
});

test("coverage gate requires quickWins and systemicFindings arrays", () => {
  const artifact = readFixture("report.ux-valid.json");
  const report = artifact.categoryReports.find((entry) => entry.categoryId === "ui-ux-product");
  delete report.quickWins;
  delete report.systemicFindings;
  const file = path.join(tempDir(), "artifact.json");
  writeFileSync(file, JSON.stringify(artifact));
  const result = run(checkScript, ["coverage", "--inventory", inventoryFixture, "--artifact", file, "--json"]);
  assert.equal(result.status, 1);
  const codes = JSON.parse(result.stdout).defects.map((defect) => defect.code);
  assert.ok(codes.includes("missing-quick-wins"));
  assert.ok(codes.includes("missing-systemic-findings"));
});

test("baseline captures per-check scores and trend reports the delta", () => {
  const dir = tempDir();
  const before = path.join(dir, "before.json");
  const write = run(checkScript, [
    "baseline",
    "--artifact",
    path.join(deepAuditFixtures, "report.ux-valid.json"),
    "--path",
    before,
    "--id",
    "ux-before",
  ], { ETRNL_ARTIFACTS_DIR: dir });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(run(checkScript, ["validate-baseline", before]).status, 0);

  const baseline = JSON.parse(readFileSync(before, "utf8"));
  assert.ok(baseline.scores.length > 0);
  const improved = {
    ...baseline,
    baselineId: "ux-after",
    scores: baseline.scores.map((row) => ({ ...row, score: Math.min(10, row.score + 2) })),
    severityCounts: { ...baseline.severityCounts, high: Math.max(0, baseline.severityCounts.high - 1) },
  };
  const after = path.join(dir, "after.json");
  writeFileSync(after, JSON.stringify(improved));

  const trend = run(checkScript, ["trend", "--before", before, "--after", after]);
  assert.equal(trend.status, 0, trend.stderr);
  const payload = JSON.parse(trend.stdout);
  assert.ok(payload.comparisons.every((row) => row.delta === 2 || row.afterScore === 10));
  assert.equal(payload.severityDelta.high.delta, -1);
});

test("validate-baseline rejects an out-of-range ux health score", () => {
  const dir = tempDir();
  const file = path.join(dir, "baseline.json");
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    baselineId: "ux",
    targetLabel: "app",
    coverage: {},
    scores: [{ checkId: "ux-01-flows-and-states", score: 12 }],
  }));
  const result = run(checkScript, ["validate-baseline", file]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /score must be between 0 and 10/);
});

test("artifact validator enforces the ux finding and score contract", () => {
  const valid = run(artifactCheck, ["validate", "--artifact", path.join(deepAuditFixtures, "report.ux-valid.json")]);
  assert.equal(valid.status, 0, valid.stderr);

  const missingField = run(artifactCheck, [
    "validate",
    "--artifact",
    path.join(deepAuditFixtures, "report.ux-finding-field-missing.json"),
    "--json",
  ]);
  assert.equal(missingField.status, 1);
  assert.match(missingField.stdout + missingField.stderr, /UX_FINDING_FIELD_MISSING/);
});

const registryLanes = REGISTERED_DEEP_AUDIT_CATEGORIES.flatMap((category) =>
  (category.lanes ?? []).map((entry) => ({ categoryId: category.categoryId, lane: entry })));

test("every registered lane in every category declares a modelTier", () => {
  const fanoutCategories = REGISTERED_DEEP_AUDIT_CATEGORIES.filter((category) => category.executionMode === "fanout");
  assert.ok(fanoutCategories.length > 0, "registry must define at least one fanout category to guard");
  for (const category of fanoutCategories) {
    assert.ok(category.lanes.length > 0, `${category.categoryId} is fanout but registers no lanes`);
  }
  assert.equal(
    registryLanes.length,
    fanoutCategories.reduce((total, category) => total + category.lanes.length, 0),
    "every registered lane must belong to a fanout category",
  );

  for (const { categoryId, lane } of registryLanes) {
    assert.ok(
      MODEL_TIERS.has(lane.modelTier),
      `${categoryId}/${lane.laneId} must declare a modelTier instead of inheriting the parent model`,
    );
  }
});

test("lane dispatch resolves an explicit model and reasoning effort for every lane", () => {
  for (const category of REGISTERED_DEEP_AUDIT_CATEGORIES) {
    if (category.lanes.length === 0) continue;
    const dispatch = categoryLaneDispatch(category.categoryId);
    assert.equal(dispatch.length, category.lanes.length);
    for (const row of dispatch) {
      assert.ok(CODEX_MODELS.has(row.model), `${category.categoryId}/${row.laneId} resolved unknown model ${row.model}`);
      assert.ok(REASONING_EFFORTS.has(row.reasoningEffort), `${category.categoryId}/${row.laneId} resolved unknown effort`);
    }
  }
});

test("no lane escalates to the top tier without a justification", () => {
  for (const { categoryId, lane } of registryLanes) {
    if (lane.modelTier !== "top") continue;
    assert.ok(
      typeof lane.modelTierJustification === "string" && lane.modelTierJustification.trim().length > 0,
      `${categoryId}/${lane.laneId} claims the top tier with no modelTierJustification`,
    );
  }
});

test("lane tiers follow the read-and-report versus analysis split", () => {
  const expected = {
    "flows-and-states": "standard",
    "hierarchy-and-visual": "standard",
    accessibility: "standard",
    "copy-and-trust": "fast",
    "cross-cutting-axes": "fast",
    "database-query-performance": "standard",
    "server-response-caching": "standard",
    "bundle-code-splitting": "fast",
    "react-rendering": "standard",
    "perceived-performance": "standard",
    "infrastructure-network": "fast",
  };
  const actual = Object.fromEntries(registryLanes.map(({ lane }) => [lane.laneId, lane.modelTier]));
  for (const [laneId, modelTier] of Object.entries(expected)) {
    assert.equal(actual[laneId], modelTier, `${laneId} should dispatch at the ${modelTier} tier`);
  }
});

test("lane dispatch rejects a lane that omits a modelTier or escalates without a reason", () => {
  assert.throws(
    () => resolveLaneDispatch({ laneId: "future-lane", label: "Future lane" }),
    /modelTier must be one of/,
  );
  assert.throws(
    () => resolveLaneDispatch({ laneId: "future-lane", modelTier: "top" }),
    /requires a modelTierJustification/,
  );
  assert.deepEqual(
    resolveLaneDispatch({ laneId: "future-lane", modelTier: "top", modelTierJustification: "Tier 3 schema cutover lane." }),
    { laneId: "future-lane", modelTier: "top", model: "gpt-5.6-terra", reasoningEffort: "high" },
  );
});

test("artifact validator rejects a clean ux check with no ux health score", () => {
  const artifact = readFixture("report.ux-valid.json");
  const report = artifact.categoryReports.find((entry) => entry.categoryId === "ui-ux-product");
  for (const check of report.checks) delete check.uxHealthScore;
  const file = path.join(tempDir(), "artifact.json");
  writeFileSync(file, JSON.stringify(artifact));
  const result = run(artifactCheck, ["validate", "--artifact", file, "--json"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /UX_HEALTH_SCORE_MISSING/);
});
