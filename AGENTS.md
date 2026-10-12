# Eternal Stack Agent Guide

This repository maintains Eternal Stack for Claude Code and Codex. The current unreleased Core candidate installs shared guidance, one native `etrnl-router` skill, and a private on-demand capability library. The `orchestrated` and `full` profiles are separate opt-in installation layouts with host-specific hooks and provisioning. Public home: [eternal-stack](https://github.com/eternalwaitt/eternal-stack). Keep tracked files free of private identity, accounts, transcripts, credentials, and local memories.

## Working rules

- Treat the request as the task contract. Complete all authorized scope; do not silently replace it with an MVP or first phase. Preserve unrelated dirty work and never broad-reset or broad-stage.
- Reuse existing hooks, scripts, docs, skills, templates, tests, and dependencies before adding surfaces. Keep changes tied to the verified gap.
- Treat installer code, profile manifests, host adapters, and tests as evidence of current behavior. Keep available, loaded, and required capabilities distinct; a skill on disk is not proof it ran.
- Keep workflow selection and requirements canonical in `scripts/lib/workflow-contract.mjs`. Do not copy scope/risk tables, worker/retry budgets, reviewer chains, or activation policy into individual skills, host profiles, hooks, or docs. Explain the contract by linking to the canonical module and user-facing capability guide.
- Keep Core free of automatic hook enforcement. Optional profiles remain host-specific; document registration and actual enforcement separately. Put project correctness checks in deterministic tooling where practical, and report what actually ran.
- Keep host paths portable. Installed library helpers run through the companion, with host home and library root treated as distinct. Do not hard-code one host's home into shared capability text.
- Preserve factual attribution for inherited or adapted material in `CREDITS.md` and source notices. Eternal owns the integrated product surface and maintenance; do not imply original authorship or invent provenance or license conclusions.
- Keep startup guidance short. Shared baseline belongs in `AGENTS.md`; `CLAUDE.md` and `templates/CLAUDE.md` import it rather than duplicate it. Put operational details in focused docs or capability references.
- Keep `VERSION` unchanged until release preparation. Update `CHANGELOG.md` under `Unreleased`, relevant docs, and credits when install surfaces or capability ownership changes.
- Run relevant targeted tests while editing. Before claiming overall health, run `tests/test-hooks.sh` and `scripts/doctor.sh`; distinguish source tests from live-host behavior.

Read [PROJECT_STATE.md](PROJECT_STATE.md) when starting relevant work. During authorized implementation, keep affected authored status and pending work current before final verification; follow [project-state maintenance](docs/project-state.md) and the canonical contract for acknowledgement requirements. Do not invent lessons or mutate state for a read-only question.

## Documentation map

| Doc | Use when |
| --- | --- |
| [README.md](README.md) | User onboarding and concise product overview |
| [PROJECT_STATE.md](PROJECT_STATE.md) and [docs/project-state.md](docs/project-state.md) | Current feature/pending overview and its maintenance/enforcement boundaries |
| [docs/product-direction.md](docs/product-direction.md) | Companion architecture and workflow contract |
| [docs/host-capabilities.md](docs/host-capabilities.md) | Core and optional profile behavior by host |
| [docs/skills.md](docs/skills.md) | Capability library, routing boundaries, and helper interface |
| [docs/install.md](docs/install.md) | Install, update, rollback, and optional profiles |
| [docs/configuration.md](docs/configuration.md) | Profile and environment-variable settings |
| [docs/hooks.md](docs/hooks.md) and [docs/guards.md](docs/guards.md) | Optional lifecycle hooks and guard behavior |
| [docs/rules.md](docs/rules.md) | Project rule-pack modules and activation |
| [docs/migration.md](docs/migration.md) and [docs/troubleshooting.md](docs/troubleshooting.md) | Existing installs and recovery |
| [docs/health-stack.md](docs/health-stack.md) and [docs/eternal-stack-coverage.md](docs/eternal-stack-coverage.md) | Checks and capability coverage |
| [docs/RELEASING.md](docs/RELEASING.md), [CHANGELOG.md](CHANGELOG.md), [CREDITS.md](CREDITS.md) | Release process, history, and provenance |

## Verification

Inspect relevant test scripts and keep checks targeted while changes are in progress. Before a final source-health claim, run:

```bash
tests/test-hooks.sh
scripts/doctor.sh
```

These repository gates do not establish task-quality improvement or equal runtime enforcement in Claude Code and Codex. Record host-specific evidence and its limits.
