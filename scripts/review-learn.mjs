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
//       [--corpus <dir>] [--min-precision 0.8] [--dry-run] [--json]
// findings.json: [{ summary, body?, severity?, category?, lensId? }, ...]
//
// Precision gate (optional): when --corpus is supplied, a template rule that
// reaches the recurrence threshold is only promoted to a guard if it is precise
// enough against a labelled corpus — <corpus>/positive/** (rule SHOULD fire) and
// <corpus>/negative/** (rule SHOULD NOT fire). A low-precision (noisy) class is
// recorded as a checklist_candidate instead of installing a false-positive guard.
// Without --corpus the loop behaves exactly as before (frequency-only gate).

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classify } from "./lib/coderabbit-classifier.mjs";
import { withFileLock, writeJsonAtomic } from "./lib/json-file-store.mjs";

// review-merge.mjs writes reviewer-dispatch rows into the same store. Mutual
// exclusion comes from the lock directory the store path derives, so both writers
// contend on it whatever they call it; the label only names the store in a timeout
// message. It matches review-merge.mjs so the two report the same wait.
const LEDGER_LOCK = { label: "review learnings" };

function parseArgs(argv) {
  const out = { findings: null, root: process.cwd(), rules: null, ledger: null, templates: null, reviewId: null, threshold: 3, corpus: null, minPrecision: 0.8, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "learn") continue;
    else if (a === "--findings") out.findings = argv[++i];
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--rules") out.rules = argv[++i];
    else if (a === "--ledger") out.ledger = argv[++i];
    else if (a === "--templates") out.templates = argv[++i];
    else if (a === "--review-id") out.reviewId = argv[++i];
    else if (a === "--corpus") out.corpus = path.resolve(argv[++i]);
    else if (a === "--min-precision") {
      const minPrecision = Number(argv[++i]);
      if (!Number.isFinite(minPrecision) || minPrecision < 0 || minPrecision > 1) {
        throw new Error("--min-precision must be a number between 0 and 1");
      }
      out.minPrecision = minPrecision;
    }
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
  if (out.corpus && !existsSync(out.corpus)) {
    throw new Error(`--corpus directory not found: ${out.corpus}`);
  }
  return out;
}

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

// Path to the real deterministic engine — the SAME runner pre-push/CI uses, so a
// precision measurement matches exactly what the promoted guard would flag.
const REVIEW_RULES_ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "review-rules.mjs");

// Count the distinct files the candidate rule matches under one corpus half by
// running it through the real engine. Returns the matched-file count.
function countMatchedFiles(tmpl, corpusRoot) {
  const cfgDir = mkdtempSync(path.join(tmpdir(), "rl-precision-"));
  try {
    const cfgPath = path.join(cfgDir, "review-rules.json");
    // A single-rule config forced into block mode: mode does not change what
    // MATCHES (findings are reported regardless of mode), it only sets exit code;
    // block keeps the engine's severity contract explicit for this measurement.
    const singleRule = {
      schemaVersion: 1,
      rulesetId: "precision-probe",
      version: 1,
      enabledRuleIds: [tmpl.ruleId],
      rules: [{ ...tmpl, mode: "block", version: tmpl.version || 1 }],
    };
    writeFileSync(cfgPath, JSON.stringify(singleRule));
    const res = spawnSync(
      "node",
      [REVIEW_RULES_ENGINE, "check", "--config", cfgPath, "--root", corpusRoot, "--json"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    // Exit 2 (cannot-evaluate: engine missing dep, malformed pattern, invalid
    // config) must not be read as "no matches" — that would let an unmeasurable
    // rule look perfectly clean on the negatives and auto-promote. Fail closed.
    if (res.status === 2 || res.error) {
      throw new Error(`precision probe could not evaluate ${tmpl.ruleId} against ${corpusRoot}: ${(res.stderr || res.error?.message || "").trim()}`);
    }
    let parsed;
    try { parsed = JSON.parse(res.stdout || ""); }
    catch { throw new Error(`precision probe returned non-JSON output for ${tmpl.ruleId}`); }
    if (parsed.status === "error") {
      throw new Error(`precision probe failed for ${tmpl.ruleId}: ${parsed.error}`);
    }
    const files = new Set((parsed.findings || []).map((f) => f.file));
    return files.size;
  } finally {
    rmSync(cfgDir, { recursive: true, force: true });
  }
}

// True when a corpus half exists AND holds at least one regular file (nested at
// any depth). An absent or empty half carries no labelling evidence, so a
// precision measurement over it is meaningless — see measurePrecision.
function halfHasLabelledFile(halfRoot) {
  if (!existsSync(halfRoot)) return false;
  try {
    for (const ent of readdirSync(halfRoot, { recursive: true, withFileTypes: true })) {
      if (ent.isFile()) return true;
    }
  } catch { return false; }
  return false;
}

// Precision of a candidate template rule against the labelled corpus.
//   TP = files matched under <corpus>/positive/  (rule SHOULD fire)
//   FP = files matched under <corpus>/negative/  (rule SHOULD NOT fire)
//   precision = TP / (TP + FP); TP + FP === 0 -> 0 (a rule that fires on nothing
//   is not promotable).
// A precision measurement is only meaningful when BOTH halves carry labelling
// evidence. If either <corpus>/positive/ or <corpus>/negative/ is missing or
// empty, there is no false-positive evidence — treating the absent half as zero
// FP would compute precision = TP/(TP+0) = 1 and auto-promote a noisy rule with
// no negative corpus at all. Return 0 (not promotable) in that case; only fall
// through to the real TP/(TP+FP) calculation when both halves are populated.
function measurePrecision(tmpl, corpusRoot) {
  const posRoot = path.join(corpusRoot, "positive");
  const negRoot = path.join(corpusRoot, "negative");
  if (!halfHasLabelledFile(posRoot) || !halfHasLabelledFile(negRoot)) return 0;
  const tp = countMatchedFiles(tmpl, posRoot);
  const fp = countMatchedFiles(tmpl, negRoot);
  if (tp + fp === 0) return 0;
  return tp / (tp + fp);
}

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

  const templates = readJson(args.templates, { rules: [] });

  const classified = admissible.map((f) => ({ finding: f, ...classify(f) }));
  const seen = new Set(classified.map((c) => c.key));

  // Each pass reads its own copies, so a discarded pass cannot leak mutations
  // into the authoritative one.
  const readLedger = () => readJson(args.ledger, { schemaVersion: 1, recurrences: {}, promoted: {}, cleanRuns: {} });
  const readRules = () => readJson(args.rules, { schemaVersion: 1, rulesetId: "learned", version: 1, enabledRuleIds: [], rules: [] });

  // A precision measurement depends only on the template and the corpus, never on
  // the ledger, so the result is cached per rule id and reused across passes.
  const precisionCache = new Map();
  const precisionFor = (tmpl) => {
    if (!precisionCache.has(tmpl.ruleId)) precisionCache.set(tmpl.ruleId, measurePrecision(tmpl, args.corpus));
    return precisionCache.get(tmpl.ruleId);
  };

  let result;
  if (args.dryRun) {
    result = applyLearning({ ledger: readLedger(), rules: readRules(), templates, classified, seen, args, precisionFor });
  } else {
    // Precision probes spawn the review-rules engine once per candidate. Doing
    // that while holding the store lock would stall every other writer past its
    // lock timeout, so a throwaway pass outside the lock warms the measurement
    // cache first; the authoritative pass inside the lock then reuses it.
    if (args.corpus) applyLearning({ ledger: readLedger(), rules: readRules(), templates, classified, seen, args, precisionFor });
    // The ledger is read inside the lock: review-merge.mjs writes reviewer rows
    // to this store, and a decision computed from a pre-lock snapshot would
    // overwrite whatever landed in between.
    result = withFileLock(args.ledger, () => {
      const ledger = readLedger();
      const rules = readRules();
      const outcome = applyLearning({ ledger, rules, templates, classified, seen, args, precisionFor });
      // Order matters for crash consistency. The ledger's `promoted`/`cleanRuns`
      // entries are what STOP a later run from re-installing a guard, so they are
      // committed only AFTER the guard is durably in review-rules.json. Write the
      // rules first; if that write throws, the ledger is never persisted, so a
      // retry recovers and installs the missing guard. review-rules.json is a
      // hand-formatted tracked config, so it is only written when a promotion or
      // escalation actually changed it — a no-op run must not reflow it. The
      // ledger is canonical JSON (idempotent rewrite = no diff).
      if (outcome.promotions.length > 0 || outcome.escalations.length > 0) {
        writeJsonAtomic(args.rules, rules);
      }
      writeJsonAtomic(args.ledger, ledger);
      return outcome;
    }, LEDGER_LOCK);
  }
  const { promotions, candidates, escalations, alreadyProcessed } = result;

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

// One learning pass over a ledger/rules pair. Mutates both and reports what it
// changed, so `main` can run it against throwaway copies outside the store lock
// and against the authoritative copies inside it.
function applyLearning({ ledger, rules, templates, classified, seen, args, precisionFor }) {
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
          // Precision gate (optional): a recurring class is frequent, not
          // necessarily precise. When a corpus is supplied, MEASURE the candidate
          // rule against it and refuse to install a noisy guard — record it as a
          // checklist_candidate (blockedBy: 'precision') instead. Without a corpus
          // this branch is skipped and promotion stays frequency-only (legacy).
          let precision = null;
          if (args.corpus) {
            precision = precisionFor(tmpl);
            if (precision < args.minPrecision) {
              ledger.promoted[c.key] = {
                type: "checklist_candidate",
                control: c.control,
                severity: c.severity,
                category: c.finding.category || c.kind,
                lensId: c.finding.lensId || null,
                sourcePrCount: tmpl.sourcePrCount ?? null,
                precision,
                blockedBy: "precision",
              };
              candidates.push({ key: c.key, control: c.control, category: c.finding.category || c.kind, blockedBy: "precision", precision });
              continue;
            }
          }
          rules.rules.push({ ...tmpl, mode: "warn", version: (tmpl.version || 1) });
          if (!rules.enabledRuleIds.includes(tmpl.ruleId)) rules.enabledRuleIds.push(tmpl.ruleId);
          ledger.promoted[c.key] = { type: "guard", ruleId: tmpl.ruleId, mode: "warn", sourcePrCount: tmpl.sourcePrCount ?? null, precision };
          ledger.cleanRuns[tmpl.ruleId] = 0;
          promotions.push({ key: c.key, ruleId: tmpl.ruleId, mode: "warn", precision });
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

  return { promotions, candidates, escalations, alreadyProcessed };
}

main();
