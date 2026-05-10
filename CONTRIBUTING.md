# Contributing

Add guards in this order:

1. Capture or add a redacted event fixture.
2. Add a failing test in `tests/test-hooks.sh`.
3. Implement the smallest hook/library change.
4. Run `tests/test-hooks.sh` and `scripts/doctor.sh`.
5. Update `CHANGELOG.md` for behavior, install/update flow, hook, skill, or release-visible docs changes.
6. Before release-branch health is claimed, move `## Unreleased` entries into the next dated `## vX.Y.Z - YYYY-MM-DD` section.
7. Document the guard, block condition, bypass, and failure message.

Do not commit private settings, credentials, transcripts, local memory, account names, or absolute user paths.
