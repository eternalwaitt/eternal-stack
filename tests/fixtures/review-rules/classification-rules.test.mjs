import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These router schemas have no runtime consumer beyond diff-triviality's path
// classification; the risk-tag and lens-suppression contracts are declarative
// data. These tests pin the CI-concurrency contract so a `.github/workflows/*.yml`
// change to a `concurrency:` group is classified concurrency-relevant and is NOT
// suppressed by the quality-N/A rules.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const classification = JSON.parse(readFileSync(path.join(repoRoot, "schemas", "review-classification-rules-v1.json"), "utf8"));
const qualityNa = JSON.parse(readFileSync(path.join(repoRoot, "schemas", "quality-na-rules.json"), "utf8"));

const rule = (schema, id) => schema.rules.find((r) => r.ruleId === id);

test("a literal `concurrency` declaration is a concurrency-risk trigger on CI and code files", () => {
  const lit = rule(classification, "concurrency-literal-declaration");
  assert.ok(lit, "concurrency-literal-declaration rule exists");
  assert.ok(lit.match.contentTokens.includes("concurrency"), "triggers on the literal concurrency token");
  assert.ok(lit.match.classificationTagsAny.includes("ci"), "applies to CI workflow files");
  assert.ok(lit.addRiskTags.includes("concurrency"), "adds the concurrency risk tag");
});

test("the quality-N/A rules do not suppress runtime lenses (concurrency, money/locale) for CI files", () => {
  // A `.github/workflows/*.yml` change carries the `ci` tag. CI files legitimately
  // declare `concurrency:` groups and carry cron timezones / locale config, so both
  // runtime-lens N/A rules must exclude `ci` from suppression, not just concurrency.
  for (const id of ["nonruntime-concurrency", "nonruntime-money-locale"]) {
    const na = rule(qualityNa, id);
    assert.ok(na, `${id} rule exists`);
    assert.ok(!na.classificationTagsAny.includes("ci"), `${id}: ci no longer triggers lens suppression`);
    assert.ok((na.classificationTagsNone || []).includes("ci"), `${id}: ci is an explicit exclusion from suppression`);
  }
});

test("runtime-lens N/A rules require the absence of runtime tags (no mixed-tag suppression)", () => {
  // docs/example.ts carries both `documentation` and `source`; concurrency and
  // money/locale must NOT be suppressed for it.
  for (const id of ["nonruntime-concurrency", "nonruntime-money-locale"]) {
    const na = rule(qualityNa, id);
    const none = na.classificationTagsNone || [];
    assert.ok(none.includes("source") && none.includes("application"),
      `${id} excludes source/application so runtime files keep the lens`);
  }
});

test("nonui-artifact keeps the UI lens for real code (a .test.tsx component), suppresses pure non-UI artifacts", () => {
  // A UI test file (.test.tsx) carries source+application+test; suppressing its
  // ui_accessibility_i18n lens would be a false negative. The same mixed-tag guard
  // the other two rules got must exclude application/source here too. But genuinely
  // non-UI artifacts (ci, schema, script, migration) stay suppressible.
  const na = rule(qualityNa, "nonui-artifact");
  const none = na.classificationTagsNone || [];
  assert.ok(none.includes("application") && none.includes("source"),
    "application/source excluded so a .test.tsx UI component keeps the UI lens");
  for (const tag of ["ci", "schema", "script", "migration"]) {
    assert.ok(na.classificationTagsAny.includes(tag), `${tag} (no UI) remains suppressible`);
    assert.ok(!none.includes(tag), `${tag} is not over-excluded from suppression`);
  }
});
