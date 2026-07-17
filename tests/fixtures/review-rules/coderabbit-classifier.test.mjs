import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findingKind,
  normalizeSeverity,
  controlType,
  matchTemplateRule,
  recurrenceKey,
  classify,
} from "../../../scripts/lib/coderabbit-classifier.mjs";

test("praise is only praise when it carries no defect qualifier", () => {
  assert.equal(findingKind("Looks good, clean separation"), "praise");
  // A "good, but ..." opener is not praise — the qualifier flips it.
  assert.notEqual(findingKind("Good, but this misses the tenant filter"), "praise");
});

test("a plain missing-coverage finding routes to test_gap", () => {
  assert.equal(findingKind("Add a test for the empty-cart path", "no coverage here"), "test_gap");
  assert.equal(findingKind("Missing test coverage for the discount branch"), "test_gap");
});

test("strong defect signals outrank a bare mention of tests (ordering fix)", () => {
  // Each of these mentions "test"/"coverage" but is fundamentally a defect; the
  // strong-signal check must win so it routes to a review rubric, not a template.
  assert.equal(findingKind("Security bug: token leaks, and it has no test"), "defect");
  assert.equal(findingKind("Race condition here; also missing regression test coverage"), "defect");
  assert.equal(findingKind("This overwrite drops the update — no test catches it"), "defect");
  assert.equal(findingKind("Incorrect result; add a test to cover it"), "defect");
});

test("weak signals stay subordinate to test_gap", () => {
  // "missing"/"fail" alone must not pull a coverage note out of test_gap.
  assert.equal(findingKind("The test fixture is missing an assertion"), "test_gap");
});

test("defect keywords are word-bounded: debug/trace do not trip bug/race", () => {
  // "debug" contains "bug" and "trace" contains "race" — substring matches would
  // misroute these coverage notes to defect instead of test_gap.
  assert.equal(findingKind("Add a test for the debug helper output"), "test_gap");
  assert.equal(findingKind("Missing test coverage for the stack trace formatter"), "test_gap");
  // A genuine bug/race still classifies as defect.
  assert.equal(findingKind("There is a bug in the reducer"), "defect");
  assert.equal(findingKind("Fix the race condition in the queue"), "defect");
  // Plural "races" must also route to defect even alongside a test mention;
  // "traces" (plural of trace) must NOT — the boundary holds on both stems.
  assert.equal(findingKind("Fix the data races; add regression tests"), "defect");
  assert.equal(findingKind("Add a test for the stack traces panel"), "test_gap");
});

test("convention and advisory buckets", () => {
  assert.equal(findingKind("Hardcoded BRL string; use DEFAULT_CURRENCY"), "convention_gap");
  assert.equal(findingKind("Naming: rename foo to fooCount"), "convention_gap");
  assert.equal(findingKind("Consider extracting this into a helper"), "advisory");
  // A low-value severity routes to advisory even with terse body text.
  assert.equal(findingKind("Tweak", "", "minor"), "advisory");
});

test("severity normalization maps aliases and defaults low", () => {
  assert.equal(normalizeSeverity("blocker"), "blocker");
  assert.equal(normalizeSeverity("P1"), "high");
  assert.equal(normalizeSeverity("nitpick"), "nit");
  assert.equal(normalizeSeverity("something-unknown"), "low");
});

test("control type routes by kind", () => {
  assert.equal(controlType("test_gap"), "test_template");
  assert.equal(controlType("convention_gap"), "deterministic_guard");
  assert.equal(controlType("defect"), "review_rubric");
  assert.equal(controlType("advisory"), "review_rubric");
});

test("template triggers match known mechanical classes", () => {
  assert.equal(matchTemplateRule("Avoid `as any` cast", "unsafe type escape"), "no-expect-any");
  assert.equal(matchTemplateRule("Remove it.only from the suite"), "no-focused-tests");
  assert.equal(matchTemplateRule("Delete the it.skip skipped test"), "no-skipped-test");
  assert.equal(matchTemplateRule("This empty catch swallows the error"), "no-empty-catch");
  assert.equal(matchTemplateRule("redirect() inside try/catch is swallowed by catch"), "nextjs-no-redirect-in-try-catch");
  assert.equal(matchTemplateRule("General prose with no trigger"), null);
});

test("recurrence key is stable and hash-free", () => {
  const finding = { category: "Tenant Scope", lensId: "security_privacy_tenancy" };
  assert.equal(recurrenceKey(finding, "defect"), "review_rubric:security_privacy_tenancy:tenant-scope");
  // Same inputs => same key (deterministic).
  assert.equal(recurrenceKey(finding, "defect"), recurrenceKey(finding, "defect"));
});

test("classify composes the pieces for a security finding", () => {
  const out = classify({ summary: "Security bug: tenant leak, no test", severity: "major", lensId: "security_privacy_tenancy", category: "tenant-leak" });
  assert.equal(out.kind, "defect");
  assert.equal(out.control, "review_rubric");
  assert.equal(out.severity, "high");
  assert.equal(out.key, "review_rubric:security_privacy_tenancy:tenant-leak");
});
