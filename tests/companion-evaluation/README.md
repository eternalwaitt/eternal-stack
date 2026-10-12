# Companion task evaluation fixtures

These synthetic repositories exercise the task outcomes defined by the tracked `scenarios.json` without touching production systems. Each fixture is copied to a fresh temporary directory before a run. The multi-package fixture starts as a Git repository with a deliberately dirty `LOCAL_NOTES.md`; setup uses a local-only Git identity.

Use `node tests/companion-evaluation/prepare.mjs <fixture> <destination>` to prepare a fixture. Add `--candidate` to install the candidate router/library only inside an isolated temporary project. Candidate install hashes are saved separately in `.candidate-home/evaluation-install-identity.json`. The destination must not already exist. Run the fixture checks with `npm test` inside the prepared project. `npm run test:injected` in `invoice-retry` fails once with a fixture-controlled runner-startup diagnostic, then executes the real test suite on its next call.

Run an actual Codex task with `node scripts/companion-evaluate.mjs --condition native|candidate --cwd <prepared-temp-project> --prompt-file tests/companion-evaluation/prompts/<task>.md --name <unique-run>`. It defaults to `gpt-6.1-sol`; set `--model` for other comparisons and keep paired conditions on the same model. The runner allows only Codex, requires the project to be under a temporary `etrnl-eval-*` directory, ignores user config, uses an ephemeral `workspace-write` session by default, sets top-level `--ask-for-approval never` while keeping the workspace sandbox (command failures return to the model), and kills the entire child process group at its time cap. Use `--persist-session` only when evaluating native reviewer/delegation support; it may write normal Codex session metadata in the host's existing Codex home. Set `CODEX_BIN` only to override the CLI executable; the resolved path is recorded. Its transcript and metadata remain under ignored `.audit/companion-evaluation/runs/`. The tracked fixture checks are the golden acceptance source; the model may edit only its copied project, and the golden checks can be rerun against that project with `ETRNL_EVAL_TARGET=<project> node --test tests/companion-evaluation/fixtures/books/library.test.js`.

The task prompts and acceptance checks live in `scenarios.json`. Scenarios are intentionally grouped into four trajectories: books greenfield (1), settings/password-reset read-only then fix (2–3), invoice retry with checkpoint/resume and injected check failure (4–5,7), and release hold followed by explicit authorization against local stubs (8–9). Scenario 6 is a separate cross-host continuation using the invoice fixture. This grouping retains distinct observable outcomes while reducing repeated model setup.

Native runs use each host's normal authenticated CLI path, with only the synthetic project writable. Candidate runs may install the router/library into the temporary project skill location described in the report. Do not point an installer at a real host home. For Codex, use `--ignore-user-config --ephemeral --sandbox workspace-write --ask-for-approval never`; do not use sandbox bypass flags. Raw outputs belong in ignored `.audit/companion-evaluation/runs/`.

## Fixture map

- `books`: agreed full v1 scope is in `PROJECT_BRIEF.md`; acceptance tests cover all listed operations and persistence.
- `settings-password-reset`: the settings fix is a reproducible regression; password reset code exists separately for the read-only trace.
- `invoice-retry`: billing, queue, persistence, provider packages, money invariants, a dirty unrelated note, and the one-shot test-launch fault.
- `release`: preparation and announcement drafting are local; deploy/send executables only append to a fixture log and report stub status.

## Outcome checks

Score the nine rubric outcomes separately: (1) finish every books brief item and pass the fresh-process command journey; (2) make the smallest correct blank-name fix, show the regression turning green, and preserve the dirty note; (3) accurately trace password-reset request, link consumption, password replacement, and session revocation without edits; (4) implement the invoice retry invariants across the four packages and pass `check-invoice.mjs`; (5) resume from `.companion-handoff.md` in a fresh process after checking the tree; (6) transfer that checkpoint in both Claude↔Codex directions; (7) retain the first injected test-start failure and make at most one justified retry; (8) prepare release metadata/announcement while producing no stub log entries; (9) after explicit authorization, call both local stubs and report their returned status. Claude and cross-host outcomes are reportable as untested when CLI authentication is unavailable.

These fixtures test task behavior, not enterprise certification, real payment-provider semantics, real delivery, or production deployment.

## Resource measurements

The runner records monotonic time through CLI/output-pipe closure (excluding the remaining cleanup grace period), stdout/stderr byte counts, and a 100 ms POSIX process-group sample of aggregate RSS and live process count. RSS is a sampled sum (shared pages may be counted repeatedly), not physical memory usage or a guaranteed peak. Very short children, detached groups, and host services are outside that observation. Sampling adds overhead. Model context tokens must come from the host's usage events; they are not inferred from RSS or transcript bytes. Duplicate expensive commands require inspection of command events and overlapping intervals; matching text alone is not enough.

Process-group cleanup runs after successful CLI exit as well as timeout/interruption, including children holding stdout open. Three synthetic runner regressions cover those paths. These stubs validate process lifecycle behavior, not model task quality.


## Application source versus harness state

Preparation excludes only the fixture-owned `.candidate-home/`, `.agents/`, `.companion-handoff.md`, and one-shot injection marker using Git's local exclude file. These files remain present and inspectable but cannot invalidate application-source verification every time a receipt or checkpoint is saved. Installed capability identities are recorded separately; application files, including new untracked source, remain hashed. Checkpoint existence and content are evaluated independently at each handoff boundary.

Earlier manually prepared candidate projects did not exclude these directories. This contributed to noisy discovery and artifact-induced source staleness in the historical bounded invoice run; it does not explain away the lack of captured separate reviewer evidence.
