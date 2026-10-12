# Capability library

## How it works

The default Core installation adds one native `etrnl-router` skill and a private library under the selected host's `etrnl/library` directory. The router is the user-facing entrypoint: users can describe work naturally; it selects a workflow and reads only relevant library guidance. The private library does not appear as dozens of separate skills in Claude or Codex discovery.

Keep three states distinct:

- **Available:** a capability or helper is present in the host's library.
- **Loaded:** its instructions were read for the current task.
- **Mandatory:** the user, project policy, or resolved workflow contract requires it.

A capability being installed does not mean it was loaded or must be run. Core installs no hooks, native agents, services, or third-party tools. The separately supported `orchestrated` and `full` profiles can add optional runtime integrations; see [Host capabilities](host-capabilities.md) and [Install](install.md). Codex hook integrations are active only after native registration.

## Workflow selection

The router uses five user-facing outcomes: Build, Fix, Explain, Review, and Ship. These are orientation words, not a command grammar. It resolves explicit intent, impact scope, and consequence risk using the canonical implementation in `scripts/lib/workflow-contract.mjs`; it does not infer axes from keywords or file counts.

For a new app or feature, users can describe the goal in everyday language. The router guidance asks the assistant to translate it into a practical user journey, recommend sensible reversible defaults, clarify only consequential unknowns, preserve the accepted scope, and check the actual journey where the environment allows. Explanations should fit the user's familiarity. Brainstorming is optional and does not add an approval gate to already authorized implementation.

The resulting contract determines whether the task needs a task record, program phases, packets, test-first evidence, independent review, or a bounded worker/retry/verification budget. The contract is stored in the host-local execution ledger for structured/program work. Ledger-backed spawn admission checks the worker budget and reserves a concurrent slot, but it only accounts for workers admitted through that path; it does not govern every host-native spawn. Record each admitted worker's terminal outcome and release its reservation; stop checks report any reservation still open. Direct contained work needs no forced plan, ledger, agent, or reviewer; run relevant checks natively and report actual results. If a ledger is active, use command-captured evidence for required mechanical verification; a reviewer’s judgment is recorded separately and is not a test receipt. Read-only explanation/review may use checks or another perspective when it helps, but the catalog does not make those passes mandatory. Exhaustion means stop, preserve the result, and explain what remains; it does not trigger repeated approval requests.

Ledger-backed check freshness uses a Git worktree hash. Initialize version control in a new project before relying on structured/program ledger checks; direct contained work has no ledger requirement and can run relevant checks natively.

`Ship` chooses a workflow and never grants authority to merge, publish, deploy, message, or mutate external state. Respect the user's standing authorization and any actual project approval gate.

## Durable project state

Use one project-owned overview for current scope, features, pending work and curated lessons. The router reads it at startup and maintains it during authorized implementation; the canonical contract selects acknowledgement requirements and the ledger supplies bounded generated evidence. See [Project state](project-state.md) for document selection, update ordering and the distinction between native guidance and deterministic helper completion checks.

## Maintained capabilities

Current source inventory: 56 skill entrypoint files, including `etrnl-router`. The router is the only Core-native skill; all other entries below are available as on-demand library modules. These names describe maintained capabilities, not individual slash commands.

| Family | Capability entrypoints |
| --- | --- |
| Workflow and delivery | etrnl-dev-autoplan, etrnl-dev-brainstorm, etrnl-dev-ci, etrnl-dev-commit, etrnl-dev-debug, etrnl-dev-deprecate, etrnl-dev-deps, etrnl-dev-execute, etrnl-dev-plan, etrnl-dev-pr, etrnl-dev-stress-test, etrnl-dev-test, etrnl-ops-ship |
| Audit and review | etrnl-audit-browser, etrnl-audit-code, etrnl-audit-docs, etrnl-audit-performance, etrnl-audit-production, etrnl-audit-security, etrnl-audit-tooling, etrnl-code-review-excellence, etrnl-deep-audit, etrnl-deep-audit-ux |
| Engineering references | etrnl-backend-patterns, etrnl-frontend-patterns |
| Host and communication | etrnl-comm-email-reply-quality, etrnl-ops-agent-files, etrnl-ops-context-restore, etrnl-ops-context-save, etrnl-ops-disk-cleanup |
| Domain and security guidance | abacatepay-integration, better-auth, domain-cli, domain-cloud-native, domain-embedded, domain-fintech, domain-iot, domain-ml, domain-web, eternal-best-practices, money-vo-discipline, stripe-best-practices, tenant-isolation-patterns |
| Data, backend, and delivery guidance | ci-cd, i18n-localization, orpc-patterns, prisma-expert, sql-optimization-patterns |
| Product and interface guidance | code-simplifier, design-taste-frontend, finding-duplicate-functions, frontend-design, impeccable, ux-researcher-designer, wcag-accessibility |


Capabilities are intentionally specialized. The router reads only the entrypoint or reference modules that fit the request. A skill may contain further references, schemas, or helpers; those are included only when the portable library manifest closes over them.

## Host differences

The same router and maintained capability sources serve Claude Code and Codex. Native tool names, permission prompts, skill discovery, model/delegation fields, and hook registration differ. Core does not claim behavioral equivalence for missing host features: the router reports a control as advisory/manual or unavailable when the host cannot provide it. Read the [host capability matrix](host-capabilities.md) before relying on a hook, agent, or local state location.

A paired evaluation on Codex CLI 0.159.2 with `gpt-6.1-sol` passed the books, read-only password-reset trace, small fix, and local release hold/grant acceptance checks. The invoice behavior checks passed, but the candidate did not provide independent-review evidence, so that required contract item failed. Claude and cross-host continuation remain untested. See the [evaluation report](companion-evaluation.md) for the task details and limits. Its runner is a maintainer evaluation tool, not a user setup or coding workflow.

The optional Claude orchestration profile may install hook definitions and agent files. Codex receives no native Claude-agent definitions, and copied Codex hook scripts are not active until registered through the native config (`hooks.json` for the current companion adapter). Source availability, installation, host registration, loaded context, and runtime effect are separate evidence.

## Optional role references and external command

The maintained role files `etrnl-adversary`, `etrnl-browser-qa`, `etrnl-consumer-tracer`, `etrnl-design-reviewer`, `etrnl-dx-reviewer`, `etrnl-executor`, `etrnl-investigator`, `etrnl-quality-reviewer`, `etrnl-scout`, `etrnl-spec-reviewer`, and `etrnl-test-wiring-auditor` are optional references for the orchestration profiles. Core installs none of them. Claude can use installed role files when its profile and configuration enable them; Codex does not consume Claude agent definitions as native subagents. These files do not make delegation mandatory.

The separate `email-triage` command is an optional integration reference that depends on the external `vivaz-email` runtime and its account access. It is outside the Core capability index and is not required for coding workflows.

## Helper interface

Maintained helper scripts run through the companion so they use the shared library while writing state under the active host's home. The installed router provides the concrete command path:

```sh
node <path-to-companion.mjs> inspect
node <path-to-companion.mjs> list
node <path-to-companion.mjs> select --intent fix --scope contained --risk low
node <path-to-companion.mjs> run scripts/<indexed-helper>.mjs -- <arguments>
```

`select` returns exact required/optional capability paths and the resolved contract. `list` reports availability without loading content. `run` is restricted to indexed helpers, rejects path traversal and symlinks, uses the target project as its working directory, and supplies separate library and host-home paths. The router's `inspect` result gives the installed command and paths. Core's companion is under `<host-home>/etrnl/library/scripts/`; the alternative optional profiles place it at `<host-home>/scripts/companion.mjs`. In a source checkout, use `node scripts/companion.mjs run --host claude scripts/<indexed-helper>.mjs -- <arguments>` or replace `claude` with `codex` for a Codex fixture/home; this is not an installation step.

## Capturing independent review

When the resolved contract requires independent review, a caller-written artifact or `verified` status is insufficient. The author first saves a checkpoint and registers a review request in its original host session:

```sh
node <path-to-companion.mjs> run scripts/execution-ledger.mjs -- request-review --host <codex|claude> --checkpoint <checkpoint-path> [--session <ledger-session-bucket>]
```

The request obtains the actual author session from the host-provided `CODEX_THREAD_ID` (Codex) or actual `CLAUDE_SESSION_ID` (Claude; obtain the exact UUID from its native session/callback, never guess it); do not invent or override it. The companion then provides an explicit outer-host handoff that captures a separate read-only reviewer and resumes that original implementation session:

```sh
node <path-to-companion.mjs> review-and-resume --host codex --ledger <active-ledger-path>
```

Save the checkpoint before invoking review, with accepted scope, current evidence, unfinished work and task/session identity. Use an ignored project-local checkpoint/evidence directory or a path outside tracked source. The controller derives checkpoint/session from the pending request; optional `--checkpoint`/`--session` assertions must match. Keep the registered checkpoint unchanged until review capture finishes; the controller retains an immutable copy for its receipt. One request allows one review/resume; after source changes, register a fresh checkpoint/request and repeat only within the remaining allowance. The original contract remains authoritative for requirements and remaining budget. Optional `--model`, `--review-seconds` and `--resume-seconds` select the model and finite process deadlines; they do not increase workflow allowance. The controller uses a fixed supported host invocation, retains provider output and source identity, and rejects caller-authored verified review imports. Review findings and changed source require resolution and fresh evidence within the remaining allowance. Manual review records can report blocked/skipped outcomes, which leave a required review incomplete.

Before requesting the final review, refresh every required check that became stale after implementation changed. Preserve the accepted task ID, title and scope during finalization: use `set-task --task <id> --status verified` without a replacement `--title`. A deliberate accepted-scope change requires fresh review even when source files are unchanged. A completion diagnostic that only awaits the required review is expected at this point; do not repeatedly run it or fabricate evidence.

If the reviewer approved unchanged source but the author resume was interrupted, retry only that captured continuation:

```sh
node <path-to-companion.mjs> review-and-resume --host codex --ledger <active-ledger-path> --resume-existing
```

This path revalidates the captured approval and task/source/session binding, spends the remaining canonical retry allowance before launch, and does not launch or charge another reviewer. Changed source, a failed reviewer, or exhausted retries cannot use it. A later planned review after a successful earlier scope still spends review allowance; it is not itself a failed-attempt retry. Do not refund previous usage or create another task identity to evade exhaustion.

If an outer controller dies abruptly, the next supported request/recovery checks recorded process identity and preserves consumed budgets. Cleanup signals only an identifiable owned process group; unknown/reused process identities and deliberately detached descendants are not treated as proven ownership. This requires the supported POSIX process-identity facilities; it is not a Windows enforcement claim.

Run this command from the authorized outer host. A nested model sandbox may prohibit launching the CLI; the supported response is a saved checkpoint and explicit host handoff, never a sandbox bypass. Core installs no automatic interception or background service, and this command does not install Eternal into a live home. Existing host authentication is required. The Claude provider is source- and fixture-tested, with separate tool and output boundaries documented in [native adapters](native-adapters.md); paid live execution and desktop parity remain unverified. A Codex result cannot stand in for a Claude result.

A captured separate invocation is stronger evidence than asserted reviewer IDs, but it does not guarantee sound judgment or authenticate state against malicious same-user filesystem rewriting. During resumed work, the author finishes required task/check evidence and yields with controller finalization pending. The controller accepts the captured review only after a successful resumed host turn, then checks completion against the original ledger and source. The author must not loop on that pending completion check or forge a verified row. Inspect the retained findings and controller result; process exit alone does not establish completion. See the [evaluation report](companion-evaluation.md#review-output-evidence) for actual observed behavior and limitations.

## Sharing verification and keeping context focused

Assign one owner to each expensive suite, build, browser session, watcher or development server. Workers use focused checks and return evidence paths with source/configuration identity. Complete all required verification against integrated source; sharing does not permit skipping checks. Coverage lanes are concerns to examine, not a required number of simultaneous agents. Workflow limits remain defined only in [`workflow-contract.mjs`](../scripts/lib/workflow-contract.mjs).

For ledger-backed finite commands, `run-check` reserves verification/retry usage itself. Do not additionally reserve that same attempt with `record-budget-use --action retry`; the review controller likewise owns its review/resume accounting. Manual budget recording requires explicit `--operation replan|redelegate|context-restore` for work outside these capturing helpers; a bare reservation or a check/review/resume operation is rejected without charging the budget. It is not a prerequisite to using a capturing helper.

For ledger-backed finite commands:

```sh
node <path-to-companion.mjs> run scripts/execution-ledger.mjs -- run-check --name focused-test -- npm test
```

The command runner coordinates cooperating callers using the same worktree and runs directory. `--max-concurrent-checks N` selects capacity; agree on it across cooperating callers. An optional `--reuse-key INPUT_IDENTITY` permits reuse only when command, source, environment, timeout, task and explicit input identity match. The identity must cover ignored dependencies, toolchain and other relevant inputs; omit reuse when those cannot be established. Failed results are never reused. Renaming a check does not replenish retries, and reinitializing an existing contract run preserves its counters.

Output forwarding is bounded while the full stream is drained and hashed. POSIX process-group cleanup covers ordinary descendants on success, failure, timeout or cancellation; intentionally detached groups and unrelated native-host commands are outside that boundary. Browsers and persistent servers need an explicit owner and stop handle. This is cooperative local coordination, not a machine-wide resource manager or an authenticated identity boundary.

Large taste, SaaS-pattern and accessibility entrypoints now select topical sections of retained detailed guides. Read only what the next task needs; preserve advanced context through evidence paths, decisions, scope and remaining budget. Byte reductions measure available text to load, not actual model tokens or host RAM. A resumed task reconciles current source, check freshness and process state before reusing evidence. Independent review requires [retained separate output](companion-evaluation.md#review-output-evidence), not a manually verified status.

## Provenance and maintenance

Eternal owns the router, capability IDs, canonical modules, host adapters, packaging, tests, and ongoing maintenance. Some specialist knowledge is inherited or adapted. `CREDITS.md` and the repository's source/provenance inventory preserve factual attribution and maintenance lineage; routine user-facing routing does not need to expose it. Product ownership does not imply original authorship, a license conclusion, or certification of every inherited example for every dependency version.

Update the skill inventory, helper closure, relevant docs, and credits when a capability is added, merged, rewritten, or retired. Keep factual source notices with adapted material. Run the targeted skill-contract and portable-install checks after changing library entrypoints.

See [market research](market-research.md) for the current source-backed landscape and [product direction](product-direction.md) for the design and implementation boundaries of this unreleased companion candidate.
