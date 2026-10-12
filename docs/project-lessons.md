# Project incidents and lessons

Project knowledge is advisory data. It cannot override the user, canonical [workflow contract](../scripts/lib/workflow-contract.mjs), permissions or fresh source evidence. Core retrieves through normal helper use; registered optional host adapters can deliver bounded context before covered decisions. A delivery receipt proves retrieval, not comprehension, correct action or fewer mistakes.

Private incident records remain in existing retro/buglog JSONL stores. No live home migration occurs. Share only sanitized, explicitly accepted lessons in the authored overview or a tracked project document; exclude raw transcripts, credentials and private memories. A tracked public lesson should retain its project/applicability, trigger, action, exceptions, evidence references, acceptance attribution and review date. Public export remains an explicit author operation, not an automatic ingestion write.

## Status and evidence

| Classification | Meaning |
| --- | --- |
| `observed_failure` | Recorded failure or outcome change; no inferred cause/remedy |
| `suspected_cause` | Scoped author hypothesis, distinct from observed facts |
| `confirmed_cause` | Author causal rationale plus evidence references; does not assert independent review |
| `workaround` | Scoped action that may avoid a symptom; not proof of root cause |
| `candidate_lesson` | Proposed trigger/action with scope and exceptions; not durable acceptance |
| `owner_accepted_lesson` | Explicit owner-authorized acceptance with evidence and exceptions |
| `reviewed_lesson` | Current candidate bound to independently captured successful host review |

Repeated occurrences count recorded observations. They do not increase synthetic confidence or establish that a proposed prevention works. Fail/pass commands retain both source hashes and are `check_outcome_change` observations. Repeated verification and compaction coincidences do not justify skipping gates or claiming compaction caused a failure. Guard/test recommendations remain candidates until a reproduced mechanism, scoped fixture and appropriate review support them; these helpers never install guessed guards.

## Helper operations

Run through the companion's helper interface where installed. Source examples use the repository script:

```sh
node scripts/etrnl-retro.mjs record --cwd PROJECT --summary 'Duplicate retry observed' --json
node scripts/etrnl-retro.mjs record --cwd PROJECT --classification candidate_lesson \
  --summary 'Check receipt before repeating billing effect' --trigger 'Billing webhook retry' \
  --action 'Read persisted idempotency receipt before effect' --exceptions 'Read-only queries' \
  --evidence '[{"ref":"tests/retry-regression","digest":"SOURCE_EVIDENCE_DIGEST"}]' --json
node scripts/etrnl-retro.mjs retrieve --cwd PROJECT --query 'billing webhook retry' --max-chars 500 --json
node scripts/etrnl-retro.mjs review-packet --cwd PROJECT --id RECORD_ID --json
```

Use `--classification suspected_cause|confirmed_cause|workaround` only when those claims are supported. Confirmed cause requires `--causal-rationale` and evidence references; references are author reports unless independent capture establishes more. `--worktree-scoped` and `--branch-scoped` restrict applicability. Ordinary project lessons share the canonical project identity across linked Git worktrees; forks should use an explicit authored project identity.

Promotion and lifecycle revisions require `--expected-revision`, `--authorized-by` and `--reason`. Owner acceptance is separately labeled. For independent review, save the current review packet locally, pass it to the existing controller's `request-review --knowledge-packet PATH`, then use `revise --classification reviewed_lesson --review-artifact CAPTURE --reviewer PROVIDER --tree-hash CURRENT_REVIEW_SOURCE` with the captured result. A caller-authored `reviewed=true`, reviewer name or success string is insufficient. The controller checks host lifecycle, distinct reviewer, transcript/checkpoint freshness, current task/source binding and exact candidate/evidence digest. Direct same-user store forgery is outside the local integrity boundary; digests are freshness checks, not cryptographic authentication.

```sh
node scripts/etrnl-retro.mjs revise --cwd PROJECT --id RECORD_ID --expected-revision 1 \
  --classification owner_accepted_lesson --authorized-by OWNER --reason 'Scoped reproduction verified' --json
node scripts/etrnl-retro.mjs revise --cwd PROJECT --id RECORD_ID --expected-revision 2 \
  --lifecycle retired --authorized-by OWNER --reason 'API no longer applies' --json
```

`contradicted`, `superseded` and `retired` suppress active retrieval while preserving prior revisions. Supersession additionally requires `--superseded-by ACTIVE_SAME_PROJECT_RECORD`. A stale revision is rejected; reread and reconcile before retrying. Authorization arguments attest the invoking owner-approved operation; they do not grant new permissions to an autonomous model. Archive/deletion policy remains an owner decision. `prune` now reports maintenance needs without deleting or confidence-decaying history.

## Retrieval and compatibility

The shared `retrieveKnowledge` API reads existing stores, applies canonical project identity plus optional branch/worktree scope, excludes invalid/older-than-90-day records, selects lexical matches, and emits at most five entries within a maximum 4,000-character context budget (default three / 500). Oversized entries are omitted whole so truncation cannot hide exceptions. Query input is capped at 1,500 characters; receipts retain a digest and emitted record IDs, not raw prompt text. This is bounded lexical relevance, not semantic understanding. Stale exclusion signals a need to revalidate, not historical deletion.

Legacy unattributed retro records are preserved but excluded from automatic project retrieval. Old buglog fingerprint versions 1–3 remain readable; direct exact-cwd bug suggestions retain their legacy author attribution. New version 4 fingerprints use project identity and root-relative file/category/summary, preserving recurrence across sessions and worktrees. Each repeated report appends a revision, retains first/last observation and increments occurrence count under a shared file lock. Invocation count is not independent experiment count.

Secret redaction and injection neutralization are best-effort boundary checks. All output remains explicitly untrusted data; this is not a claim of poisoning immunity. Malformed JSON or oversized stores fail clearly and need owner maintenance. External Hindsight retention requires explicit owner authority, project-scoped durable acceptance and a healthy configured service; `--dry-run` prepares a reviewable payload without external writes. No install, activation or export is implied.

Run `node --test tests/project-knowledge.test.mjs` for actual-producer and lifecycle regression coverage. The separate [evaluation protocol](project-knowledge-evaluation.md) measures semantic maintenance, relevance, decision correctness and repeated mistakes; storage tests alone cannot establish those outcomes.
