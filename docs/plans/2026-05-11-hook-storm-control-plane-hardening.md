# Hook Storm Control Plane Hardening Implementation Plan

Status: Final

Goal: Turn the VIVAZ and MIMO hook-storm transcripts into deterministic guard fixes that preserve useful enforcement without trapping Claude in repeated blocked-tool loops or allowing prod-data hazards.
Non-goals: No redesign of Claude Code itself; no RTK Rust implementation unless the local hook can safely avoid bad rewrites; no immediate patching of VIVAZ or MIMO application code; no migration of non-Hindsight memory systems.
Evidence: `skills/etrnl-plan/SKILL.md`, `scripts/plan-readiness-check.mjs`, `hooks/cc-pretooluse-guard.sh`, `hooks/cc-posttooluse-sycophancy.sh`, `hooks/cc-stop-verifier.sh`, `hooks/cc-posttoolbatch-observer.sh`, `hooks/lib/code-patterns.sh`, `hooks/lib/state.sh`, `scripts/agent-task-packet-check.mjs`, `hooks/fixtures/plans/good-plan.md`, VIVAZ transcript `14c676c0-0894-40b9-b26a-8c15d1286447`, and MIMO transcript `6506f7cd-4330-4d83-8850-b286fc23c16d`.
Assumptions: The goal is to improve the shareable `claude-control-plane` repo and its installed `~/.claude` copy through the normal install/update path after verification.

## Hook pipeline (ASCII)

```text
PreToolUse input
   |
   +--> command classifier -------------------------------+
   |                                                      |
   |                                               safety-critical?
   |                                                      |
   |                             +------------------------+-------------------+
   |                             |                                            |
   |                            yes                                          no
   |                             |                                            |
   |                    override token verify                          repeat/evidence checks
   |                             |                                            |
   |                      allow or deny                                allow/warn/deny
   |                             |                                            |
   +-----------------------------+----------------------+---------------------+
                                                     |
                                                     v
                                         PostToolBatch state update
                                                     |
                                                     v
                                              Stop completion gate
```

## What already exists

- `hooks/cc-pretooluse-guard.sh` already centralizes Bash, edit, source-read, domain-skill, repeat-command, port, email, and Google Workspace write checks.
- `hooks/lib/code-patterns.sh` already owns policy pattern detection for suppressions, empty catches, safety-removal, large edits, evidence discipline, and ownership deflection.
- `hooks/lib/state.sh` already records session reads, searches, edits, command history, verification runs, test runs, review runs, repeated edit files, and review triggers.
- `hooks/cc-posttoolbatch-observer.sh` records successful tool use and has the right place to distinguish successful commands from blocked attempts.
- `hooks/cc-stop-verifier.sh` already blocks completion claims with missing or stale verification and requires second-pass review for large/risky changes.
- `scripts/agent-task-packet-check.mjs` already enforces subagent packet structure.
- `tests/test-hooks.sh` and fixture events already provide the regression harness for hook behavior.
- `scripts/doctor.sh` already serves as the installed-control-plane health gate.
- `scripts/project-buglog.mjs` records repeated edits and can be reused for replay-derived fixture metadata.
- The two transcripts give concrete bad-command, sticky-sycophancy, repeat-verification, prod-schema, secret-output, and post-deploy-review examples.

## NOT in scope

- Changing application logic in `vivaz-website` or `mimo-finance`; those are evidence sources only.
- Building a new agent runtime; this plan patches guard behavior in the current Bash/Node hook system.
- Removing quality gates wholesale; the goal is proportional enforcement, not weaker standards.
- Implementing RTK internals in Rust unless the local hook cannot safely route around broken rewrites.
- Auto-rotating leaked production credentials; the guard will prevent or redact future leaks, while rotation remains an operator action.
- Vendorizing full private transcripts into the public repo; fixtures must be minimized and scrubbed.

## File map

- `hooks/cc-pretooluse-guard.sh`: add output-limiter-aware banned CLI logic, prod schema/data command guard, secret command guard, smarter repeat-command decisions, and evidence discipline one-shot integration.
- `hooks/cc-posttooluse-sycophancy.sh`: stop reading stale transcript text as the primary signal; only inspect current visible assistant text from hook input or the current response payload.
- `hooks/cc-stop-verifier.sh`: move risky-change review requirements before commit/push/deploy commands, and add migration/secret-risk stop conditions.
- `hooks/lib/code-patterns.sh`: split policy checks by file kind; scope safety-removal to source files; narrow evidence/sycophancy regexes; add command classifiers for output limiters, prod schema mutations, credential disclosure, and migration-safe alternatives.
- `hooks/lib/state.sh`: record command outcomes separately from attempted/blocked commands; add helper state for edit generation, evidence-violation fingerprint, and review-before-deploy markers.
- `hooks/cc-posttoolbatch-observer.sh`: record successful commands only after tool success; increment edit generation; classify verification after edits; record review artifacts.
- `scripts/agent-task-packet-check.mjs`: support read-only packet mode with a smaller required field set; keep full requirements for write-capable agents.
- `scripts/replay-hook-fixtures.mjs` (new): run minimized replay fixtures through hook classifiers without requiring full private transcripts.
- `hooks/fixtures/events/`: add scrubbed single-event fixtures for RTK/rg flags, output limiters, repeated verification, Markdown safety-removal, prod `prisma db push`, `veloz db credentials`, read-only subagent packets, and sticky sycophancy.
- `tests/test-hooks.sh`: add assertions for every new fixture and update existing expectations.
- `docs/health-stack.md`: document new guard semantics and operator expectations for prod schema/secret commands.
- `docs/skills.md`: document the expected workflow impact for `etrnl-plan`, `etrnl-execute`, and `etrnl-review`.
- `CHANGELOG.md`: add an unreleased entry because hook behavior and install-visible workflow semantics change.
- `scripts/doctor.sh`: add checks that replay fixtures and changelog coverage are present.

## Task groups

- **Group A: Bash command policy and RTK sanity**
  - Owns `cc-pretooluse-guard.sh`, command classifiers in `code-patterns.sh`, and command fixtures.
  - Fixes `rg` flag rewrites by allowing raw `rg` or routing to `rtk proxy rg` when flags are incompatible with `rtk grep`.
  - Allows read-only output limiters like `| head -40`, `| tail -60`, and `sed -n` when attached to safe commands.

- **Group B: Evidence discipline and sticky-hook cleanup**
  - Owns `cc-posttooluse-sycophancy.sh`, evidence functions in `code-patterns.sh`, and state fingerprints.
  - Ensures the hook examines only visible assistant text for the current event.
  - Converts mild phrasing problems into context feedback where possible and hard-blocks only reflexive agreement before evidence.

- **Group C: State-aware verification and repeat-command logic**
  - Owns `state.sh`, `posttoolbatch-observer.sh`, and repeat checks in `cc-pretooluse-guard.sh`.
  - Stops counting blocked commands as repeats.
  - Allows verification reruns after an edit generation changes.
  - Exempts lint/typecheck/test/build from hard repeat blocks after source edits and replaces them with warnings when no state changed.

- **Group D: Source-only edit safety and large-change escape hatch**
  - Owns safety-removal and large-change logic in `code-patterns.sh` plus edit handling in `cc-pretooluse-guard.sh`.
  - Prevents Markdown plans/docs from triggering source safety-removal.
  - Allows larger source changes when a plan/review artifact is recorded, while preserving review-trigger state.

- **Group E: Prod-data and secret-output hard guards**
  - Owns prod command classifiers in `code-patterns.sh`, Bash denial in `cc-pretooluse-guard.sh`, and stop verifier deploy checks.
  - Blocks or requires explicit approval state for `prisma db push` against production-looking URLs.
  - Blocks secret-bearing commands such as `veloz db credentials`, broad `printenv`, and credential dumps unless a redaction path exists.
  - Adds guidance toward migration-based prod schema changes.

- **Group F: Subagent packet proportionality**
  - Owns `scripts/agent-task-packet-check.mjs`.
  - Adds a read-only mode requiring goal, cwd/project context, exact scope, read set, expected output, and no-revert.
  - Keeps full packet requirements for write-capable or unspecified agents.

- **Group G: Replay tests, docs, doctor, changelog**
  - Owns fixtures, `tests/test-hooks.sh`, `scripts/doctor.sh`, docs, and changelog.
  - Adds sanitized VIVAZ/MIMO regression cases.
  - Verifies installed and repo-local behavior.

## Phases

1. **Fixture extraction**
   - Create minimized fixtures for each observed failure class:
     - `rg -g` / `--iglob` should not become broken `grep`.
     - `| tail -40` and `| head -100` should be allowed as output limiters.
     - repeated `pnpm check-types` after edits should be allowed.
     - evidence block should not persist after a corrected message.
     - Markdown plan writes should not trigger safety-removal.
     - read-only subagent packet should pass with the reduced field set.
     - prod-looking `prisma db push` should be blocked without approval state.
     - `veloz db credentials` should be blocked or redacted.
   - Scrub private file names and secrets from fixture payloads.

2. **Command classifier implementation**
   - Add functions in `code-patterns.sh`:
     - `cc_command_has_output_limiter`
     - `cc_command_uses_legacy_search_as_primary`
     - `cc_command_is_verification`
     - `cc_command_is_prod_schema_mutation`
     - `cc_command_may_disclose_secret`
   - Replace the current blanket legacy regex with classifier-based decisions.
   - Add targeted denial reasons with a concrete replacement command when available.

3. **State model update**
   - Add state buckets:
     - `blockedCommands`
     - `successfulCommands`
     - `editGeneration`
     - `commandLastEditGeneration`
     - `evidenceViolationFingerprints`
     - `prodApprovalMarkers`
   - Update observer logic so only successful Bash commands count toward repeat detection.
   - Increment edit generation after successful source edits and Markdown plan edits separately.

4. **Evidence discipline update**
   - Make `cc-posttooluse-sycophancy.sh` prefer hook input fields for the current assistant message.
   - Fall back to transcript only when the event explicitly identifies the current message id.
   - Ignore thinking/system/internal strings.
   - Fingerprint a violation and block it once; future tool calls with no new offending assistant text are allowed.
   - Narrow hard-block phrases to reflexive agreement patterns before evidence; emit context feedback for softer "let me verify" patterns.

5. **Edit-safety update**
   - Add path/file-kind detection for Markdown, docs, plans, fixtures, source, tests, generated files, and config.
   - Run safety-removal only for source/config files where the old and new text are meaningful code surfaces.
   - Keep suppression and unfinished-work-marker checks for source/tests, but do not block plain planning prose that mentions these policy terms in evidence.
   - Add an explicit large-change allowance when a plan path exists and a review-trigger is recorded.

6. **Prod and secret guard update**
   - Deny `veloz db credentials`, credential dumps, broad env dumps, and commands containing `DATABASE_URL=` with plaintext production host unless explicit approval state is recorded.
   - Deny `prisma db push` for prod-looking URLs and direct DB tunnels unless the command is explicitly marked local/dev.
   - Provide replacement guidance: create migration, review SQL, use migrate deploy, then verify table existence without printing credentials.
   - Ensure the guard message never echoes the secret-bearing command argument.

7. **Stop-verifier ordering update**
   - Detect commit, push, deploy, and prod DB mutation commands as risky completion operations.
   - Require review artifacts before those operations when review triggers exist, not after deployment.
   - Require migration evidence before prod schema deploy when schema files changed.

8. **Subagent packet proportionality**
   - Inspect task text for read-only markers.
   - Use reduced required fields for read-only packets.
   - Return a ready-to-copy packet template in the denial output.
   - Preserve full packet enforcement for any write-capable task.

9. **Docs, changelog, doctor**
   - Update docs with the new guard behaviors and examples.
   - Add changelog entry.
   - Add doctor checks for replay fixture presence and latest changelog entry.

10. **Verification and installed smoke**
   - Run `tests/test-hooks.sh`.
   - Run `scripts/doctor.sh`.
   - Run fixture replay script.
   - Install/update into a temporary Claude home and run doctor there.
   - If local install is requested after review, run the update script against `~/.claude` and smoke one blocked/allowed command pair.

## Skill/tool routing

- `etrnl-plan`: used for this file-backed implementation plan.
- `etrnl-execute`: use for implementation after this plan is accepted.
- `etrnl-review`: required before any commit/push/deploy of this hook change.
- `eternal-best-practices`: relevant because prod DB, credential, and finance-domain guard behavior is in scope.
- `code-simplifier`: run after implementation to prevent hook logic from becoming an unreadable regex pile.
- `finding-duplicate-functions`: run if command classifiers duplicate shell/Node logic across files.
- `brooks-audit`: useful but not blocking if unavailable; use it for health scoring if installed.
- Shell tools: use `bat`, `fd`, `rtk grep`, `node`, and project scripts; avoid broad private transcript inclusion in fixtures.

## Test plan

CODE PATH COVERAGE
- `tests/test-hooks.sh`: add cases for allowed output-limit pipelines, denied primary legacy CLI, allowed verification rerun after edit generation changes, denied repeated non-verification commands with no state change, Markdown plan safety-removal bypass, source safety-removal still denied, read-only subagent reduced packet, write-agent full packet denial, prod `prisma db push` denial, and secret-command denial.
- `scripts/replay-hook-fixtures.mjs`: assert VIVAZ and MIMO minimized events produce expected allow/warn/deny outcomes.
- `scripts/plan-readiness-check.mjs docs/plans/2026-05-11-hook-storm-control-plane-hardening.md`: plan shape stays valid.
- `scripts/doctor.sh`: overall repo health and changelog/tag checks.

USER FLOW COVERAGE
- A Claude session can search with `rg -g` or a safe RTK proxy path without falling into `grep` flag failures.
- A Claude session can limit noisy output with `tail` after a command without being blocked.
- A Claude session can rerun tests/typecheck after edits without repeat-command deadlock.
- A Claude session receives one evidence-discipline correction and can continue after changing phrasing.
- A Claude session cannot print production DB credentials into the transcript.
- A Claude session cannot push production schema changes through `db push` without explicit approval/migration evidence.

REGRESSION COVERAGE
- Existing email-send and Google Workspace write protections still block.
- Dangerous filesystem commands outside cwd/temp still block.
- Source read-before-edit still blocks source edits when unread.
- Suppression and empty-catch checks still block source/test edits.
- Stop verifier still blocks completion claims with no verification.
- Second-pass review still required for large/risky changes before completion operations.

E2E/EVAL NEEDS
- Run a temporary-home install/doctor smoke after repo tests pass.
- Use sanitized transcript replays instead of raw private transcripts in the public repo.
- Add a small command-classifier matrix test if Bash-only fixtures become hard to maintain.

## Failure modes

- **Failure mode: output limiter becomes a bypass for banned search.**
  - Coverage: distinguish primary command from downstream limiter; `grep pattern file | head` still denied if primary `grep` is a search, but `pnpm test | tail` allowed.

- **Failure mode: repeat guard allows command loops forever.**
  - Coverage: repeat allowed only after edit generation changes or for verification commands with warning; non-verification unchanged repeats still denied.

- **Failure mode: sycophancy hook stops catching real reflexive agreement.**
  - Coverage: hard-block fixture for "You're right, let me check" remains denied.

- **Failure mode: sticky evidence block returns.**
  - Coverage: replay where one offending message is blocked, then a corrected current message is allowed.

- **Failure mode: Markdown/doc safety-removal hides a real code regression.**
  - Coverage: safety-removal remains active for source/config fixtures; docs/plans are exempt only from code-safety keyword disappearance checks.

- **Failure mode: prod guard blocks local dev.**
  - Coverage: local `localhost`, Docker service, and temp DB URLs are allowed; production host patterns and Veloz credential commands are denied.

- **Failure mode: secret redaction echoes the secret in the denial.**
  - Coverage: denial messages use generic labels and never include command args containing credential-looking substrings.

- **Failure mode: read-only subagent packets become under-specified.**
  - Coverage: reduced mode still requires goal, cwd, scope, read set, expected output, and no-revert.

## Parallelization strategy

- Best implementation shape is three independent workstreams after fixture extraction:
  - **Lane 1:** Bash command classifiers, repeat state, and output-limiter fixtures. Owns `cc-pretooluse-guard.sh`, `state.sh`, and related tests.
  - **Lane 2:** Evidence discipline, edit-safety scoping, and large-change escape hatch. Owns `code-patterns.sh`, `cc-posttooluse-sycophancy.sh`, edit tests.
  - **Lane 3:** Prod/secret guards, subagent packet proportionality, docs/changelog/doctor. Owns `agent-task-packet-check.mjs`, docs, changelog, doctor checks.
- Conflict risk is moderate because all lanes touch `tests/test-hooks.sh`; assign one integrator to merge fixture assertions.
- If using subagents, give each worker disjoint ownership and remind them they are not alone in the codebase and must not revert others' changes.
- Final integration is sequential: run tests, run review, patch findings, run doctor.

## Verification gates

- `node scripts/plan-readiness-check.mjs docs/plans/2026-05-11-hook-storm-control-plane-hardening.md`
  - Expected: readiness passes.
  - Stop condition: any missing section or vague placeholder.

- `tests/test-hooks.sh`
  - Expected: all hook fixture tests pass.
  - Stop condition: any regression in existing guard behavior.

- `node scripts/replay-hook-fixtures.mjs`
  - Expected: all VIVAZ/MIMO replay fixtures match allow/warn/deny expectations.
  - Stop condition: any hook-storm replay remains blocked incorrectly or any prod/secret replay is allowed.

- `scripts/doctor.sh`
  - Expected: control-plane health passes, changelog latest-tag check passes, fixture presence check passes.
  - Stop condition: doctor failure.

- Temporary-home install smoke:
  - Expected: install, doctor, and uninstall succeed in a temp home; no user `~/.claude` mutation.
  - Stop condition: install/uninstall drift or missing files.

- Optional local installed smoke after explicit approval:
  - Expected: one safe output-limited verification command allowed; one secret command denied without echoing the secret; one prod schema push denied.
  - Stop condition: any installed behavior differs from repo tests.

## Rollback

- Revert the hook, script, doc, and fixture changes with `git revert` or by restoring the previous commit.
- If installed locally, run `scripts/update.sh` from the prior release or `scripts/rollback-local.sh` if available.
- Remove any new fixture files and replay script if they cause install issues.
- No production application data or external systems are modified by this plan.

## Execution handoff

- Use `etrnl-execute` in a single session if implementing locally without parallel agents.
- Use parallel agents only if explicitly requested:
  - Worker 1 owns command/repeat state files.
  - Worker 2 owns evidence/edit-safety files.
  - Worker 3 owns prod/secret/subagent/docs/tests.
- Each worker must edit only its assigned files, must not revert others' changes, and must report changed paths plus verification run.
- Integrator runs all verification gates and second-pass review before commit/push.

## Plan Readiness Report

- Scope Challenge: The scope is bounded to guard behavior proven faulty by VIVAZ and MIMO transcripts. It avoids app fixes, RTK internals unless necessary, and private transcript vendoring. The smallest useful release is hook classifier/state changes plus replay fixtures, docs, doctor, and changelog.
- Architecture Review: Changes stay in existing hook architecture: Bash policy in `cc-pretooluse-guard.sh`, patterns in `code-patterns.sh`, session state in `state.sh`, stop policy in `cc-stop-verifier.sh`, and deterministic tests in `tests/test-hooks.sh`. Prod/secret protection is added before execution, not after completion.
- Code Quality Review: The plan avoids one giant regex by introducing named classifiers and fixture-driven tests. It calls for code-simplifier review to keep shell logic readable and duplicate-function review if classifiers duplicate logic.
- Test Review: The test plan covers command policy, evidence stickiness, edit safety, subagent packet proportionality, prod schema guards, secret-output guards, existing regression behavior, and temporary-home install health.
- Performance Review: Hooks must remain fast; command classifiers should be pure Bash regex/string checks with no network calls. Replay tests run offline. Existing hook p95/p99 metrics from transcripts showed several-second spikes, so new logic must avoid additional external command calls on hot paths.
- Failure modes: Critical failure modes are listed with test coverage, especially output-limiter bypass, sticky evidence blocks, prod DB push false positives/negatives, and secret echoing.
- Parallelization: Three lanes are possible, but final integration is sequential because `tests/test-hooks.sh` and shared classifiers are conflict-prone.
- Unresolved questions: Whether to patch RTK Rust rewrite rules or only route around bad rewrites locally depends on implementation evidence; start local and escalate only if local hook cannot prevent broken `rtk grep` invocations.
- Verdict: Ready for execution.
## Verdict

Ready for execution.
