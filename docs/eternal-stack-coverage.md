# Eternal Stack coverage

This page summarizes the **v0.13.0** source capabilities, including standalone Upgrade Deps on top of the v0.12.0 companion; publication is not proof of live activation. Earlier tags keep their existing behavior. See [host capabilities](host-capabilities.md) for exact host behavior and [the capability library](skills.md) for the maintained catalog.

## Product surface

| Surface | Current source behavior | Evidence and limit |
| --- | --- | --- |
| Default install | Core installs shared guidance, one native `etrnl-router` skill, and a private on-demand library to the selected Claude/Codex home(s). | `scripts/lib/install-core.mjs`; portable install fixture tests. No hooks, agents, settings, services, or plugins are installed by Core. |
| Router | Explicitly selects Build, Fix, Explain, Review, or Ship and returns available/loaded/required capability state with a validated contract. | `skills/etrnl-router/SKILL.md`, `skills/etrnl-router/capability-index.json`, `scripts/companion.mjs`; does not imply task-quality parity across hosts. |
| Workflow contract | Explicit intent, impact scope, and consequence-risk axes determine mode, required evidence, and total-task budgets. | `scripts/lib/workflow-contract.mjs`, `scripts/workflow-contract.mjs`, contract tests. Axes are not inferred from keywords or file counts. |
| Execution state | Structured/program tasks persist the resolved contract and host-local evidence in the run ledger. | `scripts/execution-ledger.mjs`; command-captured checks are distinguishable from self-reported rows. Direct work does not require a ledger. |
| Portable helpers | Indexed helpers run from the private shared library with the active host home and host-local state paths passed separately. | `scripts/companion.mjs`, private library manifest and install tests. External effects and installer/doctor operations are excluded from the helper runner. |
| Claude integration | Core does not register hooks or native agents. The separate supported optional profiles may install Claude hooks and agent files. | Verify actual settings and hook health before claiming live activation. |
| Codex integration | Core installs one discoverable Eternal skill and private library. Optional Codex hooks remain inactive until registered natively. | Isolated Codex CLI 0.159.2 app-server discovery saw one Eternal skill plus built-ins. A paired `gpt-6.1-sol` fixture run passed books, read-only, small-fix, and release-stub checks; invoice behavior passed but independent-review evidence failed. Claude and cross-host continuation remain untested. See [evaluation report](companion-evaluation.md); no parity or general-quality claim. |
| Attribution | Eternal owns integration, IDs, adapters, packaging, tests, and ongoing maintenance; source lineage remains documented separately. | `CREDITS.md` and source/provenance inventory. Product ownership does not assert original authorship or make license conclusions. |

## Capability families

The private library includes workflow/delivery; audits and reviews; backend/frontend references; domain, security, auth, payments, tenancy, and localization guidance; product/interface design; and host/communications operations. The exact current entrypoints are listed in [skills.md](skills.md). Individual modules load only when the router selects them or the user asks for them. Nested files and helper dependencies are packaged as library assets, not independent top-level skills.

## Maintained optional surfaces

The `orchestrated` and `full` profiles remain supported separately from Core. They add selected hooks, tools, or services; their controls are not part of the default one-router behavior. See [install](install.md), [hooks](hooks.md), [guards](guards.md), and [configuration](configuration.md) for exact opt-in behavior and limitations.

The repository also contains deterministic deep-audit, performance, browser, release, and maintenance helpers. Their specialized artifact/check contracts apply when those capabilities are selected; they are not universal requirements for ordinary coding work. See [Health Stack](health-stack.md) for the actual health gates and how to interpret them.

## Validation status

Run the repository's required `tests/test-hooks.sh` and `scripts/doctor.sh` gates against the frozen candidate before calling it healthy. Targeted contract and installer tests validate source behavior. The separate [maintainer-run task evaluation](companion-evaluation.md) supplies limited Codex task evidence, including one unmet independent-review requirement; it is not a doctor gate and does not establish Claude behavior or cross-host parity. A release remains unverified until the tagged package and target-host canaries pass.
