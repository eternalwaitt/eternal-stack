# Companion evaluation: Codex native baseline and Eternal Stack core

Evaluation run date: 2026-10-11.

In this small paired fixture run, native Codex and Codex with the Eternal Stack companion both completed the simple books, read-only, and small-fix journeys. The candidate also completed the multi-package invoice and release-stub tasks, but its required independent review was not evidenced: it recorded its own review as verified and then described that as independent. That requirement therefore failed this evaluation. The results show useful routing and workflow instrumentation; they do not establish that Eternal is generally better or faster than native Codex.

## Method and limits

We ran seven scored user turns per condition with `gpt-6.1-sol` on Codex CLI 0.159.2: books greenfield; read-only password-reset trace; small display-name fix; invoice start and resume; release hold and explicitly authorized release. Start/resume and hold/grant reused their respective project state. Each paired task used identical prompt bytes. The invoice prompts granted authority only for actions inside the synthetic fixture and explicitly stated that scope. The release executables only append to a local stub log; no actual deployment or customer message occurred.

The native condition used Codex without the Eternal project skill/library. The candidate condition used the core router installed into isolated temporary homes and copied into the temporary project skill location. Both used ignored user configuration and a workspace-write sandbox; approvals were set to `never`, with the sandbox retained. Most turns used ephemeral Codex sessions. The invoice pair used persistent sessions to check checkpoint/resume and reviewer availability; this can write ordinary Codex session metadata to the existing Codex home. No Eternal files or settings were installed or changed in the real host home, and no credentials were copied or inspected. Candidate context started with one discoverable router; installed library files were available on demand. A file being installed does not mean the model loaded or used it.

The test harness, prompts, nine scenario definitions, and immutable acceptance checks are tracked in [`tests/companion-evaluation/README.md`](../tests/companion-evaluation/README.md), [`scenarios.json`](../tests/companion-evaluation/scenarios.json), and the fixture checkers. The scored matrix covers scenarios 1–5 and 7–9. Scenario 6, cross-host continuation, was not run. Claude Code was also untested because its CLI was logged out. This is one model, one host, and a small synthetic suite; it is not an enterprise certification, a general capability survey, or a statistically meaningful speed comparison.

An initial auto-model/unpinned books run was exploratory and is excluded. Earlier invoice runs were excluded because the global Codex instructions conflicted with using Eternal workflow files in the synthetic task. Earlier release-grant attempts were excluded because one used a fresh project rather than continuing the held release, and another was terminated before making a stub call. The paired scored runs below used scoped fixture authorization and the same stateful project within each condition. The reported invoice counts of 10/10 native and 12/12 candidate are from the latest scoped start/resume pair, not the excluded exploratory invoice runs.

## Paired task outcomes

| Journey | Native Codex | Eternal companion | Independent acceptance evidence |
| --- | --- | --- | --- |
| Books greenfield | Implemented the agreed full CLI scope: create, list, edit, remove, status, and persisted data across fresh processes. | Completed the same scope. The router selected `build / contained / low`; no deeper skill was needed. | `npm test`: 4/4 each; immutable books evaluator: 2/2 each. |
| Read-only password-reset trace | Correctly described the request, token, expiry/use, password replacement, policy, and session revocation path without source edits. | Same accurate trace. The router selected `explain / contained / low`; no deeper skill was needed. | Repository remained unchanged apart from expected harness setup files. |
| Small display-name fix | Made the null-safe blank/missing-name change and preserved the unrelated dirty note. | Same focused change; the router selected `fix / contained / low`. | `npm test`: 2/2 each; immutable settings checker passed for each; dirty note contents preserved. |
| Invoice retry, checkpoint, and resume | Implemented the invoice behavior and resumed from its checkpoint. | Implemented and resumed; selected `fix / coupled / high`, initialized a workflow ledger, recorded task/TDD/check evidence, and used `etrnl-dev-debug` and `etrnl-dev-execute`. The injected test-launch failure remained visible and was retried once. | `npm test`: 10/10 native and 12/12 candidate; immutable `check-invoice.mjs` passed both. Candidate review requirement was **not met with independent evidence**: its own ledger entry marked `orchestration_review` verified, but the transcript contains no separate reviewer invocation or reviewer result. The candidate then asserted that an independent review had found no blocker. Do not count that self-attestation as a pass. |
| Release hold, then explicit approval | Prepared release metadata and announcement with no stub calls; continued the same project after approval and called both local stubs without re-asking. | Same behavior; selected `ship / coupled / high` and read the installed `etrnl-ops-ship` capability. | Hold: `npm test` 1/1 and zero stub entries. Authorized continuation: both conditions logged successful deploy and send stub results in order. |

The invoice candidate met the independent behavioral checker and mechanical test outcomes; that does not substitute for the missing independent reviewer evidence required by its selected workflow contract. Architecture guidance was corrected after these runs to disallow self-attestation as independent review. That guidance-only correction was source-reviewed at the time; the later controller follow-up below evaluates the stronger runtime boundary separately.

The candidate made its workflow selection and helper use observable in the invoice/release runs. On the simpler tasks, its routing stayed lightweight and did not force deep skill loading. These observations support a design distinction between installed capabilities, the compact router loaded at entry, and task-specific capabilities actually read. They do not show that every installed capability works in every host or repository.

## Reproduction evidence

Run metadata and transcripts are in ignored `.audit/companion-evaluation/runs/`. The metadata records model, prompt digest, command result, and duration. Prompt digests match within each pair; for example, the scoped invoice start digest is `f4987fd8ab39f3007425fc0e27b457c259c9965307bae07a75cfc4d0b1fa6d04` and resume is `34580908e90068f9ded7f33b7d4784e83f5c23be1a4be1915d0b18804382f633`.

Candidate installed-content identities are recorded here to distinguish the tested fixtures. The router hash is SHA-256 of the installed `skills/etrnl-router/SKILL.md`; the manifest hash is SHA-256 of `.etrnl-core.json` in that fixture's isolated candidate home. The installer renders each router's helper command with that fixture's isolated home path, so router hashes differ even when the routing policy is the same.

| Fixture | Manifest SHA-256 | Router SHA-256 |
| --- | --- | --- |
| Books | `0418d8d3d64870919caf2b1582020cbf72bc7eab653dc9ef5feb54a30a550cb1` | `0566856f150a10697aa87136e05a433c2727a4cd072d8264b8e1ad647ad78e0b` |
| Read-only | `771b50f8819843ad5c92029c6f4b881e95e126c9a374e69a2b84fa4e4d5f7497` | `057e0af78d0222e90916bbecc4e7a2ab6b376c3ac069165710fce38d7a9a3027` |
| Small fix | `be4a14862cfb90b630df31cef1e5d98727e0f95c8f08272807c5ef52aff634b4` | `db9108540da14065d5f20ebc871307c4ee299d72da5d2b9460bd781ebfb72c8a` |
| Invoice start/resume | `1c1b16ae1333f5191ecd6bad18c257e381c19c7be8cd3f600a0a9b2ead52cd48` | `f0f906a68558bd83253d1c19088f7eed0057f02810f940333b496c07fdfa8eb2` |
| Release hold/grant | `c5491345306c001bd61425ed50847400103cf2b21a7b549dc6f52886b542b6f2` | `50fb4dcab6da24cd2025e55a3759eb61346f0e3d22872647584703b623ac32e1` |

Durations were recorded as run metadata, not treated as targets: books 99.6s native / 68.2s candidate; read-only 17.3s / 23.7s; small fix 18.1s / 21.2s; invoice start 76.0s / 123.0s and resume 52.8s / 102.4s; release hold 23.6s / 57.2s and grant 17.0s / 36.5s. These single-run timings are descriptive only and support no speed claim.


## Review output evidence

The original scoped invoice JSONL transcripts contained command execution, file change, and main-agent messages but no separate reviewer result. Their independent-review claims remain unsupported historical evidence.

The first audit repair required a caller-written JSON artifact with source/digest binding and distinct asserted IDs. A subsequent adversarial test proved that a correctly shaped fabricated artifact could still pass through the public import command. **That import path is now rejected for verified reviews.** Retained earlier results below describe the candidate tested at that time, not the current admission rule.

The supported Codex path now has two steps:

1. The author saves a real checkpoint and calls `execution-ledger.mjs request-review --checkpoint <path> --session <ledger-session>` through the installed companion helper. This binds the actual host-provided author session, accepted task, checkpoint and source; it does not claim review occurred.
2. An outer host process calls `companion.mjs review-and-resume --host codex --ledger <path>`. It launches a fixed, separate read-only Codex process, captures the host JSONL lifecycle and structured reviewer output, then resumes the original author session. The controller validates the resumed lifecycle and runs the completion gate against the exact ledger. New source requires a fresh review request; review and retry budgets persist.

A nested CLI probe confirmed that launching a second Codex CLI from the author's workspace sandbox fails with an operating-system permission error on this host. The supported controller therefore runs outside that author shell sandbox; it does not bypass or weaken the reviewer's read-only or author's workspace-write policies. Missing checkpoints, caller-authored review imports, self-review session IDs, failed or incomplete host lifecycles, stale source, and switched ledger pointers cannot establish completion. A copied immutable checkpoint records what the reviewer actually received while allowing the author to maintain its progress checkpoint.

This is controller-owned process provenance within a trusted local installation. It does not protect against malicious same-user replacement of the controller, host executable, or evidence store. A separate invocation also does not guarantee a correct judgment. Core has no automatic enforcement hook; the guarantees apply when this supported workflow is used. Claude execution remains separately untested.

## Skills-interaction follow-up, 2026-10-11

A fresh paired simple-fix run used Codex CLI 0.159.2, `gpt-6.1-sol`, ignored user configuration, ephemeral sessions, `workspace-write`, approvals `never`, identical prompt digest `3ba4c6074cf5041048926b2ebbdb9c6e09a9b3e2e51311acea77fee42621fc36`, and sequential 90-second caps. Candidate Core was installed only inside its isolated temporary project. Both made the one-line blank-name fix, observed the failing test first, passed both tests, and passed the separately rerun immutable settings checker with the dirty note preserved. Candidate read the router and selected `fix / contained / low`; it did not load a deeper capability.

| Observed measure | Native | Candidate |
| --- | ---: | ---: |
| Monotonic CLI/output-close duration | 22.750 s | 30.564 s |
| Sampled process-group RSS peak | 290,912 KiB | 255,632 KiB |
| Sampled process-group process peak | 1 | 1 |
| JSONL output bytes | 7,905 | 16,986 |
| Host-reported aggregate input tokens | 105,653 | 113,827 |
| Of those, cached input tokens | 95,104 | 100,992 |
| Host-reported output tokens | 404 | 547 |
| Completed command events | 4 | 6 |

Each model ran the relevant test twice, once red and once green; those are justified verification phases, not redundant concurrent checks. No concurrent expensive command appeared in these short traces. Host-reported token totals accumulate over calls and include inherited host context; they are not a maximum context-window measurement. Duration ends at CLI/output-pipe closure, before the final cleanup escalation grace period; it is not end-to-end harness duration. RSS is sampled at 100 ms and sums only the runner's process group: host-managed command processes in other groups and short-lived children may be absent. Consequently a process peak of 1 does not mean the task used only one process overall. There is no measured total-Mac RAM peak or CPU attribution. These single runs establish neither a speed nor a memory improvement.

Raw transcripts and metrics are under ignored `.audit/companion-evaluation/runs/{native,candidate}/skills-audit-fix-20261011/`; the acceptance/usage summary is `.audit/skills-interactions-2026-10-11/model-results.json`. Existing demanding invoice/checkpoint results above remain historical evidence of the previous candidate, not revalidation of the newly changed runtime.

Claude CLI 2.1.284 was present; fresh `claude auth status` still reported `loggedIn: false`; no login was attempted and no Claude model run or cross-host parity is claimed. The official [Codex CLI reference](https://developers.openai.com/codex/cli/reference/) confirms ephemeral rollout handling, workspace sandbox selection, and that ignoring user configuration still uses host authentication. The [Claude CLI reference](https://code.claude.com/docs/en/cli-reference) documents stream-JSON and version-dependent forwarding of subagent output; availability in documentation is not proof of local execution. No live-home Eternal activation occurred.


The runtime follow-up's separate evaluator also executed 39 targeted checks sequentially, including independent hostile regressions for failed-result reuse and contract-omission budget resets. All passed. This is deterministic fixture evidence for finite POSIX command coordination and review-artifact integrity; it does not imply automatic host enforcement. Retained independent review output and file hashes are in ignored `.audit/skills-interactions-2026-10-11/coordination-independent-review.json`.


### Earlier demanding model follow-up: useful code, incomplete workflow

A fresh candidate-only invoice run and one continuation used the same model/CLI/sandbox, persistent session support, and **150 seconds each (300 seconds total)**. Both hit the cap and returned 124. No further continuation was launched. The first implemented the persistence foundation; the second implemented billing retry behavior, retained the injected exit-127 diagnostic, and made one successful injection retry. Separate post-run checks passed all 12 tests and the immutable invoice acceptance checker. The unrelated note remained preserved. No `.companion-handoff.md` existed at either boundary, so explicit checkpoint delivery failed; recovery used the tree and ledger, not a delivered handoff file.

Review behavior was not successfully repaired in this model observation. The continuation said independent review was underway, but the captured JSONL contains only a collaboration `wait` with empty receiver IDs, with no separate reviewer invocation/result. It attempted to record a caller-written review artifact; the helper rejected it. The artifact later contained asserted agent/invocation IDs and reviewer prose, but those fields have no separately captured provenance. The final ledger retained **zero reviews**, eight verification attempts and four retries; completion was not established. Do not infer an independent reviewer from the artifact's labels.

Against that earlier candidate, a read-only post-run probe rejected the final artifact against the actual current source hash; its metadata structure passed when checked against its own claimed hash. A caller who fabricated reviewer fields and refreshed the source hash could therefore satisfy that earlier structural validator. This exposed the earlier import boundary; the current controller-only admission rejects that public manual import. It was not proof of actual independence. Genuine review still requires a separate invocation/result verified against host evidence; an editable artifact cannot authenticate its author. The deterministic check improved evidence integrity, but this run establishes **no general task-quality improvement or reliable model adherence to independent-review guidance**.

| Demanding candidate observation | Start | Continuation |
| --- | ---: | ---: |
| CLI/output-close duration | 150.011 s | 150.010 s |
| Sampled process-group RSS peak | 258,576 KiB | 263,648 KiB |
| Sampled process-group process peak | 2 | 2 |
| JSONL output bytes | 121,105 | 127,872 |
| Timed out | Yes | Yes |

These metrics share the sampling and cleanup limits above. This is not a native/candidate speed comparison. Exact installed snapshot hashes are retained in `.audit/skills-interactions-2026-10-11/invoice-installed-identity.json`; results and the artifact probe are in `invoice-results.json` and `invoice-artifact-validator-result.json` in that directory. The copied runtime predates the final dead-wrapper-resume and nested test-scheduler adjustments, so those changes have deterministic fixture evidence, not this model evidence. No Claude or cross-host model run was performed.

### Host-controller follow-up

The stronger follow-up uses the same demanding synthetic invoice scope, Codex CLI 0.159.2 and `gpt-6.1-sol`. A persistent author first implements the persistence foundation, writes an explicit checkpoint and registers a review request. The outer controller captures a separate read-only reviewer, resumes the same author for billing/queue/provider completion, then requires a new source-bound review before completion. The temporary installation and harness-owned artifacts are ignored by the application's source fingerprint; application files remain included, and installation hashes are recorded separately. Older fixtures lacked these exclusions, which contributed to artifact-induced staleness but did not excuse their unsupported review claims.

The initial author completed its checkpoint in 177.900 seconds under its 180-second cap. The first outer call found a real portability defect: equivalent macOS `/var` and `/private/var` checkpoint paths failed string equality. It failed before launching a reviewer. A regression now accepts filesystem aliases while still rejecting different files and changed content. The existing pending request resumed after syncing only the corrected controller/validator modules, with before/after hashes retained. The repair pause is recorded separately from the authorized 600-second aggregate active execution allowance; no author session, ledger or task budget was reset.

Two actual separate reviewer sessions subsequently completed with structured approvals: the first approved only the completed foundation; the second reviewed the completed full implementation. The author resumed in its original session, passed all 11 tests, preserved the injected exit-127 failure and its single successful retry, and updated the checkpoint. The first controller cycle correctly refused completion after source changed, requiring the second review. Reviewer sandboxes could not create disk-test temporary directories; reviewers explicitly reported that limitation. The independent evaluator reran all 11 tests and the immutable invoice acceptance checker successfully outside those read-only reviewer processes.

The initially configured final author-resume cap of 30 seconds then expired after task metadata was marked verified but before a successful host terminal event. The controller correctly blocked completion. This exposed both inadequate evaluation time allocation and an overly broad runtime rule that charged an ordinary mandatory changed-source review as a retry. These failures and the pre-recovery ledger are retained; task metadata alone is not accepted completion. That trial remains failed with 387.960 seconds of active execution and a separately recorded 217.303-second repair pause. Its exhausted retry counter is not refunded or reset. The accounting fix and supported same-review resume path are evaluated in a separately identified fresh trial of the same full demanding scope.

Exact setup, installed hashes, preserved failures, actual reviewer/resume streams, final-parser results, independent test results and separately attributable review are in ignored `.audit/skills-interactions-2026-10-11/controller-followup/`. These are local synthetic observations; no live-home Eternal activation, Claude model execution, cross-host parity or general performance improvement is established.

The separately identified `controller-corrected` trial also remains failed. Its first author delivered the checkpoint in 164.048 seconds. The separate reviewer found no material completed-source defect but blocked approval because three disk tests could not create temporary directories under its read-only sandbox; two tests passed. The resumed author completed billing, passed all 12 tests and the injected gate after its retained failure, and delivered a fresh checkpoint. However, it called public `record-budget-use --action retry` immediately before `run-check`, which automatically charged that same retry again. The second review was refused before launch when the canonical retry counter was exhausted. This exposed a public accounting-interface seam and the need to provide reviewers trustworthy captured mechanical evidence when sandbox restrictions prevent a test. The evaluator independently passed all 12 tests and the immutable checker, but that does not replace the missing final approved review. No budget was refunded, ledger reset, or successful completion reported for this trial.

### Accepted demanding workflow after explicit recovery

The final `controller-final` trial reached **controller-accepted completion** on the same demanding invoice scope. The tested installation included the corrected accounting interface and reviewer handoff of latest, current-source mechanically captured check metadata. A newer self-report or stale check cannot expose an older captured pass in that handoff. Independent deterministic preflight passed 39 targeted tests, followed by 18 controller tests after the final selector correction; the public-CLI preflight uses an explicitly synthetic host emulator and is distinct from the real Codex observations below.

The actual author delivered its checkpoint in 162.505 seconds. Three separate Codex reviewer sessions inspected source and returned captured structured results: foundation approval; full-source approval; then approval of the current task binding after finalization changed its task title. All controller resumes returned to the original author session. Reviewers ran the tests their read-only sandbox permitted, evaluated current-source captured full-suite/disk-check receipts, and explicitly distinguished those receipts from tests they personally ran. No caller-authored artifact or self-attested review satisfied completion.

The first full-source finalization correctly remained incomplete: the author had changed the task title after review, which changes the accepted-task binding, and the earlier foundation gate was stale against the whole source fingerprint. A separately authorized **single 240-second recovery window** continued the same session and ledger: the author reran only the stale foundation gate, preserved the task title, updated the checkpoint and requested the third review. No source code, ledger counters or review requirement was reset or bypassed. The third controller returned `complete` with completion exit code 0. The independent evaluator then passed **11/11 tests** and the immutable invoice checker, verified the unrelated dirty note, and revalidated every actual host lifecycle plus the final receipt against current source and task binding. The installed snapshot remained unchanged throughout this trial and recovery. Afterward, finalization guidance made status-only task updates and pre-review check freshness explicit; that wording was source-reviewed, without another model run.

| Final observation | Result |
| --- | --- |
| Explicit checkpoint, separate review, same-session continuation | Passed with retained host streams |
| Current source and accepted-task binding at completion | Matched final captured review |
| Final controller / independent acceptance checker | Both exit 0 |
| Canonical totals | 3 reviews, 4 retries, 8 verification attempts; no reset |
| Active execution across initial trial and recovery | 463.652 seconds |
| Coordination pause between them | 194.906 seconds |
| Total elapsed wall time | 658.558 seconds |
| Original 600-second wall benchmark | **Missed** |
| Explicit recovery window | 73.082 of 240 seconds used |

This demonstrates one completed, source-bound Codex workflow after real failures drove interface repairs. It does not establish universal model honesty, a performance improvement, Claude parity or that every task will fit these budgets. Earlier failed trials remain failed and retained. Exact session identities, source/module hashes, raw reviewer and author output, controller results, final validator output, canonical counters and timing arithmetic are in ignored `.audit/skills-interactions-2026-10-11/controller-final/`, particularly `acceptance-summary.json`, `final-validator-results.json` and `recovery-results.json`. No further invoice model run was used after acceptance.


## Project-state no-reminder observation

A separate bounded catalog fixture exercised the shared baseline's instruction to read and maintain existing project state without a task-specific reminder. The ordinary user prompt requested inclusive price filters, input validation, USD rendering and regression tests across two modules; it did not mention documentation, state, or ledger commands. The isolated Core snapshot included an existing state document with an unfinished translation item and a retained boundary-regression lesson. No live home was installed or activated.

Codex CLI 0.159.2 with `gpt-6.1-sol`, workspace-write sandbox and ignored user configuration completed in **82.151 seconds under a 240-second cap**, returning exit 0. The captured commands show it read `PROJECT_STATE.md` at startup. It updated the affected feature summary from unimplemented to implemented, described the actual supported behavior, and preserved the earlier pending item and lesson. Four model-authored regression tests passed; a separate evaluator also checked inclusive bounds, invalid bounds in both API and renderer, currency formatting, stock exclusion, order and nonmutation.

The host still supplied the user's global Mac instruction prohibiting `etrnl-*` skills despite `--ignore-user-config`. The model explicitly respected that instruction and did not invoke the router. Consequently, no canonical mode, `record-state` acknowledgment or supported ledger completion occurred in this observation. This is evidence of **one successful no-reminder shared-baseline maintenance behavior**, not router activation, mechanical enforcement, cross-host parity, or an always-updated guarantee. The existing history was synthetic fixture content; the run was a fresh model session, not a second live model session.

Separate independent deterministic coverage passed **34/34 tests**: 16 adversarial state cases and 18 controller cases. These include preservation across fresh helper sessions, task-linked outcome/pending acknowledgment, explicit no-new-lesson handling, stale authored/source/task rejection, malformed marker rejection, missing-document failure, concurrent helper mutations, ambiguous document binding, generated-status forgery rejection, and public controller completion through a synthetic host. The synthetic host tests establish the helper protocol, not model behavior. A retained independent review records corrected defects and exact source hashes. Repository-wide final gates are recorded separately. The first full gate then exposed an obsolete stop-success fixture and two production edge cases: authored state crowded earlier startup hints, and a repository without its first commit could not obtain a source fingerprint. The corrected stop fixture independently passed three assertions, including missing-maintenance rejection before acceptance. The final expanded state suite passed **19/19**, including large-state startup and compact caps, preserved state pointers and stale-verification warnings, and commit-free initialization/checking with corrupted-HEAD rejection. These final changes have deterministic coverage; the earlier model smoke snapshot predates them.

Authored feature, outcome and learning statements remain agent-reported content. Hash and acknowledgment checks establish freshness and required maintenance decisions; they do not prove semantic truth. Core has no automatic enforcement hooks. Optional lifecycle enforcement depends on the selected host, actual registration and the events that host delivers; interruptions or work outside the supported helper path can leave state stale. Generated evidence is deliberately labeled as a local projection rather than feature acceptance.

The reproducible fixture and ordinary prompt are in `tests/companion-evaluation/fixtures/project-state-catalog/` and `tests/companion-evaluation/prompts/project-state-catalog.md`. Local output, installation hashes, initial/final state and independent test results are retained under ignored `.audit/project-state-2026-10-12/` and `.audit/companion-evaluation/runs/candidate/project-state-no-reminder-20261012/`.
