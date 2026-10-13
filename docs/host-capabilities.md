# Host capabilities

This page describes the current source checkout and installer behavior. These changes ship in **v0.12.0**; earlier tags retain their previous behavior. Repository tests and isolated host fixtures do not prove every interaction in a user's live Claude Code or Codex session.

## Core install

Core installs the same Eternal router and capability-library sources for Claude Code and Codex. The user-facing native skill is `etrnl-router`; the library is stored outside each host's skill-discovery directory at `<host-home>/etrnl/library/`, so nested capability files do not become dozens of discoverable Codex skills. The shared guidance and router can target both hosts with `./scripts/install.sh --profile core --host both`.

| Capability | Claude Code | Codex | Core behavior |
| --- | --- | --- | --- |
| Shared operating guidance | Native instructions/import | Native instructions | Same maintained guidance; each host still supplies its own tools and permissions. |
| Eternal entrypoint | One native `etrnl-router` skill | One native `etrnl-router` skill | One discoverable Eternal entrypoint per selected host. |
| Capability library | Available from host-private `etrnl/library/` | Available from host-private `etrnl/library/` | Loaded on demand by the router; not all contents enter task context. |
| Helper scripts | Core: `<host-home>/etrnl/library/scripts/companion.mjs`; optional profiles: `<host-home>/scripts/companion.mjs` | Core: `<host-home>/etrnl/library/scripts/companion.mjs`; optional profiles: `<host-home>/scripts/companion.mjs` | Helpers use the installed profile's library layout and separate host-local state paths. |
| Captured independent review/resume | Explicit outer-host Claude CLI provider; fixture-tested, live-host unverified | Explicit outer-host `review-and-resume` after author checkpoint/request | Opt-in companion operation, not automatic Core interception; nested sandbox launch may be unavailable. |
| Hooks | None registered by Core | None registered by Core | No automatic hook enforcement. |
| Native subagents/agents | No `etrnl-*` agent files from Core | No agent definitions from Core | Use each host's native delegation only when available and within the resolved task contract. |
| Settings, services, plugins, MCPs | None written by Core | None written by Core | Native permissions and project checks remain authoritative. |

Core stores the private library under `<host-home>/etrnl/library/`; the alternative optional profiles keep their source-relative library layout under the host home and expose the helper at `<host-home>/scripts/companion.mjs`. Installed helper execution supplies `ETRNL_LIBRARY_ROOT`, `ETRNL_SCRIPT_ROOT`, and host-local `ETRNL_HOME`, `ETRNL_STATE_DIR`, `ETRNL_RUNS_DIR`, and `ETRNL_ARTIFACTS_DIR`. Do not treat `ETRNL_HOME` as a shared scripts directory. The profile's companion `inspect` result is the source for concrete paths.

## Optional profiles

`orchestrated` and `full` remain separately supported, alternative installation layouts in this checkout. They do not layer on top of Core; the installer refuses to overlay an existing incompatible installation. They retain optional runtime mechanisms and tool provisioning with host-specific behavior. The exact installed surfaces are defined by `templates/stack-profile.orchestrated.json`, `templates/stack-profile.full.json`, and the installer. Read [Hooks](hooks.md), [Guards](guards.md), and [Install](install.md) before relying on them.

| Mechanism | Claude Code | Codex |
| --- | --- | --- |
| Lifecycle hooks in optional profile | Installer registers the selected legacy Claude template; `--native-continuity` also appends the versioned companion adapter. Runtime activation depends on host settings and health. | `--native-continuity` explicitly registers the versioned adapter in `hooks.json`; copied legacy scripts alone remain inactive. Actual callbacks require separate host verification. |
| Agent role files | Optional package can install Claude agent definitions. | Codex does not consume Claude agent definitions; the maintained role files are library references unless a native Codex mechanism is separately configured. |
| Third-party tools | Profile-gated Hindsight, Beads, and CodeGraph setup. | Supported tools/configuration are host-specific; Hindsight runtime capability is not implied by Claude plugin health. |

A host with manually configured hooks, tools, or plugins may have more capabilities than the installer reports. Inspect its actual configuration before making enforcement or activation claims.

See [native continuity adapters](native-adapters.md) for version floors, preservation/removal, lifecycle coverage and fail-open limits. Core uses explicit `companion context` and checkpoint/completion commands as its portable floor.

## Available, loaded, required

- **Available**: the capability is present in the private library or the host exposes a native tool.
- **Loaded**: the router has read the relevant instructions into this task.
- **Required**: the user, project policy, or resolved workflow contract requires the step.

The capability index reports these states separately. A router selection may mark a capability required for the selected mode; other catalog entries remain optional until selected and read. Installing the library does not activate every skill or hook.

## Workflow contract and host limits

See [capturing independent review](skills.md#capturing-independent-review) for the supported author request and outer-host handoff.

Both hosts use the same validated intent, impact-scope, consequence-risk contract. The contract determines the workflow mode and its requirements/budgets. Native tool names and capabilities remain host-specific. If a requested control cannot run on that host, state whether the fallback is manual, advisory, or unavailable; never claim equivalent enforcement from shared Markdown alone.

`ship` describes a workflow and does not grant permission to publish, merge, deploy, or mutate external state. Honor standing authorization and actual project approval policy across both hosts.

## Verification evidence

The current source tree includes portable-install and workflow-contract tests. An isolated Codex CLI 0.159.2 app-server `skills/list` check after a both-host fixture install reported exactly one Eternal skill (`etrnl-router`) as enabled, in addition to Codex's native `.system` skills. Fixture uninstall succeeded and preserved Codex built-ins. This verifies Codex discovery and fixture cleanup, not end-to-end task quality, live personal-home state, or Claude runtime behavior.

A separate paired synthetic-task evaluation on Codex CLI 0.159.2 with `gpt-6.1-sol` passed both conditions' acceptance checks for books greenfield, read-only password-reset tracing, a small fix, and a local release hold followed by explicitly authorized local stubs. Both conditions passed the invoice behavior checks, but the candidate's required independent review was only self-attested and did not pass. A subsequent model run still failed to establish independent review and a delivered checkpoint. The new explicit host controller addresses the evidence-producing path; its runtime validation and actual model outcomes are reported separately in the evaluation report. Claude and cross-host continuation remain untested. See the [companion evaluation report](companion-evaluation.md); these results cover only the listed fixtures and do not establish host parity or broad task quality. The evaluation runner is for maintainers, not a user-required workflow.
