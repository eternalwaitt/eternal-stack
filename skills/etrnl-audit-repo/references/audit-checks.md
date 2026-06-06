# Repo Hygiene Audit Checks

- Category id: `repo-hygiene`
- Skill name: `etrnl-audit-repo`
- Registry source: `scripts/lib/deep-audit-categories.mjs`
- Report envelope: same schema used by `etrnl-audit`

## Checks

1. `repo-01-entrypoints`: verify README, docs, package metadata, startup files, and first-run path.
2. `repo-02-file-organization`: inspect ownership boundaries, naming, stale folders, and misplaced files.
3. `repo-03-generated-artifacts`: identify tracked build outputs, cache files, snapshots, and ignore drift.
4. `repo-04-config-consistency`: verify manifest, tooling, editor, CI, and runtime config alignment.
5. `repo-05-public-private-boundary`: inspect tracked docs, examples, templates, and logs for private material risk.

Every row ends as `finding`, `confirmed_clean`, `skipped`, `not_applicable`, or `source_limited`.
