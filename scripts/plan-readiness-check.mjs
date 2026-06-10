#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validateDeepStackPlanText } from './lib/deep-stack-artifacts.mjs';
import { REQUIRED_PLAN_HEADINGS } from './lib/plan-headings.mjs';

const args = process.argv.slice(2);
const allowDraft = args.includes('--allow-draft');
const allowTransitionalDeepStack = args.includes('--allow-transitional-deep-stack');
const json = args.includes('--json');
const explain = args.includes('--explain');
const nonFlagArgs = args.filter((arg) => !arg.startsWith('--'));
const planPath = nonFlagArgs[0];

if (!planPath) {
  console.error('usage: plan-readiness-check.mjs <single-plan.md> [--allow-draft] [--allow-transitional-deep-stack] [--json]');
  process.exit(2);
}
if (nonFlagArgs.length > 1) {
  console.error('error: multiple plan paths provided; expected exactly one');
  process.exit(2);
}

let text = '';
try {
  text = readFileSync(planPath, 'utf8');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`failed to read plan: ${message}`);
  process.exit(2);
}

const failures = [];
const repairHints = [];
let normalizedSectionHeadings = [];
const largeFinalPlanCharLimit = Number.parseInt(process.env.CLAUDE_PLAN_READINESS_MAX_CHARS ?? '120000', 10);

function requirePattern(name, pattern, message) {
  if (!pattern.test(text)) {
    failures.push({ name, message });
    repairHints.push(repairHintFor(name, message));
  }
}

function forbidPattern(name, pattern, message) {
  if (pattern.test(text)) {
    failures.push({ name, message });
    repairHints.push(repairHintFor(name, message));
  }
}

function addFailure(name, message) {
  failures.push({ name, message });
  repairHints.push(repairHintFor(name, message));
}

function normalizeHeadingKey(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function sectionBody(heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^##\\s+${escaped}\\b[^\n]*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im'));
  return match ? match[1] : '';
}

function repairHintFor(name, message) {
  const section = normalizedSectionHeadings.find((item) => item.normalizedKey === name);
  if (section) {
    return `Add section: ## ${section.heading}`;
  }
  const hintMap = {
    status: allowDraft ? 'Add top metadata: Status: Draft or Status: Final' : 'Add top metadata: Status: Final',
    execution_scope:
      'Add top metadata: Execution scope: all_phases, first_patch_only, or an explicit subset.',
    goal: 'Add top metadata: Goal: one concrete outcome.',
    evidence: 'Add top metadata: Evidence: exact files, logs, sessions, or commands read.',
    non_goals: 'Add top metadata: Non-goals: explicit excluded work.',
    scope_challenge: 'In ## Plan Readiness Report, add "- Scope Challenge: ..."',
    architecture_review: 'In ## Plan Readiness Report, add "- Architecture Review: ..."',
    code_quality_review: 'In ## Plan Readiness Report, add "- Code Quality Review: ..."',
    test_review: 'In ## Plan Readiness Report, add "- Test Review: ..."',
    performance_review: 'In ## Plan Readiness Report, add "- Performance Review: ..."',
    readiness_failure_modes_bullet: 'In ## Plan Readiness Report, add "- Failure modes: ..."',
    parallelization_review: 'In ## Plan Readiness Report, add "- Parallelization: ..."',
    immediate_first_patch:
      'Rename "Immediate First Patch" to an explicit phase, or set Execution scope: first_patch_only if the plan is intentionally partial.',
    plan_too_large:
      'Add ## Execution Digest or ## Plan Index with chunk/subplan boundaries, then move oversized detail into referenced artifacts.',
    task_groups_executable:
      'In ## Task groups, add owner, dependencies, acceptance criteria, and verification fields for executable handoff.',
    test_first_red_green:
      'In ## Test-first execution plan, add Red and Green rows or a concrete not-applicable rationale.',
    verification_commands:
      'In ## Verification gates, add exact commands or live checks with expected results.',
  };
  return hintMap[name] ?? `Fix: ${message}`;
}

function requireSectionPattern(sectionName, failureName, pattern, message) {
  if (!pattern.test(sectionBody(sectionName))) {
    addFailure(failureName, message);
  }
}

function taskGroupBodies() {
  const body = sectionBody('Task groups').trim();
  if (!body) return [];
  const groups = [...body.matchAll(/^###\s+[\s\S]*?(?=^###\s+|(?![\s\S]))/gm)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  return groups.length > 0 ? groups : [body];
}

function requireExecutableTaskGroups() {
  const executableTaskGroupPattern =
    /\bOwner:\s*\S[\s\S]*\bDependencies:\s*\S[\s\S]*\bAcceptance(?: criteria)?:\s*\S[\s\S]*\bVerification:\s*\S/i;
  const groups = taskGroupBodies();
  if (groups.length === 0 || groups.some((group) => !executableTaskGroupPattern.test(group))) {
    addFailure(
      'task_groups_executable',
      'Task groups must include owner, dependencies, acceptance criteria, and verification fields.',
    );
  }
}

function requireTestFirstPlan() {
  const body = sectionBody('Test-first execution plan');
  const hasRedGreen = /\bRed:\s*\S[\s\S]*\bGreen:\s*\S/i.test(body);
  const hasRationale = /\b(Not[- ]applicable|Rationale|Because|Cannot|Docs[- ]only|Fixture[- ]only|No source):?\s+\S/i.test(body);
  if (!hasRedGreen && !hasRationale) {
    addFailure(
      'test_first_red_green',
      'Test-first execution plan must include Red and Green rows or a concrete not-applicable rationale.',
    );
  }
}

function requireStatusHeading(allowDraftMode) {
  if (allowDraftMode) {
    requirePattern('status', /^Status:\s*(Draft|Final)\b/im, 'plan must declare Status: Draft or Status: Final');
    return;
  }
  requirePattern('status', /^Status:\s*Final\b/im, 'final plans must declare Status: Final');
}

requireStatusHeading(allowDraft);
requirePattern('execution_scope', /^Execution scope:\s*\S/im, 'missing Execution scope');

const sectionHeadings = REQUIRED_PLAN_HEADINGS
  .filter((heading) => heading.startsWith('## '))
  .map((heading) => heading.replace(/^##\s+/, ''));
normalizedSectionHeadings = sectionHeadings.map((heading) => ({
  heading,
  normalizedKey: normalizeHeadingKey(heading),
}));
const headingKeyMap = new Map();
for (const section of normalizedSectionHeadings) {
  const existing = headingKeyMap.get(section.normalizedKey) ?? [];
  existing.push(section.heading);
  headingKeyMap.set(section.normalizedKey, existing);
}
const duplicateSectionKeys = [...headingKeyMap.entries()].filter(([, headings]) => headings.length > 1);
if (duplicateSectionKeys.length > 0) {
  const formatted = duplicateSectionKeys.map(([key, headings]) => `${key}: ${headings.join(', ')}`).join('; ');
  console.error(
    `plan-readiness-check configuration error in REQUIRED_PLAN_HEADINGS: duplicate normalized section keys (${formatted})`,
  );
  process.exit(2);
}

const requiredSections = [
  ['goal', /^Goal:\s*\S/im, 'missing Goal'],
  ['evidence', /^Evidence:\s*\S/im, 'missing Evidence'],
  ['non_goals', /^Non-goals:\s*\S/im, 'missing Non-goals'],
  ...normalizedSectionHeadings.map(({ heading, normalizedKey }) => {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [normalizedKey, new RegExp(`^##\\s+${escaped}\\b`, 'im'), `missing ${heading} section`];
  }),
];

for (const [name, pattern, message] of requiredSections) {
  requirePattern(name, pattern, message);
}

const isFinal = /^Status:\s*Final\b/im.test(text);
const executionScope = text.match(/^Execution scope:\s*(.+)$/im)?.[1]?.trim() ?? '';
const firstPatchOnly = /\b(first_patch_only|first patch only|first-patch-only)\b/i.test(executionScope);
const hasImmediateFirstPatchHeading = /^##\s+Immediate First Patch\b/im.test(text);
const validExecutionScope =
  /^(all_phases|first_patch_only|phase_[a-z0-9_.-]+(?:_phase_[a-z0-9_.-]+)*_only)$/i.test(executionScope)
  || /^phase_[a-z0-9_.-]+(?:_phase_[a-z0-9_.-]+)*$/i.test(executionScope);

if (executionScope && !validExecutionScope) {
  addFailure(
    'execution_scope',
    'Execution scope must be all_phases, first_patch_only, or an explicit phase subset such as phase_1_phase_2_only.',
  );
}

if (isFinal && hasImmediateFirstPatchHeading && !firstPatchOnly) {
  addFailure(
    'immediate_first_patch',
    'Final plans must not contain "## Immediate First Patch" unless Execution scope is first_patch_only.',
  );
}

const hasLargePlanDigest =
  /^##\s+(Execution Digest|Plan Index|Chunk Index|Subplan Index)\b/im.test(text)
  || /^Plan index:\s*\S/im.test(text);
if (
  isFinal
  && Number.isFinite(largeFinalPlanCharLimit)
  && largeFinalPlanCharLimit > 0
  && text.length > largeFinalPlanCharLimit
  && !hasLargePlanDigest
) {
  addFailure(
    'plan_too_large',
    `Final plan is ${text.length} characters, above the ${largeFinalPlanCharLimit} character Eternal Stack limit, without an Execution Digest or Plan Index.`,
  );
}

const readinessReport = sectionBody('Plan Readiness Report');
const readinessChecks = [
  ['scope_challenge', /^-\s*Scope Challenge:\s*\S/im, 'readiness report must cover Scope Challenge'],
  ['architecture_review', /^-\s*Architecture Review:\s*\S/im, 'readiness report must cover Architecture Review'],
  ['code_quality_review', /^-\s*Code Quality Review:\s*\S/im, 'readiness report must cover Code Quality Review'],
  ['test_review', /^-\s*Test Review:\s*\S/im, 'readiness report must cover Test Review'],
  ['performance_review', /^-\s*Performance Review:\s*\S/im, 'readiness report must cover Performance Review'],
  ['readiness_failure_modes_bullet', /^-\s*Failure modes:\s*\S/im, 'readiness report must cover Failure modes'],
  ['parallelization_review', /^-\s*Parallelization:\s*\S/im, 'readiness report must cover Parallelization'],
];

for (const [name, pattern, message] of readinessChecks) {
  if (!pattern.test(readinessReport)) {
    addFailure(name, message);
  }
}

if (isFinal) {
  requireExecutableTaskGroups();
  requireTestFirstPlan();
  requireSectionPattern(
    'Verification gates',
    'verification_commands',
    /(`[^`]+`|^\s*-\s*(?:node|npm|pnpm|yarn|bun|bash|sh|scripts\/|\.\/scripts\/|curl|gh|git)\b)/im,
    'Verification gates must include exact commands or live checks.',
  );
}

const optionalMetadata = {
  phase: /^Phase:\s*\S/im.test(text) || /^##\s+Phase\b/im.test(text),
  workstream: /^Workstream:\s*\S/im.test(text) || /^##\s+Workstream\b/im.test(text),
  uatGate: /^UAT Gate:\s*\S/im.test(text) || /^##\s+UAT Gate\b/im.test(text),
  deepStackArtifacts: /^Deep stack artifacts:\s*\S/im.test(text),
};

forbidPattern('tbd', /\bTBD\b/i, 'plan still contains TBD');
// Word boundaries prevent matching TODO inside "TODOS.md".
forbidPattern('todo', /\bTODO\b/i, 'plan still contains TODO');
forbidPattern('handle_edge_cases', /handle edge cases/i, 'replace vague "handle edge cases" with concrete cases');
forbidPattern('wire_it_up', /wire it up/i, 'replace vague "wire it up" with concrete integration steps');
forbidPattern('similar_to_above', /similar to above/i, 'replace "similar to above" with explicit steps');

let deepStackResult;
try {
  deepStackResult = validateDeepStackPlanText(text, {
    planPath,
    requireDeepStack: isFinal && !allowDraft && !allowTransitionalDeepStack,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`failed to validate deep-stack artifacts: ${message}`);
  process.exit(2);
}
if (!deepStackResult.ok) {
  for (const deepStackError of deepStackResult.errors) {
    addFailure(deepStackError.code, `${deepStackError.whyItMatters} ${deepStackError.exactFix}`);
  }
}

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, executionScope, failures, repairHints, optionalMetadata, deepStack: deepStackResult }, null, 2));
} else if (failures.length === 0) {
  console.log(`ok: plan readiness passed for ${planPath}`);
} else {
  console.error(`fail: plan readiness failed for ${planPath}`);
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.message}`);
  }
  if (explain && repairHints.length > 0) {
    console.error('Repair hints:');
    for (const hint of repairHints) {
      console.error(`- ${hint}`);
    }
  }
}

process.exit(failures.length === 0 ? 0 : 1);
