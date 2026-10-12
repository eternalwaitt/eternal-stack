# Project knowledge evaluation

The local regression suite verifies storage, scoping, lifecycle and evidence boundaries. It does not establish fewer software mistakes or reliable semantic maintenance. No model trials have been run. Version 2 [source preparation seeds](../tests/fixtures/project-knowledge-evaluation/v2/cases.json) supply twenty plain task prompts across ten cases, with materially different source conditions in each pair. Their [manifest](../tests/fixtures/project-knowledge-evaluation/v2/manifest.json) freezes source and [separate adjudication labels](../tests/fixtures/project-knowledge-evaluation/v2/labels.json). These are synthetic preparation seeds, not an admitted runnable benchmark or twenty independent failure families.

The original [version 1 bytes](../tests/fixtures/project-knowledge-evaluation/manifest.json) remain immutable and are superseded for behavior evaluation: its maintenance/status prompts supplied answer cues and its variants were cosmetic. Version 2 removes those prompt cues, materializes actual source/docs/checkpoints/receipts, and keeps expected labels out of the agent workspace. Synthetic receipt files are scenario inputs; they do not certify real review, deployment or command execution.

## Prepare and inspect without models

The bounded [preparation tool](../scripts/project-knowledge-evaluate.mjs) creates fresh temporary workspaces and initializes a local Git directory so portable project declarations can be read. It does not execute fixture source, start models, install hosts or contact external services. It never overwrites an existing snapshot. For example, replace `NAME` with a fresh local name:

```sh
node scripts/project-knowledge-evaluate.mjs prepare --case all --output /tmp/etrnl-knowledge-eval-NAME
node scripts/project-knowledge-evaluate.mjs report --prepared /tmp/etrnl-knowledge-eval-NAME
node --test tests/project-knowledge-evaluation.test.mjs
```

Use a single ID such as `02a` instead of `all` to prepare one variant. Each case receives `workspace/` containing source, public docs, a plain `TASK.txt`, private historical checkpoint/receipt fixtures and scoped helper paths. `adjudication/` is a sibling containing expected labels and an empty run-record template. The root preparation receipt records exact bytes and hashes. The report verifies those bytes and labels, rejects tampering/symlink paths, and reports zero trial denominator with null behavioral scores and intervals.

Outside the workspace is a separation of inputs, not an access-control guarantee. Before a separately authorized trial, the runner must mount or expose only the workspace to the agent and keep labels inaccessible. Supply only the returned `agentInput` object; do not give the agent the corpus file, preparation receipt, adjudication directory or condition labels. Checkpoints intentionally retain historical source identities; resume must not reinterpret them as fresh evidence. A paired-run controller still needs admitted frozen baseline/candidate source and host snapshots, budgets, event capture, interruption/concurrency scheduling, and blinded adjudication. The existing `companion-evaluate.mjs` starts Codex and has a different restricted prompt-path contract, so this preparation tool does not invoke or relax it.

## Freeze and conditions

Before running, admit immutable fixture copies and freeze baseline/candidate source snapshots including dirty files, overview/lesson corpus, private synthetic journals, environment/tool versions, canonical workflow-contract revision, prompts, settings, model IDs and host versions. Save exact hashes and independent source/runtime ground truth. The implementation-baseline local audit copies preserve the old lesson producers; they alone are not a complete runnable baseline snapshot. Never silently label current candidate code as the baseline.

B0 is the frozen previous behavior. C1 is repaired helpers with advisory Core. C2 is the same records and policy with explicitly registered optional host adapter/controller. Hold task, model, permissions, tools and resource budget constant within each pair. Oracle lesson delivery is an upper-bound diagnostic; token-matched shuffled or withheld lessons diagnose context effects. Those interventions are not equivalent to the real retrieval candidate.

Use fresh isolated sessions/stores per condition. Block pairs by fixture, project, host and model. Counterbalance B0→C and C→B0, then randomize within blocks. Retain tool errors, failed attempts, invalid runs and timeouts; report exclusion reasons before interpreting results. Do not modify fixtures after observing candidate outcomes.

## Cases and correctness

| Case | Fixture intervention | Independent success label |
| --- | --- | --- |
| 1. Resume | Overview plus reversal, last feature, blocker and partial evidence | Correct feature, next step, blocker and status without file reminder |
| 2. Maintain | Partial multi-file fix with unrelated and residual pending work | Truthful milestone/end update; unrelated items survive |
| 3. Relevant lesson | Confirmed incident preceding a related held-out decision | Applicable evidence delivered before decision; correct action separately labeled |
| 4. Irrelevant lesson | Other project/version, near keyword and poisoning traps | Relevant item retained; irrelevant interventions, overrides and leaks absent |
| 5. Repeat errors | Shared causal trap with different surface variants and non-trigger tasks | Independently counted repeat errors/opportunities and regressions |
| 6. Interrupt | Crash before/after write, failed evidence and prior external effect | Restored decisions/pending/budget, fresh readback, no duplicate action |
| 7. Concurrent authors | Revision N disjoint updates then conflicting same-ID edits | No lost disjoint updates; stale/conflicting edit rejected or reconciled |
| 8. Contradiction | Old overview, fresh source, owner reversal and misleading timestamp | Applicable evidence and uncertainty; preserved contradiction history |
| 9. Dimensions | Tested source, missing review, failed deploy and another source's deployment | Correct independent dimensions; forged/stale evidence rejected |
| 10. Small task | One-line reversible edit or read-only question with no lesson | Same correctness and bounded extra calls/context/cost |

Version 2 freezes materially different scenario inputs and isolated rubrics, not completed model outputs or independent correctness evidence. Preparation integrity tests establish bytes, scope and prompt separation; admitting a behavior trial still requires source/runtime ground-truth review and appropriate decision instrumentation. Before scale-up add genuinely independent repositories, failure families, realistic source/runtime snapshots, synonyms and irrelevant non-trigger controls. The two variants per family are clustered examples, not twenty independent failure families.

## Event chronology and labeling

Mark the first relevant decision opportunity before the run. Capture retrieval receipt ID and emitted lesson IDs, first read/mutation/commitment timestamps, source identity and tool outcomes from the controller/host. A retrieval receipt proves delivery only. Label retrieval relevance separately from whether the lesson was applied and whether the resulting decision was correct. A read event or correct answer alone does not prove the lesson caused that decision; use paired/withheld diagnostic conditions and blinded adjudication.

Independent adjudicators see frozen source/readback evidence, not condition names or the implementer's claimed success. Double-label critical contradictions, false completion and repeated mistakes; report agreement and resolution. Automation labels storage, source freshness, budget and concurrency invariants. Human adjudication labels semantic truth, relevance and decision correctness. Capture redacted artifacts; raw private evidence remains local and is excluded from tracked reports.

## Bounded pilot and scale-up

Prepare ten cases × two variants. Start with one paired repeat per variant and each of two hosts: 40 runs per condition, 80 for one baseline/candidate comparison. Before execution set a hard per-run time/tool/token limit and total spend cap. This protocol authorizes no model execution or spending by itself. If setup is reliable and separately authorized, three repeats produce 120 runs per condition. Repeated runs within a fixture are correlated.

Predeclare gates before any outcomes: deterministic storage/crash/concurrency/forgery invariants must all pass; zero invented independent review/deployment/authorization claims and no lost pending items in the pilot. Proposed behavior targets are ≥95% critical-fact coverage, ≥90% timely recall on applicable cases, ≥80% retrieved precision, and ≤5% harmful irrelevant interventions. Small-task target: ≤500 extra input tokens, ≤one additional local read, no mandatory LLM extraction/ranking call and local helper p95 ≤250 ms excluding host/model latency. Measure cold/warm local and end-to-end latency. These are targets, not established guarantees.

Report numerator/denominator by case, project, host and model; discordant pairs; median/p95 time; cached/uncached input/output tokens; call counts; ingestion/storage growth; maintenance time; retained failures and private-data violations. Use paired bootstrap intervals clustered by independent fixture/failure family, plus exact paired binary analyses when assumptions fit. Never count repetitions as independent examples or infer mistake reduction from memory presence, coverage counts or one model run.

Case 5 needs more independent failure families than the pilot. Estimate baseline error rate and variance, then preregister a meaningful minimum improvement and powered confirmatory sample. A reliability claim requires an interval excluding no improvement with acceptable regressions. Low baseline error rate or wide intervals mean inconclusive. Scale up only after fixture/instrumentation validity, privacy and cost gates pass; stop on fixture damage, authority violations, runaway cost or invalid chronology. No result may be generalized beyond its admitted host/model/project/settings.
