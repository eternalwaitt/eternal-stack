# Contributing

Eternal Stack maintains one integrated companion for Claude Code and Codex, with a native router and on-demand capability library in the current unreleased Core candidate. The separately supported `orchestrated` and `full` profiles are alternative opt-in installation layouts; their hooks, agents, and tool provisioning differ by host. Check the installer, profile manifests, tests, and [host capability matrix](docs/host-capabilities.md) before changing product claims.

For workflow-policy changes, update the canonical contract in `scripts/lib/workflow-contract.mjs` and its tests. Skill and host guidance should explain how to use that contract, not create another routing or budget policy. For capability-library changes, update the index/manifest closure, relevant entrypoint and references, [capability catalog](docs/skills.md), [coverage map](docs/eternal-stack-coverage.md), and [credits](CREDITS.md) when attribution or ownership shifts.

For hook or guard changes:

1. Capture or add a redacted event fixture.
2. Add or update a meaningful regression check.
3. Implement the smallest coherent change.
4. Run `tests/test-hooks.sh` and `scripts/doctor.sh` before claiming repository health.
5. Document the host, activation state, effect, bypass, and failure behavior.

For docs or install changes, update the reader-facing entry, technical reference, and `CHANGELOG.md` under `Unreleased`. Keep capability availability separate from loaded context and required work. Verify changed links, examples, and commands against source. Do not change `VERSION` until preparing a release under [RELEASING](docs/RELEASING.md).

Before release-branch health is claimed, move `## Unreleased` entries into the next dated `## vX.Y.Z - YYYY-MM-DD` section.

Do not commit private settings, credentials, transcripts, local memory, account names, or absolute user paths.
