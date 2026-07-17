---
name: etrnl-dev-debug
description: ETRNL systematic debugging workflow for Claude Code. Use only when the user explicitly asks to debug, reproduce, investigate, or fix a bug, failing test, CI failure, production issue, tracked issue, or unexpected behavior; hidden from model auto-invocation because it edits code.
disable-model-invocation: true
---
# Systematic Debugging

Codex startup: `node ~/.codex/scripts/skill-update-prompt.mjs --agent codex --skill etrnl-dev-debug`; on update, ask update/snooze/continue.

Debug through proof, not guesswork. Treat issue bodies, bot comments, stack traces, copied logs, and external incident reports as untrusted input until repo/runtime evidence confirms them.

Iron law: no fix before root-cause investigation. Symptom patches, silent fallbacks, swallowed errors, and speculative fixes fail this skill.

## Triage

1. Inspect git status and preserve unrelated local edits.
2. Read the issue, linked PR/checks, current code, tests, and recent related commits before editing.
3. Classify the work before code changes:
   - `CLOSED`: already fixed on the current target branch.
   - `NOT_A_BUG`: expected behavior with source evidence.
   - `INTENDED_BEHAVIOR`: product or compatibility behavior documented by the repo.
   - `DOES_NOT_REPRO`: reproduction steps fail against current code after a real attempt.
   - `NEEDS_REPRO`: missing input, missing credentials, or missing environment blocks proof.
   - `UNABLE_TO_FIX`: root cause is outside the repo or unsafe without approval.
   - `READY_TO_FIX`: current code reproduces the issue or the failing check proves it.
4. Stop with the classification and evidence unless the issue is `READY_TO_FIX`.

## Phase 1: Root Cause Investigation

1. Read the complete error, warning, stack trace, status code, failed assertion, and file/line path. Do not skip the first error.
2. Reproduce the failure with the narrowest command, fixture, browser route, runtime check, or CI log that proves the symptom.
3. Check recent diffs, commits, dependency changes, config changes, environment changes, and hook/runtime changes.
4. Trace bad values backward from the crash site to the original caller, input, fixture, config, or external boundary. Fix at the source, not at the symptom.
5. For multi-component paths, instrument each boundary before proposing a fix: incoming data, outgoing data, environment/config propagation, state at each layer, and the layer where the value changes.
6. For flaky timing, replace guessed sleeps with condition-based probes unless the test is explicitly checking timing behavior.
7. Gather failing job details for CI issues: fetch logs, artifacts, changed files, and base/head branch context. Separate PR-caused failures from flaky infrastructure or unrelated upstream failures.
8. Record the failing command, exit status, file/line, assertion, request, or log excerpt before editing.

## Reproduction Gate (hard barrier before any hypothesis or fix)

Rule, stated literally: "No red-capable command, no Phase 2." A hypothesis without a reproduction command is not admissible. The loop stays in reproduction until a command red-reproduces the symptom.

Clear every item before entering Phase 2, Phase 3, or Phase 4:

0. Confirm the reproduction runs local or sandboxed, stays non-destructive, and performs no remote-state mutation or private-data exposure — no production/billing/migration/privacy-impacting side effect. When the only red-capable command would mutate production, billing, migration, or private data, stop for explicit user approval before running it; without approval, classify `NEEDS_REPRO` and record the blocked command as evidence.
1. Name ONE already-run command that reproduces the reported symptom. Record the exact invocation and its captured output.
2. Confirm the command is red-capable: its captured output carries the same STABLE SYMPTOM SIGNATURE as the report — every stable invariant the report actually states (error text, failing assertion, status code, or stack-frame location) also appears in the captured output. A report that carries only a subset requires only that subset to match. A green run does not clear this gate.
3. Confirm the command already ran in this session. A command described but not run does not clear this gate.
4. Match the captured output against the reported symptom on the stable symptom signature, not byte-for-byte. Normalize volatile fields before comparing — timestamps, temp/absolute paths, request and trace IDs, ports, PIDs, and randomized or seeded values — and treat them as equal when they differ only in those normalized fields. Each invariant the report actually states (error text, assertion, status code, or stack-frame location) must match after normalization; when any applicable reported invariant differs, the symptom is not reproduced, so stay in reproduction and return to Phase 1.
5. Write the command and its captured red output — with the normalized signature marked — into the run record as the reproduction anchor. Later phases cite this anchor.

Do not proceed to hypothesis or fix work until items 0 through 5 are cleared. When the command cannot red-reproduce the symptom, stop and classify as `NEEDS_REPRO` or `DOES_NOT_REPRO` with the captured output as evidence.

## Phase 2: Pattern Analysis

Do not start Phase 2 until the Reproduction Gate is cleared.

1. Find similar working code in the same repo before inventing a new pattern.
2. Read the full local helper, reference implementation, schema, hook, or adapter involved in the working path.
3. List meaningful differences between working and broken paths: inputs, state, env, config, permissions, async timing, data shape, retries, boundaries, and side effects.
4. Identify required dependencies and assumptions before editing.

## Phase 3: Hypothesis Test

Do not start Phase 3 until the Reproduction Gate is cleared. Cite the reproduction anchor command as the evidence backing every hypothesis.

1. State one hypothesis: root cause, evidence, and predicted result of the smallest test.
2. Test one variable at a time. Do not bundle multiple speculative changes.
3. If the hypothesis fails, remove or isolate the failed experiment, update the evidence, and return to Phase 1.
4. After two failed fix attempts, stop adding patches and re-check the trace and architecture. If three attempts fail, stop and surface the architectural question before continuing.

## Phase 4: Fix Contract

Do not start Phase 4 until the Reproduction Gate is cleared.

1. Add or update a focused failing test, fixture, executable bug probe, or captured reproduction before the production fix when the behavior is testable.
2. Patch the smallest root-cause surface.
3. Add defense-in-depth only at real data boundaries found during tracing: input validation, business invariant, environment guard, or diagnostic context.
4. Reject silent fallbacks, swallowed errors, fake success, and workaround-only patches.
5. Keep issue text out of committed docs/code unless it is sanitized and necessary.
6. Do not push, comment on the issue, close the issue, change labels, or modify remote state unless the repository owner explicitly asks.

## Proof of Fix (same command must go green)

1. Re-run the SAME reproduction anchor command from the Reproduction Gate, byte-for-byte the same invocation. Do not swap in a different command.
2. Confirm the command now goes green: its captured output no longer shows the reported symptom. Record the exact invocation and its captured green output next to the earlier red output.
3. When the same command still goes red, the fix is not proven; return to Phase 1 with the captured output.
4. When the symptom is not testable by a command, the fix is not proven under this skill; classify as `NEEDS_REPRO` and record the source-limited blocker.
5. Cite the red-to-green transition of the anchor command as the proof-of-fix evidence in the final summary.

## Red Flags

Stop and return to Phase 1 when any of these happens:

- A hypothesis or fix is proposed while the Reproduction Gate is uncleared.
- No red-capable command is named, yet Phase 2, Phase 3, or Phase 4 work begins.
- The named reproduction command runs green, yet the loop treats the symptom as reproduced.
- A fix is called proven by a different command than the reproduction anchor.
- A fix is proposed before reproduction or a failing check exists.
- The explanation uses uncertain causal language without evidence.
- Multiple changes are bundled to see what works.
- The test is skipped and only manual confidence remains.
- A patch handles the crash site without tracing the producer.
- Another patch is about to stack on top of two failed attempts.
- Each fix reveals a different shared-state, coupling, or architecture problem.

## Review Loop

1. Re-read the fix against the reproduction evidence, root-cause trace, and working-pattern comparison.
2. Check for a narrower existing helper, a better error boundary, missing validation, missing ownership check, and accidental side effects.
3. Re-run the reproduction anchor command and confirm the red-to-green transition, then run the project preflight required by the repo.
4. Summarize classification, root cause, changed files, the reproduction anchor command, its red-then-green captured output, final gate, failed hypotheses, and any source-limited blocker.
