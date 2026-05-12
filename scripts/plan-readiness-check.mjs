#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { REQUIRED_PLAN_HEADINGS } from './lib/plan-headings.mjs';

const args = process.argv.slice(2);
const allowDraft = args.includes('--allow-draft');
const json = args.includes('--json');
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

function requirePattern(name, pattern, message) {
  if (!pattern.test(text)) {
    failures.push({ name, message });
  }
}

function forbidPattern(name, pattern, message) {
  if (pattern.test(text)) {
    failures.push({ name, message });
  }
}

if (allowDraft) {
  requirePattern('status', /^Status:\s*(Draft|Final)\b/im, 'plan must declare Status: Draft or Status: Final');
} else {
  requirePattern('status', /^Status:\s*Final\b/im, 'final plans must declare Status: Final');
}

const sectionHeadings = REQUIRED_PLAN_HEADINGS
  .filter((heading) => heading.startsWith('## '))
  .map((heading) => heading.replace(/^##\s+/, ''));

const requiredSections = [
  ['goal', /^Goal:\s*\S/im, 'missing Goal'],
  ['evidence', /^Evidence:\s*\S/im, 'missing Evidence'],
  ['non_goals', /^Non-goals:\s*\S/im, 'missing Non-goals'],
  ...sectionHeadings.map((heading) => {
    const key = heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [key, new RegExp(`^##\\s+${escaped}\\b`, 'im'), `missing ${heading} section`];
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
  ['verdict', /^-?\s*Verdict:\s*\S/im, 'readiness report must include a Verdict'],
];

for (const [name, pattern, message] of readinessChecks) {
  requirePattern(name, pattern, message);
}

forbidPattern('tbd', /\bTBD\b/i, 'plan still contains TBD');
// Word boundaries prevent matching TODO inside "TODOS.md".
forbidPattern('todo', /\bTODO\b/i, 'plan still contains TODO');
forbidPattern('handle_edge_cases', /handle edge cases/i, 'replace vague "handle edge cases" with concrete cases');
forbidPattern('wire_it_up', /wire it up/i, 'replace vague "wire it up" with concrete integration steps');
forbidPattern('similar_to_above', /similar to above/i, 'replace "similar to above" with explicit steps');

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
} else if (failures.length === 0) {
  console.log(`ok: plan readiness passed for ${planPath}`);
} else {
  console.error(`fail: plan readiness failed for ${planPath}`);
  for (const failure of failures) {
    console.error(`- ${failure.message}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
