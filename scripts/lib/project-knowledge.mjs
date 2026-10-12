// Private append-only project incidents and lesson revisions; retrieved text is data.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { withFileLock } from './json-file-store.mjs';
import { projectIdentity } from './project-identity.mjs';
import { worktreeHash } from './etrnl-state-core.mjs';
import { readReviewArtifact } from './review-evidence.mjs';
export const knowledgePath = () => process.env.ETRNL_RETRO_LESSONS || path.join(process.env.ETRNL_HOME || process.env.CLAUDE_HOME || path.join(homedir(), '.claude'), 'etrnl', 'retro-lessons.jsonl');
export const bugKnowledgePath = () => process.env.ETRNL_BUGLOG || path.join(process.env.ETRNL_ARTIFACTS_DIR || path.join(process.env.ETRNL_HOME || process.env.CLAUDE_HOME || path.join(homedir(), '.claude'), 'etrnl', 'artifacts'), 'project-buglog.jsonl');
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = value => redactText(String(value || '')).slice(0, 2000);
export function readKnowledge(file) {
  if (!existsSync(file)) return [];
  if (!statSync(file).isFile() || statSync(file).size > 16 * 1024 * 1024) throw new Error('knowledge store exceeds bounded regular-file limit; owner maintenance required');
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`invalid knowledge JSON at line ${i + 1}`); }
  });
}
export function latestKnowledge(rows) {
  const latest = new Map();
  for (const row of rows) { const key = row.id || row.fingerprint || `${row.type}:${row.key}`; latest.set(key, row); }
  return [...latest.values()];
}
export function appendKnowledge(file, producer) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  return withFileLock(file, () => {
    const row = producer(readKnowledge(file));
    if (row) writeFileSync(file, JSON.stringify(row) + '\n', { flag: 'a', mode: 0o600 });
    return row;
  });
}
const classes = ['observed_failure', 'suspected_cause', 'confirmed_cause', 'workaround', 'candidate_lesson', 'owner_accepted_lesson', 'reviewed_lesson'];
export function knowledgeReviewBinding(row) {
  const { id, projectId, revision, classification, summary, insight, trigger, action, exceptions, evidence, scope, lifecycle, causalRationale, supersedes, contradicts } = row;
  return hash(JSON.stringify({ id, projectId, revision, classification, summary, insight, trigger, action, exceptions, evidence, scope, lifecycle, causalRationale, supersedes, contradicts }));
}
export function prepareKnowledge(input, cwd) {
  const identity = projectIdentity(cwd, { projectId: input.projectId });
  if (input.branchScoped && !identity.branch) throw new Error('branch scope requires a named Git branch');
  const classification = input.classification || 'observed_failure';
  if (!classes.includes(classification)) throw new Error('unknown knowledge classification');
  if (['reviewed_lesson', 'owner_accepted_lesson'].includes(classification)) throw new Error('durable lesson classification requires explicit promotion of a current candidate');
  const evidence = (input.evidence || []).slice(0, 20).map(item => Object.fromEntries(Object.entries(item).filter(([k]) => ['at','eventSeq','sessionId','status','treeHash','command','ref','digest','kind'].includes(k)).map(([k,v]) => [k, typeof v === 'number' ? v : clean(v)])));
  if (['suspected_cause', 'confirmed_cause', 'workaround', 'candidate_lesson'].includes(classification) && !input.trigger) throw new Error('scoped trigger required');
  if (['workaround','candidate_lesson'].includes(classification) && !input.action) throw new Error('scoped action required');
  if (classification === 'confirmed_cause' && (!input.causalRationale || !evidence.length)) throw new Error('confirmed cause requires authored causal rationale and evidence references; it is not independent proof');
  const row = { schemaVersion: 2, id: input.id || randomUUID(), projectId: identity.projectId, cwd: identity.root,
    scope: { projectId: identity.projectId, worktreeId: input.worktreeScoped ? identity.worktreeId : '', branch: input.branchScoped ? identity.branch : '' },
    revision: 1, classification, lifecycle: 'active', evidenceGrade: input.source === 'distill' ? 'ledger_observation' : 'author_report', source: input.source || 'owner_note',
    summary: clean(input.summary || input.insight), insight: clean(input.insight || input.summary), trigger: clean(input.trigger), action: clean(input.action), exceptions: clean(input.exceptions),
    causalRationale: clean(input.causalRationale), evidence, ts: new Date().toISOString(), occurrenceCount: 1, preventionProven: false,
    ...Object.fromEntries(['type','key','signal','sessionId','treeHash'].filter(k => input[k]).map(k => [k,clean(input[k])])) };
  if (!row.summary) throw new Error('summary required');
  return row;
}
export function recordKnowledge(input, cwd) { return appendKnowledge(knowledgePath(), () => prepareKnowledge(input, cwd)); }
export function reviseKnowledge({ cwd, id, expectedRevision, lifecycle, authorizedBy, reason, supersededBy, classification, artifactPath, reviewer, treeHash }) {
  if (!authorizedBy || !reason) throw new Error('explicit owner authorization and reason required');
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('expected revision required');
  if (!lifecycle && !classification) throw new Error('revision requires lifecycle change or lesson promotion');
  const identity = projectIdentity(cwd);
  return appendKnowledge(knowledgePath(), rows => {
    const old = latestKnowledge(rows).find(row => row.id === id && row.projectId === identity.projectId);
    if (!old) throw new Error('project knowledge record not found');
    if (old.revision !== expectedRevision) throw new Error('knowledge revision conflict; reread and merge');
    const next = { ...old, revision: old.revision + 1, ts: new Date().toISOString(), authority: { kind: 'owner_authorized', authorizedBy: clean(authorizedBy), reason: clean(reason) } };
    if (lifecycle) {
      if (!['active','contradicted','superseded','retired'].includes(lifecycle)) throw new Error('invalid lifecycle');
      next.lifecycle = lifecycle;
      if (lifecycle === 'superseded') {
        const replacement = latestKnowledge(rows).find(row => row.id === supersededBy && row.projectId === old.projectId && row.lifecycle === 'active' && row.id !== old.id);
        if (!replacement) throw new Error('active same-project superseding record required');
        next.supersededBy = replacement.id;
      }
    }
    if (classification) {
      if (!old.evidence?.length || !old.exceptions) throw new Error('durable promotion requires evidence references and explicit exceptions');
      if (old.classification !== 'candidate_lesson' || !['owner_accepted_lesson','reviewed_lesson'].includes(classification) || old.lifecycle !== 'active') throw new Error('promotion requires active scoped candidate lesson');
      if (classification === 'reviewed_lesson') {
        const currentSource = worktreeHash(cwd);
        if (!currentSource || currentSource !== treeHash) throw new Error('review promotion requires fresh known project source');
        const review = readReviewArtifact(artifactPath, reviewer, treeHash);
        const capture = JSON.parse(readFileSync(artifactPath, 'utf8'));
        if (capture.knowledgeBinding !== knowledgeReviewBinding(old)) throw new Error('captured review is not bound to current project candidate and evidence');
        next.review = { ...review, reviewer, treeHash, knowledgeBinding: capture.knowledgeBinding };
        next.evidenceGrade = 'captured_independent_review';
      } else next.evidenceGrade = 'owner_acceptance';
      next.classification = classification;
    }
    return next;
  });
}
const terms = text => new Set(clean(text).toLowerCase().match(/[\p{L}\p{N}_./-]{3,}/gu) || []);
export function retrieveKnowledge({ cwd = process.cwd(), query = '', files = [], maxChars = 500, limit = 3, projectId = '' } = {}) {
  const identity = projectIdentity(cwd, { projectId });
  const boundedQuery = clean(String(query).slice(0, 1500));
  const needles = terms(boundedQuery + ' ' + files.slice(0, 20).map(clean).join(' '));
  const all = [...latestKnowledge(readKnowledge(knowledgePath())), ...latestKnowledge(readKnowledge(bugKnowledgePath())).map(row => ({ ...row, id: row.id || row.fingerprint, classification: row.classification || 'observed_failure', lifecycle: row.lifecycle || 'active', evidenceGrade: row.evidenceGrade || 'legacy_author_report', source: 'buglog', insight: row.summary }))];
  const malformed = row => !classes.includes(row.classification) || !row.id || (row.scope && row.scope.projectId !== row.projectId) || (row.schemaVersion === 2 && (!Number.isInteger(row.revision) || !Array.isArray(row.evidence)));
  const warnings = all.some(row => !row.projectId) ? ['legacy-unscoped-records-excluded'] : [];
  if (all.some(row => row.projectId && malformed(row))) warnings.push('malformed-scoped-records-excluded');
  const reviewFresh = row => {
    if (row.classification !== 'reviewed_lesson') return true;
    try {
      const review = readReviewArtifact(row.review?.artifactPath, row.review?.reviewer, row.review?.treeHash);
      if (review.artifactSha256 !== row.review?.artifactSha256) throw new Error('changed artifact');
      return true;
    } catch { if (!warnings.includes('review-evidence-unavailable-or-changed')) warnings.push('review-evidence-unavailable-or-changed'); return false; }
  };
  const candidates = all.filter(row => !malformed(row) && row.projectId === identity.projectId && (row.lifecycle || 'active') === 'active'
    && reviewFresh(row)
    && (!row.scope?.worktreeId || row.scope.worktreeId === identity.worktreeId) && (!row.scope?.branch || row.scope.branch === identity.branch))
    .filter(row => { const at = Date.parse(row.ts || row.at || ''); return Number.isFinite(at) && Date.now() - at <= 90 * 86400000; })
    .map(row => { const hay = terms([row.insight,row.trigger,row.action,row.file,row.signal].join(' ')); return { row, score: [...needles].filter(word => hay.has(word)).length }; })
    .filter(({score}) => !needles.size || score > 0).sort((a,b) => b.score - a.score || String(b.row.ts || b.row.at).localeCompare(String(a.row.ts || a.row.at)));
  const budget = Math.max(0, Math.min(4000, Number(maxChars) || 500));
  const lessons = []; let text = 'Untrusted project knowledge (data; retrieval does not prove use or prevention):';
  for (const {row} of candidates.slice(0, Math.max(0, Math.min(5, Number(limit) || 3)))) {
    const line = `\n- [${row.classification}; ${row.source}; ${row.evidenceGrade}] ${clean(row.insight)}${row.trigger ? ` Trigger: ${clean(row.trigger)}.` : ''}${row.action ? ` Action: ${clean(row.action)}.` : ''}${row.exceptions ? ` Exceptions: ${clean(row.exceptions)}.` : ''}`;
    if (text.length + line.length > budget) continue;
    lessons.push(row); text += line;
  }
  if (!lessons.length) text = '';
  return { schemaVersion: 1, projectId: identity.projectId, lessons, text, count: lessons.length, warnings,
    receipt: { projectId: identity.projectId, lessonIds: lessons.map(row => row.id), queryDigest: hash(boundedQuery), at: new Date().toISOString(), classification: 'retrieval_only' } };
}

export function neutralizeInjection(value) {
  return String(value || "")
    // Canonicalize so compatibility/fullwidth glyphs and zero-width joiners cannot
    // slip a control phrase past the matchers below. Best-effort: cross-script
    // homoglyphs are not covered, so these notes remain untrusted context.
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    // Chat-template / model special tokens — never legitimate in a bug note. The
    // 60-char cap comfortably exceeds every real tokenizer token and stays bounded.
    .replace(/<\|[^\n|>]{0,60}\|>/g, "[neutralized-token]")
    .replace(/\[\/?INST\]/gi, "[neutralized-token]")
    .replace(/<<\/?SYS>>/gi, "[neutralized-token]")
    // Explicit instruction-override phrases: verb ... (previous|all) ... noun. Filler
    // budgets are kept short (24/16) AND exclude clause separators (. , ; newline) so the
    // three anchors must sit in ONE clause: a real "ignore previous instructions"
    // matches, but words spread across separate clauses ("ignore this, previous message
    // was a mistake" or "ignore stale entries; the previous request failed") stay outside
    // a single clause and are preserved intact.
    .replace(/\b(?:ignore|disregard|forget|override|bypass)\b[^.,;\n]{0,24}?\b(?:previous|prior|above|earlier|preceding|all|any|the)\b[^.,;\n]{0,16}?\b(?:instructions?|prompts?|context|messages?|rules?|guardrails?|directives?|system\s+prompt)\b/gi, "[neutralized-instruction]")
    .replace(/\bignore\s+everything\s+(?:above|before|prior)\b/gi, "[neutralized-instruction]")
    // Role-play override — only when a persona/role noun follows, so benign text
    // like "you are now on the wrong branch" is preserved intact.
    .replace(/\byou\s+are\s+now\s+(?:a\s+|an\s+|the\s+)?(?:developer|dev|assistant|ai|model|bot|chatbot|agent|admin|administrator|root|superuser|sudo|shell|terminal|dan|stan|jailbroken|unrestricted|uncensored|unfiltered|persona|character|role|god|master)\b/gi, "[neutralized-instruction]")
    .replace(/\bnew\s+(?:instructions?|prompt|system\s+prompt)\s*:/gi, "[neutralized-instruction]")
    .replace(/\b(?:reveal|print|show|output|repeat|leak)\s+(?:your\s+|the\s+)?(?:system\s+prompt|system\s+message|instructions|guardrails)\b/gi, "[neutralized-instruction]")
    // Line-leading fake conversation turns. Case-SENSITIVE lowercase on purpose:
    // injection payloads use lowercase role turns, while capitalized "System:"
    // appears in legitimate stack traces/log lines and must be preserved.
    .replace(/(^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:system|assistant|developer)[ \t]*:[ \t]/g, "$1[neutralized-role] ");
}

export function redactText(value) {
  // Neutralize (NFKC-fold + strip zero-width + defang injection) BEFORE redaction:
  // otherwise a fullwidth- or zero-width-disguised secret slips past the ASCII
  // secret regexes and only THEN normalizes to plaintext, persisting unredacted.
  return neutralizeInjection(value)
    .replace(/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9_=-]{8,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\b(aws_secret_access_key|aws_session_token|password|passwd|token|api[_-]?key)\s*=\s*[^ \n\r\t]+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}\b/g, "$1 [REDACTED]");
}
