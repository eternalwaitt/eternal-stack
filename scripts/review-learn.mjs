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
  const out = { findings: null, root: process.cwd(), rules: null, ledger: null, templates: null, reviewId: null, threshold: 3, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "learn") continue;
    else if (a === "--findings") out.findings = argv[++i];
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--rules") out.rules = argv[++i];
    else if (a === "--ledger") out.ledger = argv[++i];
    else if (a === "--templates") out.templates = argv[++i];
    else if (a === "--review-id") out.reviewId = argv[++i];
    else if (a === "--threshold") {
      const threshold = Number(argv[++i]);
      if (!Number.isSafeInteger(threshold) || threshold < 1) {
        throw new Error("--threshold must be a positive integer");
      }
      out.threshold = threshold;
    }
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

// Dispositions that must never train the loop. A PR triage classifies each review
// item (etrnl-dev-pr); only genuinely-valid items should recur into guards.
const EXCLUDED_DISPOSITIONS = new Set([
  "false-positive", "false_positive", "falsepositive",
  "source-limited", "source_limited", "sourcelimited",
  "owner-deferred", "owner_deferred", "deferred", "wont-fix", "wontfix", "invalid",
]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = readJson(path.resolve(args.findings), null);
  if (!Array.isArray(findings)) throw new Error("findings must be a JSON array");

  // Only confirmed-valid findings train the loop. A finding may carry an optional
  // `disposition` from the PR triage step (etrnl-dev-pr): items explicitly marked
  // false-positive / source-limited / owner-deferred are dropped here so a
  // mis-curated findings file cannot promote a review mistake into a recurring guard.
  // Findings with no disposition are trusted — the caller vouched for them — so the
  // mechanical primitive stays backward-compatible.
  const admissible = findings.filter((f) => {
    const d = f && typeof f.disposition === "string" ? f.disposition.toLowerCase().trim() : "";
    return !EXCLUDED_DISPOSITIONS.has(d);
  });
  const droppedByDisposition = findings.length - admissible.length;

  const ledger = readJson(args.ledger, { schemaVersion: 1, recurrences: {}, promoted: {}, cleanRuns: {} });
  const rules = readJson(args.rules, { schemaVersion: 1, rulesetId: "learned", version: 1, enabledRuleIds: [], rules: [] });
  const templates = readJson(args.templates, { rules: [] });

  const classified = admissible.map((f) => ({ finding: f, ...classify(f) }));
  const seen = new Set(classified.map((c) => c.key));

  const promotions = [], candidates = [], escalations = [];

  // Idempotency: a stable --review-id identifies the review that surfaced these
  // findings. Re-processing the same review (a retry, a re-run) must not re-count
  // recurrences or advance clean-run streaks — that would let repeated processing
  // of ONE review promote a warn guard and then escalate it to block. When a
  // review-id is omitted (legacy callers), each run counts as before.
  ledger.processedReviews ||= [];
  const alreadyProcessed = Boolean(args.reviewId) && ledger.processedReviews.includes(args.reviewId);

  if (!alreadyProcessed) {
    for (const key of seen) ledger.recurrences[key] = (ledger.recurrences[key] || 0) + 1;

    // Promote keys that reached the threshold and are not already promoted.
    for (const c of classified) {
      if (ledger.promoted[c.key] || (ledger.recurrences[c.key] || 0) < args.threshold) continue;
      if (c.templateRuleId) {
        const existing = rules.rules.find((r) => r.ruleId === c.templateRuleId);
        if (existing) {
          // A guard for this class already exists (e.g. no-expect-any ships enabled).
          // Record the recurrence as a guard promotion against the existing rule, not
          // a duplicate checklist candidate; the escalation loop below owns cleanRuns.
          if (!rules.enabledRuleIds.includes(existing.ruleId)) rules.enabledRuleIds.push(existing.ruleId);
          const mode = existing.mode || "warn";
          ledger.promoted[c.key] = { type: "guard", ruleId: existing.ruleId, mode };
          if (!(existing.ruleId in ledger.cleanRuns)) ledger.cleanRuns[existing.ruleId] = 0;
          promotions.push({ key: c.key, ruleId: existing.ruleId, mode });
          continue;
        }
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

    // Escalate warn-mode guards to block after 2 runs with no recurrence. Evaluate
    // ONCE per guard ruleId, not once per recurrence key: several keys can promote
    // the same ruleId, so a guard must reset if ANY of its keys recurred this review.
    // Counting per key would let an absent sibling key tick a guard toward block even
    // though another of its keys just recurred (and, by object order, escalate early).
    const warnGuards = Object.entries(ledger.promoted).filter(([, p]) => p.type === "guard" && p.mode === "warn");
    const recurredRuleIds = new Set(warnGuards.filter(([key]) => seen.has(key)).map(([, p]) => p.ruleId));
    const evaluatedRuleIds = new Set();
    for (const [, p] of warnGuards) {
      if (evaluatedRuleIds.has(p.ruleId)) continue;
      evaluatedRuleIds.add(p.ruleId);
      if (recurredRuleIds.has(p.ruleId)) { ledger.cleanRuns[p.ruleId] = 0; continue; }
      ledger.cleanRuns[p.ruleId] = (ledger.cleanRuns[p.ruleId] || 0) + 1;
      if (ledger.cleanRuns[p.ruleId] >= 2) {
        const rule = rules.rules.find((r) => r.ruleId === p.ruleId);
        if (rule) { rule.mode = "block"; p.mode = "block"; escalations.push({ ruleId: p.ruleId, mode: "block" }); }
      }
    }

    if (args.reviewId) ledger.processedReviews.push(args.reviewId);
  }

  if (!args.dryRun) {
    // Order matters for crash consistency. The ledger's `promoted`/`cleanRuns` entries
    // are what STOP a later run from re-installing a guard, so they must be committed
    // only AFTER the guard is durably in review-rules.json. Write the rules first; if
    // that write throws, we never persist the ledger, so a retry recovers and installs
    // the missing guard. review-rules.json is a hand-formatted tracked config, so only
    // write it when a promotion or escalation actually changed it — a no-op run must
    // not reflow it. The ledger is canonical JSON (idempotent rewrite = no diff).
    if (promotions.length > 0 || escalations.length > 0) {
      writeFileSync(args.rules, JSON.stringify(rules, null, 2) + "\n");
    }
    writeFileSync(args.ledger, JSON.stringify(ledger, null, 2) + "\n");
  }

  const metric = {
    schemaVersion: 1,
    findingsProcessed: admissible.length,
    droppedByDisposition,
    distinctKeys: seen.size,
    alreadyProcessed,
    newGuardPromotions: promotions,
    newChecklistCandidates: candidates,
    escalations,
  };
  process.stdout.write(args.json
    ? JSON.stringify(metric, null, 2) + "\n"
    : `review-learn: ${admissible.length} findings${droppedByDisposition ? ` (+${droppedByDisposition} dropped by disposition)` : ""}, ${promotions.length} guard promotion(s), ${candidates.length} checklist candidate(s), ${escalations.length} escalation(s)${alreadyProcessed ? " (review already processed; no-op)" : ""}\n`);
}

main();
