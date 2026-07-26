/**
 * Plan risk-tier parsing, auto-escalation, and scope-freeze helpers.
 * Tier definitions are owned by skills/etrnl-dev-execute/SKILL.md (Startup step 6).
 */

export const RISK_TIER_DEFINITIONS = [
  "Tier 0: docs/no-source/tiny change, local verification only.",
  "Tier 1: one small source surface, normal tests plus completion check.",
  "Tier 2: multi-file/source workflow, spec reviewer, quality reviewer, simplifier, completion audit.",
  "Tier 3: hooks, installed-home changes, auth, money, security, migrations, data loss risk, or broad Eternal Stack behavior; full deep stack plus staged install and rollback proof.",
];

// Tier 3 has two independent causes, and only one of them owes install proof:
// an install surface can be staged, doctored, and rolled back, while high-risk
// domain work has no install to stage.
const INSTALL_SURFACE_PATTERNS = [
  /\bhooks\//i,
  /\bscripts\/install[^/\s]*\.sh\b/i,
  /\bscripts\/update\.sh\b/i,
];

const HIGH_RISK_DOMAIN_PATTERNS = [
  /\bauth\b/i,
  /\bpayment\b/i,
  /\bmoney\b/i,
  /\bmigration\b/i,
  /\btenant\b/i,
];

const AUTO_ESCALATE_TIER3_PATTERNS = [...INSTALL_SURFACE_PATTERNS, ...HIGH_RISK_DOMAIN_PATTERNS];

const SCOPE_DRIFT_KEYWORDS = [
  { label: "receipt store", pattern: /\breceipt store\b/i, goalWord: "receipt" },
  { label: "receipts", pattern: /\breceipts\b/i, goalWord: "receipt" },
  { label: "provenance", pattern: /\bprovenance\b/i, goalWord: "provenance" },
  { label: "registry", pattern: /\bregistry\b/i, goalWord: "registry" },
  { label: "framework", pattern: /\bframework\b/i, goalWord: "framework" },
  { label: "subsystem", pattern: /\bsubsystem\b/i, goalWord: "subsystem" },
  { label: "ledger", pattern: /\bledger\b/i, goalWord: "ledger" },
];

const EXISTING_SURFACE_ALLOWLIST = [
  "execution-ledger",
  "execution-ledger.mjs",
  "scripts/execution-ledger.mjs",
  "review-log",
  "review-log.jsonl",
  "state log",
  "state-log",
  "etrnl-state",
  "etrnl-state-core",
];

const TIER_01_SECTION_HEADINGS = [
  "File map",
  "Task groups",
  "Verification gates",
  "Rollback",
  "Readiness checklist",
];

const TIER_23_SECTION_HEADINGS = [
  "What already exists",
  "NOT in scope",
  "File map",
  "Task groups",
  "Phases",
  "Skill/tool routing",
  "Test plan",
  "Test-first execution plan",
  "Failure modes",
  "Parallelization strategy",
  "Verification gates",
  "Rollback",
  "Execution handoff",
  "Plan Readiness Report",
  "Verdict",
];

export function parseRiskTier(planText) {
  const lineMatch = planText.match(/^Risk tier:\s*([0-3])\b(?:\s*[—–-]\s*(.+))?$/im);
  if (!lineMatch) {
    const nextLineMatch = planText.match(/^Risk tier:\s*([0-3])\b[^\n]*\n\s*(.+)$/im);
    if (nextLineMatch) {
      return {
        tier: Number.parseInt(nextLineMatch[1], 10),
        missing: false,
        justification: nextLineMatch[2].trim(),
      };
    }
    return { tier: 3, missing: true, justification: "" };
  }
  return {
    tier: Number.parseInt(lineMatch[1], 10),
    missing: false,
    justification: (lineMatch[2] ?? "").trim(),
  };
}

export function sectionBody(planText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = planText.match(new RegExp(`^##\\s+${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"));
  return match ? match[1] : "";
}

export function collectPlanFilePaths(planText) {
  const paths = new Set();
  const addPath = (raw) => {
    const cleaned = raw.replace(/^[`'"]+|[`'"]+$/g, "").trim();
    if (!cleaned || cleaned.includes(" ")) return;
    if (/^(create|modify|read|new|delete)$/i.test(cleaned)) return;
    paths.add(cleaned);
  };

  for (const row of sectionBody(planText, "File map").split("\n")) {
    const pipeCells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (pipeCells.length >= 2) {
      addPath(pipeCells[0].replace(/^`|`$/g, ""));
      continue;
    }
    const listMatch = row.match(/^[-*]\s+(`[^`]+`|\S+)/);
    if (listMatch) addPath(listMatch[1]);
  }

  for (const row of sectionBody(planText, "Task groups").split("\n")) {
    for (const match of row.matchAll(/`([^`]+)`|\b((?:hooks|scripts|skills|docs|tests)\/[^\s`,;]+)/g)) {
      addPath(match[1] ?? match[2]);
    }
  }

  return [...paths];
}

function planTier3Haystack(planText) {
  const filePaths = collectPlanFilePaths(planText);
  const goalMatch = planText.match(/^Goal:\s*(.+)$/im);
  return [
    filePaths.join("\n"),
    goalMatch?.[1] ?? "",
    sectionBody(planText, "Task groups"),
    sectionBody(planText, "Phases"),
    parseRiskTier(planText).justification,
  ].join("\n");
}

export function requiresTier3Escalation(planText) {
  const haystack = Array.isArray(planText) ? planText.join("\n") : planTier3Haystack(planText);
  return AUTO_ESCALATE_TIER3_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Reports whether a plan changes an installable surface, which decides whether
 * a tier-3 plan owes staged-install and rollback proof at all.
 */
export function planTouchesInstallSurface(planText) {
  const haystack = Array.isArray(planText) ? planText.join("\n") : planTier3Haystack(planText);
  return INSTALL_SURFACE_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function requiresTier2Escalation(filePaths) {
  return filePaths.length > 8;
}

export function validateRiskTierEscalation(planText, declaredTier) {
  const failures = [];
  const filePaths = collectPlanFilePaths(planText);

  if (requiresTier3Escalation(planText) && declaredTier < 3) {
    failures.push({
      name: "RISK_TIER_UNDER_CLASSIFIED_TIER3",
      message:
        "Plan touches hooks, installers, auth, money, migrations, or tenant surfaces but Risk tier is below 3. Auto-escalate to tier 3.",
    });
  }

  if (requiresTier2Escalation(filePaths) && declaredTier < 2) {
    failures.push({
      name: "RISK_TIER_UNDER_CLASSIFIED_TIER2",
      message:
        "Plan file map or task groups name more than 8 distinct repo paths but Risk tier is below 2. Auto-escalate to tier 2 or higher.",
    });
  }

  return failures;
}

function stripAllowlistedSurfaces(text) {
  let result = text;
  for (const surface of EXISTING_SURFACE_ALLOWLIST) {
    result = result.replace(new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  return result;
}

function goalContainsGoalWord(goal, goalWord) {
  if (!goalWord) return false;
  return new RegExp(`\\b${goalWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(goal);
}

function findScopeDriftKeyword(text, goal) {
  const scrubbed = stripAllowlistedSurfaces(text);
  for (const keyword of SCOPE_DRIFT_KEYWORDS) {
    if (goalContainsGoalWord(goal, keyword.goalWord)) continue;
    if (keyword.pattern.test(scrubbed)) {
      return keyword.label;
    }
  }
  return "";
}

function taskGroupSections(planText) {
  const body = sectionBody(planText, "Task groups").trim();
  if (!body) return [];
  const groups = [...body.matchAll(/^###\s+[\s\S]*?(?=^###\s+|(?![\s\S]))/gm)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  return groups.length > 0 ? groups : [body];
}

function taskGroupHeadingLines(planText) {
  return taskGroupSections(planText)
    .map((group) => group.split("\n")[0] ?? "")
    .filter(Boolean);
}

function fileMapCreateRows(planText) {
  const rows = [];
  for (const line of sectionBody(planText, "File map").split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const change = cells[1].toLowerCase();
    if (!/\b(create|new)\b/.test(change)) continue;
    rows.push({ path: cells[0], change: cells[1], row: line });
  }
  return rows;
}

export function validatePlanScopeFreeze(planText) {
  const errors = [];
  const goal = planText.match(/^Goal:\s*(.+)$/im)?.[1]?.trim() ?? "";

  for (const heading of taskGroupHeadingLines(planText)) {
    const keyword = findScopeDriftKeyword(heading, goal);
    if (keyword) {
      errors.push({
        code: "SCOPE_DRIFT_SUBSYSTEM",
        whyItMatters: `Task group introduces "${keyword}" scope not named in Goal.`,
        exactFix:
          "Record the finding as a checklist line or single guard instead, or add the subsystem to Goal with user approval.",
      });
      break;
    }
  }

  for (const row of fileMapCreateRows(planText)) {
    const keyword = findScopeDriftKeyword(`${row.path} ${row.change}`, goal);
    if (keyword) {
      errors.push({
        code: "SCOPE_DRIFT_SUBSYSTEM",
        whyItMatters: `File map create row introduces "${keyword}" scope not named in Goal (${row.path}).`,
        exactFix:
          "Record the finding as a checklist line or single guard instead, or add the subsystem to Goal with user approval.",
      });
      break;
    }
  }

  return errors;
}

export function requiredSectionHeadingsForTier(tier) {
  return tier <= 1 ? TIER_01_SECTION_HEADINGS : TIER_23_SECTION_HEADINGS;
}

export function requiresDeepStackArtifacts(tier) {
  return tier >= 2;
}
