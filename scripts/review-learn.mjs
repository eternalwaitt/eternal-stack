#!/usr/bin/env node
// Fully-automatic CodeRabbit learning loop: classify the findings a PR's review
// surfaced, track recurrence, and at N recurrences auto-promote — a known
// deterministic pattern becomes a review-rules.json guard (WARN mode first,
// auto-escalating to BLOCK after 2 clean runs), everything else becomes a
// tracked checklist candidate. No approval gate; no receipt/ledger machinery.
//
// Usage:
//   node scripts/review-learn.mjs learn --findings <findings.json>
//       [--root <dir>] [--rules <path>] [--ledger <path>] [--threshold 3]
//       [--dry-run] [--json]
// findings.json: [{ summary, body?, severity?, category?, lensId? }, ...]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { classify } from "./lib/coderabbit-classifier.mjs";

function parseArgs(argv) {
  const out = { findings: null, root: process.cwd(), rules: null, ledger: null, templates: null, threshold: 3, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "learn") continue;
    else if (a === "--findings") out.findings = argv[++i];
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--rules") out.rules = argv[++i];
    else if (a === "--ledger") out.ledger = argv[++i];
    else if (a === "--templates") out.templates = argv[++i];
    else if (a === "--threshold") out.threshold = Number(argv[++i]);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.findings) throw new Error("learn requires --findings <path>");
  out.rules ||= path.join(out.root, "review-rules.json");
  out.ledger ||= path.join(out.root, "review-learnings.json");
  out.templates ||= path.join(out.root, "templates", "review-rules.example.json");
  return out;
}

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = readJson(path.resolve(args.findings), null);
  if (!Array.isArray(findings)) throw new Error("findings must be a JSON array");

  const ledger = readJson(args.ledger, { schemaVersion: 1, recurrences: {}, promoted: {}, cleanRuns: {} });
  const rules = readJson(args.rules, { schemaVersion: 1, rulesetId: "learned", version: 1, enabledRuleIds: [], rules: [] });
  const templates = readJson(args.templates, { rules: [] });

  const classified = findings.map((f) => ({ finding: f, ...classify(f) }));
  const seen = new Set(classified.map((c) => c.key));

  for (const key of seen) ledger.recurrences[key] = (ledger.recurrences[key] || 0) + 1;

  const promotions = [], candidates = [], escalations = [];

  // Promote keys that reached the threshold and are not already promoted.
  for (const c of classified) {
    if (ledger.promoted[c.key] || (ledger.recurrences[c.key] || 0) < args.threshold) continue;
    if (c.templateRuleId && !rules.rules.some((r) => r.ruleId === c.templateRuleId)) {
      const tmpl = templates.rules.find((r) => r.ruleId === c.templateRuleId);
      if (tmpl) {
        rules.rules.push({ ...tmpl, mode: "warn", version: (tmpl.version || 1) });
        if (!rules.enabledRuleIds.includes(tmpl.ruleId)) rules.enabledRuleIds.push(tmpl.ruleId);
        ledger.promoted[c.key] = { type: "guard", ruleId: tmpl.ruleId, mode: "warn" };
        ledger.cleanRuns[tmpl.ruleId] = 0;
        promotions.push({ key: c.key, ruleId: tmpl.ruleId, mode: "warn" });
        continue;
      }
    }
    ledger.promoted[c.key] = { type: "checklist_candidate", control: c.control, severity: c.severity, category: c.finding.category || c.kind, lensId: c.finding.lensId || null };
    candidates.push({ key: c.key, control: c.control, category: c.finding.category || c.kind });
  }

  // Escalate warn-mode guards to block after 2 runs with no recurrence.
  for (const [key, p] of Object.entries(ledger.promoted)) {
    if (p.type !== "guard" || p.mode !== "warn") continue;
    if (seen.has(key)) { ledger.cleanRuns[p.ruleId] = 0; continue; }
    ledger.cleanRuns[p.ruleId] = (ledger.cleanRuns[p.ruleId] || 0) + 1;
    if (ledger.cleanRuns[p.ruleId] >= 2) {
      const rule = rules.rules.find((r) => r.ruleId === p.ruleId);
      if (rule) { rule.mode = "block"; p.mode = "block"; escalations.push({ ruleId: p.ruleId, mode: "block" }); }
    }
  }

  if (!args.dryRun) {
    // The ledger is canonical JSON (idempotent rewrite = no diff). review-rules.json
    // is a hand-formatted tracked config, so only write it when a promotion or
    // escalation actually changed it — a no-op run must not reflow it.
    writeFileSync(args.ledger, JSON.stringify(ledger, null, 2) + "\n");
    if (promotions.length > 0 || escalations.length > 0) {
      writeFileSync(args.rules, JSON.stringify(rules, null, 2) + "\n");
    }
  }

  const metric = {
    schemaVersion: 1,
    findingsProcessed: findings.length,
    distinctKeys: seen.size,
    newGuardPromotions: promotions,
    newChecklistCandidates: candidates,
    escalations,
  };
  process.stdout.write(args.json
    ? JSON.stringify(metric, null, 2) + "\n"
    : `review-learn: ${findings.length} findings, ${promotions.length} guard promotion(s), ${candidates.length} checklist candidate(s), ${escalations.length} escalation(s)\n`);
}

main();
