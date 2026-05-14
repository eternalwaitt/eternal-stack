#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { REQUIRED_PLAN_HEADINGS } from './lib/plan-headings.mjs';

const args = process.argv.slice(2);
const allowDraft = args.includes('--allow-draft');
const json = args.includes('--json');
const explain = args.includes('--explain');
const nonFlagArgs = args.filter((arg) => !arg.startsWith('--'));
const planPath = nonFlagArgs[0];

if (!planPath) {
  console.error('usage: plan-readiness-check.mjs <single-plan.md> [--allow-draft] [--json]');
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

function requirePattern(name, pattern, message) {
  if (!pattern.test(text)) {
    failures.push({ name, message });
    repairHints.push(repairHintFor(name, message));
  }
}

function forbidPattern(name, pattern, message) {
  if (pattern.test(text)) {
    failures.push({ name, message });
  }
}

function normalizeHeadingKey(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function repairHintFor(name, message) {
  const section = normalizedSectionHeadings.find((item) => item.normalizedKey === name);
  if (section) {
    return `Add section: ## ${section.heading}`;
  }
  const hintMap = {
    status: allowDraft ? 'Add top metadata: Status: Draft or Status: Final' : 'Add top metadata: Status: Final',
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
  };
  return hintMap[name] ?? `Fix: ${message}`;
}

function requireStatusHeading(allowDraftMode) {
  if (allowDraftMode) {
    requirePattern('status', /^Status:\s*(Draft|Final)\b/im, 'plan must declare Status: Draft or Status: Final');
    return;
  }
  requirePattern('status', /^Status:\s*Final\b/im, 'final plans must declare Status: Final');
}

requireStatusHeading(allowDraft);

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

const readinessChecks = [
  ['scope_challenge', /Scope Challenge/im, 'readiness report must cover Scope Challenge'],
  ['architecture_review', /Architecture Review/im, 'readiness report must cover Architecture Review'],
  ['code_quality_review', /Code Quality Review/im, 'readiness report must cover Code Quality Review'],
  ['test_review', /Test Review/im, 'readiness report must cover Test Review'],
  ['performance_review', /Performance Review/im, 'readiness report must cover Performance Review'],
  ['readiness_failure_modes_bullet', /^-\s*Failure modes:/im, 'readiness report must cover Failure modes'],
  ['parallelization_review', /Parallelization/im, 'readiness report must cover Parallelization'],
];

for (const [name, pattern, message] of readinessChecks) {
  requirePattern(name, pattern, message);
}

const optionalMetadata = {
  phase: /^Phase:\s*\S/im.test(text) || /^##\s+Phase\b/im.test(text),
  workstream: /^Workstream:\s*\S/im.test(text) || /^##\s+Workstream\b/im.test(text),
  uatGate: /^UAT Gate:\s*\S/im.test(text) || /^##\s+UAT Gate\b/im.test(text),
};

forbidPattern('tbd', /\bTBD\b/i, 'plan still contains TBD');
// Word boundaries prevent matching TODO inside "TODOS.md".
forbidPattern('todo', /\bTODO\b/i, 'plan still contains TODO');
forbidPattern('handle_edge_cases', /handle edge cases/i, 'replace vague "handle edge cases" with concrete cases');
forbidPattern('wire_it_up', /wire it up/i, 'replace vague "wire it up" with concrete integration steps');
forbidPattern('similar_to_above', /similar to above/i, 'replace "similar to above" with explicit steps');

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, repairHints, optionalMetadata }, null, 2));
} else if (failures.length === 0) {
  console.log(`ok: plan readiness passed for ${planPath}`);
} else {
  console.error(`fail: plan readiness failed for ${planPath}`);
  for (const failure of failures) {
    console.error(`- ${failure.message}`);
  }
  if (explain && repairHints.length > 0) {
    console.error('Repair hints:');
    for (const hint of repairHints) {
      console.error(`- ${hint}`);
    }
  }
}

process.exit(failures.length === 0 ? 0 : 1);
