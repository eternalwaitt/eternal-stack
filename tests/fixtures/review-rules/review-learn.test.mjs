import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../../../scripts/lib/coderabbit-classifier.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const learn = path.join(repoRoot, "scripts", "review-learn.mjs");

function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "rl-"));
  mkdirSync(path.join(root, "templates"));
  copyFileSync(path.join(repoRoot, "templates", "review-rules.example.json"), path.join(root, "templates", "review-rules.example.json"));
  writeFileSync(path.join(root, "review-rules.json"), JSON.stringify({ schemaVersion: 1, rulesetId: "t", version: 1, enabledRuleIds: [], rules: [] }));
  return root;
}

function runLearn(root, findings, { reviewId = null, corpus = null, minPrecision = null } = {}) {
  const fp = path.join(root, "findings.json");
  writeFileSync(fp, JSON.stringify(findings));
  const args = [learn, "learn", "--findings", fp, "--root", root, "--json"];
  if (reviewId) args.push("--review-id", reviewId);
  if (corpus) args.push("--corpus", corpus);
  if (minPrecision !== null) args.push("--min-precision", String(minPrecision));
  const res = spawnSync("node", args, { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  return {
    metric: JSON.parse(res.stdout),
    rules: JSON.parse(readFileSync(path.join(root, "review-rules.json"), "utf8")),
    ledger: JSON.parse(readFileSync(path.join(root, "review-learnings.json"), "utf8")),
  };
}

const asAny = [{ summary: "Avoid `as any` cast", body: "unsafe type escape", severity: "minor", lensId: "types_schema_contracts", category: "unsafe-type-escape" }];
const tenant = [{ summary: "Missing tenantId filter", body: "query not scoped to tenant", severity: "major", lensId: "security_privacy_tenancy", category: "tenant-scope" }];

test("3 recurrences of a template-matching finding auto-promote a WARN guard", () => {
  const root = freshRoot();
  runLearn(root, asAny); // 1
  runLearn(root, asAny); // 2
  const third = runLearn(root, asAny); // 3 -> promote
  assert.equal(third.metric.newGuardPromotions.length, 1);
  const rule = third.rules.rules.find((r) => r.ruleId === "no-expect-any");
  assert.ok(rule, "no-expect-any rule was added");
  assert.equal(rule.mode, "warn", "auto-promoted guard starts in warn mode");
  assert.ok(third.rules.enabledRuleIds.includes("no-expect-any"));
});

test("a promoted warn guard escalates to BLOCK after 2 clean runs", () => {
  const root = freshRoot();
  runLearn(root, asAny); runLearn(root, asAny); runLearn(root, asAny); // promote -> warn
  runLearn(root, tenant); // clean run 1 (no as-any)
  const after = runLearn(root, tenant); // clean run 2 -> escalate
  const rule = after.rules.rules.find((r) => r.ruleId === "no-expect-any");
  assert.equal(rule.mode, "block", "warn escalates to block after 2 clean runs");
  assert.equal(after.metric.escalations.length, 1);
});

test("a non-template finding becomes a checklist candidate, not a guard", () => {
  const root = freshRoot();
  runLearn(root, tenant); runLearn(root, tenant);
  const third = runLearn(root, tenant);
  assert.equal(third.metric.newGuardPromotions.length, 0);
  assert.equal(third.metric.newChecklistCandidates.length, 1);
  assert.equal(third.rules.rules.length, 0, "no deterministic rule invented from prose");
});

test("re-processing the same --review-id leaves recurrence counters unchanged (idempotent)", () => {
  const root = freshRoot();
  const first = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  const recurrenceAfterFirst = first.ledger.recurrences;
  // Re-run the SAME review id twice more: must not advance recurrence counts.
  const again = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  const final = runLearn(root, asAny, { reviewId: "pr-42-review-1" });
  assert.equal(again.metric.alreadyProcessed, true, "the second run is a no-op");
  assert.deepEqual(final.ledger.recurrences, recurrenceAfterFirst, "counts frozen at the first processing");
  assert.equal(final.metric.newGuardPromotions.length, 0, "reprocessing never promotes");

  // A DISTINCT review id with the same class DOES count as a new recurrence.
  const distinct = runLearn(root, asAny, { reviewId: "pr-43-review-1" });
  const key = Object.keys(recurrenceAfterFirst)[0];
  assert.equal(distinct.ledger.recurrences[key], recurrenceAfterFirst[key] + 1, "a new review advances the count");
});

test("--threshold rejects non-positive-integer values", () => {
  const root = freshRoot();
  const fp = path.join(root, "findings.json");
  writeFileSync(fp, JSON.stringify(asAny));
  for (const bad of ["0", "-1", "1.5", "abc"]) {
    const res = spawnSync("node", [learn, "learn", "--findings", fp, "--root", root, "--threshold", bad, "--json"], { encoding: "utf8" });
    assert.notEqual(res.status, 0, `threshold ${bad} must be rejected`);
    assert.match(res.stderr, /threshold must be a positive integer/);
  }
});

test("findings tagged with an excluded disposition are dropped, never promoted", () => {
  const root = freshRoot();
  const tagged = [{ ...asAny[0], disposition: "false-positive" }];
  // Three recurrences of a false-positive would promote a warn guard without the
  // disposition backstop; with it, the item is dropped on every run.
  runLearn(root, tagged); runLearn(root, tagged);
  const third = runLearn(root, tagged);
  assert.equal(third.metric.droppedByDisposition, 1);
  assert.equal(third.metric.findingsProcessed, 0);
  assert.equal(third.metric.newGuardPromotions.length, 0);
  assert.equal(third.rules.rules.length, 0, "an excluded-disposition finding never becomes a guard");

  // Control: the SAME finding WITHOUT a disposition still promotes at threshold, so
  // the backstop is scoped to excluded tags and does not break normal learning.
  const root2 = freshRoot();
  runLearn(root2, asAny); runLearn(root2, asAny);
  const promoted = runLearn(root2, asAny);
  assert.equal(promoted.metric.newGuardPromotions.length, 1, "undisposed valid finding still promotes");
});

test("clean-run escalation is counted per guard ruleId, not per recurrence key", () => {
  const root = freshRoot();
  const keyA = classify(asAny[0]).key; // the recurrence key this review surfaces
  // Seed one warn guard promoted under TWO keys of the SAME ruleId, one clean run from
  // block. The synthetic key is inserted FIRST so the old per-key loop would tick
  // cleanRuns to 2 and escalate before the real (recurring) key could reset it.
  writeFileSync(path.join(root, "review-rules.json"), JSON.stringify({
    schemaVersion: 1, rulesetId: "t", version: 1,
    enabledRuleIds: ["no-expect-any"],
    rules: [{ ruleId: "no-expect-any", mode: "warn", version: 1 }],
  }));
  writeFileSync(path.join(root, "review-learnings.json"), JSON.stringify({
    schemaVersion: 1,
    recurrences: { "deterministic_guard:types_schema_contracts:other-escape": 3, [keyA]: 3 },
    promoted: {
      "deterministic_guard:types_schema_contracts:other-escape": { type: "guard", ruleId: "no-expect-any", mode: "warn" },
      [keyA]: { type: "guard", ruleId: "no-expect-any", mode: "warn" },
    },
    cleanRuns: { "no-expect-any": 1 },
  }));
  const after = runLearn(root, asAny); // keyA recurs this review
  const rule = after.rules.rules.find((r) => r.ruleId === "no-expect-any");
  assert.equal(rule.mode, "warn", "a guard must NOT escalate when one of its keys recurred this review");
  assert.equal(after.metric.escalations.length, 0);
  assert.equal(after.ledger.cleanRuns["no-expect-any"], 0, "the recurrence resets the guard's clean-run streak");
});

test("an already-present guard records a promotion, not a duplicate checklist candidate", () => {
  const root = freshRoot();
  // Seed the guard as if no-expect-any already shipped enabled in review-rules.json.
  writeFileSync(path.join(root, "review-rules.json"), JSON.stringify({
    schemaVersion: 1, rulesetId: "t", version: 1,
    enabledRuleIds: ["no-expect-any"],
    rules: [{ ruleId: "no-expect-any", mode: "warn", version: 1 }],
  }));
  runLearn(root, asAny); runLearn(root, asAny);
  const third = runLearn(root, asAny); // threshold reached with the guard already present
  assert.equal(third.metric.newGuardPromotions.length, 1, "existing guard recorded as a promotion");
  assert.equal(third.metric.newChecklistCandidates.length, 0, "not relabeled as a checklist candidate");
  assert.equal(third.rules.rules.filter((r) => r.ruleId === "no-expect-any").length, 1, "no duplicate rule appended");
});

// A recurring empty-catch finding routes to the no-empty-catch template (regex
// engine — no ast-grep dependency), so its precision is measurable against a
// labelled corpus. The regex fires on ANY literally-empty catch block; a corpus
// where a negative/ file also has a (legitimately) empty catch makes the rule
// low precision — exactly the noisy-but-recurring class the gate must not promote.
const emptyCatch = [{ summary: "Empty catch swallows the error", body: "catch block is empty and hides failures", severity: "major", lensId: "correctness_state", category: "silent-fallback" }];

function lowPrecisionCorpus(root) {
  const corpus = path.join(root, "corpus");
  mkdirSync(path.join(corpus, "positive", "src"), { recursive: true });
  mkdirSync(path.join(corpus, "negative", "src"), { recursive: true });
  // positive: an empty catch that SHOULD fire (a genuine swallowed error).
  writeFileSync(path.join(corpus, "positive", "src", "tp.ts"), "export function a() { try { risky(); } catch (e) {} }\n");
  // negative: a literally-empty catch too, but here it is a false positive — the
  // deterministic regex cannot tell intent, so it also fires. TP=1, FP=1 -> 0.5.
  writeFileSync(path.join(corpus, "negative", "src", "fp.ts"), "export function b() { try { cleanup(); } catch (e) {} }\n");
  return corpus;
}

test("a low-precision recurring finding does NOT promote; it becomes a precision-blocked checklist candidate", () => {
  const root = freshRoot();
  const corpus = lowPrecisionCorpus(root);
  // 3 recurrences reach the frequency threshold, but the corpus proves the rule is
  // noisy (precision 0.5 < 0.8), so it must NOT be installed as a guard.
  runLearn(root, emptyCatch, { corpus, minPrecision: 0.8 });
  runLearn(root, emptyCatch, { corpus, minPrecision: 0.8 });
  const third = runLearn(root, emptyCatch, { corpus, minPrecision: 0.8 });

  assert.equal(third.metric.newGuardPromotions.length, 0, "a low-precision class is never promoted to a guard");
  assert.equal(third.metric.newChecklistCandidates.length, 1, "it is recorded as a checklist candidate instead");
  const candidate = third.metric.newChecklistCandidates[0];
  assert.equal(candidate.blockedBy, "precision", "the candidate is flagged as blocked by the precision gate");
  assert.equal(candidate.precision, 0.5, "the measured precision is reported (TP/(TP+FP) = 1/2)");
  assert.equal(third.rules.rules.filter((r) => r.ruleId === "no-empty-catch").length, 0, "no noisy guard added to review-rules.json");
  assert.ok(!third.rules.enabledRuleIds.includes("no-empty-catch"), "the noisy rule is not enabled");
  // The ledger records the block with the measured precision alongside sourcePrCount.
  const key = classify(emptyCatch[0]).key;
  const ledgerEntry = third.ledger.promoted[key];
  assert.equal(ledgerEntry.type, "checklist_candidate");
  assert.equal(ledgerEntry.blockedBy, "precision");
  assert.equal(ledgerEntry.precision, 0.5);
  assert.equal(ledgerEntry.sourcePrCount, 3, "sourcePrCount from the template is recorded alongside precision");

  // Backward-compat: the SAME 3 recurrences WITHOUT --corpus still promote a guard,
  // proving the precision gate is opt-in and does not change legacy behavior.
  const legacyRoot = freshRoot();
  runLearn(legacyRoot, emptyCatch);
  runLearn(legacyRoot, emptyCatch);
  const legacyThird = runLearn(legacyRoot, emptyCatch);
  assert.equal(legacyThird.metric.newGuardPromotions.length, 1, "without a corpus the same class promotes (frequency-only gate)");
  const rule = legacyThird.rules.rules.find((r) => r.ruleId === "no-empty-catch");
  assert.ok(rule, "no-empty-catch guard was installed with no corpus supplied");
  assert.equal(rule.mode, "warn", "legacy promotion still starts in warn mode");
  assert.ok(legacyThird.rules.enabledRuleIds.includes("no-empty-catch"));
});
