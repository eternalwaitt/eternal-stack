// Clean CodeRabbit finding classifier — keyword maps lifted verbatim from the
// mined coderabbit-review-parser, WITHOUT the receipt/hash/ledger machinery.
// Pure functions over finding text; no crypto, no I/O.

export function findingKind(summary = "", body = "", severity = "") {
  const title = String(summary).toLowerCase();
  const text = `${summary} ${body}`.toLowerCase();
  if (/^(good|correctly|solid|well done|looks good)\b/.test(title) && !/\b(but|however|missing|incorrect|broken|fails?)\b/.test(title)) return "praise";
  // Strong defect signals outrank a bare mention of "test": a security/data-loss
  // bug that merely notes missing coverage is a defect to fix, not a test-template
  // candidate. Weaker signals (missing/does not/fail) stay below test_gap so a
  // plain "missing test coverage" finding still routes to a test template.
  if (/\bbugs?\b|incorrect|wrong|\braces?\b|security|overwrite|leak|lost update/.test(text)) return "defect";
  if (/\btest(?:s|ing)?\b|coverage|regression|assert|fixture/.test(text)) return "test_gap";
  if (/path instruction|convention|hardcod|stale comment|duplicate|unused|naming/.test(text)) return "convention_gap";
  if (/missing|does not|fail/.test(text)) return "defect";
  if (/consider|could|suggest|advisory/.test(text) || /trivial|minor|quick win|low value/i.test(severity)) return "advisory";
  return "defect";
}

const SEVERITY = Object.freeze({
  blocker: "blocker", critical: "critical", p0: "blocker", p1: "high", p2: "medium", p3: "low",
  major: "high", minor: "medium", warning: "medium", medium: "medium", high: "high",
  trivial: "low", low: "low", info: "low", nitpick: "nit", nit: "nit", nice_to_have: "nice_to_have",
  quick_win: "low", low_value: "low", unclassified: "low", unknown: "low",
});

export function normalizeSeverity(raw = "") {
  return SEVERITY[String(raw).toLowerCase().trim()] || "low";
}

// Where the preemption for this finding class should live.
export function controlType(kind) {
  if (kind === "test_gap") return "test_template";
  if (kind === "convention_gap") return "deterministic_guard";
  return "review_rubric"; // defect + advisory need a review lens, not a linter
}

// Known deterministic-rule templates a recurring finding can auto-enable.
const TEMPLATE_TRIGGERS = Object.freeze([
  { match: /\bas any\b|`as any`|unsafe.*type|type[- ]escape/i, ruleId: "no-expect-any" },
  { match: /\.only\(|focused test|it\.only|describe\.only|test\.only/i, ruleId: "no-focused-tests" },
  { match: /\.skip\(|skipped test|it\.skip|describe\.skip|test\.skip|\bxit\b|\bxdescribe\b|\bxtest\b/i, ruleId: "no-skipped-test" },
  { match: /empty catch|swallow(?:ed|s|ing)? (?:the )?error|silent(?:ly)? (?:fail|catch|swallow)|catch\s*\([^)]*\)\s*\{\s*\}/i, ruleId: "no-empty-catch" },
  { match: /redirect\(\)[^.]*\b(?:try|catch)\b|\b(?:try|catch)\b[^.]*redirect\(\)|notFound\(\)[^.]*catch|redirect[^.]*swallow|next\.?js redirect/i, ruleId: "nextjs-no-redirect-in-try-catch" },
]);

export function matchTemplateRule(summary = "", body = "") {
  const text = `${summary} ${body}`;
  for (const t of TEMPLATE_TRIGGERS) if (t.match.test(text)) return t.ruleId;
  return null;
}

// Stable, hash-free recurrence key: control + lens + normalized category token.
export function recurrenceKey(finding, kind) {
  const control = controlType(kind);
  const lens = finding.lensId || "unspecified";
  const cat = String(finding.category || kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${control}:${lens}:${cat}`;
}

export function classify(finding) {
  const kind = findingKind(finding.summary || finding.title || "", finding.body || "", finding.severity || "");
  return {
    kind,
    control: controlType(kind),
    severity: normalizeSeverity(finding.severity || ""),
    templateRuleId: matchTemplateRule(finding.summary || finding.title || "", finding.body || ""),
    key: recurrenceKey(finding, kind),
  };
}
