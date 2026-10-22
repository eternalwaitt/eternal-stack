<!-- etrnl:project-state {"version":1,"projectId":"git-aa28244a55031d536b3c5373b12cba2a","path":"PROJECT_STATE.md"} -->
# Eternal Stack project state

## Current scope

Eternal Stack is a coding companion released as v0.12.0 for Claude Code and Codex. Durable project state, scoped project observations, explicit recovery and optional native continuity adapters are implemented in source. Earlier project-state behavior has an independent review and one no-reminder Codex observation; the current continuity corrections have independent source and fixture review. Current implementation targeted checks are retained separately; integrated required gate outcomes belong to separate receipts for the final source/document identity. These observations do not imply release readiness or live host parity. Versioned publication does not imply live-home activation or cross-host parity. Read the [product direction](docs/product-direction.md) and [state maintenance guide](docs/project-state.md) for the supported boundaries.

## Features

| ID | Capability | Current status | Evidence and limits |
| --- | --- | --- | --- |
| core | One router and on-demand capability library | Implemented in v0.12.0 | Installation/discovery fixture evidence is documented in [host capabilities](docs/host-capabilities.md). It does not establish equal live behavior on both hosts. |
| skills | Maintained workflow and domain guidance | Audited and improved | The library contains 56 entrypoints. Deep references were retained and targeted defects corrected; this was not an exhaustive revalidation of every technical claim. See [capability library](docs/skills.md). |
| dependency-upgrades | Standalone Upgrade Deps with whole-toolchain planning | Source expanded; schema/contract checks and independent synthetic planning review passed | Retains catalog/bot/security checks and adds file-level impact classification, compatibility batches, pnpm migration guidance, baseline-safe rollback and explicit Codex invocation. See [source comparison](skills/etrnl-dev-deps/references/upstream-comparison.md). Packaging and synthetic checks do not establish real upgrade acceptance or cross-host behavior. |
| checks | Cooperative finite-command coordination | Implemented | Shared-helper checks support bounded concurrency, source-bound reuse and process cleanup. Native commands, separate state roots and deliberately detached processes have different limits. See [verification coordination](docs/skills.md#sharing-verification-and-keeping-context-focused). |
| review | Captured independent review and same-session continuation | Implemented; one demanding Codex workflow observed complete after recovery | Actual separate reviewer streams and final source/task binding were validated. The original wall-time benchmark was missed; earlier failed trials remain failed. A Claude captured-review provider now supports the same controller and durable budgets, with strict JSON/session/source fixtures. No paid Claude trial or equal live host behavior is established. See [evaluation](docs/companion-evaluation.md#accepted-demanding-workflow-after-explicit-recovery). |
| project-state | Durable overview, curated lessons and automatic evidence projection | Implemented; independent review and targeted verification passed | Task/feature aliases, safe existing-overview bindings, scoped revision merges and explicit ownership handover now preserve pending work and failures. Initial independent deterministic matrix: 34/34; additional gate-driven regressions are retained with final validation evidence. A no-reminder Codex task read and updated state, preserved prior pending work/lesson, and passed 4 tests plus an independent oracle. Inherited host instructions prevented router activation, so this is shared-baseline behavior, not live ledger enforcement. See [observed evaluation](docs/companion-evaluation.md#project-state-no-reminder-observation) and [state boundaries](docs/project-state.md). |
| continuity | Natural task selection and bounded session recovery | Implemented; targeted fixtures and independent correction review passed | Fresh sessions receive a prior-run preview and saved decisions/blockers/next work without adopting ownership. Explicit resume preserves run, failure history and budgets. Source freshness and cross-worktree context remain labeled. See [state maintenance](docs/project-state.md). |
| lessons | Project-scoped observations and reviewed lessons | Implemented; producer/retrieval fixtures passed | Failed-then-passed commands remain observations without inferred causality or confidence. Unattributed legacy/global rows are excluded; retrieval receipts prove retrieval only. Review recurrence proposes rules; enabling shared rules requires authorization. See [project lessons](docs/project-lessons.md). |
| native-adapters | Optional Claude/Codex native lifecycle registration | Implemented; local envelope/config fixtures passed | Declared minimum versions and real native config paths are checked; Core remains hook-free. Live callback registration, semantic state maintenance and runtime host equivalence are unverified. See [native adapters](docs/native-adapters.md). |
| knowledge-evaluation | Paired project-knowledge evaluation preparation | Corrected source preparation implemented; local checks passed | Frozen original seeds are retained as superseded. Twenty revised seeds have distinct source conditions, isolated adjudication labels and a bounded source-only prepare/report tool. Preparation tests passed; no model trials or quality/cost improvement claim exists. See [evaluation protocol](docs/project-knowledge-evaluation.md). |

An implemented capability is not a claim that every workflow, host or deployment is verified. Current-task verification belongs in the generated evidence block and retained check records.

## Pending work

| ID | State | Next action |
| --- | --- | --- |
| dependency-upgrades | Real upgrade acceptance pending | Use the standalone skill on the next authorized repository upgrade and validate resulting runtime behavior. Keep standalone Codex installation, source checks and any future GitHub release distinct. |
| state-validation | Current targeted checks and independent correction review passed; integrated outcomes retained separately | Before a source-health claim, require `tests/test-hooks.sh` and `scripts/doctor.sh` receipts matching the integrated candidate, including exact source identity, failures and outcomes. Earlier startup-context and first-commit failures remain historical. Do not treat local fixtures or the prior smoke as live helper or cross-host enforcement proof. |
| claude-review-parity | Source provider and subprocess fixtures implemented; live parity unverified | Run an authorized real Claude captured-review/continuation trial before claiming live equivalence. Preserve existing Codex historical benchmark failures and recovery observations. |
| native-runtime | Available and fixture-registered; live activation not performed | Validate exact installed host versions, native callback coverage and actual maintained state in an authorized isolated host trial. Hook errors can fail open and excluded tools retain the portable guidance/helper floor. |
| knowledge-trials | Revised source preparation validated; admitted behavioral/model trials not run | Review runner isolation and hidden labels for any admitted trial, then run only separately authorized trials. Measure quality, reminder-free maintenance and token/time cost; deterministic materialization does not establish improvement. |
| release | v0.12.0 versioned publication | Core, continuity and accumulated changes are assigned to v0.12.0. Reviewer-spawn fixtures now use a known isolated diff; required release gates must pass on the final clean commit before pushing the tag and publishing notes. Live host validation and model trials remain pending; meaningful future shipments require versioned GitHub Releases. |

## Mistakes and lessons

- **review-provenance:** A caller-authored reviewer label and output could satisfy the earlier artifact structure without a separate invocation. The supported controller now captures actual host lifecycle/output and rejects manual verified imports. Artifact integrity still does not defend against malicious same-user filesystem rewriting, and a separate invocation does not guarantee correct judgment. Evidence: [review-output history](docs/companion-evaluation.md#review-output-evidence).
- **retry-accounting:** A model manually reserved a retry before a helper charged the same attempt automatically. Capturing helpers now own their accounting; bare/helper-owned manual reservations are rejected. Never refund an exhausted historical trial to turn it into a success. Evidence: [controller follow-up](docs/companion-evaluation.md#host-controller-follow-up).
- **task-binding:** Changing the accepted task title during finalization made a previously approved review stale. Preserve accepted scope and identity after review; use status-only updates when scope has not changed, and obtain new evidence when it has. Evidence: [accepted workflow and recovery](docs/companion-evaluation.md#accepted-demanding-workflow-after-explicit-recovery).
- **read-only-verification:** A reviewer could not create temporary files for disk tests. That restriction is an environment limitation rather than, by itself, a source defect. Provide current-source captured check evidence, inspect coverage independently and disclose tests the reviewer did not personally rerun; insufficient evidence can still block approval. Evidence: [evaluation](docs/companion-evaluation.md).

- **startup-context-budget:** Adding the overview excerpt before existing startup hints displaced useful context inside the fixed output cap. Preserve existing priorities, reserve a short document pointer, and fill only remaining space. Evidence: [optional startup hook](hooks/cc-sessionstart-restore.sh) and [hook regression suite](tests/test-hooks.sh).
- **new-project-fingerprint:** A repository before its first commit has no `HEAD` tree; treating that as generic fingerprint failure blocked valid state bootstrap. Recognize only a genuinely unborn symbolic branch, hash its actual staged/working content, and still fail closed for corrupt or detached references. Evidence: [source fingerprint](scripts/lib/etrnl-state-core.mjs) and [unborn/corrupt-reference regressions](tests/project-state-adversarial.test.mjs).

Keep these entries concise and evidence-backed. Record no new lesson when none was learned; do not turn a failed-then-passed command into an invented root cause.

- **observation-versus-cause:** A historical Lane B distillation treated command recovery as an environment remedy with high confidence, and global hints could cross project boundaries. The producer now records observed outcome changes without causal confidence and retrieval requires project attribution/scope. Historical rows remain evidence rather than automatically accepted lessons. Evidence: [project lessons](docs/project-lessons.md), [retrieval tests](tests/project-knowledge.test.mjs).
- **controller-stop-handoff:** A native Stop callback could attempt repair while the live outer controller still owned author finalization. Stop now verifies the owned run/task/reviewed-source/session and live process identity, checkpoints and yields without another retry; unresolved manual or mismatched reviews still fail canonical completion. Evidence: [continuity regression](tests/continuity.test.mjs), [native Stop fixture](tests/native-install.test.mjs).

<!-- etrnl:task-note:2918c18b271753ffd16ff16f:start -->
### Task maintenance: source-fixture-repair

Feature IDs: state-validation

Pending owner: integrated-source-fixture-repair; disposition: open

Outcome (author-reported): Native continuity, scoped project knowledge and optional installation source implemented; stale substantive verification fixtures repaired. Integrated source-health outcomes require separate captured receipts matching this source identity.

Pending / disposition (author-reported): Live native host activation, real Claude parity, admitted model knowledge trials and release remain pending; retain earlier failed gate receipts and consumed budgets.

Learning decision: No new reusable learning claimed.
<!-- etrnl:task-note:2918c18b271753ffd16ff16f:end -->
<details><summary>Previous task maintenance</summary>

### Task maintenance: source-fixture-repair

Feature IDs: state-validation

Pending owner: integrated-source-fixture-repair; disposition: open

Outcome (author-reported): Native continuity, scoped project knowledge and optional installation source implemented; stale substantive verification fixtures repaired. Final integrated source gates are being captured for this source identity.

Pending / disposition (author-reported): Live native host activation, real Claude parity, admitted model knowledge trials and release remain pending; retain earlier failed gate receipts and consumed budgets.

Learning decision: No new reusable learning claimed.

</details>


<!-- etrnl:task-note:bcf09a50b4c29b5995911a2a:start -->
### Task maintenance: publication-preparation

Feature IDs: state-validation

Pending owner: publication-preparation; disposition: open

Outcome (author-reported): Coherent portable Core, continuity, scoped knowledge and optional host adapter improvements selected for publication on the existing feature branch. Publication preparation corrects whitespace and keeps the unreleased boundary explicit; final source health requires matching captured gate receipts.

Pending / disposition (author-reported): Live native host activation, real Claude parity, admitted model trials and release remain pending. Keep ignored evidence private and preserve historical failed receipts and budgets.

Learning decision: No new reusable learning claimed.
<!-- etrnl:task-note:bcf09a50b4c29b5995911a2a:end -->

<!-- etrnl:project-evidence:start -->
Execution evidence from the latest helper mutation only; earlier pending work remains in authored sections. Feature status is not inferred.

- Run reference: 35a45baf8808
- Source fingerprint: 12a661eb353b0923
- Tasks: 1; unresolved: 0; reported verified: 1
- Latest named checks: 2; current captured passes: 2; current failed/unfinished: 0; stale or self-reported: 0
- Review: not recorded
- State acknowledgement: current
- Completion: not established by this view; use the supported completion gate.
<!-- etrnl:project-evidence:end -->
