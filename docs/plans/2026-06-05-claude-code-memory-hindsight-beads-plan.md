# Claude Code Shareable Memory Stack Implementation Plan

Status: Final

Execution scope: all_phases
Deep stack artifacts: docs/plans/artifacts/2026-06-05-claude-code-memory-hindsight-beads/deep-stack-artifacts.json
Goal: Turn this repo into a shareable G Stack-style Claude/Codex install: core install plus a full-stack profile that provisions ETRNL hooks and skills, CodeGraph, Beads, Hindsight, configs, health checks, rollback, and post-install canaries while ETRNL remains compact handoff authority.
Non-goals: No Hindsight as compact or handoff authority, no raw `bd prime` startup or compact injection, no raw upstream `bd setup claude` or `bd setup codex` doctrine, no transcript or tool-call retention without privacy gates, no secrets in tracked files or command output, no Docker/service mutation without explicit `--profile full` or interactive approval, and no unsupported Claude settings carried into a fresh install.
Evidence: AGENTS.md; README.md; docs/install.md; docs/configuration.md; docs/skills.md; docs/compact-recovery.md; docs/adr/0002-etrnl-state-and-compact-handoff.md; docs/plans/2026-06-03-tool-effectiveness-and-beads-pilot-plan.md; scripts/install.sh; scripts/bootstrap-tools.sh; scripts/lib/skill-lists.sh; scripts/canary-hindsight.sh; scripts/settings-audit.mjs; scripts/tool-stack-check.mjs; scripts/doctor.sh; templates/settings.json; templates/settings.strict.json; tests/test-install.sh; tests/test-hooks.sh; tests/test-workflow-tools.sh; `./scripts/install.sh --dry-run`; `jq '{enabledPlugins, autoCompactWindow, hasSkipAutoPermissionPrompt:(has("skipAutoPermissionPrompt")), permissions, hookEvents:(.hooks|keys)}' "$HOME/.claude/settings.json"`; `node scripts/settings-audit.mjs "$HOME/.claude/settings.json" --strict-conflicts --json`; `scripts/canary-hindsight.sh`; `claude plugin list`; `gh repo view vectorize-io/hindsight --json nameWithOwner,url,defaultBranchRef,pushedAt,latestRelease,description`; `gh release view --repo vectorize-io/hindsight --json tagName,publishedAt,name,url,isPrerelease,isDraft`; Hindsight README quick-start Docker and Python embedded paths; Hindsight Claude Code integration README, plugin manifest, hooks manifest, setup skill, and daemon code; installed plugin hook manifest `hindsight-memory/0.3.0/hooks/hooks.json`; redacted `$HOME/.hindsight/claude-code.json`; `npm view @beads/bd version dist-tags.latest description repository.url --json`; `bd version`; `bd status --json`; `bd setup claude --check`; `bd setup codex --check`; `bd memories`; `bd prime --hook-json --memories-only`; `bd prime --full`; Claude Code hooks and settings docs; `node scripts/research-competitor-intel.mjs validate-manifest --manifest docs/research/top10-lock.json`; `node scripts/research-competitor-intel.mjs validate-evidence --evidence docs/research/capability-evidence.json`.
Phase: phase_0_through_phase_8
Workstream: source_distributable_stack_staged_install_live_rollout

## What already exists

- The compact-state rewrite establishes JSONL ETRNL state as canonical local workflow state. `SessionStart(source=compact)` synchronously injects bounded handoff context, `PostCompact` records Claude's compact summary, and `Stop` blocks completion when verification is stale after compact.
- `docs/adr/0002-etrnl-state-and-compact-handoff.md` already rejects model summarization, Beads CLI calls, Dolt SQL, raw transcript reads, and broad startup dumps inside lifecycle hooks.
- `docs/configuration.md` and `docs/skills.md` already state that Beads is explicit backlog, blocker, dependency, claim, and follow-up state only. They explicitly say not to run `bd setup` or inject `bd prime` output as startup, resume, compact, or Stop context.
- `scripts/settings-audit.mjs` already validates repo-owned hooks inside a settings file and currently reports the live settings hook graph as clean under `--strict-conflicts`.
- `scripts/canary-hindsight.sh` already checks that Hindsight is enabled and that configured API health responds.
- `hooks/cc-hindsight-lesson.py` already exports a narrow evidence-before-agreement lesson to Hindsight, but it writes directly to Hindsight as best-effort side effect rather than first recording a deterministic ETRNL lesson event.
- The live Claude settings currently enable `hindsight-memory@hindsight`, still include top-level `autoCompactWindow: 400000`, and include top-level `skipAutoPermissionPrompt`.
- The installed Hindsight plugin is version `0.3.0`, while the latest upstream release checked through GitHub CLI is `v0.7.2`, published on 2026-06-02.
- Hindsight local config points to `http://127.0.0.1:9077`; `scripts/canary-hindsight.sh` currently fails because that API is not listening.
- The installed Hindsight plugin contributes hook manifests outside `settings.json`: `SessionStart`, `UserPromptSubmit`, async `Stop`, and `SessionEnd`.
- Beads is installed at `bd version 1.0.5`; the repo has `.beads` state with zero issues and no memories. `bd setup claude --check` reports no hooks installed, and `bd setup codex --check` reports no project Beads skill installed.
- `bd prime --full` would inject a competing task-management doctrine, including default Beads task tracking and a session-close checklist. That is useful for Beads-native projects but conflicts with ETRNL when used raw in this control plane.
- Current `scripts/install.sh` already backs up Claude/Codex homes, copies repo-owned hooks, scripts, docs, `etrnl-*` skills, Claude slash-command shims, agents, rules, settings templates, and install metadata, then runs hook/workflow tests and a post-upgrade canary.
- Current installer dry-run says it would install Claude files, Codex runtime files, and bootstrap CodeGraph/Beads only when interactive or `CLAUDE_CONTROL_PLANE_BOOTSTRAP_TOOLS=1`.
- Current `scripts/bootstrap-tools.sh` can install CodeGraph globally, refresh CodeGraph MCP config, install Beads globally, and initialize project-local `.codegraph` or `.beads`, but it does not install Hindsight or manage Hindsight service mode.
- Hindsight upstream supports a Claude Code plugin installed with `claude plugin marketplace add vectorize-io/hindsight` and `claude plugin install hindsight-memory`, local daemon mode through `uvx hindsight-embed`, external API mode, Docker server mode, and knowledge MCP tools.
- Beads upstream install through `@beads/bd` is current at `1.0.5`, but its Claude/Codex setup commands are not compatible with ETRNL authority unless wrapped by this repo.

Current authority model:

```text
Claude lifecycle hooks
  |
  +-- ETRNL JSONL state: compact handoff, workflow events, stale verification
  |
  +-- Hindsight plugin hooks: semantic recall and retain, outside settings-audit
  |
  +-- Beads local repo: explicit backlog only, not currently hooked
```

Target authority model:

```text
Claude lifecycle hooks
  |
  +-- ETRNL JSONL state: mandatory deterministic authority
  |
  +-- Hindsight supervisor: optional semantic recall only when canary and privacy pass
  |
  +-- Beads bridge: explicit backlog/dependency export only after dry-run approval
```

Target install model:

```text
./scripts/install.sh --profile core
  -> ETRNL hooks, skills, agents, rules, scripts, Codex runtime, settings audit

./scripts/install.sh --profile full --yes
  -> core profile
  -> CodeGraph global tool and MCP config
  -> Beads global binary and optional project DB
  -> Hindsight Claude plugin and local-daemon or external-API config
  -> post-install doctor, canaries, rollback proof, stack lock
```

## NOT in scope

- Do not replace ETRNL compact handoff with Hindsight memories. Hindsight recall is semantic context, not deterministic continuation state.
- Do not use Beads as active execution ledger, compact state, plan authority, or Claude startup context.
- Do not install raw Beads Claude or Codex hooks during this plan. If Beads is exposed to agents, it must be through an ETRNL-owned wrapper that preserves ETRNL authority.
- Do not enable Hindsight transcript retention until service health, version, retention scope, and privacy filters are mechanically checked.
- Do not make Dolt a hook-runtime dependency. Dolt remains optional future projection, not a lifecycle hot path.
- Do not remove other enabled Claude plugins solely because they are enabled. This plan audits hook and memory interference first, then changes only confirmed conflicts.
- Do not claim live Claude home remediation from source tests alone. Installed-home mutation requires staged proof and explicit live rollout.
- Do not make `--profile full` require a private Victor-only path, token, keychain item, or local daemon that a fresh user cannot reproduce from documented prerequisites.

## File map

- `scripts/install.sh`: add shareable install profiles such as `--profile core|full`, `--yes`, `--dry-run`, `--skip-hindsight`, `--skip-beads`, `--skip-codegraph`, and staged-home flags; keep current conservative behavior available as `core`.
- `scripts/bootstrap-tools.sh`: extend bootstrap from CodeGraph/Beads-only to full stack bootstrap, or split reusable logic into helpers that `install.sh` can call without duplicate package detection.
- `scripts/stack-profile-check.mjs`: new or equivalent existing-surface extension that validates stack profile manifests, required tools, Hindsight mode, Beads mode, CodeGraph mode, expected hooks, and rollback proof.
- `templates/stack-profile.core.json` and `templates/stack-profile.full.json`: tracked public profile manifests with package names, version pins or latest policies, enabled features, required environment variables, service ports, and health checks.
- `templates/hindsight/claude-code.local-daemon.json`: tracked token-free Hindsight config template for local daemon mode with `hindsightApiUrl` empty, `apiPort`, dynamic bank isolation, conservative recall budget, `retainToolCalls: false`, and fresh-evidence preamble.
- `templates/hindsight/claude-code.external.example.json`: tracked token-free external API example showing where URL and token come from without storing secrets.
- `scripts/settings-audit.mjs`: extend beyond settings-only hook checks by reporting risky top-level settings keys, plugin hook manifests, plugin memory hooks, and skill or agent frontmatter hook declarations.
- `scripts/tool-stack-check.mjs`: add Hindsight installed-version, latest-version, API-health, and config-mode checks alongside existing CodeGraph and Beads checks.
- `scripts/canary-hindsight.sh`: split canary failures into disabled plugin, missing config, external API down, daemon mode mismatch, version lag, and unsafe retention configuration.
- `scripts/doctor.sh`: include Hindsight/Beads memory posture in source and installed-home health without requiring Beads hooks.
- `hooks/cc-hindsight-lesson.py`: record deterministic ETRNL lesson evidence first, then optionally export to Hindsight only when the supervisor gate is green.
- `hooks/cc-pretooluse-guard.sh`, `hooks/cc-stop-verifier.sh`, and `hooks/cc-posttooluse-sycophancy.sh`: keep lesson export calls but route through the hardened lesson writer contract.
- `scripts/etrnl-state.mjs` and `scripts/lib/etrnl-state-core.mjs`: add a narrow `lesson` or `memory_candidate` event kind if the current state schema lacks one.
- `templates/settings.json`, `templates/settings.strict.json`, and `templates/settings.local.example.json`: document allowed settings keys and remove or translate unsupported top-level memory or compact keys from shipped templates if any appear.
- `tests/test-install.sh`: add clean temporary-home install coverage for `--profile core`, `--profile full --dry-run`, staged full-stack install with stubbed external tools, rollback, and no-private-path assertions.
- `tests/test-workflow-tools.sh`: add fixture coverage for plugin hook inventory, Hindsight unhealthy states, risky settings keys, and Beads raw-prime rejection.
- `tests/test-hooks.sh`: add hook-fixture coverage for Hindsight lesson export, ETRNL-first persistence, and no raw Beads injection.
- `tests/fixtures/stack-install/`: add synthetic install homes, stack profiles, plugin list outputs, package manager outputs, Hindsight service health responses, Beads setup outputs, and rollback states.
- `tests/fixtures/memory-posture/`: add synthetic settings, plugin manifests, Hindsight config profiles, and Beads prime outputs.
- `docs/install.md`: document core versus full profiles, prerequisites, fresh-user install commands, Hindsight local daemon/external/Docker modes, Beads policy, CodeGraph MCP setup, rollback, and noninteractive CI install.
- `README.md`: make the one-command install and verification path accurate for shareable users.
- `docs/configuration.md`: document Hindsight modes, canary gates, supported Claude compact settings, unsupported local settings, and Beads non-hook boundary.
- `docs/skills.md`: clarify that Hindsight is not an ETRNL companion execution skill and that Beads is explicit backlog only.
- `docs/health-stack.md`: add the memory posture gate and expected commands.
- `docs/adr/0002-etrnl-state-and-compact-handoff.md`: add a short amendment that semantic memory cannot override compact handoff state.
- `CHANGELOG.md`: record memory posture hardening and any installed-home migration guidance.
- `docs/plans/artifacts/2026-06-05-claude-code-memory-hindsight-beads/deep-stack-artifacts.json`: readiness artifact for this plan.

## Task groups

### Group A - Distribution Install Profile Contract

Owner: installer owner.
Dependencies: current `scripts/install.sh`, `scripts/bootstrap-tools.sh`, `scripts/lib/skill-lists.sh`, docs/install contract, Hindsight plugin install docs, Beads npm package evidence, CodeGraph bootstrap behavior, and clean temporary-home test harness.
Acceptance criteria: a fresh user can run a documented core profile and a documented full profile; core profile installs the ETRNL harness without global memory services; full profile installs or configures ETRNL, CodeGraph, Beads, Hindsight plugin, Hindsight config, Hindsight service mode, health checks, install metadata, and rollback metadata; noninteractive full profile fails with a precise missing-prerequisite message instead of silently skipping Hindsight, Beads, or CodeGraph; dry-run prints every planned mutation and package manager action.
Verification: `./scripts/install.sh --dry-run`, `./scripts/install.sh --profile core --dry-run`, `./scripts/install.sh --profile full --yes --dry-run`, staged `CLAUDE_HOME`/`CODEX_HOME` install tests with stubbed package managers, `node scripts/stack-profile-check.mjs templates/stack-profile.full.json --json`, and `tests/test-install.sh`.

### Group B - Hook Source Inventory And Audit

Owner: control-plane audit owner.
Dependencies: Group A profile schema, existing `settings-audit.mjs`, Claude settings templates, plugin cache layout, skill contract checker, and installed Claude home read-only evidence.
Acceptance criteria: the audit reports repo-owned settings hooks, plugin hook manifests, project/user plugin scope, memory-affecting plugin hooks, skill or agent frontmatter hook declarations, and risky top-level settings keys; the report clearly distinguishes repo-owned clean status from outside-settings hook sources; strict mode fails when an enabled memory plugin is unhealthy or when unsupported settings are present in the controlled Claude home.
Verification: `node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts --json`, `node scripts/settings-audit.mjs "$HOME/.claude/settings.json" --strict-conflicts --json`, fixture runs for plugin `hooks.json`, and fixture runs for skill/agent frontmatter hook declarations.

### Group C - Hindsight Provisioning, Supervisor, And Canary

Owner: memory integration owner.
Dependencies: Groups A and B, existing `scripts/canary-hindsight.sh`, redacted Hindsight config, installed plugin version evidence, upstream release evidence, Hindsight Claude Code plugin install commands, and Hindsight daemon/Docker/external modes.
Acceptance criteria: full profile can install or verify the `hindsight-memory` Claude plugin, write token-free config from templates, choose exactly one mode (`local-daemon`, `external-api`, or `docker-server`), pin or lock plugin/embed versions, detect required LLM provider inputs without printing secrets, start or verify the selected service, and run recall/retain-safe canaries; Hindsight status is deterministic across disabled, enabled-healthy, enabled-api-down, daemon-mode, external-api-mode, Docker-mode, unsafe-retention, and version-lag states; no Hindsight memory is trusted when canary is red.
Verification: `claude plugin list`, `scripts/canary-hindsight.sh`, `node scripts/tool-stack-check.mjs --json`, `node scripts/stack-profile-check.mjs --hindsight --json`, fixture checks for Hindsight config profiles, stubbed `claude plugin marketplace add vectorize-io/hindsight`, stubbed `claude plugin install hindsight-memory`, stubbed daemon health, and staged installed-home canary before live rollout.

### Group D - ETRNL-First Lesson Retention

Owner: hook state owner.
Dependencies: compact-state ETRNL JSONL state layer, `hooks/cc-hindsight-lesson.py`, and Group C supervisor gate.
Acceptance criteria: lesson candidates are first appended to ETRNL state with bounded fields and privacy validation; optional Hindsight export reads from that accepted event; failures to export do not erase deterministic lesson evidence; duplicate lesson noise is debounced; tests prove raw prompts, transcript paths, secrets, and private home paths are rejected.
Verification: `python3 -m py_compile hooks/cc-hindsight-lesson.py`, `node scripts/etrnl-state.mjs doctor --compact --explain`, memory-posture privacy fixtures, and `tests/test-hooks.sh`.

### Group E - Settings Cleanup And Stock Claude Boundary

Owner: install and settings owner.
Dependencies: Groups A and B audit output, Claude settings docs, templates, live settings backup path, and explicit rollout command.
Acceptance criteria: unsupported top-level keys such as `autoCompactWindow` and `skipAutoPermissionPrompt` are removed, translated to documented environment variables, or marked as private overlay only with a failing audit in controlled installs; templates stay stock-compatible except repo-owned harness hooks, Hindsight plugin enablement when full profile is selected, and explicit permissions; the plan leaves Claude Code's native auto-compact decision to Claude unless a documented setting exists.
Verification: `jq empty templates/settings.json templates/settings.strict.json templates/settings.local.example.json`, `node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts`, staged install diff, full-profile settings audit, and live settings audit after approved rollout.

### Group F - Beads Provisioning, Boundary, And Bridge

Owner: backlog integration owner.
Dependencies: Group A profile schema, ETRNL state context entries, existing Beads dry-run bridge, Beads CLI availability, `.beads` repo state, and Group B audit.
Acceptance criteria: full profile installs or verifies `bd`, can initialize project-local `.beads` when requested, and records Beads health without installing raw Beads Claude/Codex hooks; raw `bd prime --full` output is classified as prohibited for this control plane; only blockers, dependencies, claims, backlog items, and discovered follow-ups can become Beads candidates; active execution state is counted as noise; bridge commands default to dry-run and require explicit user action for mutation; `bd setup claude --check` and `bd setup codex --check` are expected to report no raw hooks unless an ETRNL-owned wrapper has replaced them.
Verification: `npm view @beads/bd version --json`, `bd status --json`, `bd setup claude --check`, `bd setup codex --check`, `bd prime --hook-json --memories-only`, profile fixture for missing `bd`, profile fixture for initialized `.beads`, ETRNL state Beads fixtures, and `tests/test-workflow-tools.sh`.

### Group G - CodeGraph Provisioning And MCP Sanity

Owner: code navigation tooling owner.
Dependencies: current CodeGraph bootstrap behavior, `scripts/bootstrap-tools.sh`, `scripts/tool-stack-check.mjs`, full profile schema, and MCP config expectations.
Acceptance criteria: full profile installs or verifies CodeGraph, refreshes global MCP config when approved, initializes or syncs project `.codegraph` when requested, and records version and health in tool-stack and doctor output; core profile only reports missing/stale CodeGraph as optional unless a plan explicitly requires it.
Verification: stubbed `codegraph --version`, stubbed `codegraph install --target all --location global --yes`, stubbed `codegraph init`, `node scripts/tool-stack-check.mjs --json`, and `scripts/bootstrap-tools.sh check --project "$PWD"`.

### Group H - Docs, Doctor, And Rollout Gates

Owner: final integration owner.
Dependencies: Groups A through G.
Acceptance criteria: docs explain core and full profiles, final authority split, Hindsight install and service modes, Beads boundaries, CodeGraph MCP setup, rollback paths, exact fresh-user commands, prerequisites, unsupported paths, and verification commands; doctor reports memory posture in a way that cannot be mistaken for successful Hindsight recall; changelog records user-visible behavior; staged install, rollback rehearsal, and post-upgrade canary are required before live home mutation.
Verification: `node scripts/skill-contract-check.mjs`, `tests/test-hooks.sh`, `tests/test-workflow-tools.sh`, `tests/test-install.sh`, `scripts/doctor.sh`, `git diff --check`, staged install proof, rollback proof, and post-upgrade canary.

## Task sizing and slices

- Slice 1: add stack profile fixtures and profile validator. Keep this to profile JSON/templates, dry-run parsing, stubs, and install tests before mutating installer behavior.
- Slice 2: extend `scripts/install.sh` and `scripts/bootstrap-tools.sh` for `core` and `full` profiles with deterministic dry-run output and explicit skip flags.
- Slice 3: add read-only memory posture fixtures and extend `settings-audit.mjs` reporting. Keep this to audit code, fixtures, and tests only.
- Slice 4: harden `scripts/canary-hindsight.sh` and `scripts/tool-stack-check.mjs` so Hindsight health is explainable before changing hooks.
- Slice 5: add Hindsight provisioning in full profile: plugin install/verify, config template materialization, selected service mode, health check, and rollback metadata.
- Slice 6: change `cc-hindsight-lesson.py` to ETRNL-first persistence and add privacy fixtures. This slice touches hook state and should run hook tests immediately.
- Slice 7: add Beads and CodeGraph full-profile provisioning while preserving ETRNL authority and avoiding raw Beads hooks.
- Slice 8: add settings cleanup checks and template documentation. This slice must not mutate the live Claude home.
- Slice 9: integrate doctor, docs, changelog, staged install, rollback rehearsal, and live rollout instructions.
- Split any future implementation batch that touches more than eight files or crosses unrelated subsystems. The natural split is profile schema, installer, audit, Hindsight provisioning, ETRNL lesson, Beads, CodeGraph, settings, and rollout docs.

## Phases

### Phase 0 - Baseline, Fresh-Install Contract, And Backups

Record current live settings, enabled plugins, Hindsight config with token redacted, plugin hook manifests, Beads status, install dry-run output, upstream Hindsight install surfaces, Beads npm evidence, and source git status. Create a rollback snapshot for live Claude settings and Hindsight config before any installed-home mutation. Define the public fresh-install contract first: `core` installs the ETRNL harness, `full` installs and configures the whole supported stack.

### Phase 1 - Stack Profile Schema And Installer Dry Run

Add stack profile manifests and a validator before changing real install behavior. Dry-run must enumerate Claude/Codex file writes, settings merges, plugin commands, package installs, service starts, project DB/index initialization, health checks, and rollback files. Noninteractive full profile must fail if required prerequisites are missing and no skip flag is supplied.

### Phase 2 - Read-Only Audit Expansion

Make outside-settings hook sources visible. The first implementation should be read-only: plugin hook manifests, risky settings keys, skill/agent frontmatter hook declarations, and memory plugin posture appear in JSON output and tests.

### Phase 3 - Hindsight Provisioning And Supervision

Upgrade the canary from binary curl check to a structured supervisor. Add full-profile Hindsight provisioning: marketplace/plugin install or verify, config materialization from token-free templates, local daemon/external API/Docker mode selection, version lock, health check, and rollback. An enabled Hindsight plugin with a down configured service must be red, not advisory green.

### Phase 4 - ETRNL-First Lessons

Move lesson authority into ETRNL state. Hindsight becomes an exporter of accepted lesson candidates, never the only place where a durable correction is stored.

### Phase 5 - Settings Cleanup

Remove or quarantine unsupported live settings such as `autoCompactWindow` and `skipAutoPermissionPrompt` behind a staged rollout. Preserve stock Claude Code behavior for auto-compact and permission prompts except where the harness has a documented hook or permission need.

### Phase 6 - Beads Provisioning And Boundary

Install or verify the Beads binary in full profile and optionally initialize project `.beads`. Keep raw Beads hooks uninstalled. Add deterministic rejection of raw Beads startup output and a dry-run bridge for allowed backlog items only.

### Phase 7 - CodeGraph Provisioning

Install or verify CodeGraph, refresh MCP config when approved, and initialize or sync project-local `.codegraph` only when requested by profile. Tool-stack and doctor must report version, availability, and project health.

### Phase 8 - Staged Rollout And Final Verification

Run source gates, staged core install, staged full install with stubs or safe temp homes, staged doctor/canary, rollback rehearsal, live install only with explicit approval, and post-upgrade canary. Completion requires source and installed-home evidence to agree.

## Skill/tool routing

- Use `etrnl-dev-plan` for this plan and readiness artifact.
- Use `Hook Development` during implementation because the work changes Claude lifecycle hooks, plugin hook auditing, and installed settings behavior.
- Use `Plugin Structure` or `Plugin Settings` only if implementation vendors plugin metadata or needs a repo-owned plugin wrapper; otherwise keep Hindsight as an installed third-party plugin with this repo owning the profile/canary contract.
- Use `Command Development` if new installer CLI flags or commands are added beyond simple `install.sh` options.
- Use `code-simplifier` after implementation because memory posture checks can become overbuilt.
- Use `finding-duplicate-functions` if Hindsight and Beads health checks duplicate `tool-stack-check.mjs`, `settings-audit.mjs`, or `doctor.sh` parsing.
- Use `brooks-audit` if implementation changes the health-stack contract or broad workflow enforcement.
- `eternal-best-practices` is not applicable unless the implementation expands into auth, tenant, money, i18n, Prisma, permissions, or soft-delete domains.
- Advanced TypeScript review is not applicable unless implementation unexpectedly touches exported TypeScript contracts, runtime schemas, DTO boundaries, or state-machine types.
- Use GitHub CLI for Hindsight upstream release checks, not stale release memory.
- Use Beads commands only as read-only evidence or explicit dry-run bridge input during this plan.

## Test plan

- Install tests cover fresh temporary homes for `--profile core`, dry-run `--profile full --yes`, full-profile stubbed package/plugin/service provisioning, skip flags, missing-prerequisite failures, rollback, and no private paths in tracked outputs.
- Stack profile tests cover schema validation, package/version lock fields, Hindsight mode selection, Beads mode selection, CodeGraph mode selection, service ports, health checks, and rollback artifacts.
- Settings audit fixtures cover clean repo-owned settings, enabled Hindsight plugin with healthy service, enabled Hindsight plugin with down service, plugin hook manifests outside settings, risky top-level settings keys, and forbidden skill/agent hook frontmatter.
- Hindsight canary fixtures cover disabled plugin, missing config, external API down, daemon mismatch, unsafe retention mode, version lag, and healthy configured service.
- Hindsight provisioning fixtures cover marketplace add/install success, already-installed plugin, plugin version drift, local daemon config, external API config with token redacted, Docker server mode, missing LLM provider, and service health failure.
- Hook tests cover ETRNL-first lesson persistence, Hindsight export skipped when canary is red, Hindsight export attempted when canary is green, privacy rejection, and duplicate debounce.
- Beads tests cover zero issues, explicit memories-only output, raw full prime rejection, allowed backlog candidate dry-run, and active execution noise rejection.
- CodeGraph tests cover global binary missing, MCP config refresh, project index creation, project sync, and optional core-profile reporting.
- Doctor tests prove memory posture is visible in source health and installed-home health.
- Install tests prove templates remain valid, staged install preserves repo-owned hooks, unsupported keys are not reintroduced, full profile does not silently skip Hindsight/Beads/CodeGraph, and rollback restores prior installed settings.
- Regression tests keep compact handoff behavior unchanged: ETRNL remains the only compact continuation authority.

## Test-first execution plan

- Red: add fixture where `./scripts/install.sh --profile full --yes --dry-run` is currently rejected because `install.sh` only supports `--dry-run`; expected future output lists Hindsight, Beads, CodeGraph, Claude hooks, Codex skills, config writes, canaries, and rollback artifacts.
- Red: add temporary-home install fixture where full profile has no Hindsight plugin/service provisioning; expected failure says Hindsight profile item is missing rather than passing with only core hooks.
- Red: add fixture where noninteractive full profile lacks an LLM provider or external Hindsight URL; expected failure gives exact environment/config requirement and prints no secret values.
- Red: add fixture where full profile silently skips Beads because stdin is noninteractive; expected failure says use `--skip-beads` or install `bd`, not silent skip.
- Red: add fixture where CodeGraph MCP refresh is skipped in full profile without `--skip-codegraph`; expected failure names the missing command.
- Red: add fixture where settings-audit currently passes despite enabled Hindsight plugin hooks and down API; expected failure says memory plugin is enabled but unhealthy.
- Red: add fixture where a plugin `hooks.json` contributes `UserPromptSubmit` and async `Stop`; expected output lists it as outside-settings hook source.
- Red: add fixture where settings include `autoCompactWindow` and `skipAutoPermissionPrompt`; expected strict audit failure or explicit private-overlay classification.
- Red: add fixture where `bd prime --full` output tries to impose Beads as default task tracking; expected rejection for raw Beads startup doctrine.
- Red: add fixture where `cc-hindsight-lesson.py` receives secret-looking or private-path material; expected ETRNL append rejection and no Hindsight export.
- Green: implement Groups A through H until all red fixtures pass and source gates, staged install gates, rollback gates, and canaries pass.

## Failure modes

- Full install claims success while Hindsight is not installed: profile validator and post-install canary require plugin presence, config, mode, and health.
- Full install claims success while Beads or CodeGraph was silently skipped: noninteractive full profile fails unless an explicit skip flag is supplied.
- Hindsight local daemon cannot start because `uvx`, `hindsight-embed`, Docker, or LLM provider config is missing: installer fails with one precise prerequisite and rollback leaves core install intact.
- Hindsight external API token leaks into logs or tracked files: config templating redacts token-bearing values and tests scan tracked outputs for secret-looking material.
- Hindsight is enabled but API is down: canary fails and recall is treated as unavailable, not silently trusted.
- Hindsight recall injects stale or misleading memory: docs and prompts state fresh repo/runtime evidence wins, and compact handoff never reads Hindsight as authority.
- Hindsight plugin setup overwrites repo-owned hooks: audit detects plugin hook manifests separately and rollout forbids running third-party setup scripts that merge hooks without review.
- Hindsight retention leaks raw session material: ETRNL privacy validation rejects prompts, transcript text, transcript paths, secrets, and private home paths before export.
- Beads raw startup output overrides ETRNL workflow: audit and tests reject `bd prime --full` injection and keep Beads unhooked.
- Beads duplicates active execution state: bridge filters active execution entries as noise and only allows backlog/dependency/claim/follow-up candidates.
- Unsupported Claude settings break stock behavior: staged settings cleanup uses backup, diff, audit, and rollback before live mutation.
- Version drift changes Hindsight hook behavior: tool-stack and canary report installed and latest versions and require post-upgrade canary.
- Fresh-user install depends on Victor-specific local state: profile fixtures use temporary homes, stubbed package managers, and no private paths to prove portability.

## Parallelization strategy

- Group A is first because every other group depends on install profile semantics and dry-run output.
- Group B can start after Group A defines profile fixtures because hook audit output needs to know which profile is expected.
- Groups C, F, and G can run in parallel after Group A because Hindsight, Beads, and CodeGraph provisioning touch mostly disjoint install helper branches.
- Group D should wait for Group C because lesson export behavior depends on Hindsight supervisor semantics.
- Group E can run in parallel with Group D after Group B identifies risky settings keys.
- Group H is sequential final integration.
- Avoid parallel edits to `scripts/install.sh`, `scripts/bootstrap-tools.sh`, `scripts/settings-audit.mjs`, `scripts/tool-stack-check.mjs`, `scripts/doctor.sh`, `tests/test-install.sh`, and `tests/test-workflow-tools.sh`; these are integration choke points.

## Verification gates

- `node scripts/deep-stack-check.mjs validate-plan --plan docs/plans/2026-06-05-claude-code-memory-hindsight-beads-plan.md`
- `node scripts/plan-readiness-check.mjs docs/plans/2026-06-05-claude-code-memory-hindsight-beads-plan.md`
- `./scripts/install.sh --dry-run`
- `./scripts/install.sh --profile core --dry-run`
- `./scripts/install.sh --profile full --yes --dry-run`
- `node scripts/stack-profile-check.mjs templates/stack-profile.core.json --json`
- `node scripts/stack-profile-check.mjs templates/stack-profile.full.json --json`
- `jq empty templates/settings.json templates/settings.strict.json templates/settings.local.example.json`
- `jq empty templates/stack-profile.core.json templates/stack-profile.full.json templates/hindsight/claude-code.local-daemon.json templates/hindsight/claude-code.external.example.json`
- `node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts --json`
- `node scripts/settings-audit.mjs "$HOME/.claude/settings.json" --strict-conflicts --json`
- `scripts/canary-hindsight.sh`
- `node scripts/tool-stack-check.mjs --json`
- `claude plugin list`
- `claude plugin marketplace add vectorize-io/hindsight --help`
- `claude plugin install hindsight-memory --help`
- `rtk proxy curl -fsS --max-time 2 http://127.0.0.1:9077/health`
- `docker ps --filter name=hindsight --format '{{.Names}} {{.Status}}'`
- `bd status --json`
- `bd setup claude --check`
- `bd setup codex --check`
- `codegraph --version`
- `codegraph status "$PWD"`
- `python3 -m py_compile hooks/cc-hindsight-lesson.py`
- `tests/test-hooks.sh`
- `tests/test-workflow-tools.sh`
- `tests/test-install.sh`
- `node scripts/skill-contract-check.mjs`
- `scripts/doctor.sh`
- `git diff --check`

Stop condition: any source gate failure, any full-profile silent skip, any staged install drift, any failed Hindsight canary while Hindsight remains enabled for recall, any raw Beads hook injection, any secret/private-path leak in tracked outputs, or any rollback rehearsal failure blocks live rollout.

## Rollback

- Restore the saved live Claude settings snapshot if settings cleanup or plugin audit changes break Claude Code behavior.
- Restore the saved profile/install metadata if a full-stack rollout partially completes.
- Disable `hindsight-memory@hindsight` or remove it from enabled plugins if the supervisor remains red after remediation.
- Stop or remove the local Hindsight daemon/container only when this installer started it and recorded ownership metadata.
- Restore the saved redacted Hindsight config source from the local backup; never commit token-bearing config.
- Revert source changes to `scripts/install.sh`, `scripts/bootstrap-tools.sh`, `scripts/settings-audit.mjs`, `scripts/tool-stack-check.mjs`, `scripts/canary-hindsight.sh`, `hooks/cc-hindsight-lesson.py`, tests, and docs if source gates fail.
- Leave existing `.beads` data untouched unless the profile created it and rollback metadata proves it is safe to remove.
- Leave existing `.codegraph` data untouched unless the profile created it and rollback metadata proves it is safe to remove.
- Do not delete ETRNL JSONL state during rollback; it is the deterministic handoff authority and is append-only local runtime evidence.

## Execution handoff

Use `etrnl-execute` after Victor explicitly asks to implement this plan. Execution must complete `all_phases` or stop with a concrete blocker. Use parallel agents only after Group A defines fixtures and only for disjoint Hindsight, Beads, CodeGraph, and audit work. Live Claude home mutation is a separate explicit rollout checkpoint after source, staged core install, staged full install, rollback, and canaries pass.

## Plan Readiness Report

- Scope Challenge: The plan now treats this as a shareable stack install, not just local memory hardening. The smallest durable solution is a profile-driven installer that can prove core and full installs, while still rejecting Hindsight or Beads as compact-handoff authority.
- Architecture Review: ETRNL remains the mandatory local state substrate; Hindsight is provisioned semantic recall/export; Beads is provisioned explicit backlog/dependency state; CodeGraph is provisioned code-navigation infrastructure; Dolt remains outside hook hot paths. Source, staged home, rollback, and live install are separate gates.
- Code Quality Review: The implementation should reuse `install.sh`, `bootstrap-tools.sh`, `settings-audit.mjs`, `tool-stack-check.mjs`, `canary-hindsight.sh`, `etrnl-state`, and existing install/hook tests. New surfaces are limited to stack profile manifests, Hindsight config templates, stack profile validation if needed, fixtures, and possibly one narrow ETRNL lesson event kind.
- Test Review: The plan starts with red fixtures for the exact current gaps: full profile unsupported by `install.sh`, Hindsight not provisioned, noninteractive tool bootstrap skips, plugin hooks outside settings, API-down enabled plugin, risky top-level settings keys, raw Beads prime doctrine, and Hindsight lesson privacy rejection.
- Performance Review: Installer work can run package managers and service checks; hook-time work stays bounded to local checks and ETRNL append/query calls. Hindsight service checks belong in canary/doctor/tool-stack gates, not every prompt hot path.
- Failure modes: The critical risks are false full-install success, stale semantic recall, service-down hidden memory, plugin hook overwrite, transcript leakage, raw Beads workflow takeover, unsupported settings drift, version drift, secret leakage, and Victor-specific install assumptions. Each has a gate, fixture, or rollback path.
- Parallelization: Profile schema comes first; Hindsight, Beads, and CodeGraph provisioning can split after profile fixtures; lesson persistence waits for Hindsight supervisor semantics; final install proof is sequential.
- Unresolved questions: research_flow: auto-generated; targeted GitHub CLI and installed-state refresh also completed for Hindsight and Beads. Open implementation decision: default full-profile Hindsight mode should be `local-daemon` using `uvx hindsight-embed`, with `external-api` and `docker-server` as explicit alternatives unless execution evidence proves a better default.
- Verdict: Ready for execution as a shareable stack installer plan; live rollout still requires staged proof and explicit approval.

## Verdict

Ready for execution.
